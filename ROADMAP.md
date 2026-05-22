# Project Roadmap

Priority order: complete **Phase 2 — MVP** items before **Phase 3 — Production** or data-phase provider work unless explicitly requested.

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
- [ ] README diagram or quick-start for scouts (non-technical users)

## Explicitly Out Of Scope (Phase 2)

- [ ] Authentication
- [ ] Provider ingestion (API-Football / Footio)
- [ ] Cron refresh implementation
- [ ] Multi-provider reconciliation

---

# Phase 3 — Production Readiness

## Planned

- [ ] E2E tests (Playwright or Next experimental test runner)
- [ ] CI pipeline: lint + test + build on pull requests
- [ ] Monitoring and logging (recommendation run failures, API errors)
- [ ] Rate limiting on public API routes
- [ ] Secure cron endpoint (`CRON_SECRET` or Vercel cron auth)
- [ ] Performance review (search debounce, recommend payload size)

---

# Data Pipeline Phases (README)

Aligned with [README.md](README.md) provider integration plan.

## Phase 1 — Seed baseline

- [x] Seed canonical players and season stats
- [x] Ranking/recommendation logic against stable schema

## Phase 2 — Single provider sync

- [ ] Choose first provider (API-Football or Footio)
- [ ] Implement fetch + transform in `src/lib/provider/`
- [ ] Upsert players and stats into Supabase
- [ ] Keep API contracts unchanged for UI and `/api/recommend`

## Phase 3 — Multi-provider enrichment

- [ ] Advanced metrics and scouting events
- [ ] Source precedence and conflict resolution

## Phase 4 — Automated refresh

- [ ] Implement `GET /api/cron/refresh` ingestion job
- [ ] Wire Vercel cron (`vercel.json`) with monitoring
- [ ] Alert on failed ingestion / stale data

---

# Future Ideas

- Scout watchlists and saved comparisons
- Export recommendations (CSV / PDF)
- Team-level squad planning view
- Confidence tuning per league or position
- Analytics dashboard for recommendation run history
