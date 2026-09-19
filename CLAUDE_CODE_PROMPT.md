# Prompt for Claude Code — extend the Interview Prep Tracker

Paste everything below this line into Claude Code, run from inside the
project folder (`D:\Projects\CosmoDiva\Preparations`).

---

## Context

This is an existing, working app called **Interview Prep Tracker** — a
60-day interview-prep tool (HR/behavioral, delivery & program management,
people management, technical architecture, AI automation/product — 24
topics, 15 questions each, 360 total) built for personal use and to share
with a few other people, each of whom gets their own private, saved
progress. It runs entirely on **Cloudflare Workers + D1**, no separate
frontend framework or build step — just static HTML/CSS/JS served by the
Worker, with a small JSON API for auth and per-user state.

Read the whole codebase before changing anything: `src/worker.js` (API +
static asset serving), `public/index.html`, `public/app.js` (all client
logic — state model, rendering, the review-selection algorithm),
`public/styles.css`, `public/questions.js` (the static question bank —
**do not edit its content**, it's curated and reviewed separately from
this feature work), `migrations/0001_init.sql` (current schema),
`wrangler.toml`, and `README.md`.

### Current data model (D1)

- `users(id, email, name, password_hash, salt, created_at)`
- `sessions(token, user_id, created_at, expires_at)` — 30-day cookie
  sessions, `HttpOnly; Secure; SameSite=Lax`
- `user_state(user_id, state_json, updated_at)` — one JSON blob per user:
  `{ version, topics: { [topicId]: {status, shownIds, startedAt, doneAt} },
  streak: {count, lastActiveDate}, questionStats: { [questionId]:
  {timesShown, correctStreak, lastResult, lastShown} } }`

Passwords are hashed with PBKDF2 (Web Crypto, 100k iterations, per-user
salt) — no external dependency. Auth is a random 32-byte token in a
`sessions` row, not a JWT.

### Current API (`src/worker.js`)

`POST /api/signup`, `POST /api/login`, `POST /api/logout`, `GET /api/me`,
`GET /api/state`, `PUT /api/state` (whole-state overwrite). Everything
else falls through to `env.ASSETS.fetch(request)` for the static app.

### Current frontend behavior (`public/app.js`)

Single-page vanilla-JS app, no framework. On load: `GET /api/me` to check
session → show login/signup screen or the app shell. Home view shows
overall progress, a "continue current topic" card, and a "daily review"
card with a 10–20 slider. Topic view serves up to 10 unseen questions at
a time from the topic's 15-question bank, reveals model answers on click,
and lets the user mark the topic done at any time (not gated on having
seen all 15). Review view pulls a weighted-random batch from every
question in topics marked `done` — questions marked "review again" get
roughly 2–3× the sampling weight of ones marked "got it" repeatedly, so
weak spots resurface sooner. Streak counts consecutive **calendar days**
(client-local date) with at least one reveal or review action.

### Deployment state — important, read before touching D1

