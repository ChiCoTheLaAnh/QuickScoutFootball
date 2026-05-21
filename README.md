# QuickScout Football

QuickScout Football is an MVP scouting intelligence app that helps identify football players worth tracking using seeded player profiles, season stats, and recommendation runs.

## Project purpose

The goal is to provide a fast, explainable recommendation pipeline for scouting:

- Store player entities with stable provider IDs and normalized names.
- Track season-level performance metrics in a queryable table.
- Persist recommendation job history for repeatability and analysis.
- Keep the architecture lightweight while provider integrations mature.

## Local setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create environment file:

   ```bash
   cp .env.example .env.local
   ```

3. Start development server:

   ```bash
   npm run dev
   ```

4. (Optional) Apply Supabase schema from `supabase/schema.sql` to your local or hosted project.

## Running with seed fallback

Supabase is optional for local MVP development. Leave these values empty or unset in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

Then run:

```bash
npm install
npm run dev
```

The app will read from `src/data/seedPlayers.ts`.

## Running with Supabase

Set the required Supabase values in `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

`SUPABASE_SERVICE_ROLE_KEY` is optional for this MVP. Server reads use it when present and fall back to the anon key otherwise.

Apply the schema using the Supabase SQL editor by running the contents of:

```bash
supabase/schema.sql
```

Or, with a linked Supabase CLI project:

```bash
supabase db push
```

Apply seed data using the SQL editor by running the contents of:

```bash
supabase/seed.sql
```

Then start the app:

```bash
npm run dev
```

Provider ingestion, authentication, and cron refresh logic are intentionally not implemented yet.

## Verify locally

```bash
npm run lint
npm run test
npm run build
```

Optional production-mode smoke test (starts `next start` on port 3000):

```bash
npm run smoke:local
```

## Deploy to Vercel

### Prerequisites

- Vercel account linked to this repository
- `npm run build` passes locally

### Environment variables

Set these in the Vercel project (**Settings → Environment Variables**):

| Variable | Required | Notes |
|----------|----------|-------|
| `NEXT_PUBLIC_APP_URL` | Recommended | Production URL, e.g. `https://your-app.vercel.app` |
| `NEXT_PUBLIC_SUPABASE_URL` | Optional | Omit for seed-only deploy |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional | Omit for seed-only deploy |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional | Server writes; falls back to anon key |
| `CRON_SHARED_SECRET` | Future | Not used until cron ingestion is implemented |
| Provider API keys | Future | See `.env.example`; not used in MVP |

### Seed-only deploy (fastest MVP)

1. Import the repo in Vercel (framework preset: **Next.js**).
2. Leave Supabase variables **unset** — the app uses `src/data/seedPlayers.ts`.
3. Deploy. Recommendation runs are stored in-memory per serverless instance (not durable across cold starts).

### Supabase-backed deploy

1. Create a Supabase project and run `supabase/schema.sql` then `supabase/seed.sql` in the SQL editor.
2. Set all three Supabase env vars in Vercel.
3. Deploy. Runs persist in `recommendation_runs`.

### Cron note

`vercel.json` schedules `GET /api/cron/refresh` daily. The route is a stub (`not_implemented`) until Phase 4 — safe to deploy, no ingestion runs yet.

### Deploy commands

```bash
npx vercel          # preview deploy
npx vercel --prod   # production deploy
```

### Post-deploy smoke test

Replace `BASE_URL` with your deployment URL:

```bash
BASE_URL=https://your-app.vercel.app npm run smoke
```

Checks:

- `GET /api/players/search?q=salah` returns results
- `POST /api/recommend` returns recommendations for Mohamed Salah
- `GET /` returns the home page

### Hosted Supabase verification (optional)

After a Supabase-backed deploy:

1. Submit a recommendation on the home page (or via `POST /api/recommend`).
2. Call `GET /api/recommendation-runs` — confirm a recent run appears.
3. Call `GET /api/recommendation-runs/[runKey]` — confirm stored response payload.

Or run against production with credentials configured:

```bash
BASE_URL=https://your-app.vercel.app npm run smoke:supabase
```

(`smoke:supabase` requires Supabase env vars on the target deployment.)

## API routes

MVP route surface:

- `GET /api/players` — list all players, or search with `?q=`.
- `GET /api/players/search?q=` — alias for player search (same response shape as `GET /api/players?q=`).
- `GET /api/players/[id]` — fetch one player with latest stats.
- `POST /api/recommend` — run the recommender and persist a `recommendation_runs` record.
- `GET /api/recommendations` — fetch the latest completed recommendation output.
- `GET /api/recommendation-runs` — list recent run metadata (newest first, limit 20).
- `GET /api/recommendation-runs/[runKey]` — fetch one run including stored response payload.
- `GET /api/cron/refresh` — scheduled refresh stub (configured in `vercel.json`, inactive until Phase 4).

Recommendation runs are stored in Supabase when configured; otherwise they are kept in an in-memory buffer for the current server process (seed-only local dev).

## Seed-data-first architecture

This project follows a **seed-data-first** approach:

- Start with curated static/seeded datasets to validate product flow.
- Model entities exactly as they will appear in production provider syncs (IDs, timestamps, metadata).
- Keep ingestion deterministic so recommendation outputs are reproducible during early testing.
- Gradually swap seed pipelines with provider sync jobs without changing downstream API contracts.

## Future provider integration plan

Provider integrations are intentionally staged:

1. **Phase 1 — Seed baseline**
   - Seed canonical players and season stats.
   - Build ranking/recommendation logic against stable schema.

2. **Phase 2 — Single provider sync**
   - Add one external provider for player + market value updates.
   - Map external IDs to `provider_source` + `provider_*_id` columns.

3. **Phase 3 — Multi-provider enrichment**
   - Add advanced event and scouting metrics.
   - Reconcile conflicts via confidence rules and source precedence.

4. **Phase 4 — Fully automated refresh**
   - Run daily ingestion via cron (`/api/cron/refresh`).
   - Monitor run status using `recommendation_runs` + logs/alerts.

This keeps MVP delivery fast while preserving a path to production-grade data operations.
