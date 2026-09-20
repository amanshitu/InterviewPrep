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

## Phase 2 — AI

**Status: built and verified locally; not yet deployed to production** (no schema migration needed — `mcq_variants`/`daily_test_results` already existed from `0003`, schema-only until now).

| Item | Status |
|---|---|
| `[ai]` binding in `wrangler.toml` | Done — see note below on local dev limitations |
| `AI_KEY_ENCRYPTION_SECRET` Worker secret (prod) + `.dev.vars` (local) | Done — generated, set, never printed to any log |
| BYOK encryption (AES-GCM, `encryptSecret`/`decryptSecret` in `src/worker.js`) | Done |
| `PATCH /api/profile` extended for `aiProvider`/`aiApiKey` (set/clear) | Done |
| MCQ generation + cache (`generateMcq`, `getOrCreateMcqVariant`) — Workers AI default, OpenAI/Anthropic via BYOK, generic fallback on any AI failure | Done |
| `GET /api/test/today` (stable daily set, persisted on first fetch) | Done |
| `POST /api/test/answer` (idempotent — can change an answer, re-grades) | Done |
| Frontend: Daily test view (MCQ buttons, correct/incorrect highlight, score) | Done |
| Frontend: Settings "AI provider" card (provider select + key field + clear) | Done |
| Local verification (`wrangler dev --local` + Playwright) | Done — full flow tested with the fallback MCQ (see note below); BYOK set/clear tested with a fake key; two-user isolation re-confirmed |
| Real Workers AI call verified end-to-end | Done — see note below on the model id catch |
| Deploy to production | Done |

**Local dev AI limitation:** Workers AI has no local inference simulator, and this wrangler version reports the `[ai]` binding's `remote = true` mode as "not supported" under plain `wrangler dev` (only the older blanket `wrangler dev --remote` works, which would also point D1 at production — undesirable for routine testing). `generateMcq()` catches any AI failure and falls back to a generic MCQ (correct answer + 3 generic distractors) and logs the failure via `console.error` (visible with `wrangler tail`), so local dev exercises the full queue/cache/scoring/UI logic correctly even without real AI-generated distractors, and a real failure in production degrades gracefully instead of breaking the test.

**Caught during production verification:** the first deploy used `@cf/meta/llama-3.1-8b-instruct`, which turned out to be deprecated (as of 2026-05-30) — it silently fell back to the generic MCQ every time, which is exactly the failure mode the fallback+logging above is meant to catch. Confirmed via `wrangler tail` and swapped to `@cf/meta/llama-3.1-8b-instruct-fp8`, verified live against the account's actual model catalog with `wrangler ai models` rather than trusting docs/memory. Real AI-generated distractors confirmed working and graded correctly after the fix. Worth rechecking this model id periodically — Workers AI's catalog changes fairly often.

**OpenAI/Anthropic BYOK paths are implemented but not verified against a real key** — nobody has supplied test credentials for either. The request/response handling follows each provider's standard, stable chat-completion API shape; low risk, but flagged as unverified.

**Decisions made in this phase, not previously locked:**
- Model: `@cf/meta/llama-3.1-8b-instruct-fp8` (Workers AI free tier default, ~50-200 neurons/request against the 10,000/day free quota).
- BYOK providers supported: OpenAI (`gpt-4o-mini`) and Anthropic (`claude-3-5-haiku-20241022`), called directly via `fetch()` (no SDK). Other providers aren't supported yet.
- Daily test size: fixed at 10 questions (`TEST_SIZE`), not user-configurable in this phase.
- `mcq_variants` is a **global** cache keyed only by `question_id` — the first user to trigger generation for a given official question determines its MCQ for every other user who later does that same question. This was already the intended design from the Phase 1 planning review, just noting it's now live.

## Phase 3 — sharing, PWA, routing

**Status: built, verified locally, deployed to production.**

| Item | Status |
|---|---|
| `POST /api/question-sets/:id/submit` (owner submits private/rejected → pending) | Done |
| `GET /api/admin/pending-sets`, `POST /api/admin/question-sets/:id/approve`, `POST /api/admin/question-sets/:id/reject` (role='admin' enforced) | Done |
| `GET /api/question-sets/suggestions` + `POST /api/question-sets/:id/subscribe` | Done |
| Frontend: "Submit for review" on private/rejected sets in Settings | Done |
| Frontend: "Suggested sets" card in Settings with Subscribe | Done |
| Frontend: Admin view (sidebar nav item, visible only to `role==='admin'`) | Done |
| PWA: `manifest.json`, `sw.js` (cache-first shell, network-only `/api/*`), icons generated with a small pure-Node PNG writer (`scripts/generate-icons.js`) | Done |
| Real URL routing (`setRoute`/`dispatchRoute`, History API) replacing the pure in-memory `currentView` switch | Done — `/`, `/review`, `/test`, `/settings`, `/stats`, `/admin` all deep-linkable and refresh-safe (via the existing SPA fallback), back/forward verified |
| Responsive/mobile pass | Done — checked at 390px width (queue, MCQ test, settings/upload); no fixes needed, existing responsive rules from Phase 1 already covered the new elements |
| Local verification (`wrangler dev --local` + Playwright, incl. mobile viewport) | Done |
| Set the real account's `role` to `admin` in production | Done (see below) |
| Deploy to production | Done |

