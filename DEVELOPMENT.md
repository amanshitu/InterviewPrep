# Development Tracking

Living checklist for the multi-tenant / AI-enabled redesign. Updated as work
lands. See the approved plan this was built from for full rationale (kept in
this session's plan history — the "Locked decisions" section below is the
durable summary future sessions should trust).

## Locked decisions (do not re-litigate without the user)

- **BYOK**: per-user, encrypted at rest in D1 (AES-GCM, master key = Worker
  secret). Default fallback is the shared Cloudflare Workers AI binding.
- **Content sharing**: a user's uploaded question set needs admin approval
  before it's surfaced to other users as a suggestion.
- **MCQ generation**: once per question, cached in D1 (`mcq_variants`),
  reused forever. No regeneration UI planned unless quality issues surface.
- **Quota carry-over**: the daily target stays **flat** at the user's
  configured `daily_quota` — it never grows. Questions left unfinished from
  a prior day get priority position in the next day's queue, capped at
  **1× daily_quota** worth of backlog per day. Excess backlog isn't lost,
  just not specially prioritized — it surfaces via normal rotation.
- **Same-day "give me more"**: only once the day's full target is met;
  each request grants a small fixed batch (`EXTRA_BATCH`, default 5).
- **Upload structure**: user-submitted question sets must define an ordered
  section/topic structure (title + ordered sections + ordered questions per
  section) — same rigor as the official bank. Enforced by validation, not
  extra schema.
- **`user_state` (old JSON blob table)** stays untouched as a fallback/audit
  trail until Phase 1 is confirmed stable in production. Drop it in a later
  cleanup migration only after explicit sign-off.

## Phase 1 — relational content model, quota engine (no AI, no PWA, no admin UI yet)

**Status: done, deployed to remote D1, not yet deployed as the live Worker** (schema + data are live on the real `interview-prep-db`; `wrangler deploy` hasn't been run yet — see note at the bottom).

| Item | Status |
|---|---|
| Schema migration `0003_relational_content.sql` | Done |
| Seed script: `public/questions.js` → official `question_sets`/`questions` rows (`scripts/generate-seed-sql.js` → `migrations/seed_official_bank.sql`) | Done |
| Backfill script: existing `user_state` JSON → relational tables (`scripts/generate-backfill-sql.js` → `migrations/backfill.sql`) | Done — only one real account existed with empty progress, so this was mostly a subscribe-to-official-sets no-op; script is generic/reusable if more historical data ever needs it |
| Queue/backlog engine (`ensureTodayQueueFilled`, `getOrCreateTodayLedger`) in `src/worker.js` | Done |
| `GET /api/queue/today` | Done |
| `POST /api/questions/complete` | Done (also bumps streak server-side now) |
| `POST /api/questions/request-more` | Done (grants `EXTRA_BATCH`=5 per call, gated until today's target is met) |
| `POST /api/questions/review-result` | Done (spaced-repetition grading, separate from daily completion) |
| `GET /api/review` | Done (server-side weighted pick, moved off the client) |
| `POST /api/question-sets` (structured upload, validation) | Done |
| `GET /api/question-sets/mine` | Done |
| `PATCH /api/profile` (track + daily_quota) | Done |
| `GET /api/export/progress` | Done (replaces the old client-side JSON export, which relied on the removed local `state` object) |
| Signup: track + daily quota fields | Done |
| Frontend: today's queue view re-pointed at new API | Done — Home view now renders the daily queue directly (topic browsing/sidebar topic list removed, since topics aren't a fixed curriculum anymore) |
| Frontend: "My question sets" + upload form in Settings | Done |
| Frontend: Review/Stats re-pointed at relational tables | Done |
| `app.js` stops reading `window.QUESTION_BANK` live | Done — `<script src="questions.js">` removed from `index.html` entirely; the file stays in the repo only as the seed source |
| Local verification (`wrangler dev --local` + Playwright smoke test) | Done — signup w/ profile fields, queue reveal, request-more, review grading, settings/upload form, stats all verified in a real browser; two-user isolation re-verified against the new schema |
| Apply `0003` + seed + backfill to remote D1 | Done |
| Deploy the new Worker code live (`wrangler deploy`) | **Not done yet — checking with the user before pushing to production** |

Dropped in this phase: the old "export the full static question bank as Markdown" Settings button. It doesn't have a clear meaning anymore now that content is multi-set and partly user-owned; revisit if there's demand for a per-set export instead.

## Phase 2 — AI (not started)

Workers AI binding, per-user BYOK profile fields + encryption, MCQ
generation-and-cache, daily multiple-choice Test view, `daily_test_results`.

## Phase 3 — sharing, PWA, polish (not started)

Admin approval queue + `role` enforcement, cross-user "suggested sets"
surfacing, PWA (manifest + service worker + icons), real URL-path routing
(History API) replacing the in-memory `currentView` switch, responsive
visual polish pass.
