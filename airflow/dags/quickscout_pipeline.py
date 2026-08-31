from __future__ import annotations

import json
import logging
import os
import subprocess
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

from airflow.sdk import dag, get_current_context, task


LOGGER = logging.getLogger(__name__)
QUICKSCOUT_ROOT = Path(os.getenv("QUICKSCOUT_ROOT", "/opt/airflow/quickscout"))
DBT_PROJECT_DIR = QUICKSCOUT_ROOT / "analytics"
DBT_PROFILES_DIR = QUICKSCOUT_ROOT / "analytics"
DBT_TARGET_DIR = Path("/tmp/quickscout-dbt-target")
DBT_LOG_DIR = Path("/tmp/quickscout-dbt-logs")
FACT_RELATION = "analytics_marts.fact_player_season"


def should_simulate_failure(*, simulate_retry: bool, try_number: int) -> bool:
    return simulate_retry and try_number == 1


def _context_fields() -> dict[str, Any]:
    context = get_current_context()
    task_instance = context["task_instance"]
    return {
        "dag_id": task_instance.dag_id,
        "run_id": task_instance.run_id,
        "task_id": task_instance.task_id,
        "attempt": task_instance.try_number,
    }


def _log_event(event: str, **fields: Any) -> None:
    payload = {"event": event, **_context_fields(), **fields}
    LOGGER.info("quickscout_airflow=%s", json.dumps(payload, sort_keys=True))


def _connect():
    import psycopg2

    return psycopg2.connect(
        host=os.environ["DBT_HOST"],
        port=int(os.getenv("DBT_PORT", "5432")),
        user=os.environ["DBT_USER"],
        password=os.environ["DBT_PASSWORD"],
        dbname=os.getenv("DBT_DBNAME", "postgres"),
        sslmode=os.getenv("DBT_SSLMODE", "disable"),
    )


def _fetch_mart_snapshot(cursor) -> dict[str, Any] | None:
    cursor.execute("select to_regclass(%s)", (FACT_RELATION,))
    if cursor.fetchone()[0] is None:
        return None

    cursor.execute(
        """
        select
          count(*)::integer as row_count,
          (count(*) - count(distinct player_season_id))::integer as duplicate_count,
          md5(
            coalesce(
              string_agg(
                jsonb_build_object(
                  'player_season_id', player_season_id,
                  'player_key', player_key,
                  'team_key', team_key,
                  'league_key', league_key,
                  'source_stats_id', source_stats_id,
                  'appearances', appearances,
                  'starts', starts,
                  'minutes', minutes,
                  'goals', goals,
                  'assists', assists,
                  'expected_goals', expected_goals,
                  'expected_assists', expected_assists,
                  'shots', shots,
                  'shots_on_target', shots_on_target,
                  'key_passes', key_passes,
                  'pass_accuracy', pass_accuracy,
                  'dribbles_completed', dribbles_completed,
                  'tackles', tackles,
                  'interceptions', interceptions,
                  'aerial_duels_won', aerial_duels_won,
                  'yellow_cards', yellow_cards,
                  'red_cards', red_cards,
                  'clean_sheets', clean_sheets,
                  'goals_conceded', goals_conceded,
                  'saves', saves
                )::text,
                '|' order by player_season_id
              ),
              ''
            )
          ) as checksum
        from analytics_marts.fact_player_season
        """
    )
    row_count, duplicate_count, checksum = cursor.fetchone()
    return {
        "row_count": row_count,
        "duplicate_count": duplicate_count,
        "checksum": checksum,
    }


def _run_dbt(command: str) -> dict[str, str]:
    args = [
        "dbt",
        "--no-use-colors",
        "--log-format",
        "text",
        "--log-path",
        str(DBT_LOG_DIR),
        command,
        "--project-dir",
        str(DBT_PROJECT_DIR),
        "--profiles-dir",
        str(DBT_PROFILES_DIR),
        "--target-path",
        str(DBT_TARGET_DIR),
    ]
    _log_event("dbt.command.started", command=command)
    process = subprocess.Popen(
        args,
        cwd=QUICKSCOUT_ROOT,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        bufsize=1,
    )
    assert process.stdout is not None
    for line in process.stdout:
        LOGGER.info("dbt[%s] %s", command, line.rstrip())

    return_code = process.wait()
    if return_code != 0:
        _log_event("dbt.command.failed", command=command, return_code=return_code)
        raise RuntimeError(f"dbt {command} failed with exit code {return_code}")

    _log_event("dbt.command.completed", command=command, return_code=return_code)
    return {"command": command, "status": "success"}


