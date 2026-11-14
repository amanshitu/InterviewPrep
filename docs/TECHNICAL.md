# ExamStreak — Technical Documentation

A reference for the codebase's architecture, data model, and API surface.
For development history and the reasoning behind specific decisions as
they were made, see `../DEVELOPMENT.md`. For what the app does from a
user's perspective, see `FUNCTIONAL.md`.

## 1. Stack

| Layer | Technology |
|---|---|
| Frontend | React 19 + TypeScript, Vite 7, Tailwind CSS v4 |
| Backend | A single Cloudflare Worker, raw SQL, no framework/ORM |
| Database | Cloudflare D1 (SQLite) |
| AI | Cloudflare Workers AI (default) or BYOK OpenAI/Anthropic |
| Email | Brevo transactional API, admin-configured at runtime (falls back to console logging if unconfigured) |
| Captcha | Cloudflare Turnstile (invisible mode) |
| Push | Web Push (VAPID), hourly Cron Trigger |
| Hosting | Cloudflare Workers + Workers Assets (`[assets]` in `wrangler.toml`) |

No build step beyond Vite for the frontend; the backend ships as plain
ES modules with zero bundling/transpilation step of its own (Workers
runs modern JS natively).

## 2. Repository layout

```
migrations/             Tracked D1 migrations (0001 … 0058+), applied in order
src/worker/
  index.js              The entire HTTP router — one big if/else chain matching
                         url.pathname + request.method, dispatching to routes/
  lib/                  Shared backend utilities (see table below)
  routes/               One file per API domain (auth, account, queue, admin, …)
src/web/
  index.html            The only HTML document — every route is client-routed
  entries/app.tsx        Mounts the single BrowserRouter tree (lazy-loaded routes)
  routes/
    app/                Authenticated pages (Today, Review, Settings, Stats, …)
    admin/              AdminHome (tabbed dashboard)
    auth/               Login (sign-in/up/forgot/reset, one component)
    public/             Home, About, Guide, FAQ, Privacy, Terms, Grievance, Press
  components/
    layout/             AppShell, Sidebar, MobileHeader, AuthGate, PageHeader,
                         PublicPageChrome/Parts, icon set
    settings/            Settings tab sections + their localStorage-backed prefs
    admin/               Admin panel sub-components (one per tab)
  api/                  One typed client module per backend domain
  hooks/                Shared React hooks (toast, confirm, push subscription, …)
  styles/globals.css    Design tokens, theme/accent CSS, Tailwind v4 @theme block
docs/                   This file + FUNCTIONAL.md
```

## 3. Frontend architecture

### 3.1 Single-page app, one document

Every route — authenticated pages, Settings, Admin, Login, and every
public/legal page — is a sibling route inside one `<BrowserRouter>` tree
(`src/web/entries/app.tsx`). This replaced an earlier phase where each
public page was its own separate HTML document/Vite build target; they're
now consolidated so there's exactly one `index.html` and one bundle.

Every route is `React.lazy()`-loaded (wrapped in one shared `<Suspense>`)
specifically so this consolidation doesn't mean a visitor opening
`/privacy` downloads the entire app — each page gets its own chunk,
fetched only when its route matches.

### 3.2 Two route groups, two different guards

- **Authenticated routes** (`/`, `/review`, `/test`, `/self-test`,
  `/mock-interview`, `/stats`, `/settings`, `/admin`) are nested under one
  layout route rendering `<AppShell>`, which wraps them in `<AuthGate>`.
- **Public/auth routes** (`/login`, `/home`, `/about`, `/guide`, `/faq`,
  `/privacy`, `/terms`, `/press`, `/grievance`) are sibling top-level
  routes, rendered directly — no AppShell, no AuthGate, no session check.

### 3.3 AuthGate

`src/web/components/layout/AuthGate.tsx` runs once per app visit (it's
inside the AppShell layout route, which only mounts once; it does not
re-run on client-side navigation between authenticated pages). Logic:

1. `likelyAuthed()` (a `localStorage` flag, not a real session check) —
   if false, redirect immediately with zero network round trip.
2. Otherwise call `GET /api/me` to confirm. A confirmed 401/403 clears
   the flag and redirects; any other failure (offline, 5xx, an aborted
   request) falls back to the last cached user snapshot rather than
   bouncing a possibly-still-valid session.
3. Root `/` redirects an unauthenticated visitor to `/home` (the
   marketing page) instead of straight to `/login` — it's the app's
   default URL (PWA `start_url`, bare domain). Every other deep link
   still redirects straight to `/login`, preserving a fast re-auth path.

### 3.4 Theming

CSS custom properties, defined in `src/web/styles/globals.css`'s
`@theme inline` block (Tailwind v4). Two independent, orthogonal choices:

- **Theme** (`localStorage: "theme"`, applied via classes on
  `<html>`): `system` | `light` | `dark` | `futuristic` | `midnight` |
  `noirgold` (always-dark looks) | `ivory` (always-light look).
  `theme-init.js` runs pre-paint to set the right class before React
  hydrates, avoiding a flash of the wrong theme.
