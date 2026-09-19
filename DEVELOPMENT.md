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

| Item | Status |
|---|---|
| Schema migration `0003_relational_content.sql` | Not started |
| Seed script: `public/questions.js` → official `question_sets`/`questions` rows | Not started |
| Backfill script: existing `user_state` JSON → relational tables | Not started |
| Queue/backlog engine (`buildTodayQueue`, ledger) in `src/worker.js` | Not started |
| `GET /api/queue/today` | Not started |
| `POST /api/questions/complete` | Not started |
| `POST /api/questions/request-more` | Not started |
| `POST /api/question-sets` (structured upload, validation) | Not started |
| `GET /api/question-sets/mine` | Not started |
| `PATCH /api/profile` (track + daily_quota) | Not started |
| Signup: track + daily quota fields | Not started |
| Frontend: today's queue view re-pointed at new API | Not started |
| Frontend: "My question sets" + upload form in Settings | Not started |
| Frontend: Review/Stats re-pointed at relational tables | Not started |
| `app.js` stops reading `window.QUESTION_BANK` live | Not started |
| Local verification (`wrangler dev --local`) | Not started |
| Apply `0003` + seed + backfill to remote D1 | Not started |

## Phase 2 — AI (not started)

Workers AI binding, per-user BYOK profile fields + encryption, MCQ
generation-and-cache, daily multiple-choice Test view, `daily_test_results`.

## Phase 3 — sharing, PWA, polish (not started)

Admin approval queue + `role` enforcement, cross-user "suggested sets"
surfacing, PWA (manifest + service worker + icons), real URL-path routing
(History API) replacing the in-memory `currentView` switch, responsive
visual polish pass.
