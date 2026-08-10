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
- [x] Validate the earlier single-target scheduled production cron run after deploy

## Phase 5 — Expanded API-Football coverage

- [x] Support multiple configured API-Football player URLs
- [x] Follow API-Football pagination with a per-target page cap
- [x] De-dupe provider players before transform/upsert
- [x] Add coverage metadata to provider sync summaries
- [x] Keep downstream app and recommendation API contracts unchanged

## Final milestone — Big Five season 2024 production proof

- [x] Restrict ingestion to exact Big Five league/season blocks before aggregation
- [x] Preserve canonical identity by provider source and provider player ID across ingestion, search, selection, and ranking
- [x] Aggregate multi-team facts and pass accuracy with pass-total/minutes weighting
- [x] Add actual-page quota probes, 20% gates, fail-closed headers/cap, pacing, and bounded retries
- [x] Add service-role-only persisted sync claims, duplicate suppression, deterministic cron rotation, and persisted health
- [x] Scale Supabase reads and writes with cursor/chunk pagination and bounded batch/concurrency sizes
- [x] Add canary/full audit, checksum, smoke, E2E, and 3+50 performance acceptance tooling
- [x] Generate and apply the additive `provider_sync_runs` migration
- [x] Add free staged per-target quota accounting, 6200ms pacing, cap 60, and the 285-second cron deadline
- [x] Add conservative later-page quota ledger and atomic provider-season global lock
- [ ] Deploy the canary release and configure all five production targets
- [ ] Complete canary, probe, two full backfills, two dbt builds, hosted audits, and production performance evidence
- [ ] Validate one scheduled cron plus same-day duplicate skip, then remove the cron schedule and performance secret
- [ ] Record final production evidence and stop the project

---

# Analytics Pipeline

## Phase 0 — dbt Analytics Foundation

- [x] Keep `public.players` and `public.player_season_stats` as unchanged application-owned sources
- [x] Add dbt Core/Postgres configuration with environment-based credentials
- [x] Add staging views with normalized player and competition identities
- [x] Add `dim_player`, `dim_team`, `dim_league`, and `fact_player_season`
- [x] Share deterministic key and team fallback macros across dimensions and fact
- [x] Add grain, metric, row-count, foreign-key, and exact-schema tests
- [x] Add canonical `player_season_id` while preserving `fact_player_season_key` compatibility
- [x] Run `dbt debug`, 6 models, 76 tests, key-alias validation, and docs generation in GitHub Actions (`82/82` passed on 2026-08-10)
- [x] Document local operation and the current-team fallback limitation
- [x] Validate `dbt debug` and two consecutive `dbt build` runs against hosted Supabase (`80/80` passed in both builds on 2026-08-07)

---

# Future Ideas

- Scout watchlists and saved comparisons
- Export recommendations (CSV / PDF)
- Team-level squad planning view
- Confidence tuning per league or position
- Analytics dashboard for recommendation run history
