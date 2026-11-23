# Scouting Validation V1 · Salah feasibility decision

**Decision on 2026-11-23: blocked at source verification.** No real player-level snapshot was available for the season 2024 Salah replacement case. The size of the eligible pool is unknown. Ranking, expert reviews and workflow timing have no measured results for this case.

| Question | Result | Evidence needed |
|---|---|---|
| How many distinct real RWs, excluding Salah? | Unknown | Provider identities and explicit right-wing position evidence for the season. Generic attacker labels must be counted separately. |
| How many played at least 1,200 minutes and were at most 25? | Unknown | Season minutes at a documented grain, transfer reconciliation, date of birth and a common recruitment decision date. |
| How many have an estimated value within €45m? | Unknown | A positive EUR valuation, its source and an observation date at or before the decision date. A database update timestamp alone cannot establish this. |
| Can Salah serve as the reference profile? | Unverified | Exact real provider identity, league and season, minutes and observed features shared with the candidate pool. |

## Evidence available

- Repository revision: `e6b656253e4c8636f89b73d26fd43edb6a48e13f`. The tracked scouting workbook is documented as a seed snapshot. The supplied attachment contains the project brief.
- Local PostgreSQL fixture: 20 player identities under provider `seed`. The inventory returned no non-seed season groups.
- Historical hosted evidence recorded 20 API-Football identities and 20 league-39 facts. Page 4 was rejected during the staged backfill. The aggregates contain no candidate records or valuation provenance. [Production evidence](../BIG_FIVE_PRODUCTION_EVIDENCE.md)
- No hosted Supabase or dbt connection bindings were available in the development shell. Access to the public player-list endpoint returned HTTP 403 from this environment. This observation does not establish the state of the hosted database. Even when reachable, the summary endpoint omits season minutes and valuation provenance.

## Reproduce and resume

Run the read-only inventory against the supplied local fixture from the repository root:

```sh
docker exec -i quickscout-dev-postgres psql -X -v ON_ERROR_STOP=1 -U postgres -d quickscout_ci < supabase/audits/scouting_validation_inventory.sql
```

To reopen the gate, supply a read-only player and season-stat export with source identifiers, position evidence and dated valuation evidence. Record its extraction time, checksum, competition coverage and recruitment decision date. Check whether numeric zeroes indicate observed results or ingestion defaults. Reconcile transfers before totaling minutes, exclude Salah by identity and publish distinct counts after each filter.

Stop the case if the verified pool is empty or Salah lacks a comparable profile. With 1–4 eligible players, report a descriptive case with its actual denominator. With at least five, proceed to scoring and blinded evaluation. At exactly five, Precision@5 cannot distinguish rankings of the same five players.

## Transfermarkt follow-up · 2026-11-23

**Historical and retrospective eligible counts are both unknown.** No player-level payload was available. The publisher's Git repository supplies a concrete historical reference: the June 14 commit points to an **April 11** prepared dataset (11 files, 172,220,266 bytes, DVC directory MD5 `a6cc59dd99460db12a8dcc9865399254.dir`). This predates the season finish. June raw scraping commits exist separately. The June repository timestamp cannot establish coverage through June. The historical DVC index, publisher's current DuckDB endpoint and Kaggle download endpoint returned HTTP 403 in this environment. [June pointer](https://github.com/dcaribou/transfermarkt-datasets/blob/017b4cfe8d46002ac4e70ddb752a65adc4891bad/data/prep.dvc) · [Prepared dataset update](https://github.com/dcaribou/transfermarkt-datasets/commit/3c6a94b84afb2a389666188b019d636cef5c58b0)

The maintainer attributed the 2024/25 data loss to partial scrapes overwriting prior records and identified fix `3452a20` on March 18, 2026. Their reported recovered appearance counts were GB1 11,567, ES1 11,899, IT1 11,888, L1 9,528 and FR1 9,413. These are external comparison figures. A newly downloaded release still needs its own audit. [Issue and resolution](https://github.com/dcaribou/transfermarkt-datasets/issues/349) · [Fix](https://github.com/dcaribou/transfermarkt-datasets/commit/3452a20d54be4ba5d9c02c60dbb235b9e8d7017e)

### Manual intake and reproduction

Use the publisher's [Kaggle versions](https://www.kaggle.com/datasets/davidcariboo/player-scores/versions) to obtain a dated historical release published by June 30, 2025 UTC, or a dated release containing the March 2026 recovery. For a historical DVC checkout with accessible object storage, the prepared files can also be recovered with `dvc pull data/prep.dvc` at the pinned commit above. Check the actual last game dates.

Place files under `.tmp/transfermarkt/strict/<version>/raw/` or `.tmp/transfermarkt/retrospective/<version>/raw/` from the repo root. Use exactly one release per directory. Required: `transfermarkt-datasets.duckdb` **or** `players.csv`, `games.csv`, `competitions.csv`, `appearances.csv`, `player_valuations.csv`. Include `game_lineups.csv` when present. Individual CSV files may be gzipped. Add local `source.json` with keys `version`, `url`, `published_at`, and `mode`. Strict mode requires the verified version and timezone-aware publication timestamp. For retrospective inputs of unknown vintage, record the reported source URL, use null for unknown version and publication date, and document the provenance limitation. Verify metadata against the release page before running. The unversioned DuckDB download alone cannot substantiate its publication date.

From the checkout, with Python 3.11+ and DuckDB 1.4.4 installed in an isolated virtual environment:

```sh
python scripts/transfermarkt_inventory.py "$release/raw" "$release/audit"
python -m unittest discover -s scripts -p test_transfermarkt_inventory.py
```

Set `release` to the chosen version directory. Run again into a fresh directory and compare the output hashes in the manifests. The offline SQL inventory binds to one source at a time. The manifest records source metadata, extraction time, input row counts, input hashes and output hashes. The CSVs include player IDs, identity fields, observed minutes/goals/assists, RW appearance counts, latest dated historical valuation, eligibility status, filter counts, completeness and team-match coverage. RW minutes are unavailable from a lineup label alone. Output denominators cover players with appearance records in scoped league matches; wholly missing players remain an unknown population.

### Review before publishing the count

1. Review `coverage.csv`, `matches.csv` and `team_games.csv`. Match official fixture dates and teams for each competition, documenting independent reference URLs and differences. Investigate anomalous team-match participation and minutes distributions. A matching season total cannot verify the identity of every fixture. Review `appearances.csv` for conflicting player-game records.
2. Review `target.csv` for Transfermarkt ID 148455, verify Mohamed Salah and Liverpool match participation and reconcile appearances, minutes, goals and assists with independent season totals. Record source, definitions and any differences. Missing appearance data can depress observed totals; `below_threshold_observed` is provisional until coverage is reconciled.
3. Inspect the funnel and unresolved evidence alongside the three financial groups. Only confirmed RW, age and minutes enter those groups. Strict mode accepts the release's recorded Right Winger sub-position or a same-team positive-minute RW lineup appearance; retrospective mode uses the latter. Observed zero RW appearances with no lineup file means evidence is unavailable. Compare raw position labels for aliases before sign-off. Exclude current market values at all stages.
4. For two releases, compare match IDs per league, then full-join appearances by game and player and compare player totals by player ID. Report additions, removals, minute changes and crossings of 1,200 separately. Do not add recovered rows to the strict snapshot. Until fixture and target reconciliation is signed off, report only verified candidates in the observed data, with the counts whose status may change. Five verified candidates supports considering a benchmark; expert evaluation needs a separate readiness decision.
