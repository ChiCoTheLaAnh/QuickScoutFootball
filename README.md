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

## API routes

Current/expected MVP route surface:

- `GET /api/players` — list/search players.
- `GET /api/players/:id` — fetch one player with latest stats.
- `GET /api/recommendations` — fetch latest recommendation output.
- `POST /api/recommendations/run` — create a recommendation run.
- `GET /api/recommendation-runs` — view run history/metadata.
- `GET /api/cron/refresh` — scheduled refresh endpoint used by Vercel cron.

> If some routes are not implemented yet, this list acts as the contract for MVP delivery.

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
