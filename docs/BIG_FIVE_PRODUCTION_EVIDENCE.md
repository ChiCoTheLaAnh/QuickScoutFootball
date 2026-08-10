# Big Five season 2024 production evidence

Status: conservative quota ledger and global provider-season lock are verified, but the free staged rollout is blocked because the live API-Football Free plan rejects every page greater than 3. Cron remains disabled. Historical season 2024 refresh is validation-only.

## Release identity

| Evidence | Value |
|---|---|
| Implementation commit | `d87972a` (conservative quota ledger/global lock; free staged guardrails `37bf9dc`; identity implementation `bb0ec83`) |
| Cron-off ledger deployment | `dpl_FsvqBembHCz41KvWcAfWJSwgBw9f` — READY at `quick-scout-football.vercel.app`; production smoke passed; cron list empty |
| Final deployment without cron | Pending |
| Supabase migrations | `20260808000359_provider_sync_runs`, `20260808003758_provider_sync_runs_hardening`, and `20260808040855_provider_sync_run_global_lock` applied |

## Local acceptance

| Check | Result |
|---|---|
| Unit/integration | 138 passed; 2 environment-gated tests skipped |
| TypeScript | Passed |
| ESLint | Passed |
| Production build | Passed |
| Playwright E2E | Exact-identity flow passed 1/1 |
| Production-mode smoke | Local and deployed production alias passed |
| Search benchmark | 3 warmups + 50 measured; 50 HTTP 200; median 6.7 ms; p95 9.9 ms; max 11.8 ms; 189-byte payload; 1 result |
| Recommendation benchmark | 3 warmups + 50 measured; 50 HTTP 200; median 8.3 ms; p95 9.8 ms; max 10.8 ms; 7,474-byte payload; 10 results |

The local benchmark used the exact seed identity `seed:seed-mohamed-salah`. Production acceptance must use an exact API-Football provider pair, so these local numbers are a regression baseline rather than production evidence.

## Provider rollout

| Step | Pages / quota | Rows / coverage | Result |
|---|---|---|---|
| Pre-backfill hosted baseline | N/A | 20 API-Football identities; 20 league-39 facts; zero canonical/fact duplicates, orphans, or out-of-scope facts | Recorded; not acceptance evidence |
| Premier League 39 canary | `paging.total=57`; cap `50`; daily remaining before broader probe `99` | No writes; hosted counts remained 20 identities / 20 facts | Failed closed before pagination because the live total exceeds the approved cap |
| Pass 1 Day 1 — league 39 | Cap `60`; 6200ms start pacing; live diagnostic showed daily `90/100`, minute `6/10`, pages `57` | Two attempts stopped after about 19s; hosted counts remained 20 identities / 20 facts | Provider intermittently omitted all four required quota headers on a later page; fail closed, no fallback quota inference |
| Quota-ledger hardening | Page-1 remains complete-header fail-closed; every later attempt decrements a conservative ledger; daily headers cannot increase it | Unit/integration/lint/typecheck/build/E2E/local smoke pass; hosted concurrent-scope test pass | Ready for one league-39 retry in a new provider quota window; no diagnostic probe |
| Pass 1 Day 1 retry — 2026-08-10 | Page 1 reused as probe; request pacing remained 6200ms; run stopped when requesting page 4 after 19.7s | Persisted `failed`; lock finalized/released; hosted counts remain 20 identities / 20 league-39 facts; checksum `86a6c99fc0c868751d272bf83030ea73ce128ed20a9e54b82cbb6a5539de0f23` | Provider error: `Free plans are limited to a maximum value of 3 for the Page parameter`; zero player/fact writes |
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
- Missing later-page quota headers are recorded and estimated conservatively; initial probe headers are never inferred. A partial unique `apiFootball:2024` lock serializes all manual and cron quota consumers.
- The current Free provider plan cannot fetch league totals beyond page 3. The approved league-level staged rollout therefore cannot reach page 57 or satisfy volume acceptance without a separately approved data-access redesign or plan change.
