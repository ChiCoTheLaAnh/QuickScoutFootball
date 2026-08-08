# Project Status

## Current Phase

**Final Big Five season 2024 production-proof rollout in progress; Product Phase 4 and Analytics Phase 0 remain complete**

Data pipeline context (see [README.md](README.md)): the identity-safe, quota-gated Big Five implementation is complete locally. The additive persisted-run migration has been applied to hosted Supabase; canary/backfill/deployment evidence is still pending.

## Objective Of Current Phase

Finish the project with defensible production data volume while avoiding identity corruption and unnecessary provider quota use.

Focus on:

- Exact Big Five league/season filtering and provider-pair identity
- Safe quota probes and two-run backfill gates
- Durable duplicate/concurrency protection for cron validation
- Hosted canary, two idempotent backfills, dbt, audit, smoke/E2E, and 50-iteration performance proof
- Removing the historical cron after one scheduled validation

Avoid:

- Premature optimization
- Large refactors
- Overengineering
- Unnecessary abstractions
- Auth, accounts, and schema-heavy watchlists unless explicitly requested
- Multi-provider reconciliation before scout workflow UX is useful

---

# Current State

## Completed

- Next.js 16 App Router project initialized (TypeScript, React 19, Tailwind)
- Supabase schema and seed SQL (`supabase/schema.sql`, `supabase/seed.sql`)
- Seed player dataset (`src/data/seedPlayers.ts`) with per-90-ready stats
- Core scoring engine (`src/lib/scoring.ts`) and request validation (`src/lib/recommendationRequest.ts`)
- API routes: players list/search/detail, recommend, recommendation-runs, recommendations
- Home UI: autocomplete search, recommendation form, results table with score breakdown
- Seed fallback when Supabase env vars are unset; in-memory recommendation runs in seed-only mode
- ESLint (flat config), Vitest unit tests, and route integration tests (seed mode)
- Deployment docs, smoke scripts (`npm run smoke`, `npm run smoke:local`, `npm run smoke:supabase`)
- `npm run lint`, `npm run build`, and `npm test` passing
- API-Football provider fetch, transform, and Supabase upsert foundation; Footio remains a later candidate stub
- Manual API-Football sync command (`npm run sync:api-football`)
- Cron-based API-Football refresh route (`/api/cron/refresh`)
- Documentation: [README.md](README.md), [AGENTS.md](AGENTS.md)
- Hosted Supabase-backed recommendation runs verified
- API error responses include stable machine-readable codes while preserving `error` strings
- Results UI includes distinct empty states and mobile-friendly recommendation cards
- GitHub Actions CI workflow runs lint, tests, and build on pull requests and pushes to `main`
- Manual GitHub Actions production smoke workflow validates deployed core flow and optional cron health
- Supabase seed data is aligned with local seed fallback players and season stats
- Playwright E2E coverage verifies the core search-to-recommendation browser flow
- Structured server logs cover recommendation/search/cron events and Supabase persistence fallback
- Public recommend/search routes have best-effort in-memory rate limits
- Cron refresh uses Vercel-style `Authorization: Bearer <CRON_SECRET>` auth
- Search/recommendation routes include performance metadata, and `npm run perf:review` measures endpoint latency and payload size
- README includes a quick start for scouts
- Hosted API-Football sync validated against Supabase (`fetched: 20`, `transformed: 20`, `playersUpserted: 20`, `statsUpserted: 20`, `skipped: 0`)
- The earlier single-target API-Football cron refresh called the validated sync path and logged refresh summaries/failures
- Persisted refresh health tracks the latest run plus the latest success/failure, stale status, and emits alert-ready structured logs plus an authenticated health endpoint
- Earlier single-target production cron validation completed before this final milestone (`GET /api/cron/refresh` 200, followed by cron health smoke validation)
- Recommendation history UI uses existing persisted recommendation runs
- Recommendation run detail/replay view uses saved request and response payloads
- CSV export is available for current results and saved run results
- Playwright E2E covers the core recommendation flow plus history/detail/export and shortlist export
- Browser-only shortlist/comparison UX works without auth or database migrations
- API-Football sync supports multiple configured player URLs, pagination with a page cap, de-dupe, and coverage metadata
- Analytics Phase 0 validated against hosted Supabase on 2026-08-07: `dbt debug` passed; two consecutive builds each passed 6 models and 74 tests (`80/80`); 2 staging views and 4 mart tables preserve all 40 season-stat rows
- Big Five ingestion filters every statistics block by exact league ID and season before multi-team aggregation
- Canonical identity, target lookup/exclusion, and ranking tie-breaks use provider source plus provider player ID; legacy same-name ambiguity returns `409`
- API-Football quota probes use actual page totals, 20% safety gates, fail-closed headers/page cap, minute pacing, and bounded retries
- Provider writes are batched at 250 players and 500 facts; app reads use 500-row player cursors and 100-ID stat chunks with concurrency four
- Persisted `provider_sync_runs` claims protect cron quota from duplicate/overlapping delivery; health reads persisted state
- Current merged tree passes 122 unit/integration tests (2 environment-gated skips), typecheck, lint, production build, exact-identity E2E, production-mode smoke, and 3+50 endpoint benchmarks
- Hosted `provider_sync_runs` and hardening migrations are applied; table access is limited to service-role reads/writes and claim/finalize RPC execution

## In Progress

- Deploy the Big Five canary release and configure the exact five season-2024 provider targets
- Run the approved canary → probe → two full backfills → two dbt builds → production acceptance sequence
- Capture one scheduled cron/duplicate/health proof, then remove the schedule and temporary performance secret

## Not Started (This Phase Or Later)

- Authentication
- Multi-provider enrichment and conflict resolution
- Additional CI/CD hardening after production smoke observations

## Blockers

- None critical for local MVP development
- None for Data Phase 2 or automated refresh validation
- Production rollout requires exact `API_FOOTBALL_PLAYERS_URLS`, provider quota, and deploy access before it changes live data volume

---

# Definition Of Done (Current Phase)

The phase is complete when:

- [x] Main user flow works end-to-end: search target player → submit filters → view top recommendations with explanations
- [x] App deploys successfully to Vercel with seed or Supabase-backed data (see README; verify with `npm run smoke` / `npm run smoke:local`)
- [x] No critical runtime errors in local `npm run dev` for the core flow
- [x] Basic loading and error states on the recommender UI
- [x] README setup instructions are accurate
- [x] `npm run lint`, `npm run build`, and `npm test` pass
- [x] Optional: Supabase-backed recommendation runs verified in a hosted environment

---

# Next Phase

**Final milestone — Big Five production proof**

Planned focus:

- Complete the locked rollout and then stop feature development

**Data Phase 4 — Automated refresh** (see [README.md](README.md))

- Validate exactly one historical cron delivery and duplicate skip, then remove its schedule

**Data Phase 5 — Expanded provider coverage** (see [README.md](README.md))

- Backfill and audit all five Big Five league IDs for API-Football season 2024

**Analytics Phase 0 — complete** (see [README.md](README.md))

- Hosted validation and lineage documentation are complete; no additional analytics features are in Phase 0 scope

---

# Important Constraints

- Prefer simple solutions
- Keep file structure clean (`app/`, `src/lib/`, `src/data/`)
- Do not rewrite working systems unnecessarily
- Minimize dependencies
- Keep commits small and isolated
- Seed-data-first: do not change downstream API shapes when adding ingestion
