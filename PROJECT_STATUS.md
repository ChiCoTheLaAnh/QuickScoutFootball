# Project Status

## Current Phase

**Product Phase 4 — Scout Workflow UX core tasks complete; Data Phase 5 expanded provider coverage implemented; Analytics Phase 0 awaiting hosted validation**

Data pipeline context (see [README.md](README.md)): **Phase 1 (Seed baseline)** is complete. **Phase 2 (Single provider sync)** is validated for API-Football against hosted Supabase.

## Objective Of Current Phase

Turn the working recommender into a more useful scout workflow without adding auth or multi-provider complexity.

Focus on:

- Recommendation history using existing persisted runs
- Recommendation run detail/replay from saved request and response payloads
- CSV export for current and saved candidate lists
- Seed-data-first local dev with optional Supabase persistence
- Stable API contracts for players and recommendation runs

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
- Automated API-Football cron refresh calls the validated sync path and logs refresh summaries/failures
- Automated refresh health tracks last success/failure, stale status, and emits alert-ready structured logs plus an authenticated health endpoint
- Production cron refresh validation completed after deploy (`GET /api/cron/refresh` 200, followed by cron health smoke validation)
- Recommendation history UI uses existing persisted recommendation runs
- Recommendation run detail/replay view uses saved request and response payloads
- CSV export is available for current results and saved run results
- Playwright E2E covers the core recommendation flow plus history/detail/export and shortlist export
- Browser-only shortlist/comparison UX works without auth or database migrations
- API-Football sync supports multiple configured player URLs, pagination with a page cap, de-dupe, and coverage metadata

## In Progress

- Analytics Phase 0 dbt models and tests are implemented locally; hosted Supabase `dbt debug` and two consecutive `dbt build` validations remain

## Not Started (This Phase Or Later)

- Authentication
- Multi-provider enrichment and conflict resolution
- Additional CI/CD hardening after production smoke observations

## Blockers

- None critical for local MVP development
- None for Data Phase 2 or automated refresh validation
- Expanded provider coverage requires production env configuration (`API_FOOTBALL_PLAYERS_URLS`) and operator validation before it changes live data volume
- Analytics Phase 0 completion requires PostgreSQL connection credentials with read access to `public.*` and create access for the analytics schemas

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

**Product Phase 4 — Scout Workflow UX**

Planned focus:

- Additional CI/CD hardening after production smoke observations

**Data Phase 4 — Automated refresh** (see [README.md](README.md))

- Continue monitoring cron health output and structured logs for stale data after deploys

**Data Phase 5 — Expanded provider coverage** (see [README.md](README.md))

- Configure expanded API-Football URL targets in production and validate larger sync counts

**Analytics Phase 0 — dbt foundation** (see [README.md](README.md))

- Run `dbt debug` and two consecutive `dbt build` validations against hosted Supabase
- Mark the phase complete only after all dbt source, model, singular, and schema-location tests pass

---

# Important Constraints

- Prefer simple solutions
- Keep file structure clean (`app/`, `src/lib/`, `src/data/`)
- Do not rewrite working systems unnecessarily
- Minimize dependencies
- Keep commits small and isolated
- Seed-data-first: do not change downstream API shapes when adding ingestion
