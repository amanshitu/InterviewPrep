# Interview Prep Tracker

A 60-day interview-prep tracker: 24 topics (HR/behavioral, delivery &
program management, people management, technical architecture, AI
automation/product) with 15 senior-level questions and model answers each.
Every day: work through 10 new questions in your current topic, mark a
topic done when you've covered it, and run a daily random review (10–20
questions) drawn from everything you've completed. Runs on Cloudflare
Workers + D1, with email/password login so anyone you share the link with
gets their own separate, saved progress.

Also included: password reset / change, a Settings screen (display name,
password, sign-out-everywhere), basic rate limiting and security headers,
a Stats view (accuracy trend, weakest topics/questions, streaks) built
from an activity history table, and one-click export of your progress
(JSON) or the whole question bank (Markdown).

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

Then run the schema migration against the real (remote) database:

```
npm run db:migrate:remote
npm run db:migrate:remote:0002
```

`0002` adds password-reset tokens, per-IP rate-limit tracking, and the
append-only activity log the Stats view reads from. It's additive
(`CREATE TABLE IF NOT EXISTS`), so it's safe to run even if some of it
already exists.

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
npm run dev
```

Opens a local dev server backed by a local copy of the D1 database, useful
for trying changes before deploying.

## Updating the question bank

The question bank lives in `public/questions.js` as a single
`window.QUESTION_BANK` object (`{ groups, topics }`, each topic holding 15
`{ id, q, a }` pairs). Edit it directly and redeploy with `npm run
deploy` — no database change is needed, since questions are static
content and only per-user progress is stored in D1.

## What's stored where

- `public/questions.js` — the question bank itself (static, ships with
  the app, identical for every user).
- D1 `users` / `sessions` — accounts and login sessions.
- D1 `user_state` — one JSON blob per user: which topics are
  started/done, which questions they've seen, their streak, and
  per-question review history (used to resurface questions you marked
  "review again" more often).
- D1 `password_resets` — short-lived (30 min), single-use password reset
  tokens.
- D1 `rate_limit_attempts` — per-IP, per-endpoint request timestamps used
  to throttle `/api/login`, `/api/signup`, and `/api/password/forgot`
  (10 attempts / 15 min by default; rows are pruned lazily).
- D1 `activity_log` — append-only history of every question reveal and
  review action, used to derive the Stats view (accuracy trend, weakest
  topics/questions). `user_state` stays the source of truth for current
  status and streak; this table is history-only.

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
