# Agent Instructions

## Before Starting

Always read:

1. [PROJECT_STATUS.md](PROJECT_STATUS.md)
2. [ROADMAP.md](ROADMAP.md)
3. [README.md](README.md)

---

## Project Summary

QuickScout Football is an MVP scouting intelligence app. Users select a target player and filters; the app returns ranked replacement candidates with explainable scores. Data comes from seed files or Supabase; provider sync is staged for later phases.

**Stack:** Next.js 16, TypeScript, React 19, Tailwind, Supabase (optional), Vercel.

---

## Your Responsibilities

When working on the repository:

1. Understand the current phase ([PROJECT_STATUS.md](PROJECT_STATUS.md))
2. Prioritize [ROADMAP.md](ROADMAP.md) tasks correctly
3. Avoid future-phase work (auth, provider ingestion, cron jobs) unless explicitly requested
4. Preserve existing architecture and API contracts
5. Prefer minimal safe changes
6. Explain reasoning before major edits

---

## Coding Rules

- Do not modify unrelated files
- Keep functions small
- Reuse existing patterns (`src/lib/`, `app/api/`, seed-first data access)
- Avoid unnecessary dependencies
- Prefer readability over cleverness
- Do not change API response shapes when adding ingestion or persistence

---

## Workflow

### Before coding

1. Analyze relevant files
2. Explain the planned approach
3. Identify risks

### After coding

1. Run verification (when possible):

   ```bash
   npm run lint
   npm run build
   npm test
   ```

2. Summarize changed files
3. Suggest the next logical step from [ROADMAP.md](ROADMAP.md)

---

## Roadmap Updating

If a task is completed:

- Mark it complete in [ROADMAP.md](ROADMAP.md)

If phase scope or architecture changes:

- Update [PROJECT_STATUS.md](PROJECT_STATUS.md)

---

## Output Style

Be concise and technical.
Prioritize actionable implementation details.

---

## Quick Reference

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local development |
| `npm run lint` | ESLint |
| `npm run build` | Production build |
| `npm test` | Vitest unit + integration tests |
| `npm run smoke:local` | Production build + local smoke test |
| `npm run smoke` | Smoke test against `BASE_URL` (e.g. Vercel deploy) |
| `npm run smoke:supabase` | Smoke test including `GET /api/recommendation-runs` |

Seed-only local dev: leave Supabase env vars empty in `.env.local` (see [README.md](README.md)).