- **Accent** (`localStorage: "accent"`, applied via `data-accent` on
  `<html>`): 9 colors, each with separately tuned light-mode and
  dark-mode hex values (`:root[data-accent="x"]` / `.dark[data-accent="x"]`)
  so button text stays WCAG-AA-legible in both modes — a real bug fixed
  in this codebase's history (see `DEVELOPMENT.md`): colors originally had
  one hex reused in both modes, which failed contrast in one mode or the
  other for several accents.

Both `setTheme()`/`setAccent()` wrap their DOM mutation in
`withoutTransitions()` (briefly disables all CSS transitions) so every
recolored element lands on its new color in the same frame.

### 3.5 Collapsing page title (`PageHeader`)

`src/web/components/layout/PageHeader.tsx`: a page's `<h1>` fades/drifts
upward as it scrolls toward the top; a compact frosted title bar
(permanently mounted, initially invisible) cross-fades in once the real
title crosses a threshold (56px under the mobile top bar, 0 on desktop),
and fades back out once the title returns. Driven by the title's own
`getBoundingClientRect()` position (via a `requestAnimationFrame`-
throttled scroll listener), not scroll direction — so there's never a
frame with neither title visible. Currently used on Settings and Admin;
not yet applied to pull-to-refresh-wrapped pages (their gesture handler's
own scroll-container assumptions need separate verification first).

### 3.6 Offline/PWA

A minimal service worker (`src/web/public/sw.js`) precaches only the
handful of stable, unhashed paths (`/`, `/manifest.json`,
`/theme-init.js`, `/favicon.ico`) and opportunistically caches whatever
hashed asset a visitor's browser actually requests. Never caches
`/api/*` — there's no meaningful offline experience beyond "the shell
loads"; pages needing live data show their last-loaded snapshot via
`src/web/lib/offline-store.ts` instead.

## 4. Backend architecture

### 4.1 Routing

`src/worker/index.js` is one `fetch()` handler with a long chain of
`if (url.pathname === "..." && request.method === "...")` checks (plus
regex matches for path params like `/api/sessions/:id/revoke`). Every
`/api/*` response passes through `applySecurityHeaders()`. Routes below
the public ones (`/api/signup`, `/api/login`, `/api/categories/public`,
`GET /api/auth/verify-email`) require a session, resolved once via
`getUserFromRequest()` and passed to every handler as `user`.

### 4.2 `lib/` reference

| File | Responsibility |
|---|---|
| `http.js` | `json()` helper, CSP + security headers |
| `session.js` | Session create/read/list/revoke, cookie handling |
| `crypto.js` | Password hashing (PBKDF2-SHA256), AES-GCM encrypt/decrypt for BYOK keys |
| `ratelimit.js` | D1-backed rate limiting, by IP or by an explicit key override (used for per-account login lockout) |
| `turnstile.js` | Server-side Turnstile siteverify, fails closed, no-ops if unconfigured |
| `settings.js` | `app_settings` key/value store (captcha toggle, AES-GCM-encrypted Brevo config) |
| `email.js` | Brevo wrapper (verification/reset/deletion emails), console-log fallback |
| `accountDeletion.js` | Grace-period purge logic, run from the existing hourly cron |
| `audit.js` | `logAdminAction()`, called from every admin mutation handler |
| `ai.js` | Workers AI / OpenAI / Anthropic dispatch, model lists, usage capping |
| `srs.js` | Spaced-repetition interval table and due-date math |
| `mcq.js` | Multiple-choice distractor generation/caching |
| `webpush.js` | VAPID push send |
| `datetime.js` | Timezone-aware "today" resolution |
| `request.js` | Body parsing, cookie parsing, email validation |
| `user.js` | DB-row ↔ API-payload mapping (`mapUserRow`, `userPayload`) |

### 4.3 `routes/` reference (one file per domain)

`auth.js` (signup/login/logout/password reset/email verification) ·
`account.js` (profile, sessions, data export, account deletion) ·
`categories.js` · `queue.js` (Today/Review, spaced-repetition reads/writes)
· `dailytest.js` · `selftest.js` · `resume.js` (resume-to-prompt) ·
`stats.js` · `questionsets.js` (upload/import/approve) · `reports.js`
(question reports) · `aiReports.js` (AI-output quality reports) ·
`feedback.js` · `admin.js` (overview/users/approval/audit log) ·
`platformSettings.js` (public config + admin captcha on/off) · `push.js`
(subscribe/unsubscribe + the hourly cron handler).

## 5. Database schema (grouped)

**Accounts & auth**: `users`, `sessions`, `password_resets`,
`email_verifications`, `rate_limit_attempts`.

**Categories & enrollment**: `categories`, `user_categories`,
`question_set_categories`.

**Content**: `question_sets`, `questions`, `user_question_sets`,
`mcq_variants` (cached Daily Test distractors).

**Per-user progress**: `user_question_progress` (now includes `due_date`
and `lapses` for spaced repetition), `daily_quota_ledger`,
`daily_test_results`, `activity_log`, `ai_usage`, `ai_stats_insights`.

