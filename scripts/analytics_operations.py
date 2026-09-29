"""Run ledger, quality gate, and GitHub Issue monitor for hosted analytics."""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import date, datetime, timedelta, timezone
from urllib import error as url_error
from urllib import request as url_request


ISSUE_PREFIX = "[QuickScout analytics] "
ALERT_DESCRIPTIONS = {
    "MISSING_DAILY_RUN": "No accepted analytics run exists for today's UTC logical date.",
    "SOURCE_UPDATE_DELAYED": "A source update has waited over 24 hours for an accepted build.",
    "SOURCE_EMPTY": "The player or season-stat source is empty.",
    "RUN_STUCK": "A pipeline run has remained running for over two hours.",
    "RUN_FAILED": "The most recent pipeline run failed its build or quality gate.",
    "STATE_UNAVAILABLE": "The analytics run ledger or source tables cannot be read.",
}


def parse_logical_date(value: str, today: date | None = None) -> date:
    result = date.fromisoformat(value)
    if result > (today or datetime.now(timezone.utc).date()):
        raise ValueError("Logical date cannot be in the future")
    return result


def source_changed(before: dict, after: dict) -> bool:
    return any(before.get(key) != after.get(key) for key in ("players", "stats", "watermark"))


def assess_snapshot(
    source: dict,
    mart: dict,
    baseline: dict | None,
    accept_new_baseline: bool,
) -> dict:
    failures = []
    if source["players"] == 0 or source["stats"] == 0:
        failures.append("SOURCE_EMPTY")
    if mart["facts"] != source["stats"]:
        failures.append("FACT_COUNT_MISMATCH")
    if mart["duplicate_keys"] != 0:
        failures.append("DUPLICATE_FACT_KEY")
    if baseline and not accept_new_baseline and any(
        source[key] <= baseline[key] * 0.95 and source[key] < baseline[key]
        for key in ("players", "stats")
    ):
        failures.append("SOURCE_COUNT_DROP")
    return {"failures": failures, "passed": not failures}


def _timestamp(value: str | datetime | None) -> datetime | None:
    if value is None:
        return None
    if isinstance(value, datetime):
        return value
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def health_alerts(
    now: datetime,
    latest_run: dict | None,
    latest_success: dict | None,
    current_source: dict,
    today_success: bool | None = None,
) -> list[str]:
    alerts = []
    accepted_today = today_success if today_success is not None else (
        latest_success is not None and str(latest_success["logical_date"]) == now.date().isoformat()
    )
    if not accepted_today:
        alerts.append("MISSING_DAILY_RUN")
    if current_source["players"] == 0 or current_source["stats"] == 0:
        alerts.append("SOURCE_EMPTY")
    if latest_run:
        if latest_run["status"] == "failed":
            alerts.append("RUN_FAILED")
        started = _timestamp(latest_run["started_at"])
        if latest_run["status"] == "running" and started and now - started > timedelta(hours=2):
            alerts.append("RUN_STUCK")
    source_watermark = _timestamp(current_source.get("watermark"))
    accepted_watermark = _timestamp(latest_success.get("source_watermark")) if latest_success else None
    if source_watermark and (accepted_watermark is None or source_watermark > accepted_watermark):
        if now - source_watermark >= timedelta(hours=24):
            alerts.append("SOURCE_UPDATE_DELAYED")
    return alerts


def _connect():
    import psycopg2

    return psycopg2.connect(
        host=os.environ["DBT_HOST"],
        port=int(os.getenv("DBT_PORT", "5432")),
        user=os.environ["DBT_USER"],
        password=os.environ["DBT_PASSWORD"],
        dbname=os.getenv("DBT_DBNAME", "postgres"),
        sslmode=os.getenv("DBT_SSLMODE", "require"),
    )


