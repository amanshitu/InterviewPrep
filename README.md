# ExamStreak

A multi-user, multi-category daily exam/interview prep tracker. Every
account enrolls in one or more categories (Banking, SSC, UPSC, GATE,
Interview Prep, and more — full list below), each with its own daily
quota, streak, and question pool. Pick up a fresh batch of questions every
day sized to your own pace, mark what you've got down, and let
spaced-repetition review bring back what needs another pass. Runs
entirely on Cloudflare Workers + D1 — no separate backend, no ORM, no
build step beyond Vite for the frontend.

## Features

- **Daily queue + backlog** — unfinished questions from a prior day show
  up first, capped at one day's worth of backlog so a long absence never
  turns into an overwhelming pile; finishing early lets you request a few
  more the same day.
- **Spaced-repetition review** — a "Daily review" batch pulled from
  everything you've completed so far, sized on demand.
- **AI-generated Daily Test** — a same-all-day, 10-question multiple-choice
  test built from questions you've already completed (Workers AI, cached
  per question after first generation).
- **Self Test** — write or speak a free-response answer to a random
  question and get AI feedback scored against the model answer.
- **Mock Interview** — a short back-to-back batch of Self Test questions
  with a session summary at the end.
- **Multi-category support** — enroll in as many categories as you want,
  switch which one is active, each with independent quota/streak/progress.
  Browse categories you haven't joined yet as a card grid or a list
  (Settings → Prep profile).
- **Stats** — accuracy trend, weakest topics/questions, streaks, an
  AI-generated coaching insight, and a weekly activity chart.
- **Admin panel** — category management, community question-set
  submission/approval queue, and a user directory (admin role only).
- **Question sets** — anyone can upload their own question set (CSV or
  JSON, with an AI-prompt generator built in) for admin approval and
  sharing, or subscribe to sets others have published.
- **PWA** — installable, works offline for already-loaded data (read-only
  cache, never a background sync queue), with pull-to-refresh on every
  page that has one clear "refetch" action.
- **Themes** — System/Light/Dark plus four always-on-one-mode looks
  (Futuristic, Midnight, Noir Gold, Ivory) and nine accent colors, each
  with separately tuned light/dark values for real WCAG AA contrast.
- **Account security** — email verification (with a non-nagging banner),
  self-serve account deletion with a 30-day grace period and one-click
  cancel, a per-device "Where you're signed in" list with individual
  revoke, invisible Turnstile captcha on login/signup/forgot-password,
  per-account (not just per-IP) login lockout, and an admin audit log of
  every moderation action.
- Password reset/change, rate limiting, security headers (CSP, HSTS,
  Permissions-Policy), and one-click JSON export of your own progress.
- **Public pages** — Home (marketing), About, Guide (illustrated
  walkthrough), FAQ, Privacy Policy, Terms of Service, Grievance, and
  Press — one consolidated single-page app, no separate documents.

See `DEVELOPMENT.md` for the phased build history and the "Locked
decisions" section for the reasoning behind the quota/backlog and
content-sharing behavior. See `docs/TECHNICAL.md` and
`docs/FUNCTIONAL.md` for a deeper architecture and feature reference.

## Categories

Every category currently carries at least 500 questions (the two
Interview Prep ones are a special case — see note below). Counts below
are the per-category question pool size — i.e. what you see once
enrolled, including any question that's shared across more than one
category (see note).

| Category | Questions |
|---|---:|
| Banking Exam | 600 |
| Computer Awareness / IT | 500 |
| Current Affairs & General Knowledge | 500 |
| Defence Exams (NDA/CDS/AFCAT) | 500 |
| GATE (Engineering) | 500 |
| Insurance Exams (LIC/GIC/NIACL) | 500 |
| Interview Prep | 500 |
| Judiciary & Law (CLAT) | 500 |
| MBA Entrance (CAT/XAT/MAT) | 500 |
| Mathematics | 500 |
| Police Exam | 605 |
| Railway Exam | 500 |
| SSC Exam | 600 |
| Teaching Exam | 500 |
| Technical Leadership Interview Prep | 369 |
| UPSC / Civil Services (Prelims GS) | 500 |

**Technical Leadership Interview Prep** is a separate, smaller category
(senior TAM/TDM/TPM/Architect-style interview questions, personalized
career-story content) — distinct from the generic **Interview Prep**
category above.

