# Big Five season 2024 production evidence

Status: free staged implementation complete locally; deployment and Pass 1 pending. Historical season 2024 refresh is validation-only.

## Release identity

| Evidence | Value |
|---|---|
| Implementation commit | `bb0ec83` (deployment packaging follow-up `a746661`) |
| Canary deployment | `dpl_GZnq51WTH3D5tWuUgwwYK9ay3UJd` — READY at `quick-scout-football.vercel.app` |
| Final deployment without cron | Pending |
| Supabase migrations | `20260808000359_provider_sync_runs` and `20260808003758_provider_sync_runs_hardening` applied |

## Local acceptance

| Check | Result |
|---|---|
| Unit/integration | 122 passed; 2 environment-gated tests skipped |
| TypeScript | Passed |
| ESLint | Passed |
| Production build | Passed |
| Playwright E2E | Exact-identity flow passed 1/1 |
| Production-mode smoke | Passed: search, exact-identity recommendation, validation 400, and missing route 404 |
| Search benchmark | 3 warmups + 50 measured; 50 HTTP 200; median 6.7 ms; p95 9.9 ms; max 11.8 ms; 189-byte payload; 1 result |
| Recommendation benchmark | 3 warmups + 50 measured; 50 HTTP 200; median 8.3 ms; p95 9.8 ms; max 10.8 ms; 7,474-byte payload; 10 results |

The local benchmark used the exact seed identity `seed:seed-mohamed-salah`. Production acceptance must use an exact API-Football provider pair, so these local numbers are a regression baseline rather than production evidence.

## Provider rollout

| Step | Pages / quota | Rows / coverage | Result |
|---|---|---|---|
| Pre-backfill hosted baseline | N/A | 20 API-Football identities; 20 league-39 facts; zero canonical/fact duplicates, orphans, or out-of-scope facts | Recorded; not acceptance evidence |
| Premier League 39 canary | `paging.total=57`; cap `50`; daily remaining before broader probe `99` | No writes; hosted counts remained 20 identities / 20 facts | Failed closed before pagination because the live total exceeds the approved cap |
| Five-league probe | `39=57`, `140=53`, `135=52`, `78=38`, `61=46`; `S=246`; daily remaining after probe `94`; minute remaining `4` | Read-only; five page-one calls | Two-run gate requires `ceil(2 × 246 × 1.20) = 591`, so the live quota failed closed |
| Full backfill 1 | Pending | Pending | Pending |
| Full backfill 2 | Pending | Pending | Pending |

## Hosted data audit

| Acceptance | First run | Second run |
|---|---|---|
| League IDs exactly `39,61,78,135,140` | Pending | Pending |
| Active provider identities ≥1,000 | Pending | Pending |
| Active target facts ≥1,000 | Pending | Pending |
| Positive appearances and minutes ≥95% | Pending | Pending |
| Candidates with minutes ≥900 and no budget ≥500 | Pending | Pending |
| Canonical/fact duplicates, orphans, out-of-scope facts | Pending | Pending |
| Content checksum excluding timestamps | Pending | Pending |

## Analytics and application acceptance

| Check | First run | Second/final run |
|---|---|---|
| `dbt build` | Pending | Pending |
| Staging/fact row-count parity | Pending | Pending |
| Production smoke/E2E | Pending | Pending |
| Production search 3+50 | Pending | Pending |
| Production recommendation 3+50 | Pending | Pending |

## Cron validation and teardown

| Evidence | Result |
|---|---|
| One scheduled cron invocation completed | Pending |
| Same-day duplicate returned `200 skipped` | Pending |
| Duplicate made zero provider calls | Pending |
| Health read persisted run state | Pending |
| `crons` removed from `vercel.json` | Pending |
| `PERF_REVIEW_SECRET` removed | Pending |
| Final redeploy and smoke | Pending |

## Known limitations

- API-Football season `2024` is historical and must not remain on a recurring refresh schedule.
- Missing market value, xG, and xA remain null; they are not synthesized.
- No cross-provider reconciliation is performed by name. Same-name provider identities remain distinct and are reported by the audit.
- The live provider account exposes roughly a 100-request daily allowance. Backfills therefore run locally one target per quota gate across multiple daily windows; no Vercel full sync is permitted.
- The approved fail-closed page cap is 60. Request starts are paced by at least 6200ms and every target retains the 20% probe-inclusive quota buffer.
