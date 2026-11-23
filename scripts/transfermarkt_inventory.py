"""Audit one local, versioned Transfermarkt release. Requires duckdb==1.4.4."""
import argparse
import hashlib
import json
import tempfile
from datetime import date, datetime, timezone
from pathlib import Path

import duckdb

TABLES = ("players", "games", "appearances", "player_valuations", "competitions", "game_lineups")


def digest(path):
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def audit(raw, output):
    meta = json.loads((raw / "source.json").read_text())
    if not meta.get("url") or meta.get("mode") not in {"strict", "retrospective"}:
        raise ValueError("Supply a source URL and a valid mode")
    strict = meta["mode"] == "strict"
    timestamp = meta.get("published_at")
    if strict and (not timestamp or not meta.get("version")):
        raise ValueError("Strict mode requires a verified publication timestamp and version")
    if timestamp:
        published = datetime.fromisoformat(timestamp)
        if published.tzinfo is None:
            raise ValueError("Supply a publication timestamp with timezone")
        if strict and published.astimezone(timezone.utc).date() > date(2025, 6, 30):
            raise ValueError("Release was published after the strict cutoff")
    if output.exists():
        raise FileExistsError(output)
    con = duckdb.connect()
    files = {}
    db = raw / "transfermarkt-datasets.duckdb"
    if db.is_file():
        quoted = str(db.resolve()).replace("'", "''")
        con.execute(f"attach '{quoted}' as source (read_only)")
        files[db.name] = digest(db)
    input_rows = {}
    for table in TABLES:
        if db.is_file():
            found = con.execute("select count(*) from information_schema.tables where table_catalog='source' and table_schema='main' and table_name=?", [table]).fetchone()[0]
            if found:
                con.execute(f"create temp view {table} as select * from source.main.{table}")
                continue
        else:
            paths = [p for p in (raw / f"{table}.csv", raw / f"{table}.csv.gz") if p.is_file()]
            if len(paths) == 1:
                con.read_csv(str(paths[0]), all_varchar=True).create_view(table)
                files[paths[0].name] = digest(paths[0])
                continue
            if paths:
                raise ValueError(f"Multiple inputs for {table}")
        if table != "game_lineups":
            raise ValueError(f"Missing {table}")
        con.execute("create temp view game_lineups as select null::varchar game_id,null::varchar player_id,null::varchar club_id,null::varchar position where false")
    for table in TABLES:
        input_rows[table] = con.execute(f"select count(*) from {table}").fetchone()[0]
    con.execute("create temp table settings(strict boolean)")
    con.execute("insert into settings values (?)", [strict])
    con.execute(Path(__file__).with_suffix(".sql").read_text())
    for query in (
        "select game_id from matches group by game_id having count(*)>1",
        "select player_id from players group by player_id having count(*)>1",
        "select a.game_id from match_players a join matches m using(game_id) where a.club_id is null or a.club_id not in (m.home_club_id,m.away_club_id)",
    ):
        if con.execute(query).fetchone():
            raise ValueError(f"Ambiguous source identity or fixture: {query}")
    outputs = {
        "players": "select * from player_snapshot order by player_id",
        "matches": "select * from matches order by competition_id,match_date,game_id",
        "team_games": "select * from team_games order by competition_id,game_id,club_id",
        "appearances": "select * from match_players order by game_id,player_id",
        "groups": "select status,count(*) as players from player_snapshot group by status order by status",
        "coverage": """select league,expected,count(distinct game_id) observed,
            count(*) filter(where positive_appearances<11 or positive_appearances>17 or uncertain_appearances>0) as flagged_team_games
            from (values ('GB1',380),('ES1',380),('IT1',380),('FR1',306),('L1',306)) l(league,expected)
            left join team_games on league=competition_id group by league,expected order by league""",
        "funnel": """select
            count(*) filter(where status<>'target') as observed_non_target,
            count(*) filter(where is_rw) as confirmed_rw,
            count(*) filter(where is_rw and age_years between 0 and 25) as rw_within_age,
            count(*) filter(where status in ('eligible','over_budget','unverified_price')) as rw_age_minutes,
            count(*) filter(where status='eligible') as verified_within_budget
            from (select *, status<>'target' and rw_evidence in ('lineup_and_appearance','historical_profile') as is_rw
                  from player_snapshot)""",
        "target": "select * from player_snapshot where status='target'",
        "league_minutes": """select competition_id,count(*) as observed_players,
            min(total_minutes) minimum_minutes,median(total_minutes) median_minutes,
            max(total_minutes) maximum_minutes from (
                select competition_id,player_id,sum(minutes) total_minutes
                from match_players join matches using(game_id) group by competition_id,player_id
            ) group by competition_id order by competition_id""",
        "completeness": """select count(*) as observed_players,count(birth_date) as with_birth_date,
            count(*) filter(where rw_evidence='unresolved') as unresolved_position,
            count(*) filter(where unknown_minute_rows=0) as with_all_observed_minutes,
            count(observed_goals) as with_observed_goals,count(observed_assists) as with_observed_assists,
            count(value_eur) as with_dated_price,median(valuation_age_days) filter(where value_eur is not null) as median_price_age_days
            from player_snapshot""",
    }
    output.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=output.parent) as temp:
        stage = Path(temp) / "snapshot"
        stage.mkdir()
        for name, query in outputs.items():
            con.sql(query).write_csv(str(stage / f"{name}.csv"), header=True)
        manifest = dict(source=meta, extracted_at=datetime.now(timezone.utc).isoformat(),
                        cutoff="2025-06-30", inputs_sha256=files, input_rows=input_rows, duckdb=duckdb.__version__,
                        outputs_sha256={p.name: digest(p) for p in sorted(stage.glob("*.csv"))})
        (stage / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
        stage.rename(output)
    con.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("raw", type=Path)
    parser.add_argument("output", type=Path)
    args = parser.parse_args()
    audit(args.raw, args.output)
