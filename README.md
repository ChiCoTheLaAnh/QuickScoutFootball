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

Provider ingestion is available through the manual API-Football sync command and the scheduled cron refresh route. Authentication and multi-provider enrichment remain staged for later phases.

## Quick start for scouts

1. Open the app home page.
2. Type a target player name, for example `Mohamed Salah`.
3. Select the player from the search suggestions.
4. Adjust role, age, market value, minutes, and recommendation mode.
5. Click **Get Recommendations**.
6. Review the ranked candidates, explanation text, and score breakdown.

The MVP is designed for replacement scouting: start with one target player, tune constraints, and compare the ranked alternatives.

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

Optional cron health smoke test against a deployed app:

```bash
BASE_URL=https://your-app.vercel.app CRON_SECRET=... npm run smoke:cron
```

Optional endpoint performance review against a running app:

```bash
npm run perf:review
```

Use `BASE_URL` and `PERF_LABEL` to compare seed and Supabase-backed deployments:

```bash
PERF_LABEL=supabase BASE_URL=https://your-app.vercel.app npm run perf:review
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
| `SUPABASE_SERVICE_ROLE_KEY` | Optional for app, required for provider sync | Server writes; app reads fall back to anon key |
| `CRON_SECRET` | Required for cron route | Vercel sends this as `Authorization: Bearer <CRON_SECRET>`; cron returns `503` if unset |
| `LOG_LEVEL` | Optional | `info` by default; supports `info`, `warn`, `error`, `silent` |
| `REFRESH_STALE_AFTER_HOURS` | Optional | Cron health stale threshold; defaults to `36` hours |
| `API_FOOTBALL_API_KEY` | Required for manual provider sync | Sent as `x-apisports-key` |
| `API_FOOTBALL_PLAYERS_URL` | Required unless `API_FOOTBALL_PLAYERS_URLS` is set | Full API-Football players endpoint URL to fetch; still supported for single-target sync |
| `API_FOOTBALL_PLAYERS_URLS` | Optional | Comma- or newline-separated full player endpoint URLs for expanded coverage |
| `API_FOOTBALL_MAX_PAGES_PER_TARGET` | Optional | Pagination cap per configured URL; defaults to `10` |

### Seed-only deploy (fastest MVP)

1. Import the repo in Vercel (framework preset: **Next.js**).
2. Leave Supabase variables **unset** — the app uses `src/data/seedPlayers.ts`.
3. Deploy. Recommendation runs are stored in-memory per serverless instance (not durable across cold starts).

### Supabase-backed deploy

1. Create a Supabase project and run `supabase/schema.sql` then `supabase/seed.sql` in the SQL editor.
2. Set all three Supabase env vars in Vercel.
3. Deploy. Runs persist in `recommendation_runs`.

### Cron note

`vercel.json` schedules `GET /api/cron/refresh` daily at `05:00 UTC`. The route requires `Authorization: Bearer <CRON_SECRET>` and runs the validated API-Football sync path.

`GET /api/cron/health` uses the same authorization and returns refresh health. When Supabase is configured, stale checks use the latest API-Football `players.updated_at`; otherwise they use the current server process snapshot. The default stale threshold is 36 hours, which allows a daily cron one missed-run buffer.

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

To also verify the cron health endpoint after a production deploy:

```bash
BASE_URL=https://your-app.vercel.app CRON_SECRET=... npm run smoke:cron
```

Set `SMOKE_CRON_HEALTH_EXPECT_HEALTHY=1` when the deploy should already have a fresh successful cron run recorded.

You can also run the same checks from GitHub Actions with **Production Smoke** (`workflow_dispatch`). Configure the repository secret `CRON_SECRET`, then provide the deployed `base_url`. Enable `expect_healthy_cron` only after the scheduled cron should have run successfully.

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

## Manual API-Football sync

API-Football sync is available as an operator-run command. The same service path is used by the scheduled cron refresh route.

Set Supabase write credentials and API-Football credentials:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
API_FOOTBALL_API_KEY=your-api-football-key
API_FOOTBALL_PLAYERS_URL=https://your-api-football-players-endpoint
# Optional expanded coverage:
API_FOOTBALL_PLAYERS_URLS=https://endpoint-one,https://endpoint-two
API_FOOTBALL_MAX_PAGES_PER_TARGET=10
```

