# Project Status

## Current Phase

**Phase 2 — MVP Development**

Data pipeline context (see [README.md](README.md)): **Phase 1 (Seed baseline)** is complete. **Phase 2 (Single provider sync)** has not started.

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
- ESLint (flat config) and Vitest unit tests for scoring + request validation
- `npm run lint`, `npm run build`, and `npm test` passing
- Provider module stubs (`apiFootball`, `footio`) and cron route stub (`/api/cron/refresh`)
- Documentation: [README.md](README.md), [AGENTS.md](AGENTS.md)

## In Progress

- Expanding automated test coverage (route integration / E2E not started)
- Production deployment verification (Vercel config present; full deploy smoke test pending)
- UX polish (loading/error states exist on home page; not uniform across all API consumers)

## Not Started (This Phase Or Later)

- Authentication
- Single-provider data ingestion (API-Football or Footio)
- Multi-provider enrichment and conflict resolution
- Cron-based daily refresh implementation
- Monitoring, rate limiting, CI/CD hardening

## Blockers

- None critical for local MVP development
- Provider work blocked on API keys, rate-limit strategy, and field-mapping decisions (see `.env.example`)

---

# Definition Of Done (Current Phase)

The phase is complete when:

- [x] Main user flow works end-to-end: search target player → submit filters → view top recommendations with explanations
- [ ] App deploys successfully to Vercel with seed or Supabase-backed data
- [x] No critical runtime errors in local `npm run dev` for the core flow
- [x] Basic loading and error states on the recommender UI
- [x] README setup instructions are accurate
- [x] `npm run lint`, `npm run build`, and `npm test` pass
- [ ] Optional: Supabase-backed recommendation runs verified in a hosted environment

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

- Implement one external provider for player + market value updates
- Map external IDs to `provider_source` / `provider_*_id` columns without breaking API contracts

---

# Important Constraints

- Prefer simple solutions
- Keep file structure clean (`app/`, `src/lib/`, `src/data/`)
- Do not rewrite working systems unnecessarily
- Minimize dependencies
- Keep commits small and isolated
- Seed-data-first: do not change downstream API shapes when adding ingestion
