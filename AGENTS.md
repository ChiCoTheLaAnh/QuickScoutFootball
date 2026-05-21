# Agent Instructions

## Project goal

QuickScout Football is an MVP scouting intelligence app. It helps identify football players worth tracking by combining seeded (or Supabase-backed) player profiles, season stats, and an explainable recommendation pipeline. Users pick a target player and filters; the app scores candidates (like-for-like, cheaper alternative, young upside) and persists recommendation run history for repeatability.

## Tech stack

- **Framework:** Next.js 16 (App Router)
- **Language:** TypeScript, React 19
- **Database:** Supabase (PostgreSQL) — optional; falls back to `src/data/seedPlayers.ts` and in-memory recommendation runs when env vars are unset
- **Deployment:** Vercel (`vercel.json` cron stub for `/api/cron/refresh`)

## Current state

**What already works:**

- Home UI: player search autocomplete, recommendation form, results table with score breakdown
- API routes: players list/search/detail, `POST /api/recommend`, recommendation runs list/detail, latest recommendations
- Scoring and normalization in `src/lib/scoring.ts` and `src/lib/normalize.ts`
- Seed-data-first dev without Supabase; Supabase schema/seed in `supabase/schema.sql` and `supabase/seed.sql`
- Provider module stubs (`apiFootball`, `footio`) ready for Phase 2+ integration

**What is broken / missing:**

- No automated test suite (`npm test` not defined)
- Provider ingestion not implemented (stubs return empty / `not_implemented`)
- Cron refresh (`GET /api/cron/refresh`) returns `not_implemented` — scheduled in Vercel but inactive until Phase 4
- Authentication not implemented
- Multi-provider sync, conflict resolution, and production monitoring not built

## How to run

```bash
npm install
cp .env.example .env.local   # optional; leave Supabase vars empty for seed-only mode
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

**With Supabase:** set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and optionally `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`, then apply `supabase/schema.sql` and `supabase/seed.sql`.

**Verify before finishing work:**

```bash
npm run lint
npm run build
```

(`npm test` is not configured yet; use lint + build until tests are added.)

## Rules for the agent

- Do not rewrite unrelated files.
- Prefer small commits.
- Always explain changed files.
- Run `npm run lint` and `npm run build` before final answer (add tests when a test runner exists).
- If unsure, inspect files before editing.
