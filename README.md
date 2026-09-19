# Interview Prep Tracker

A multi-user interview-prep tracker, driven entirely from D1. Everyone
gets the shared official curriculum (HR/behavioral, delivery/program
management, people management, technical architecture, AI automation)
plus whatever question sets they or other users upload. Every account has
its own daily quota of questions (configurable, default 10): unfinished
questions from a prior day get priority the next day, capped at one day's
worth of backlog so a long absence never turns into an overwhelming pile,
and finishing early lets you request a few more the same day. On top of
that: spaced-repetition daily review across everything you've completed,
password reset/change, a Settings screen (display name, prep profile,
password, sign-out-everywhere, question-set uploads), basic rate limiting
and security headers, a Stats view (accuracy trend, weakest
topics/questions, streaks), and one-click export of your progress (JSON).
Runs on Cloudflare Workers + D1 — see `DEVELOPMENT.md` for the phased
roadmap (AI features and PWA support are planned next) and its "Locked
decisions" section for the rules behind the quota/backlog and
content-sharing behavior.

## One-time setup

```
cd interview-prep
npm install
npx wrangler login          # opens a browser tab to authorize your Cloudflare account
```

## Create the database (first time only)

```
npx wrangler d1 create interview-prep-db
```

This prints a `database_id` — copy it into `wrangler.toml`, replacing
`REPLACE_WITH_DATABASE_ID`.

Then run the schema migrations against the real (remote) database, in order:

```
npm run db:migrate:remote
npm run db:migrate:remote:0002
npm run db:migrate:remote:0003
npm run db:seed:remote
```

`0002` adds password-reset tokens, per-IP rate-limit tracking, and the
append-only activity log the Stats view reads from. `0003` adds the
relational content model (question sets, per-question progress, the daily
quota ledger) that the app now runs on instead of a static question bank +
JSON blob — see "What's stored where" below. `db:seed:remote` seeds the
official curriculum (`public/questions.js`) into the new tables as the
default shared content every account subscribes to. All of it is additive
(`CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN`), so it's safe
to run even if some of it already exists.

If you're upgrading an existing deployment that already has real user
progress in the old `user_state` JSON blob, also run the one-time backfill
so nobody loses progress:

```
npx wrangler d1 execute interview-prep-db --remote --command "SELECT user_id, state_json FROM user_state" --json > dump.json
node scripts/generate-backfill-sql.js dump.json > migrations/backfill.sql
npx wrangler d1 execute interview-prep-db --remote --file=./migrations/backfill.sql
```

This subscribes every existing account to the official question sets
(mirroring what signup now does automatically) and converts any of their
old per-topic progress into the new relational tables. `user_state` itself
is left untouched as a fallback/audit trail.

## Password reset emails

Forgot-password currently does **not** send a real email — no email
provider was wired up yet. Requesting a reset logs the reset link to the
Worker's console instead:

```
npm run tail
```

(or watch the `wrangler dev` terminal locally) and look for a line like
`[password reset] someone@example.com -> https://.../?reset=<token> (expires in 30 min)`.
The link is valid for 30 minutes and single-use.