Two underlying question sets (`railway-exam-bank`, `shared-gk-bank`) are
deliberately tagged into several categories at once (Banking/Police/
Railway/SSC/Teaching's general-awareness overlap), so the sum of the
table above is larger than the actual distinct number of questions in the
database — check the live total with:

```
npx wrangler d1 execute interview-prep-db --remote --command \
  "SELECT COUNT(*) FROM questions;"
```

and the live per-category breakdown with:

```
npx wrangler d1 execute interview-prep-db --remote --command \
  "SELECT c.name, COUNT(DISTINCT q.id) AS question_count
   FROM categories c
   JOIN question_set_categories qsc ON qsc.category_id = c.id
   JOIN questions q ON q.set_id = qsc.set_id
   GROUP BY c.id ORDER BY c.name;"
```

New categories and their content are added the same way as everything
else — a tracked migration under `migrations/` (see `scripts/import-new-categories.js`
for the generator used to turn a batch of AI-generated `{"sections":[...]}`
JSON into one).

## Stack

- **Frontend**: React 19 + TypeScript (`src/web/`), built with Vite +
  Tailwind v4 into a single document (`index.html` + one React Router
  tree, every route lazy-loaded — see `src/web/entries/app.tsx`), served
  as static assets by the Worker (`[assets]` in `wrangler.toml`) with
  `run_worker_first = true` so the Worker's own `fetch()` still attaches
  security headers to every response, including static files.
- **Backend**: a single Cloudflare Worker (`src/worker/`), raw SQL over
  D1 — no ORM, no framework.
- **Database**: Cloudflare D1 (SQLite), `migrations/` is the single
  source of truth, applied with `wrangler d1 migrations apply` (not the
  older per-migration npm scripts below, which only cover the first few
  migrations from before that command existed in this project's workflow).
- **AI**: Workers AI (configurable model, see Settings → AI & Usage) by
  default, with optional bring-your-own-key OpenAI/Anthropic.
- **Push**: Web Push (VAPID), hourly cron checks each subscriber's local
  time and sends at most one daily reminder.

## One-time setup

```
npm install
npx wrangler login          # opens a browser tab to authorize your Cloudflare account
```

## Create the database (first time only)

```
npx wrangler d1 create interview-prep-db
```

This prints a `database_id` — copy it into `wrangler.toml`'s
`[[d1_databases]]` block.

Then apply every tracked migration, in order, against the real (remote)
database:

```
npx wrangler d1 migrations apply interview-prep-db --remote
```

This is additive and idempotent — safe to re-run any time new migrations
land. It creates the full schema and seeds every official category's
question bank (the table above).

## Local development

```
npx wrangler d1 migrations apply interview-prep-db --local
npm run dev
```

`npm run dev` builds the frontend (`predev` → `build:web`) and starts
`wrangler dev`, which serves the built frontend and the Worker's API from
one local server backed by a local copy of D1 — no separate dev server
needed for the frontend. `npm run dev:web` (plain `vite dev`) is also
available for frontend-only iteration without the Worker/API behind it.

Workers AI has no local inference simulator; AI calls return a
lower-quality fallback locally (see `wrangler.toml`'s `[ai]` block
comment) rather than failing outright, so local dev still works
end-to-end. To exercise real AI output, use `wrangler dev --remote` or
test after `wrangler deploy`.

## Deploy

```
npm run deploy
```

Wrangler prints the live URL (something like
`https://interviewprep.<your-subdomain>.workers.dev`). Anyone who opens it
creates their own account and gets their own progress, streak, and
review history; nothing is shared between accounts except the content
itself.

## Email (password reset + verification + account deletion)

Password reset, email verification, and account-deletion notices all
send through [Brevo](https://www.brevo.com)'s transactional API
(`src/worker/lib/email.js`). Unlike every other integration in this
app, Brevo isn't a Worker secret — it's configured from the Admin page
(Admin → the "Email (Brevo)" card near the top): sender email, sender
name, and the Brevo API key (from Brevo → Settings → SMTP & API → API
Keys). The key is AES-GCM encrypted at rest in `app_settings`
(`src/worker/lib/settings.js`, reusing the same `AI_KEY_ENCRYPTION_SECRET`
master key as BYOK AI keys) rather than stored in plain text, and the
admin UI never echoes it back — leave the field blank when re-saving
just the sender name/email to keep the existing key.

Without Brevo configured yet (e.g. a fresh deploy before an admin has
filled it in), every email falls back to logging the link to the
Worker's console instead of failing outright — useful for local dev:

```
npm run tail
```

(or watch the `wrangler dev` terminal locally) and look for a line like
`[email:password-reset] Brevo not configured — would have sent to
someone@example.com: "Reset your ExamStreak password"` followed by the
link. Reset links are valid for 30 minutes and single-use; verification
links for 24 hours.

## Invisible captcha

Login, signup, and forgot-password are gated by an invisible Cloudflare
Turnstile widget (`src/web/lib/turnstile.ts`, site key hardcoded since
it's safe to expose client-side). The secret lives in
`TURNSTILE_SECRET`:

```
npx wrangler secret put TURNSTILE_SECRET
```

Without it set, `verifyTurnstile()` (`src/worker/lib/turnstile.js`)
no-ops and lets the request through — so a fresh local clone still
works end-to-end before you've created a Turnstile widget.

An admin can also turn the captcha off platform-wide from the Admin
page (a switch at the top of `/admin`), without touching any secret or
redeploying. This flips `app_settings.captcha_enabled`
(`src/worker/lib/settings.js`), which `GET /api/config` exposes to the
frontend (so Login skips loading the Turnstile script entirely when
off) and which `checkCaptcha()` in `src/worker/routes/auth.js` checks
server-side before calling `verifyTurnstile()`. Every toggle is
recorded in the admin audit log.

## What's stored where

- D1 `users` — accounts, profile fields (`track`, `headline`,
  `years_experience`, `bio`, `timezone`), `role` (`user`/`admin`), and
  `active_category_id`.
- D1 `categories` — every category (the table above), `is_active`
  controls whether it's offered to new enrollees.
- D1 `user_categories` — which categories a user is enrolled in, each
  with its own `daily_quota`/`streak_count`/`streak_longest`.
- D1 `question_sets` / `questions` — all question content, official
  (`owner_user_id IS NULL`, auto-approved/shared) and user-submitted
  (`visibility`: `private` default → `pending` on submit →
  `shared`/`rejected` on admin review).
- D1 `question_set_categories` — which category(ies) a question set
  belongs to; a set can belong to more than one (see the Categories note
  above).
- D1 `user_question_sets` — which sets feed a user's daily queue. Every
  account auto-subscribes to every official set at signup; enrolling in
  an additional category afterward auto-subscribes to that category's
  official sets too.
- D1 `user_question_progress` — per-user, per-question status
  (`queued`/`shown`/`done`), review stats, and which day's queue a
  question was last assigned to.
- D1 `daily_quota_ledger` — one row per user per category per active day:
  that day's quota snapshot, any same-day "request more" additions, and
  how many were completed.
- D1 `mcq_variants` — cached AI-generated multiple-choice distractors for
  the Daily Test, one row per question, generated once and reused forever.
- D1 `daily_test_results` — per-user, per-day Daily Test answers.
- D1 `sessions` — login sessions: a cookie-only `token` plus a separate,
  non-sensitive `id` (used by the "Where you're signed in" list and
  per-device revoke so that endpoint never has to return the real
  token), `ip_address`/`user_agent`/`last_seen_at` for display there.
- D1 `password_resets` / `email_verifications` — short-lived, single-use
  tokens (30 min / 24h respectively).
- D1 `rate_limit_attempts` — per-(IP or account), per-endpoint request
  timestamps; throttles `/api/login` (both by IP and by the attempted
  email, independently), `/api/signup`, and `/api/password/forgot`.
- D1 `activity_log` — append-only history of every reveal/review/test
  action, the source for the Stats view.
- D1 `ai_usage` — per-user, per-day token/request usage against the
  shared Workers AI free-tier cap (20/day; bring-your-own-key users are
  unlimited, capped by their own provider account instead).
- D1 `push_subscriptions` — Web Push subscriptions for the daily
  reminder cron.
- D1 `admin_audit_log` — who did what admin action (resolve a report,
  edit a question, approve/reject a set, view a user's stats) and when.
- D1 `ai_reports` — user-flagged issues with AI-generated output (Self
  Test feedback, the Stats coaching insight) — separate from
  `question_reports` since there's no underlying `questions.id` to point
  at, so a snapshot of the flagged text is stored instead.
- `users.deletion_requested_at` — set when an account schedules self-serve
  deletion; purged by the existing hourly `scheduled()` cron once 30 days
  pass (`src/worker/lib/accountDeletion.js`), cleared by canceling.
- D1 `app_settings` — generic admin-toggleable key/value store; today
  just `captcha_enabled` (`src/worker/lib/settings.js`).

## Security notes / decisions made

- **Signup's "account already exists" message stays as-is.** The minor
  enumeration risk is judged an acceptable trade-off against the UX cost
  of a generic message. `/api/password/forgot`, reachable by anyone with
  just an email address, stays fully generic.
- **CSP allows `'unsafe-inline'` for `style-src` only**, never
  `script-src` (Turnstile's own script/frame are allowlisted by host, not
  `'unsafe-inline'`).
- **Rate limiting uses a D1 table**, not Cloudflare's dashboard-level
  Rate Limiting rules, so the behavior stays in code and testable with
  `wrangler dev --local`. Login is throttled both per-IP and per-account
  independently, so a distributed attempt against one account is still
  caught even if it's spread across many IPs.
- **Passwords**: PBKDF2-SHA256, 100,000 iterations, per-user salt.
- **BYOK AI keys**: AES-GCM encrypted at rest (`AI_KEY_ENCRYPTION_SECRET`).
- **Email verification doesn't block anything** — it's a soft nudge (a
  dismissible, snoozable banner shown only after an account is 24h+ old),
  not a login/feature gate, since there's no high-stakes action in this
  app that specifically needs a confirmed email.
- **Account deletion is soft, with a 30-day grace period** and an
  explicit in-app Cancel — not immediate, and not silent.

## Custom domain (optional)

By default the app lives at the `*.workers.dev` URL Wrangler assigns. To
put it on your own domain, add the domain in the Cloudflare dashboard
under the Worker's **Settings → Domains & Routes**, or add a
`[[routes]]` entry to `wrangler.toml` if the domain's zone is already on
your Cloudflare account.