def _source_snapshot(cursor) -> dict:
    cursor.execute(
        """
        select
          (select count(*) from public.players),
          (select count(*) from public.player_season_stats),
          (select count(*) from public.players where is_active),
          (select count(*) from public.players where is_active and market_value_eur is not null),
          greatest(
            (select max(updated_at) from public.players),
            (select max(updated_at) from public.player_season_stats)
          )
        """
    )
    players, stats, active_players, priced_players, watermark = cursor.fetchone()
    return {
        "players": players,
        "stats": stats,
        "active_players": active_players,
        "priced_players": priced_players,
        "watermark": watermark.isoformat() if watermark else None,
    }


def _mart_snapshot(cursor) -> dict:
    cursor.execute(
        """
        select count(*)::integer,
          (count(*) - count(distinct player_season_id))::integer,
          count(*) filter (where appearances > 0 and minutes > 0)::integer
        from analytics_candidate_marts.fact_player_season
        """
    )
    facts, duplicate_keys, positive_facts = cursor.fetchone()
    return {"facts": facts, "duplicate_keys": duplicate_keys, "positive_facts": positive_facts}


def promote_candidate(cursor) -> None:
    """Swap tested dbt schemas into publication names in the caller's transaction."""
    cursor.execute(
        """select to_regnamespace('analytics_candidate_staging') is not null,
                  to_regnamespace('analytics_candidate_marts') is not null"""
    )
    staging_ready, marts_ready = cursor.fetchone()
    if not staging_ready or not marts_ready:
        raise RuntimeError("Candidate dbt schemas are missing")

    for schema in ("analytics_staging", "analytics_marts"):
        cursor.execute(f"drop schema if exists {schema}_previous cascade")
        cursor.execute(f"select to_regnamespace('{schema}') is not null")
        if cursor.fetchone()[0]:
            cursor.execute(f"alter schema {schema} rename to {schema}_previous")
    cursor.execute("alter schema analytics_candidate_staging rename to analytics_staging")
    cursor.execute("alter schema analytics_candidate_marts rename to analytics_marts")
    cursor.execute("drop schema if exists analytics_marts_previous cascade")
    cursor.execute("drop schema if exists analytics_staging_previous cascade")


def make_run_key(run_id: str, attempt: int) -> str:
    if not run_id or attempt < 1:
        raise ValueError("A GitHub run ID and positive attempt are required")
    return f"{run_id}:{attempt}"


def _run_key() -> str:
    return make_run_key(os.environ["GITHUB_RUN_ID"], int(os.environ["GITHUB_RUN_ATTEMPT"]))


def _source_counts(snapshot: dict) -> dict:
    return {key: snapshot[key] for key in ("players", "stats", "active_players", "priced_players")}


def start_run() -> None:
    from psycopg2.extras import Json

    logical_date = parse_logical_date(os.getenv("PIPELINE_LOGICAL_DATE") or datetime.now(timezone.utc).date().isoformat())
    trigger = "schedule" if os.environ["GITHUB_EVENT_NAME"] == "schedule" else "manual"
    accepted = os.getenv("PIPELINE_ACCEPT_NEW_BASELINE") == "true"
    reason = os.getenv("PIPELINE_BASELINE_REASON", "").strip()
    if accepted and (trigger != "manual" or not reason):
        raise ValueError("A manual baseline acceptance requires a reason")

    source_empty = False
    with _connect() as connection, connection.cursor() as cursor:
        snapshot = _source_snapshot(cursor)
        cursor.execute(
            """
            insert into public.analytics_pipeline_runs (
              run_key, github_run_id, github_attempt, logical_date, trigger_kind,
              status, source_read_at, source_watermark, source_counts, acceptance_reason
            ) values (%s, %s, %s, %s, %s, 'running', now(), %s, %s, %s)
            on conflict (run_key) do nothing
            """,
            (
                _run_key(), os.environ["GITHUB_RUN_ID"], int(os.environ["GITHUB_RUN_ATTEMPT"]),
                logical_date, trigger, snapshot["watermark"], Json(_source_counts(snapshot)),
                reason if accepted else None,
            ),
        )
        if cursor.rowcount != 1:
            raise RuntimeError("This GitHub run attempt is already recorded")
        if snapshot["players"] == 0 or snapshot["stats"] == 0:
            source_empty = True
            cursor.execute(
                """update public.analytics_pipeline_runs
                   set status='failed', completed_at=now(), error_code='SOURCE_EMPTY'
                   where run_key=%s""",
                (_run_key(),),
            )
    if source_empty:
        raise RuntimeError("Source player or season-stat table is empty")
    print(json.dumps({"event": "analytics.started", "run_key": _run_key(), "logical_date": str(logical_date)}))


