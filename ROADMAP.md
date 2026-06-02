# Project Roadmap

Priority order: **Product Phase 4 — Scout Workflow UX** is the next default focus after MVP, production readiness, and automated refresh validation. Avoid auth, provider reconciliation, and schema-heavy watchlists unless explicitly requested.

---

# Phase 1 — Setup

- [x] Initialize repository
- [x] Configure TypeScript and Next.js App Router
- [x] Setup ESLint (Next.js 16 / ESLint CLI flat config)
- [x] Setup Vitest (`npm test`)
- [x] Create Supabase schema (`supabase/schema.sql`)
- [x] Add seed players dataset (`src/data/seedPlayers.ts`)
- [x] Add `.env.example` and README setup docs

---

# Phase 2 — MVP

## High Priority

- [x] Implement scoring and recommendation modes (`like_for_like`, `cheaper`, `young_upside`)
- [x] Connect home UI to `POST /api/recommend`
- [x] Player search API and autocomplete
- [x] Recommendation run persistence (Supabase or in-memory fallback)
- [x] Request payload validation with unit tests
- [x] Fix production build and lint pipeline
- [x] Deploy MVP to Vercel and smoke-test core flow (`npm run smoke:local` or `BASE_URL=... npm run smoke` after `vercel --prod`)
- [x] Verify Supabase-backed runs in hosted environment (optional; `npm run smoke:supabase` on Supabase-backed deploy)

## Medium Priority

- [x] Expand unit tests (candidate filtering via `recommendCandidates.ts`)
- [x] Add route-level integration tests for `/api/recommend` and `/api/players/search`
- [x] Improve API error responses and client-side error mapping
- [x] Document Vercel env vars and cron secret strategy (see README Deploy to Vercel)

## Low Priority

- [x] UI polish (empty states, table responsiveness)
- [x] README diagram or quick-start for scouts (non-technical users)

## Explicitly Out Of Scope (Phase 2)

- [ ] Authentication
- [ ] Provider ingestion (API-Football / Footio)
- [ ] Cron refresh implementation
- [ ] Multi-provider reconciliation

---

# Phase 3 — Production Readiness

## Planned

- [x] E2E tests (Playwright or Next experimental test runner)
- [x] CI pipeline: lint + test + build on pull requests
- [x] Monitoring and logging (recommendation run failures, API errors)
- [x] Rate limiting on public API routes
- [x] Secure cron endpoint (`CRON_SECRET` or Vercel cron auth)
- [x] Performance review (search debounce, recommend payload size)
- [x] Manual post-deploy smoke workflow for production validation

---

# Product Phase 4 — Scout Workflow UX

## High Priority

- [x] Add recommendation run history view using existing `GET /api/recommendation-runs`
- [x] Add recommendation run detail view using existing `GET /api/recommendation-runs/[runKey]`
- [x] Add CSV export for current results and saved run results

## Medium Priority

- [x] Add candidate comparison/shortlist UX without auth
- [x] Add smoke or E2E coverage for history and export

## Explicitly Out Of Scope Unless Requested

- [ ] Authentication and user accounts
- [ ] Multi-provider conflict resolution
- [ ] Schema-heavy watchlists or saved-team planning

---

# Data Pipeline Phases (README)

Aligned with [README.md](README.md) provider integration plan.

## Phase 1 — Seed baseline

- [x] Seed canonical players and season stats
- [x] Ranking/recommendation logic against stable schema
- [x] Keep Supabase seed data in parity with local seed fallback

## Phase 2 — Single provider sync

- [x] Choose first provider (API-Football)
- [x] Implement fetch + transform in `src/lib/provider/`
- [x] Upsert players and stats into Supabase
- [x] Add manual API-Football sync command
- [x] Keep API contracts unchanged for UI and `/api/recommend`
- [x] Validate API-Football sync against hosted Supabase with real credentials

## Phase 3 — Multi-provider enrichment

- [ ] Advanced metrics and scouting events
- [ ] Source precedence and conflict resolution

## Phase 4 — Automated refresh

- [x] Implement `GET /api/cron/refresh` ingestion job
- [x] Wire Vercel cron (`vercel.json`) with monitoring
- [x] Alert on failed ingestion / stale data
- [x] Validate scheduled production cron run after deploy

---

# Future Ideas

- Scout watchlists and saved comparisons
- Export recommendations (CSV / PDF)
- Team-level squad planning view
- Confidence tuning per league or position
- Analytics dashboard for recommendation run history