@dag(
    dag_id="quickscout_analytics",
    description="Build and test the QuickScout dbt analytics models.",
    schedule="@daily",
    start_date=datetime(2026, 1, 1, tzinfo=timezone.utc),
    catchup=False,
    max_active_runs=1,
    default_args={
        "owner": "quickscout",
        "retries": 2,
        "retry_delay": timedelta(seconds=15),
    },
    tags=["quickscout", "dbt", "analytics"],
)
def quickscout_analytics():
    @task
    def validate_source_data() -> dict[str, Any]:
        _log_event("source.validation.started")
        with _connect() as connection, connection.cursor() as cursor:
            cursor.execute("select count(*) from public.players")
            player_count = cursor.fetchone()[0]
            cursor.execute("select count(*) from public.player_season_stats")
            stats_count = cursor.fetchone()[0]
            previous_mart = _fetch_mart_snapshot(cursor)

        if player_count == 0 or stats_count == 0:
            raise RuntimeError("QuickScout source fixture is empty")

        result = {
            "source_players": player_count,
            "source_stats": stats_count,
            "previous_mart": previous_mart,
        }
        _log_event("source.validation.completed", **result)
        return result

    @task
    def retry_probe(payload: dict[str, Any]) -> dict[str, Any]:
        context = get_current_context()
        dag_run = context.get("dag_run")
        conf = dag_run.conf if dag_run is not None else {}
        simulate_retry = conf.get("simulate_retry", False) is True
        try_number = context["task_instance"].try_number

        _log_event(
            "retry_probe.started",
            simulate_retry=simulate_retry,
            try_number=try_number,
        )
        if should_simulate_failure(
            simulate_retry=simulate_retry,
            try_number=try_number,
        ):
            _log_event("retry_probe.intentional_failure")
            raise RuntimeError("Intentional first-attempt failure for retry evidence")

        retry_status = "recovered" if simulate_retry else "not_requested"
        _log_event("retry_probe.completed", retry_status=retry_status)
        return {**payload, "retry_status": retry_status, "retry_attempt": try_number}

    @task
    def dbt_build(payload: dict[str, Any]) -> dict[str, Any]:
        return {**payload, "dbt_build": _run_dbt("build")}

    @task
    def dbt_test(payload: dict[str, Any]) -> dict[str, Any]:
        return {**payload, "dbt_test": _run_dbt("test")}

    @task
    def verify_idempotency(payload: dict[str, Any]) -> dict[str, Any]:
        _log_event("idempotency.verification.started")
        with _connect() as connection, connection.cursor() as cursor:
            current_mart = _fetch_mart_snapshot(cursor)

        if current_mart is None:
            raise RuntimeError("dbt fact relation was not created")
        if current_mart["row_count"] != payload["source_stats"]:
            raise RuntimeError(
                "Fact row count does not match the source season-stat count"
            )
        if current_mart["duplicate_count"] != 0:
            raise RuntimeError("Duplicate player_season_id values detected")

        previous_mart = payload["previous_mart"]
        if previous_mart is None:
            idempotency_status = "baseline_created"
        elif (
            current_mart["row_count"] == previous_mart["row_count"]
            and current_mart["checksum"] == previous_mart["checksum"]
        ):
            idempotency_status = "verified"
        else:
            raise RuntimeError("Mart row count or checksum changed across the rerun")

        verification = {
            **current_mart,
            "idempotency_status": idempotency_status,
        }
        _log_event("idempotency.verification.completed", **verification)
        return {**payload, "verification": verification}

    @task
    def summarize_run(payload: dict[str, Any]) -> dict[str, Any]:
        summary = {
            "dbt_build": payload["dbt_build"]["status"],
            "dbt_test": payload["dbt_test"]["status"],
            "retry_status": payload["retry_status"],
            **payload["verification"],
        }
        _log_event("pipeline.completed", **summary)
        return summary

    source = validate_source_data()
    retry = retry_probe(source)
    build = dbt_build(retry)
    tests = dbt_test(build)
    verification = verify_idempotency(tests)
    summarize_run(verification)


quickscout_analytics()