def finish_run(dbt_outcome: str) -> None:
    from psycopg2.extras import Json

    accepted = os.getenv("PIPELINE_ACCEPT_NEW_BASELINE") == "true"
    with _connect() as connection, connection.cursor() as cursor:
        cursor.execute(
            """select status, source_counts, source_watermark
               from public.analytics_pipeline_runs where run_key=%s for update""",
            (_run_key(),),
        )
        row = cursor.fetchone()
        if not row:
            raise RuntimeError("Run was not started; watchdog will report missing state")
        status, original_counts, original_watermark = row
        if status != "running":
            raise RuntimeError(f"Run already finalized: {status}")

        current = _source_snapshot(cursor)
        mart = None
        failure = None
        if dbt_outcome != "success":
            failure = "DBT_BUILD_FAILED"
        else:
            try:
                mart = _mart_snapshot(cursor)
                cursor.execute(
                    """select source_counts from public.analytics_pipeline_runs
                       where status='completed' order by completed_at desc limit 1"""
                )
                baseline_row = cursor.fetchone()
                baseline = baseline_row[0] if baseline_row else None
                checks = assess_snapshot(current, mart, baseline, accepted)
                if source_changed(
                    {**original_counts, "watermark": original_watermark.isoformat() if original_watermark else None},
                    current,
                ):
                    failure = "SOURCE_CHANGED_DURING_BUILD"
                elif checks["failures"]:
                    failure = checks["failures"][0]
            except Exception:
                failure = "MART_CHECK_FAILED"

        if not failure:
            cursor.execute("savepoint candidate_promotion")
            try:
                promote_candidate(cursor)
            except Exception:
                cursor.execute("rollback to savepoint candidate_promotion")
                failure = "PROMOTION_FAILED"

        metrics = None
        if not failure and mart:
            metrics = {
                "market_value_coverage_pct": round(100 * current["priced_players"] / current["active_players"], 2)
                if current["active_players"] else None,
                "positive_fact_pct": round(100 * mart["positive_facts"] / mart["facts"], 2)
                if mart["facts"] else None,
            }
        cursor.execute(
            """update public.analytics_pipeline_runs
               set status=%s, completed_at=now(), source_counts=%s, mart_counts=%s,
                   metrics=%s, error_code=%s
               where run_key=%s""",
            (
                "failed" if failure else "completed", Json(_source_counts(current)),
                Json(mart) if mart else None, Json(metrics) if metrics else None,
                failure, _run_key(),
            ),
        )
    print(json.dumps({"event": "analytics.finished", "run_key": _run_key(), "status": "failed" if failure else "completed", "error_code": failure}))
    if failure:
        raise RuntimeError(failure)


def _github_request(method: str, path: str, payload: dict | None = None):
    url = f"https://api.github.com/repos/{os.environ['GITHUB_REPOSITORY']}{path}"
    body = json.dumps(payload).encode() if payload is not None else None
    request = url_request.Request(
        url, data=body, method=method,
        headers={
            "Authorization": f"Bearer {os.environ['GH_TOKEN']}",
            "Accept": "application/vnd.github+json",
            "Content-Type": "application/json",
            "User-Agent": "quickscout-analytics-monitor",
        },
    )
    try:
        with url_request.urlopen(request, timeout=20) as response:
            return json.load(response)
    except url_error.HTTPError as exc:
        raise RuntimeError(f"GitHub Issues API returned {exc.code}") from exc


