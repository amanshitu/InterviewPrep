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
  (Futuristic, Midnight, Noir Gold, Ivory) and a configurable accent color.
- Password reset/change, session sign-out-everywhere, rate limiting,
  security headers, and one-click JSON export of your own progress.

See `DEVELOPMENT.md` for the phased build history and the "Locked
decisions" section for the reasoning behind the quota/backlog and
content-sharing behavior.

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
  Tailwind v4, served as static assets by the Worker (`[assets]` in
  `wrangler.toml`) with `run_worker_first = true` so the Worker's own
  `fetch()` still attaches security headers to every response, including
  static files.
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

## Password reset emails

Forgot-password currently does **not** send a real email — no email
provider is wired up. Requesting a reset logs the reset link to the
Worker's console instead:

```
npm run tail
```

(or watch the `wrangler dev` terminal locally) and look for a line like
`[password reset] someone@example.com -> https://.../?reset=<token> (expires in 30 min)`.
The link is valid for 30 minutes and single-use.

To send real emails, add an HTTP-API provider (e.g.
[Resend](https://resend.com)):

```
npx wrangler secret put RESEND_API_KEY
```

then replace the reset-link logging in `handleForgotPassword`
(`src/worker/routes/auth.js`) with a `fetch()` call to the provider's
send-email endpoint.

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
- D1 `sessions` / `password_resets` — login sessions and short-lived
  (30 min), single-use password reset tokens.
- D1 `rate_limit_attempts` — per-IP, per-endpoint request timestamps used
  to throttle `/api/login`, `/api/signup`, and `/api/password/forgot`.
- D1 `activity_log` — append-only history of every reveal/review/test
  action, the source for the Stats view.
- D1 `ai_usage` — per-user, per-day token/request usage against the
  shared Workers AI free-tier cap (20/day; bring-your-own-key users are
  unlimited, capped by their own provider account instead).
- D1 `push_subscriptions` — Web Push subscriptions for the daily
  reminder cron.

## Security notes / decisions made

- **Signup's "account already exists" message stays as-is.** The minor
  enumeration risk is judged an acceptable trade-off against the UX cost
  of a generic message. `/api/password/forgot`, reachable by anyone with
  just an email address, stays fully generic.
- **CSP allows `'unsafe-inline'` for `style-src` only**, never
  `script-src`.
- **Rate limiting uses a D1 table**, not Cloudflare's dashboard-level
  Rate Limiting rules, so the behavior stays in code and testable with
  `wrangler dev --local`.
- **Turnstile was not added** — worth adding if this app ever gets a
  wider public link.

## Custom domain (optional)

By default the app lives at the `*.workers.dev` URL Wrangler assigns. To
put it on your own domain, add the domain in the Cloudflare dashboard
under the Worker's **Settings → Domains & Routes**, or add a
`[[routes]]` entry to `wrangler.toml` if the domain's zone is already on
your Cloudflare account.
