# NextGen Model

A sensemaking, customized diagnostic tool for **organizational assessment** — an NTT DATA platform asset, sibling to the Nexus Transformation Board. Each client gets a password-gated **Assessment Journey** that walks through a fixed set of steps: define pillars → collect data → map & report the AS-IS → co-design the TO-BE → build a transformation roadmap.

## Stack

- **Frontend:** single `index.html` + `nextgen.js` (vanilla JS, no build step) — same NTT DATA design system and theming as the Nexus board.
- **Backend:** Express + `pg`, raw SQL, JSONB-per-section state (one load/save per journey).
- **Database:** Neon Postgres (single `DATABASE_URL`).
- **Hosting:** Vercel — `api/index.js` serverless function + static `index.html`.

## The assessment journey (9 steps)

| # | Step | Phase |
|---|------|-------|
| 1 | Organizational Pillars / Domains | Setup |
| 2 | Data Collection (Surveys · Gemba · 1:1 · Leadership) | Phase 1 · AS-IS |
| 3 | AS-IS Mapping | Phase 1 · AS-IS |
| 4 | AS-IS Reporting | Phase 1 · AS-IS |
| 5 | TO-BE Design Sessions (Context-Driven Design) | Phase 2 · TO-BE |
| 6 | Champions (Early Adopters) | Phase 2 · TO-BE |
| 7 | TO-BE Deliverables (process maps, playbooks, guides) | Phase 2 · TO-BE |
| 8 | TO-BE Final Proposal | Phase 2 · TO-BE |
| 9 | Transformation Roadmap (Strategic Initiatives) | Phase 3 · Roadmap |

The 4 default pillars (Strategic Planning & Governance · Processes, Tools & IT · People & Culture · NextGen Organization) with their sub-areas and interview questions are seeded into every new journey and are editable per journey.

## Run locally

```bash
npm install
# put your Neon pooled connection string in .env → DATABASE_URL=postgresql://…
npm run migrate    # creates the clients + journeys tables (idempotent)
npm start          # http://localhost:3000
```

`GET /api/health` returns `{ "status": "ok" }` when the DB is reachable. The server also runs an idempotent schema bootstrap on first `/api` request, so `migrate` is optional.

## Deploy (Vercel)

1. **Neon:** create a **new** database in the account → copy the pooled connection string.
2. **GitHub:** push this repo (e.g. `NextGen_Model_Application`).
3. **Vercel:** create a new project (e.g. `nextgenmodel`, separate from `nexusboard`) → set the `DATABASE_URL` env var → deploy. `vercel.json` routes `/api/*` to the serverless function and everything else to `index.html`.

## Data model

Two tables. `clients` (name, slug) contain `journeys`; each journey row carries the whole assessment state in JSONB columns (`pillars`, `data_collection`, `asis_findings`, `asis_report`, `tobe_sessions`, `champions`, `tobe_deliverables`, `tobe_proposal`, `roadmap`, `progress`) plus an optional SHA-256 `password_hash`. See `server/schema.sql`.