def sync_issues(alerts: list[str], state_available: bool, details: dict[str, str] | None = None) -> None:
    issues = []
    page = 1
    while True:
        batch = _github_request("GET", f"/issues?state=open&per_page=100&page={page}")
        issues.extend(batch)
        if len(batch) < 100:
            break
        page += 1
    managed = {
        issue["title"].removeprefix(ISSUE_PREFIX): issue
        for issue in issues
        if issue["title"].startswith(ISSUE_PREFIX) and "pull_request" not in issue
    }
    for code in alerts:
        title = ISSUE_PREFIX + code
        evidence = (details or {}).get(code)
        body = ALERT_DESCRIPTIONS[code]
        if evidence:
            body += f"\n\nEvidence: {evidence}"
        body += "\n\nSee the analytics workflow and dashboard for the latest run evidence."
        existing = managed.get(code)
        if existing is None:
            _github_request("POST", "/issues", {"title": title, "body": body})
        elif existing["body"] != body:
            _github_request("PATCH", f"/issues/{existing['number']}", {"body": body})
    for code, issue in managed.items():
        if code not in alerts and (state_available or code == "STATE_UNAVAILABLE"):
            _github_request("PATCH", f"/issues/{issue['number']}", {"state": "closed"})


def watchdog() -> None:
    from psycopg2.extras import RealDictCursor

    now = datetime.now(timezone.utc)
    try:
        with _connect() as connection, connection.cursor(cursor_factory=RealDictCursor) as cursor:
            current = _source_snapshot(cursor)
            cursor.execute(
                """select status, started_at, logical_date, github_run_id, error_code
                   from public.analytics_pipeline_runs
                   order by started_at desc limit 1"""
            )
            latest_run = cursor.fetchone()
            cursor.execute(
                """select logical_date, source_watermark from public.analytics_pipeline_runs
                   where status='completed' order by completed_at desc limit 1"""
            )
            latest_success = cursor.fetchone()
            cursor.execute(
                """select exists(select 1 from public.analytics_pipeline_runs
                   where status='completed' and logical_date=%s)""", (now.date(),)
            )
            today_success = cursor.fetchone()["exists"]
        alerts = health_alerts(now, latest_run, latest_success, current, today_success)
        details = {"MISSING_DAILY_RUN": f"UTC logical date: {now.date().isoformat()}"}
        if latest_run:
            run_link = f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/actions/runs/{latest_run['github_run_id']}"
            run_evidence = f"Run: {run_link}"
            if latest_run["error_code"]:
                run_evidence += f" · Code: {latest_run['error_code']}"
            details["RUN_FAILED"] = run_evidence
            details["RUN_STUCK"] = run_evidence
        details["SOURCE_EMPTY"] = f"Players: {current['players']}; season stats: {current['stats']}"
        details["SOURCE_UPDATE_DELAYED"] = f"Current source update: {current['watermark']}"
        state_available = True
    except Exception as exc:
        print(json.dumps({"event": "analytics.watchdog.state_unavailable", "error_type": type(exc).__name__}))
        alerts = ["STATE_UNAVAILABLE"]
        details = {}
        state_available = False
    sync_issues(alerts, state_available, details)
    print(json.dumps({"event": "analytics.watchdog.completed", "alerts": alerts}))


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["start", "finish", "watchdog"])
    parser.add_argument("--dbt-outcome", default="skipped")
    args = parser.parse_args()
    if args.command == "start":
        start_run()
    elif args.command == "finish":
        finish_run(args.dbt_outcome)
    else:
        watchdog()


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Database and transport exceptions can include connection details.
        print(json.dumps({"event": "analytics.operation.failed", "error_type": type(error).__name__}), file=sys.stderr)
        sys.exit(1)