**Note on the real admin:** `manoj.ansh@gmail.com` (the one real account) was set to `role='admin'` directly via SQL as part of this phase's deploy — there's no self-service "become admin" path by design, and this is the only account that should have it for now.

## Phase 3.1 — split `app.js` into per-page ES modules (follow-up)

**Status: done, deployed.** After Phase 3 shipped, the user pointed out the app still "seems like a single page application" — accurate: the routing above gives real per-view URLs, but every view's code (~52KB) was still loaded upfront in one `app.js`, regardless of which page you actually visit. Asked what they meant; they wanted the code split so a page's script only loads when you visit it, still with no build step or framework.

Solution: native ES modules (`<script type="module">` + dynamic `import()`), which every modern browser supports with zero tooling.

- `public/app.js` is now a small core module (~9KB): shared utils (`$`, `el`, `escapeHtml`, `api`, `toast`, `formatDate`, `downloadBlob`), a shared mutable `state` object (`currentUser`, `currentView`, `todayQueue` — needed since ES module bindings for primitives can't be reassigned from outside the module, so shared mutable state has to live on an exported object), the shell (`renderShell`/`renderSidebar`/`renderTopStats`), the auth screen, and routing.
- Routing now lazy-loads: `navigate(path, param)` and the internal `dispatchRoute` look up a per-route dynamic `import()` (`./pages/home.js`, `./pages/review.js`, `./pages/test.js`, `./pages/settings.js`, `./pages/stats.js`, `./pages/admin.js`) and call that module's exported `render()`. The browser caches an imported module after first load, so revisiting a page within the same session doesn't re-fetch it.
- Each page module imports only what it needs from `app.js` and keeps its own page-local state (e.g. `reviewBatch`, `testBatch`) as module-scoped variables — no more one giant shared closure.
- `public/index.html`'s script tag gained `type="module"`; no other HTML changes. `sw.js` still only precaches the core shell (`/`, `/app.js`, `/styles.css`, `/manifest.json`) — page modules are *not* precached, since that would defeat the point; they get cached opportunistically by the existing fetch handler the first time each one is actually requested.
- Verified: fresh signup → home → review → back → test → settings (incl. AI provider save, question-set upload, suggestions) → stats → a direct deep-link reload on `/settings`, all via Playwright, zero console errors or failed requests.
- Size impact: initial script payload for a typical first visit (core + home page) is ~16KB, down from ~52KB when everything loaded as one file — and a user who never opens Settings never downloads its ~18KB (the largest single page) at all.

## Phase 3.2 — AI-enabled Stats, per-user AI usage cap, CSV import, favicon fix

**Status: done, deployed.** Requested directly by the user after reviewing Phase 3.

| Item | Status |
|---|---|
| Migration `0004_ai_usage_insights.sql` (`ai_usage`, `ai_stats_insights`) | Done |
| Per-user daily AI usage cap (`FREE_AI_DAILY_CAP = 20`) for the shared Workers AI resource | Done — BYOK users are uncapped (they're bounded by their own key/cost instead) |
| `GET /api/ai-usage` (usage display) | Done |
| `GET /api/stats/insight` — AI-generated coaching insight, cached once per user per day | Done |
| Stats page: "Your coaching insight" card | Done |
| Settings: AI usage line in the AI provider card | Done |
| CSV import (Settings → My question sets → "Import from CSV" + "Download CSV template") | Done — client-side parse, reuses the existing `POST /api/question-sets` upload endpoint, no new backend needed for import itself |
| Favicon: proper `favicon.ico` (real ICO container, generated by `scripts/generate-icons.js`) + a 32px PNG + `sizes`/cache-busting query param on the icon links | Done |
| Local verification (curl for cap boundary + non-persistence of capped fallback; Playwright for insight/usage-line/CSV-import/favicon) | Done |
| Apply `0004` + deploy | Done |

**Design notes:**
- **AI usage cap is attempts, not just successes** — if a Workers AI call errors out (not just "capped"), the unit is still spent (checked-and-incremented before the call is made). This matches typical rate-limiting semantics and stops a broken/error-prone request pattern from being free to retry indefinitely.
- **A capped MCQ generation is never permanently cached.** `mcq_variants` is a global, forever cache — if a rate-limited fallback got written there, every future user of that question would be stuck with filler distractors permanently. Capped results are returned but not persisted, so the next uncapped attempt (a different user, or the same user tomorrow) generates it properly.
- **CSV import format**: header row must include `section`, `question`, `answer` columns (any order, case-insensitive); quoted fields with embedded commas/newlines are supported (RFC4180-ish parser, hand-written, no dependency). "Excel" support means exporting a spreadsheet to CSV first — true `.xlsx` binary parsing was considered and explicitly declined (would need a CDN-hosted parsing library and a CSP change) in favor of staying dependency-free, per the user's choice.
- **Favicon root cause**: before this, there was no `/favicon.ico` at all — some browsers probe that path directly regardless of `<link rel="icon">`, and with `not_found_handling = "single-page-application"` in `wrangler.toml`, an unmatched `/favicon.ico` request was silently served `index.html` (200, wrong content type) instead of 404ing or serving an icon. Added a real ICO-format file (PNG-in-ICO, supported by all modern browsers) plus explicit `sizes` attributes and a `?v=2` cache-busting query string, since favicons are cached unusually aggressively by browsers.

## Phase 3.3 — expanded profile fields

**Status: done, deployed.** Closes out the last item flagged as partial back in Phase 3's review.

| Item | Status |
|---|---|
| Migration `0005_profile_fields.sql` (`headline`, `years_experience`, `bio`, `timezone`) | Done |
| Signup: optional "Current role" field + silently auto-detected browser timezone | Done |
| Settings → Prep profile: headline, years of experience, bio, editable timezone | Done |
| Timezone-aware "today"— `todayDateStr()` now takes the user's IANA timezone (validated server-side, falls back to UTC on anything invalid/unparseable) instead of always using UTC | Done — affects the daily quota ledger, the daily test set, and the AI usage cap, all of which now reset at the user's own midnight |
| AI Stats insight prompt now includes headline/years/bio/track when set, for a more tailored coaching note | Done |
| Fixed along the way: `handleLogin`'s response was missing `aiProvider`/`hasAiKey` entirely (a real latent bug — a BYOK user's key status wouldn't show correctly until something else refetched `/api/me`). Consolidated signup/login/change-password onto one `mapUserRow()` + `userPayload()` path instead of three hand-rolled object literals, so this class of drift can't recur | Done |
| Local verification (curl: signup/login/profile-update with new fields, invalid-timezone fallback, and a real cross-timezone date-boundary check against a live UTC-offset difference; Playwright: signup → Settings → save → reload persistence) | Done |
| Apply `0005` + deploy | Done |

**Design notes:**
- Progressive profiling: only "current role" was added to signup (kept optional, to not add friction) — years of experience, bio, and timezone override live in Settings, filled in whenever the user gets to it, not forced upfront.
- Timezone is auto-detected via `Intl.DateTimeFormat().resolvedOptions().timeZone` in the browser and sent silently at signup; users only need to touch the field manually if traveling or if detection was wrong.
- `mcq_variants`, `daily_test_results`, etc. are still all UTC-agnostic identifiers already (`date` is just a plain `YYYY-MM-DD` string) — the timezone-awareness lives entirely in *which* string gets computed as "today" for a given user, not in the schema.

## Phase 3.4 — timezone dropdown, selectable Workers AI model

**Status: done, deployed.** Two small follow-ups requested directly by the user.

| Item | Status |
|---|---|
| Timezone: free-text input → curated `<select>` with friendly labels (e.g. "IST — India") | Done — 26 major-region entries, west to east; if a user's stored/detected zone isn't in the list, it's injected as an extra option instead of silently overwritten |
| Migration `0006_workers_ai_model_choice.sql` (`users.workers_ai_model`) | Done |
| Per-user selectable Workers AI model, 6 options across different vendors (Meta, Mistral, Google, Z.ai) | Done — direct response to the earlier model-deprecation incident: if one model breaks, a user can self-serve switch instead of waiting on a code fix |
| Settings: "Workers AI model" dropdown, shown only when provider = Workers AI | Done |
| Local verification (curl: default/switch/invalid-model fallback; Playwright: dropdown behavior, provider-switch show/hide, save+reload persistence) | Done |
| Apply `0006` + deploy | Done |

**Design notes:**
- **Timezone alias handling**: IANA has legacy aliases for the same zone (`Asia/Calcutta` == `Asia/Kolkata`) — a browser's auto-detected name and the curated list's name can differ as strings while meaning the same thing. Both sides are canonicalized via `Intl.DateTimeFormat(...).resolvedOptions().timeZone` before comparing, so the friendly label still matches instead of falling back to a redundant raw-string option. Caught this exact case in testing (a dev machine reporting `Asia/Calcutta`) and fixed it before shipping.
- **Model list is a server-side allowlist** (`WORKERS_AI_MODELS` in `src/worker.js`) — a request naming anything outside it falls back to the default regardless of what the client sends. `public/pages/settings.js` keeps its own copy in sync for the dropdown UI; a comment in each file points at the other.
- **Model choice only applies to the shared Workers AI path**, not BYOK — OpenAI/Anthropic already have their own fixed model choice hardcoded per provider. The picker hides automatically when a BYOK provider is selected.
- `mcq_variants.generated_by` now records the specific model too (e.g. `workers-ai:@cf/meta/llama-3.1-8b-instruct-fp8`), not just the provider name — so a future admin tool could identify and regenerate MCQs that came from a model that's since been deprecated. The Stats insight's `generated_by` stays provider-only, since that one is shown directly to the user and the extra detail wouldn't mean anything to them.

**Also answered, no code change**: how to grant `role='admin'` — currently a direct SQL update (`UPDATE users SET role='admin' WHERE email=...`), no self-service UI by design. Offered to build a "Manage admins" section in the Admin view if wanted; not yet requested.

## Phase 3.5 — resume-tailored question prompt builder

**Status: done, deployed.** Requested with an explicit ask to analyze and plan before changing anything — see the approved plan for the full reasoning; summarized here.

| Item | Status |
|---|---|
| "Generate questions from your resume" card in Settings | Done — pure frontend, no new endpoint, no new migration, no AI call from this app |
| Resume text input (pasted, not an uploaded file) | Done |
| Target role, pre-filled from `track`/`headline` | Done |
| Category checkboxes (5 official curriculum groups) + custom category add | Done |
| Prompt builder (`buildResumePrompt`) → copy-to-clipboard, with a select-and-copy fallback if the Clipboard API throws | Done |
| Local verification (Playwright: prefill, custom category, prompt content, clipboard) | Done |
| **Critical check**: hand-crafted a CSV shaped exactly like what the prompt asks an external AI to produce (quoted comma-containing field included) and ran it through the existing "Import from CSV" flow — imported cleanly | Done |
| Deploy | Done |

**Locked decisions (from the approved plan, confirmed directly with the user):**
- **Pasted resume text, not a file upload.** Real PDF/DOCX parsing needs a parsing library, which this project has declined more than once already for the same reason (see Phase 3.2's CSV-vs-XLSX call). Users copy text out of their PDF/Word doc instead.
- **Prompt-assist only, for now — no direct in-app generation.** The user's own ChatGPT/Claude account does the actual generation; this app only builds the prompt and reuses the CSV importer already built in Phase 3.2. Zero new AI-call cost, zero interaction with `FREE_AI_DAILY_CAP` (which is sized for small MCQ-style calls, not 40-60 full Q&A pairs at once).
- **Nothing is persisted or sent by this app.** The resume text lives only in the browser for the duration of building the prompt. A line in the UI says so explicitly, and that pasting the prompt into ChatGPT/Claude sends it there under the user's own account, not through this app.
- **Direct in-app generation stays a documented option for later** — if there's real demand for skipping the copy/paste round trip, it would need its own usage-cap accounting (a resume-scale generation is a much bigger ask than one MCQ) and likely one AI call per category rather than one big call, to stay within smaller models' output limits.

## Phase 3.6 — AI-suggested target role, larger resume input

**Status: done, deployed.** Two follow-ups to Phase 3.5's resume prompt builder.

| Item | Status |
|---|---|
| Resume textarea: `maxlength` 8000 → 24000 (tripled, as requested) | Done |
| `POST /api/resume/suggest-role` — small AI call, resume text → suggested target role | Done |
| Settings: "Suggest from resume" button next to the target role field, always editable | Done |
| Local verification (curl: empty-input 400, cap-exceeded 429 with friendly message, AI-error 502 fallback; Playwright: button states, graceful error display, role field stays editable) | Done |
| Real Workers AI call verified live in production | Done |
| Deploy | Done |

**This reintroduces an AI call from the app for one small piece — not the deferred "generate 40-60 Q&A" path.** Phase 3.5 locked in "prompt-assist only, no AI call from this app" for the *bulk question generation* specifically, because that's a large, expensive, multi-question call that would need its own usage-cap accounting. Suggesting a single role from a resume is a tiny, cheap, one-line-output call — the same scale as MCQ generation or the Stats insight — so it reuses the existing `callConfiguredAi`/`FREE_AI_DAILY_CAP`/BYOK infra directly with no new design needed. The bulk generation itself is still prompt-assist only; this just makes the "target role" input smarter, with the user always free to override it.

**Design notes:**
- Resume text passed to this endpoint is not persisted — it exists only for the duration of the request, same as the client-side prompt builder.
- A capped or failed suggestion degrades gracefully (clear inline error, button re-enabled) rather than blocking the flow — the target role field is always just a normal editable text input, so the user can type one manually regardless of whether the suggestion succeeded.

## Phase 3.7 — About page

**Status: done, deployed.**

| Item | Status |
|---|---|
| `public/pages/about.js` — new routed page explaining what the app does, key features, a getting-started walkthrough, and AI/privacy notes | Done |
| Reachable pre-login (standalone `#about-screen`, so prospective users can read it before signing up) and post-login (sidebar nav item, rendered into `#main` like any other page) from one shared content function | Done |
| "About this app" link in the footer on both screens | Done |
| Local verification (Playwright: direct `/about` visit pre-login, footer link, "Back to sign in", authenticated sidebar nav + active state, sidebar chrome intact) | Done |
| Deploy | Done |

**Design notes:**
- One `buildAboutView()` function is the single source of content; `render()` in `about.js` picks between rendering it into a standalone screen (`state.currentUser` is null) or into `#main` with the usual page chrome (logged in) — no content duplication between the two contexts.
- The footer's "About this app" link is a plain `<a href="/about">`, not JS-wired — clicking it does a full page reload rather than an SPA transition. Given it's a low-frequency destination, that trade-off was fine to keep the footer (which appears on every screen, including pre-login) simple; the sidebar nav item gives a snappier SPA-routed path for logged-in users who want to revisit it.

**Known trade-offs, not blocking:**
- PWA icons are a flat brand-color square with a checkmark, generated programmatically — functional (satisfies installability requirements) but not real designed artwork. Swap `public/icons/*.png` for real icons later if desired; `scripts/generate-icons.js` isn't needed once you do.
- The reject-reason prompt in the Admin view uses the browser's native `prompt()` rather than a custom modal — simplest thing that works for a low-traffic, admin-only interaction.
- `mcq_variants`' global (not per-user) caching, noted back in the Phase 1 planning review, is now visibly relevant here too: a user-submitted set's MCQs get generated using whichever AI provider the *first* person to reach a "done" question on that set happens to have configured.

## Phase 3.8 — top-nav restructure, profile menu, theme selector, About footer fix

**Status: done, deployed.**

| Item | Status |
|---|---|
| Removed the near-empty left sidebar; `Today`/`Stats`/`Admin`/`About` moved into the topbar as `.nav-link` buttons, `.main` is now a direct flex child of `.app` (no `.layout` wrapper) | Done |
| New top-right profile widget: initials avatar (`getInitials()`) + name + caret, opens a Settings/Sign-out dropdown on hover (desktop mouse) *and* on click/tap (mobile, touch, keyboard) — `wireProfileMenu()` in `app.js` | Done |
| Theme selector (`#theme-select`: System/Light/Dark) in the topbar, backed by `localStorage`, plus a synchronous inline `<head>` script in `index.html` that replays the saved choice before first paint (no flash) | Done |
| Fixed reported bug: the standalone (pre-login) About screen never rendered a footer at all — `renderStandalone()` in `about.js` now appends one after rebuilding `#about-standalone-wrap` on every render | Done |
| `renderSidebar` renamed to `renderNav` across `app.js` and all 7 page modules (mechanical rename, same element IDs, no other logic changes) | Done |
| New/rewritten CSS: `.topbar-nav`, `.nav-link`, `.theme-select`, `.profile-menu`/`.profile-trigger`/`.profile-avatar`/`.profile-dropdown` (opacity/visibility + `.is-open` class, not the `hidden` attribute — see note below), plus a responsive block for the topbar at mobile widths; removed dead `.layout`/`.sidebar`/`.nav-group*`/`.nav-topic*`/`.status-dot*` rules | Done |
| Local verification (Playwright): sidebar/`.layout` gone, avatar+name populated, dropdown opens on hover and on click, closes on outside-click and Escape, theme defaults to System, toggling to Dark/Light applies and survives reload, About nav active-state in both desktop and mobile viewports, both About footers (standalone + authenticated) render | Done |
| Deploy | Done |

**Design notes:**
- The dropdown deliberately avoids the HTML `hidden` attribute: this app's global reset rule `[hidden] { display: none !important; }` would override a CSS `:hover`-based reveal. Instead `.profile-dropdown` is always in the DOM with `opacity: 0; visibility: hidden`, made visible via `.profile-menu:hover`/`:focus-within` (desktop) or a JS-toggled `.is-open` class (click/tap, with outside-click and Escape to close) — both mechanisms just add/remove the same visual state, so they don't fight each other.
- No separate "Profile" page was built — the dropdown's "Settings" item routes to the existing Settings page (which already has Account/Prep-profile cards), and "Sign out" calls the existing logout flow. Avatars are initials-only; there's no photo upload since no R2 bucket (or any file storage) is configured for this app yet.
- The theme selector lives only in the post-login app-shell topbar, not on the pre-login auth/About screens — scoped that way since those screens are simpler and shorter-lived; can be added later if wanted.
- **Caught during verification, not by the user:** the new inline `<head>` script (for flash-free theme init) was silently blocked by the app's own `Content-Security-Policy: script-src 'self'` header — CSP has no notion of "same-origin inline," so any inline `<script>` needs either `'unsafe-inline'` (too broad) or an exact hash. Fixed by allowlisting the script's exact SHA-256 hash in `CONTENT_SECURITY_POLICY` in `src/worker.js`; that hash must be recomputed if this specific script's text ever changes (it's static, so this is expected to be rare).

## Phase 3.9 — avatar upload, modern theme toggle, dropdown hover fix, About/Stats depth

**Status: done, deployed.**

| Item | Status |
|---|---|
| Profile picture upload in Settings' Account card (`avatar-upload-row`), client-side cropped/resized to a 256×256 JPEG via canvas before upload — no R2 needed, stored as a `data:` URL in a new `users.avatar_data` column (migration `0007_avatar.sql`) | Done |
| Topbar/Settings avatar renders the uploaded picture (`renderAvatar()` in `app.js`) instead of initials wherever it's set; "Remove" clears it back to initials | Done |
| Theme selector replaced with a modern 3-icon segmented control (`.theme-toggle`/`.theme-option`), same System/Light/Dark behavior and persistence as before | Done |
| Fixed reported bug: the profile dropdown closed before the pointer reached it on the way down from the trigger. Root cause: the dropdown had a `margin-top` gap that wasn't part of any element's hoverable box, so `.profile-menu:hover` dropped mid-transit. Fixed by moving that spacing into the dropdown's own `padding-top` instead | Done |
| Logo/brand text in the topbar is now a button that navigates home | Done |
| About page: new "How it works" flow diagram (5 connected steps) and a small illustrative "why spaced repetition works" trend graphic | Done |
| Stats page: new server-computed `GET /api/stats/progress` (per-topic completion % + accuracy, joined from `questions`/`user_question_sets`/`user_question_progress`, plus a ranked "focus areas" shortlist) backs two new cards — "Focus areas" and "Progress by topic" (replacing the old client-only "Weakest topics" card, which only covered topics the user had already attempted and couldn't show completion at all); a 4th stat tile shows overall completion % | Done |
| Local verification (Playwright): logo→home, segmented theme control, hover-transit across the dropdown gap + real click-through to Settings, avatar upload/persist-after-reload/remove round trip, About flow/graphic present, Stats focus-areas/progress-by-topic cards populated, mobile viewport check | Done |
| Deploy | Done |

**Design notes:**
- Avatar images are center-cropped to a square and downscaled to at most 256px client-side before upload, so a real photo lands well under the server's `MAX_AVATAR_DATA_URL_LENGTH` (400,000 chars) backstop — no separate file storage, consistent with this app staying zero-infra beyond D1/Workers AI.
- "Focus areas" ranks topics by a blended score (60% completion gap, 40% accuracy gap when there's enough attempt history to trust it) — on a near-empty account, several topics can tie at "fully untouched," which is expected; the ranking sharpens once there's real review history to weight the accuracy half.
- `getUserFromRequest()` and `handleLogin`'s user-lookup query both had to be extended with the new `avatar_data` column — a reminder that this app hand-lists columns per query rather than `SELECT *`, so adding a user-table column means checking every such query, not just `mapUserRow`/`userPayload`.

**Known trade-offs, not blocking:**
- The old local dev D1 state had drifted from its own migration-tracking table (only `0001`/`0002` were recorded despite the schema already reflecting everything through `0006` from earlier ad hoc testing this session) — worked around locally by backfilling the missing tracking rows rather than re-running already-applied SQL. Local-only; does not affect the production database or this feature's migration file.

## Phase 4.0 — question-bank header stat, CSV import size fix, branding cleanup

**Status: done, deployed.**

| Item | Status |
|---|---|
| New header stat pill showing `yours/total` question counts — questions this user can see (official + subscribed + own sets) vs. every question anyone has ever added to the platform | Done |
| New `GET /api/questions/bank-count` endpoint (`handleGetBankCount` in `src/worker.js`) backing it; fetched once at boot into `state.bankStats` and re-fetched via `refreshBankStats()` after a CSV import, a manual upload, or subscribing to a suggested set — no full page reload needed | Done |
| Fixed "Request body too large" on CSV import: `handleCreateQuestionSet`'s body-size cap was 300,000 bytes, but a few hundred detailed Q&A rows re-serialized as JSON routinely exceeds that (JSON's per-field quoting adds real overhead over the raw CSV size) — raised to 2,000,000 bytes | Done |
| Removed the "About this app" link from both site-wide footers (auth screen and app shell) | Done |
| Removed "Cloudflare" from the two user-facing AI-provider explanations (About page's "About the AI features" card and Settings' AI provider card) — both now say "our built-in AI" instead of naming the underlying platform | Done |
| Local verification (Playwright): signed up, confirmed the pill shows real counts (`360/376`), re-imported the full 360-question CSV (~600KB) with zero import errors and the pill updating to `720/736`, confirmed the footer no longer mentions About and neither About nor Settings mention Cloudflare | Done |
| Deploy | Done |

**Design notes:**
- "Yours" and "total" reuse the same `user_question_sets` join pattern the queue-builder and `/api/stats/progress` already use for "what can this user see," rather than introducing a new visibility rule — kept as its own lightweight endpoint (two `COUNT(*)` queries, no joins beyond the one) rather than folding it into `/api/stats/progress`, since the header needs this on every page, not just Stats.
- The pill is fetched once at boot and cached in `state.bankStats`, not re-fetched on every route change — it only changes when someone adds/subscribes to content, which is rare enough that an explicit `refreshBankStats()` call from those three action sites is simpler and cheaper than polling or re-fetching per navigation.

## Phase 4.1 — admin question review + approval/rejection history

**Status: done, deployed.**

| Item | Status |
|---|---|
| Admin can expand "Review questions" on any pending set before deciding — shows every question and its model answer, grouped by topic, via a new `GET /api/admin/question-sets/:id/questions` endpoint | Done |
| New "Review history" section on the Admin page listing every past decision (both approved and rejected sets): submitter, question count, who acted, when, and — for rejections — the reason | Done |
| New `GET /api/admin/approval-history` endpoint backing it, self-joining `question_sets` to `users` twice (once for the submitter, once for whichever admin acted) | Done |
| Migration `0008_set_review_audit.sql` adds `rejected_at`/`rejected_by` to `question_sets`, mirroring the `approved_at`/`approved_by` columns that already existed — `handleRejectSet` now records who rejected a set, not just why | Done |
| "Review questions" is also available on each history row, not just pending ones, so an admin can re-check what a set actually contained after the fact | Done |
| Local verification (Playwright): submitted a set, reviewed its questions before approving, confirmed it moved into history with the correct approver name/date; submitted and rejected a second set, confirmed the reason and rejecting admin's name appear in history; confirmed history sorts most-recent-decision-first and pre-existing rows from before this migration degrade gracefully (show "Rejected by unknown" rather than erroring, since old rejections never recorded an actor) | Done |
| Deploy | Done |

**Design notes:**
- `approved_by`/`rejected_by` are two separate nullable columns rather than one shared "decided_by" column, matching the existing `approved_at`/`rejected_reason` pattern already on the table — the history query reconciles them with `COALESCE(approved_by, rejected_by)` when it needs "whoever acted" as a single value to join against `users`.
- Fetched question lists are cached client-side per set id (`questionsCache` in `admin.js`) so toggling a review panel open/closed repeatedly, or re-expanding the same set from both the pending list and history, doesn't re-fetch every time.
- The review-questions endpoint isn't restricted to pending sets — an admin can call it for any set id, since re-inspecting an already-decided set's content from the history view is exactly the kind of thing this feature exists for.

**Incident (2026-09-21):** approving/rejecting any set on production started returning "Server error." Root cause: something outside this session's own `wrangler deploy` calls is auto-deploying every commit to production almost immediately (confirmed by checking the live `admin.js`/`settings.js` content right after committing, with no manual deploy run) — so this phase's code went live before its migration (`0008_set_review_audit.sql`, adding `rejected_at`/`rejected_by`) had been applied to the *remote* database, and `handleApproveSet`'s UPDATE statement referencing those columns failed outright. Fixed by applying the migration to the remote D1 database directly; verified live with disposable submitter/admin test accounts (approve and reject both confirmed working, test data cleaned up afterward). Given this auto-deploy behavior, any future migration-adding commit needs its remote migration applied essentially immediately, not deferred to a separate "when you're ready to deploy" step.

## Phase 4.2 — AI-generated resume prompt

**Status: done, deployed, verified live.**

| Item | Status |
|---|---|
| "Generate prompt" on the resume-prompt card now calls a new `POST /api/resume/generate-prompt` endpoint instead of building the prompt from a pure client-side template — the AI writes a tailored introduction referencing the resume's actual companies, technologies, and seniority signals, so the questions/answers a user later gets back from pasting it into ChatGPT/Claude are genuinely specific rather than generic | Done |
| Uses the same shared-quota/BYOK accounting as every other AI feature (`callConfiguredAi`) — no new cap or budget | Done |
| The CSV-import contract (exact `section,question,answer` header, quoting rules, category list, count per category) stays deterministic, never AI-generated: the model is instructed to reproduce it verbatim, and the server checks for the literal header string in the reply and appends the rules block itself if it's missing, so a hallucinated or truncated reply can never produce an unimportable prompt | Done |
| Graceful fallback: any failure calling the endpoint (AI capped for the day, or the call failing outright) falls back to the original deterministic client-side template (`buildResumePrompt`, kept in `settings.js` for exactly this) rather than leaving the button broken — strictly a superset of the old behavior, never a regression | Done |
| Local verification (Playwright): confirmed the button shows a "Generating…" loading state, and — since Workers AI isn't reachable from local dev — confirmed the fallback path produces a working prompt with the correct CSV header and the resume's own detail embedded, with the button correctly re-enabled afterward | Done |
| Live verification against production with a disposable test account, catching and fixing two real bugs the local fallback-only testing couldn't have caught (see below) | Done |

**Bugs caught during live verification, not local testing:**
- The reply came back truncated mid-instruction, cutting off the verbatim rules block before it finished — because `callWorkersAi`/`callAnthropic` had a small hardcoded token budget (Workers AI's implicit default; Anthropic hardcoded to 400) sized for this app's existing short AI outputs (a one-line role suggestion, a short MCQ), never previously large enough to matter until this call's much longer expected output. Fixed by threading an explicit `maxTokens` parameter through `callConfiguredAi` → `callWorkersAi`/`callOpenAi`/`callAnthropic` (default 600, raised to 1200 specifically for this call).
- The model routinely prepended commentary like `Here is the prompt:` and sometimes wrapped its whole reply in a stray quote — despite explicit instructions not to. Added light server-side cleanup (strip a leading "here's/here is...:" line; unwrap a fully-matching pair of wrapping quotes) alongside the existing markdown-fence stripping.

**Known trade-off, not blocking:** the free-tier Workers AI model (small, weaker instruction-following) still sometimes drafts a few illustrative example questions of its own before the verbatim rules block, despite being told not to — cosmetically imperfect, but functionally harmless: the verbatim rules block is always present (verified via the header-string safety-net check) and unambiguously overrides anything before it once pasted into a genuinely capable downstream assistant (ChatGPT/Claude). Not worth further prompt-engineering effort against a small model's known instruction-following ceiling.

**Design notes:**
- Deliberately narrow scope for what's AI-generated: only the framing/analysis portion of the prompt, never the machine-readable output contract. This was a conscious reversal of the original Phase 3.5 decision to keep prompt-building "pure frontend, zero AI calls" — the user explicitly asked for AI-generated prompt content, and the risk (a broken CSV contract) is mitigated by the deterministic verbatim-reproduction instruction plus the server-side string-check-and-repair, rather than by avoiding AI involvement entirely.
- Reuses the exact same cap/BYOK plumbing as `handleSuggestTargetRole` right above it in `worker.js` — one more short-output AI call, no new accounting needed.

## Phase 4.3 — typed toasts (success / error / warning)

**Status: done, deployed.**

| Item | Status |
|---|---|
| `toast(msg, type)` now applies a `.toast-{type}` class (`success`/`error`/`warning`/`info`, default `info` unchanged from before) so the pill is colored — green/red/amber — instead of every message looking identical regardless of outcome | Done |
| New `toastSuccess()`/`toastError()`/`toastWarning()` convenience exports from `app.js`, matching the common `toast.success()`-style API of most toast libraries | Done |
| Swept every existing `toast(...)` call site across the app (home, review, test, stats, admin, settings — about.js has none) and classified each: server/network failures → error, completed actions (imported, uploaded, approved, exported, subscribed, copied…) → success, and soft/non-blocking nudges (missing input before a click, AI quota exhausted with a working fallback, clipboard access failing but text still selected) → warning | Done |
| Removed the now-unused plain `toast` import from every file where every call site got a specific type | Done |
| Local verification (Playwright): triggered one of each type (export progress → success, empty-resume click → warning, malformed CSV import → error, AI-fallback path → warning, manual set upload → success) and confirmed both the CSS class and message text on `#toast` each time; screenshotted the success (green) and warning (amber) pills to confirm the colors actually render correctly in both the base and dark-mode CSS paths | Done |
| Deploy | Done |

**Design notes:**
- The dark-mode/system-default override rule for `.toast` (`:root:not([data-theme="light"]) .toast { ... }`) isn't inside a `prefers-color-scheme` media query in this file — it's unconditional whenever `data-theme` isn't explicitly `"light"`, which was already true before this phase and not something this change altered. Because that rule's selector specificity (three combined selectors) is higher than a plain `.toast-success` class alone, the type-modifier rules had to be duplicated under that same `:root:not([data-theme="light"])` prefix to actually win the cascade in the default/dark state — a plain lower-specificity `.toast-success` rule placed after it in source order would have silently lost.
- "Rejected." (in the admin approve/reject flow) is styled as `toastSuccess`, not a negative color, since the color communicates "this action completed without error," not "this is good news for the submitter" — kept consistent with "Approved" using the same styling logic.
