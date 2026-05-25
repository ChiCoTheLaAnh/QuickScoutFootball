# Project Status

## Current Phase

**Phase 3 — Production Readiness core tasks complete; ready for Data Phase 2 planning**

Data pipeline context (see [README.md](README.md)): **Phase 1 (Seed baseline)** is complete. **Phase 2 (Single provider sync)** foundation is implemented for API-Football; hosted sync validation still requires provider credentials.

## Objective Of Current Phase

Build a working end-to-end MVP with core scouting functionality only.

Focus on:

- Player search and recommendation flow (target player → filters → ranked candidates)
- Explainable scoring (similarity, role fit, affordability, age upside)
- Seed-data-first local dev with optional Supabase persistence
- Stable API contracts for players and recommendation runs
- Deployability on Vercel

Avoid:

- Premature optimization
- Large refactors
- Overengineering
- Unnecessary abstractions
- Multi-provider ingestion before one provider works

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
- Cron route stub (`/api/cron/refresh`)
- Documentation: [README.md](README.md), [AGENTS.md](AGENTS.md)
- Hosted Supabase-backed recommendation runs verified
- API error responses include stable machine-readable codes while preserving `error` strings
- Results UI includes distinct empty states and mobile-friendly recommendation cards
- GitHub Actions CI workflow runs lint, tests, and build on pull requests and pushes to `main`
- Supabase seed data is aligned with local seed fallback players and season stats
- Playwright E2E coverage verifies the core search-to-recommendation browser flow
- Structured server logs cover recommendation/search/cron events and Supabase persistence fallback
- Public recommend/search routes have best-effort in-memory rate limits
- Cron refresh stub requires `x-cron-secret` backed by `CRON_SHARED_SECRET`
- Search/recommendation routes include performance metadata, and `npm run perf:review` measures endpoint latency and payload size
- README includes a quick start for scouts

## In Progress

- Hosted API-Football sync validation with real provider credentials

## Not Started (This Phase Or Later)

- Authentication
- Multi-provider enrichment and conflict resolution
- Cron-based daily refresh implementation
- Additional CI/CD hardening

## Blockers

- None critical for local MVP development
- Hosted provider sync validation requires `API_FOOTBALL_API_KEY` and `API_FOOTBALL_PLAYERS_URL`

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

**Phase 3 — Production Readiness** (product)

Planned focus:

- Route integration and E2E tests
- Performance and caching where measured bottlenecks exist
- Monitoring and structured logging
- Security (auth, cron secret, rate limits)
- CI/CD pipeline (lint, test, build on PR)

**Data Phase 2 — Single provider sync** (see [README.md](README.md))

- Validate API-Football sync against a hosted Supabase database with real provider credentials
- Keep the manual service path stable before wiring cron automation

---

# Important Constraints

- Prefer simple solutions
- Keep file structure clean (`app/`, `src/lib/`, `src/data/`)
- Do not rewrite working systems unnecessarily
- Minimize dependencies
- Keep commits small and isolated
- Seed-data-first: do not change downstream API shapes when adding ingestion