The Cloudflare D1 database **`interview-prep-db` already exists** and
`migrations/0001_init.sql` **has already been run against it** (via the
Cloudflare dashboard's D1 console). Do **not** recreate the database and
do **not** re-run or edit `0001_init.sql` — if you need schema changes,
add a new file `migrations/0002_<description>.sql` with additive changes
only (`ALTER TABLE ... ADD COLUMN`, `CREATE TABLE IF NOT EXISTS ...`),
and apply it with:

```
npx wrangler d1 execute interview-prep-db --remote --file=./migrations/0002_<description>.sql
```

`wrangler.toml` still has `database_id = "REPLACE_WITH_DATABASE_ID"` —
before deploying, get the real id with `npx wrangler d1 list` (or from
the Cloudflare dashboard → Workers & Pages → D1 → interview-prep-db →
"Database ID") and put it in `wrangler.toml`. Deploying or running a
`--remote` migration also requires `npx wrangler login` to have been done
on this machine (or a `CLOUDFLARE_API_TOKEN` env var set) — check with
`npx wrangler whoami` first and stop to ask the user if it's not
authenticated, rather than working around it.

## What must still be true when you're done (regression checklist)

Don't break any of this while adding the features below:

1. Signing up and logging in still works; each account's progress,
   streak and review history stay fully separate from every other
   account's (verify by creating two test accounts locally and checking
   neither sees the other's state).
2. A topic still serves questions 10 at a time, in order, with a
   "show N more" control, and can be marked done at any time regardless
   of how many of its 15 questions have been seen.
3. Daily review still draws a user-adjustable 10–20 questions at random
   from only the topics marked `done`, still weighted toward
   "review again" questions, and still shows an empty state if no topic
   is done yet.
4. Existing users' `user_state` JSON (shape described above) keeps
   working after your changes — if you change the state shape, write a
   migration function in `app.js` that upgrades old state on load
   (bump `version` and branch on it), rather than assuming a clean slate.
5. No new frontend framework or build step — keep it static HTML/CSS/JS
   served directly by the Worker's `assets` binding, consistent with the
   rest of the app, unless you have a concrete reason to change that
   (explain it before doing so).

## New features to add

### 1. Account essentials

- **Forgot / reset password**: `POST /api/password/forgot` (accepts an
  email, always returns a generic 200 success message whether or not the
  account exists — never reveal account existence here) generates a
  random token, stores it with an expiry (~30 min) in a new
  `password_resets` table (new migration), and emails a reset link
  containing the token. Use an HTTP-API email provider that works from a
  Cloudflare Worker without SMTP — **Resend** (`https://resend.com`) is
  the simplest (`fetch` call with an API key as a Worker secret,
  `npx wrangler secret put RESEND_API_KEY`); if the user doesn't have a
  Resend (or similar) account yet, stop and ask which provider they'd
  rather use instead of guessing. `POST /api/password/reset` takes the
  token + new password, validates expiry, updates `password_hash`/`salt`,
  deletes the token, and invalidates all existing sessions for that user
  (delete their rows from `sessions`) so a stolen session can't survive a
  reset.
- **Change password** (while logged in): `POST /api/password/change`
  taking current + new password, verifying the current one first.
- **Settings screen**: a small view (reachable from the header) to change
  display name and password, and see the account's email (read-only) and
  member-since date.

### 2. Security hardening

- **Rate limiting** on `/api/login`, `/api/signup`, and
  `/api/password/forgot`: track attempts per IP (use
  `request.headers.get("CF-Connecting-IP")`) in a new small D1 table (or
  propose Cloudflare's native Rate Limiting rules on the dashboard as an
  alternative and explain the trade-off) — a sensible default is 10
  attempts per 15 minutes per IP per endpoint, returning 429 with a
  `Retry-After` hint once exceeded.
- **Session hygiene**: rotate (issue a new token, delete the old row)
  on password change/reset as above; add a "sign out of all devices"
  action in settings that deletes every session row for that user.
- **Response headers**: add `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, and a reasonable
  `Content-Security-Policy` (allow only `'self'` plus the Google Fonts
  origins already used in `index.html`) on HTML responses.
- **Input hardening**: cap request body sizes defensively, keep the
  existing generic "Incorrect email or password" (don't let the new
  forgot-password endpoint leak whether an email is registered),
  and reconsider whether `signup`'s current "an account with that email
  already exists" message is acceptable for this small-scale, invite-only
  use case or should also be genericized — make a call and note it in
  your summary rather than leaving it ambiguous.
- Optional, mention but don't build unless asked: Cloudflare Turnstile on
  signup/login to block bots, since it's a small addition on a Workers
  app if this ever gets a wider public link.

### 3. Progress insights & export

- **Stats view** (new nav item/view): accuracy trend (rolling "got it"
  vs "review again" ratio over the last N review sessions), a ranked list
  of the user's weakest topics/questions (highest "review again" rate,
  computed from `questionStats`), current + longest streak, and a simple
  visual (inline SVG bar/line chart — no external charting library needed
  for data this small) rather than a wall of numbers. This likely needs
  more history than `questionStats` currently keeps (it only stores the
  *latest* result per question) — add an append-only `activity_log`
  table (new migration: `user_id, occurred_at, event_type, topic_id,
  question_id, result`) written to alongside the existing state update
  whenever a question is revealed or reviewed, and derive the stats view
  from it. Keep `user_state` as the source of truth for current
  status/streak; treat `activity_log` as history-only.
- **Export**: a button that downloads the signed-in user's own progress
  (topics status, streak, question stats) as a JSON file, generated
  client-side from data already in memory (no new endpoint needed) via a
  `Blob` + temporary `<a download>` link. Separately, a "download the
  full question bank" export (all 360 Q&A as Markdown or CSV, grouped by
  topic) for offline studying — also generate this client-side from
  `window.QUESTION_BANK`, since it's static content already shipped to
  the browser.

## Process

1. Read every existing file first; don't guess at behavior you can just
   read.
2. Confirm `wrangler whoami` is authenticated and get the real D1
   `database_id` before doing anything that touches the remote database;
   stop and ask if either is missing.
3. Write new migrations additively, apply them with `--remote` against
   the *existing* `interview-prep-db`, and test locally first with
   `--local` + `wrangler dev --local` before touching remote data.
4. Implement the three feature areas above, keeping the zero-build,
   vanilla-JS, single-Worker architecture.
5. Re-verify the full regression checklist above by hand (or with a
   quick Playwright/curl smoke test) before calling it done.
6. Update `README.md` with the new setup steps (Resend API key secret,
   any new migrations to run) and give a short written summary of what
   changed and any decisions you made where this prompt left something
   to your judgment (e.g., the signup-enumeration question above).