To send real emails, add an HTTP-API provider (e.g. [Resend](https://resend.com)):

```
npx wrangler secret put RESEND_API_KEY
```

then replace the `console.log(...)` in `handleForgotPassword` (in
`src/worker.js`) with a `fetch()` call to the provider's send-email
endpoint, addressed to the user's email with the same `resetLink`.

## Deploy

```
npm run deploy
```

Wrangler prints the live URL (something like
`https://interview-prep.<your-subdomain>.workers.dev`). Share that link —
anyone who opens it creates their own account and gets their own progress,
streak, and review history; nothing is shared between accounts.

## Local development (optional)

```
npm run db:migrate:local
npm run db:migrate:local:0002
npm run db:migrate:local:0003
npm run db:seed:local
npm run dev
```

Opens a local dev server backed by a local copy of the D1 database, useful
for trying changes before deploying.

## Updating the official curriculum

`public/questions.js` is no longer read live by the app — it's kept only
as the source the seed script (`scripts/generate-seed-sql.js`) reads from.
To change the official curriculum: edit `public/questions.js`, run
`node scripts/generate-seed-sql.js` to regenerate
`migrations/seed_official_bank.sql`, then re-apply it (`INSERT`s use the
same ids, so re-running is safe for unchanged questions; edits to existing
questions need a manual `UPDATE` or a delete-and-reseed of that set).
Anyone can also upload their own question sets from the app's Settings
screen — no redeploy needed for that.

## What's stored where

- D1 `users` — accounts, plus profile fields (`track`, `daily_quota`,
  `role`) and streak counters.
- D1 `sessions` — login sessions.
- D1 `question_sets` / `questions` — all question content, official and
  user-submitted. `question_sets.visibility` is `private` (default for a
  new upload), `pending`/`shared`/`rejected` (Phase 3's admin-approval
  workflow — schema exists now, workflow doesn't yet).
- D1 `user_question_sets` — which sets feed a user's daily queue. Every
  account auto-subscribes to the official sets at signup.
- D1 `user_question_progress` — per-user, per-question status
  (`queued`/`shown`/`done`), review stats, and which day's queue a
  question was last assigned to. This is the relational replacement for
  the old `user_state` JSON blob's `topics`/`questionStats` fields.
- D1 `daily_quota_ledger` — one row per user per active day: that day's
  quota snapshot, any same-day "request more" additions, and how many
  were completed. Drives the backlog/carry-over logic — see
  `DEVELOPMENT.md`.
- D1 `mcq_variants` / `daily_test_results` — schema-only for now; Phase 2
  (AI-generated daily multiple-choice test) will populate these.
- D1 `user_state` — the old JSON-blob table. Kept as an untouched
  fallback/audit trail; no longer written to by the app. Safe to drop in
  a later cleanup once Phase 1 has been stable for a while.
- D1 `password_resets` — short-lived (30 min), single-use password reset
  tokens.
- D1 `rate_limit_attempts` — per-IP, per-endpoint request timestamps used
  to throttle `/api/login`, `/api/signup`, and `/api/password/forgot`
  (10 attempts / 15 min by default; rows are pruned lazily).
- D1 `activity_log` — append-only history of every question reveal and
  review action, used to derive the Stats view (accuracy trend, weakest
  topics/questions).

## Security notes / decisions made

- **Signup's "account already exists" message stays as-is.** This is a
  small, invite-only app shared with a handful of known people, so the
  minor enumeration risk was judged an acceptable trade-off against the
  UX cost of a generic message. `/api/password/forgot`, which is
  reachable by anyone with just an email address, stays fully generic.
- **CSP allows `'unsafe-inline'` for `style-src` only** (never
  `script-src`) — the client renders lots of templated markup with
  inline `style="..."` attributes, and rewriting all of them wasn't
  worth it for the XSS protection it would add on top of a strict
  `script-src`.
- **Rate limiting uses a D1 table**, not Cloudflare's dashboard-level
  Rate Limiting rules. A dashboard rule would need to be configured
  outside of version control and wouldn't work identically in local dev;
  the D1 table keeps the behavior in code and testable with `wrangler
  dev --local`. For a wider-traffic deployment, a dashboard rule (or
  Durable Objects) would scale better than a D1 write per request.
- **Turnstile was not added.** Worth adding if this app ever gets a
  wider public link, but not needed for a handful of invited users.

## Custom domain (optional)

By default the app lives at the `*.workers.dev` URL Wrangler assigns. To
put it on your own domain, add the domain in the Cloudflare dashboard
under the Worker's **Settings → Domains & Routes**, or add a `[[routes]]`
entry to `wrangler.toml` if the domain's zone is already on your
Cloudflare account.