Run the sync:

```bash
npm run sync:api-football
```

The command prints a JSON summary with `fetched`, `transformed`, `playersUpserted`, `statsUpserted`, `skipped`, and coverage metadata such as `targetsFetched` and `pagesFetched`. It does not print API keys, raw provider payloads, configured URLs, or full player records.

## API routes

MVP route surface:

- `GET /api/players` — list all players, or search with `?q=`.
- `GET /api/players/search?q=` — alias for player search (same response shape as `GET /api/players?q=`).
- `GET /api/players/[id]` — fetch one player with latest stats.
- `POST /api/recommend` — run the recommender and persist a `recommendation_runs` record.
- `GET /api/recommendations` — fetch the latest completed recommendation output.
- `GET /api/recommendation-runs` — list recent run metadata (newest first, limit 20).
- `GET /api/recommendation-runs/[runKey]` — fetch one run including stored response payload.
- `GET /api/cron/refresh` — scheduled API-Football refresh route (configured in `vercel.json`; requires cron authorization).
- `GET /api/cron/health` — authenticated refresh-health snapshot for cron validation and stale-data checks.

Recommendation runs are stored in Supabase when configured; otherwise they are kept in an in-memory buffer for the current server process (seed-only local dev).

## Production hardening notes

- Server routes emit JSON-style logs to stdout with event name, route, status, duration, and safe metadata. Logs do not include full request payloads, recommendation responses, or secrets.
- Search and recommendation success logs include performance metadata such as result counts, candidate counts, and response payload size.
- Public MVP routes use best-effort in-memory rate limits per IP and route: `POST /api/recommend` allows 20 requests per minute, and nonblank `GET /api/players/search` allows 60 requests per minute.
- Rate-limit responses use the additive API error shape with `code: "RATE_LIMITED"` and status `429`.
- Cron calls must include `Authorization: Bearer <CRON_SECRET>`; missing or invalid secrets return `CRON_UNAUTHORIZED`, unset `CRON_SECRET` returns `CRON_NOT_CONFIGURED`, and sync failures return `CRON_REFRESH_FAILED`.
- Cron refresh success and failure logs include refresh-health metadata (`refreshStatus`, `isStale`, `needsAttention`, timestamps, and stale threshold). Failed syncs also emit `cron.refresh.alert`.
- Cron health is intentionally lightweight. It reads Supabase freshness when available and keeps latest failure metadata in-process; use Vercel cron execution history and structured logs as the durable source for failed-run details. Use `npm run smoke:cron` to confirm the deployed health route is reachable and correctly authorized.

## Cron operations runbook

Use this after each production deploy with Supabase, API-Football, and `CRON_SECRET` configured.

1. Confirm the deploy is reachable:

   ```bash
   BASE_URL=https://your-app.vercel.app npm run smoke
   ```

2. Confirm cron health authorization and response shape:

   ```bash
   BASE_URL=https://your-app.vercel.app CRON_SECRET=... npm run smoke:cron
   ```

3. After the scheduled `05:00 UTC` cron window, confirm Vercel cron history shows `GET /api/cron/refresh` ran. Then require healthy data:

   ```bash
   SMOKE_CRON_HEALTH_EXPECT_HEALTHY=1 BASE_URL=https://your-app.vercel.app CRON_SECRET=... npm run smoke:cron
   ```

