# Scoring V2 · Cloud handoff

The 2024/25 Salah case is awaiting a verified player-level run. Human evaluation is postponed. Cloud can develop and test against synthetic fixtures now. The real-data benchmark requires a privately staged release and a usable Salah profile.

## Three methods to compare

Use the same Big Five domestic-league pool for all three methods. At June 30, 2025, require RW evidence, age ≤25, at least 1,200 minutes and a dated positive valuation ≤€45M. Exclude Salah from the candidate pool. [Eligibility audit](../../scripts/transfermarkt_inventory.sql)

| Method | Intended ranking |
|---|---|
| QuickScout role-aware score | Combine profile similarity, role evidence, output, affordability and age profile. The current application assigns the same output calculation to role fit and output. Resolving that duplication and freezing the V2 weights are pending. |
| Attacking production baseline | Rank by 90 × (goals + assists) / minutes on the same observed matches. Missing scoring inputs need explicit handling. |
| Similarity baseline | Rank by similarity to Salah on shared observed features. Record feature definitions, normalization and missingness alongside the run. |

[Current scoring implementation](../../src/lib/scoring.ts)

## Observed results and sensitivity

The inventory fixture exercises cutoff dates, boundary eligibility, repeated appearance rows, conflicting valuations and reproducible CSV output. The Cloud checkout contains no raw Transfermarkt CSVs or verified V2 rankings. The real candidate count, ranking agreement and shortlist quality remain unknown. The existing dashboard case study uses different age and minutes constraints. [Inventory fixture](../../scripts/test_transfermarkt_inventory.py) · [Feasibility evidence](SCOUTING_VALIDATION_V1.md) · [Dashboard case study](SCOUTING_CASE_STUDY.md)

No measured sensitivity results are available. Once the pool is verified, vary one weight at a time by ±20%, renormalize the weights, and rerun after removing overlapping or optional features. Report both top-five membership changes and order changes. If exactly five candidates qualify, membership is invariant by construction. Historical missing appearances may depress minute totals, while retrospective profile labels may have changed since the cutoff. [Publisher’s appearance recovery report](https://github.com/dcaribou/transfermarkt-datasets/issues/349)

## Reproduction

With Python 3.11+ and DuckDB 1.4.4, run the fixture from the repository root:

```sh
python -m unittest discover -s scripts -p test_transfermarkt_inventory.py
```

For a real release, stage raw data and source metadata privately, then run the inventory into a fresh output directory:

```sh
release=.tmp/transfermarkt/retrospective/kaggle-download
python scripts/transfermarkt_inventory.py "$release/raw" "$release/audit"
```

Use the manifest to compare input and output hashes across runs. Review team-match coverage, the target profile and unresolved evidence before estimating the feasible pool. Keep player-level outputs under `.tmp/` and private evaluation materials under `evaluation/private/`. [Source metadata and reconciliation instructions](SCOUTING_VALIDATION_V1.md)