**Moderation & support**: `question_reports`, `ai_reports`, `feedback`,
`admin_audit_log`.

**Other**: `push_subscriptions`, `user_state` (legacy JSON-blob snapshot,
superseded by the relational tables above but still read/written for
backward compatibility), `app_settings` (admin-toggleable platform
settings, currently just `captcha_enabled`).

See `README.md`'s "What's stored where" for a plain-English description
of each table's purpose, and `migrations/*.sql` for exact column
definitions — migrations are the single source of truth, never
hand-edited after being applied.

## 6. Spaced repetition

Leitner-box scheme (`src/worker/lib/srs.js`): `correct_streak` (already
tracked) doubles as the box level — no separate column needed. Interval
table `[1, 2, 4, 8, 16, 32, 60, 90, 120, 180]` days, indexed by streak,
capped at the last value. `user_question_progress.due_date` is set on
every grading action (`handleCompleteQuestion`, `handleReviewResult`); a
`NULL` due_date (every row that existed before this feature shipped) is
treated as "due now" everywhere it's read, so nothing in an existing
review pool disappeared when it launched. `handleGetReview` splits the
candidate pool into due vs. not-yet-due and prioritizes due questions
first, filling the remainder via the pre-existing weighted-random sample.

## 7. Security model

- **Passwords**: PBKDF2-SHA256, 100,000 iterations, per-user random salt
  — never stored or logged in plain text.
- **Sessions**: `HttpOnly; Secure; SameSite=Lax` cookie, 30-day TTL. A
  session's `id` (used by the sessions-list UI) is separate from its
  `token` (the actual cookie secret), so the list endpoint never returns
  anything cookie-security-sensitive.
- **BYOK AI keys**: AES-GCM, key from `AI_KEY_ENCRYPTION_SECRET`.
- **Captcha**: invisible Turnstile on login/signup/forgot-password,
  verified server-side (`success: true` only — no action/hostname
  cross-check, judged sufficient for this app's threat model). An admin
  can flip it off platform-wide from Admin → the captcha switch
  (`app_settings.captcha_enabled`, checked by `checkCaptcha()` in
  `auth.js` before `verifyTurnstile()` runs; the frontend's
  `useTurnstileToken()` also skips loading the Turnstile script entirely
  when off). Every toggle is audit-logged.
- **Rate limiting**: D1-table-backed, per (IP, endpoint) and, for login
  specifically, also per (attempted email, endpoint) independently —
  catches both a single-IP brute force and a distributed one against one
  account.
- **Admin authorization**: every `/api/admin/*` route checks
  `user.role === "admin"` individually in the router (not centralized
  behind one middleware — a known duplication, not a correctness gap;
  every route was verified to have the check).
- **Headers**: CSP (`script-src 'self'` plus a hash-allowlisted
  theme-flash-prevention script and Turnstile's host; no `unsafe-inline`
  for scripts anywhere), `X-Content-Type-Options`,
  `Referrer-Policy`, `Strict-Transport-Security`, `Permissions-Policy`.
- **Admin audit log**: every admin mutation (question edit, report/
  feedback resolve, set approve/reject) and the per-user stats
  drill-down (viewing, not just mutating) write a row to
  `admin_audit_log`, visible at Admin → Audit Log.
- **Account deletion**: self-serve, password-confirmed, soft (30-day
  grace period via `users.deletion_requested_at`), cancelable any time
  before the grace period ends, purged by the existing hourly cron.

## 8. AI integration

Three providers behind one interface (`src/worker/lib/ai.js`):
Cloudflare Workers AI (default, shared, daily per-user cap), OpenAI, and
Anthropic (both BYOK, unlimited, user's own billing). A user's choice and
encrypted key live on their `users` row. Workers AI model choice is
user-configurable (`workers_ai_model` column) from a fixed allowlist.

## 9. Build & deploy

```
npm run dev          # wrangler dev, builds frontend first (predev hook)
npm run build:web    # tsc --noEmit && vite build -> dist/
npm run deploy       # wrangler deploy (Cloudflare Workers Builds also
                      # auto-deploys on every push to the connected branch
                      # via its own git integration — verify this is the
                      # desired behavior for your own fork/remote)
```

Migrations are applied explicitly, never automatically, with
`npx wrangler d1 migrations apply interview-prep-db --remote` (or
`--local` for dev). This is the one step that must be run manually after
pulling a commit that added a new migration file — nothing else deploys
schema changes.

## 10. Known constraints

- No automated test suite — correctness is verified manually via
  Playwright against a running `wrangler dev` instance per feature, not
  via a checked-in test file (see `DEVELOPMENT.md` for the verification
  log per phase).
- `requireAdmin()` is not a shared middleware; the `user.role === "admin"`
  check is repeated inline per route. Functionally correct everywhere
  it's used, but a future refactor candidate.
- No Cloudflare-usage-quota surfacing in the admin dashboard (D1
  row-read/write or Worker-request pressure) — a stretch idea from
  comparing against sibling projects, not built.