4. Check structured logs:
   - Success: `cron.refresh.completed` with `refreshStatus: "healthy"` and provider counts.
   - Failure: `cron.refresh.failed` plus `cron.refresh.alert`.
   - Health check: `cron.health.completed` or `cron.health.attention_required`.

5. Triage failures:
   - `CRON_NOT_CONFIGURED`: set `CRON_SECRET` on the deployment.
   - `CRON_UNAUTHORIZED`: align Vercel cron authorization and the deployment `CRON_SECRET`.
   - `CRON_REFRESH_FAILED`: verify `API_FOOTBALL_API_KEY`, `API_FOOTBALL_PLAYERS_URL` or `API_FOOTBALL_PLAYERS_URLS`, Supabase service-role credentials, and provider quota.
   - `status: "unknown"`: no successful refresh is visible yet; wait for the first scheduled run or run the refresh manually with valid cron auth.
   - `status: "stale"`: the last Supabase API-Football player update is older than `REFRESH_STALE_AFTER_HOURS`; inspect cron history and provider sync logs.

The GitHub Actions **Production Smoke** workflow runs the same smoke script manually against a supplied `base_url`. It is intentionally not part of pull-request CI because it depends on deployed infrastructure and the `CRON_SECRET` repository secret.

## Seed-data-first architecture

This project follows a **seed-data-first** approach:

- Start with curated static/seeded datasets to validate product flow.
- Model entities exactly as they will appear in production provider syncs (IDs, timestamps, metadata).
- Keep ingestion deterministic so recommendation outputs are reproducible during early testing.
- Gradually swap seed pipelines with provider sync jobs without changing downstream API contracts.

## Provider integration plan

Provider integrations are intentionally staged:

1. **Phase 1 — Seed baseline**
   - Seed canonical players and season stats.
   - Build ranking/recommendation logic against stable schema.

2. **Phase 2 — Single provider sync**
   - First provider: API-Football.
   - Fetch raw players through `API_FOOTBALL_PLAYERS_URL` using `API_FOOTBALL_API_KEY`.
   - Transform raw payloads in `src/lib/provider/apiFootball.ts`.
   - Upsert normalized players and season stats with `src/lib/supabase/providerSync.ts`.
   - Run manually with `npm run sync:api-football`.
   - Keep `/api/recommend` and UI response shapes unchanged.

3. **Phase 3 — Multi-provider enrichment**
   - Add advanced event and scouting metrics.
   - Reconcile conflicts via confidence rules and source precedence.

4. **Phase 4 — Fully automated refresh**
   - Run daily ingestion via cron (`/api/cron/refresh`).
   - Monitor refresh results using structured logs, the authenticated health route, and Vercel cron failure visibility.

5. **Phase 5 — Expanded API-Football coverage**
   - Continue using API-Football as the only active provider.
   - Fetch one or more full player endpoint URLs through `API_FOOTBALL_PLAYERS_URL` and `API_FOOTBALL_PLAYERS_URLS`.
   - Follow API-Football pagination up to `API_FOOTBALL_MAX_PAGES_PER_TARGET`.
   - De-dupe provider player rows before transform/upsert.
   - Keep downstream app and recommendation API contracts unchanged.

This keeps MVP delivery fast while preserving a path to production-grade data operations.

### API-Football field mapping

The first sync path expects provider payloads that can supply:

- external player ID (`player.id`)
- normalized name (`player.name` or `firstname` + `lastname`)
- age or birth date (`player.age` currently mapped)
- nationality (`player.nationality`)
- position (`statistics[0].games.position`)
- team and league (`statistics[0].team.name`, `statistics[0].league.name`)
- market value when a provider payload supplies it
- season stats used by scoring: appearances, starts, minutes, goals, assists, shots, key passes, pass accuracy, tackles, interceptions, dribbles, aerial duels, cards, saves, and goals conceded

Set these variables before running the manual sync service:

```bash
API_FOOTBALL_API_KEY=...
API_FOOTBALL_PLAYERS_URL=...
```
