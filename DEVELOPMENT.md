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

**Follow-up confirmation (2026-09-27):** re-confirmed this is still happening, and it's one step earlier than previously understood — `git fetch origin` showed the remote branch already had every local commit from this session's later phases (Phase 4.12/4.13), despite `git push` never being run manually. So something in this environment auto-pushes local commits to GitHub, and Cloudflare's git integration then auto-deploys on every push (`wrangler deployments list` shows a fresh deployment at each commit's timestamp, "Source: Unknown (deployment)"). Confirmed the live site at `https://interviewprep.xynora.workers.dev` directly, via `curl`, matches the latest local commit exactly. **Practical implication: the "commit only vs. deploy now" question asked after each phase has not been reflecting reality for a while — everything ends up live within roughly one deployment cycle regardless of the answer.** Going forward, prefer checking the actual live state directly (curl the production URL / grep its served JS) over trusting a "left undeployed" assumption.

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

**Status: implemented and locally verified; committed but deliberately left undeployed (user's choice) as of 2026-09-21.**

| Item | Status |
|---|---|
| `toast(msg, type)` now applies a `.toast-{type}` class (`success`/`error`/`warning`/`info`, default `info` unchanged from before) so the pill is colored — green/red/amber — instead of every message looking identical regardless of outcome | Done |
| New `toastSuccess()`/`toastError()`/`toastWarning()` convenience exports from `app.js`, matching the common `toast.success()`-style API of most toast libraries | Done |
| Swept every existing `toast(...)` call site across the app (home, review, test, stats, admin, settings — about.js has none) and classified each: server/network failures → error, completed actions (imported, uploaded, approved, exported, subscribed, copied…) → success, and soft/non-blocking nudges (missing input before a click, AI quota exhausted with a working fallback, clipboard access failing but text still selected) → warning | Done |
| Removed the now-unused plain `toast` import from every file where every call site got a specific type | Done |
| Local verification (Playwright): triggered one of each type (export progress → success, empty-resume click → warning, malformed CSV import → error, AI-fallback path → warning, manual set upload → success) and confirmed both the CSS class and message text on `#toast` each time; screenshotted the success (green) and warning (amber) pills to confirm the colors actually render correctly in both the base and dark-mode CSS paths | Done |
| Deploy | Not yet — pending |

**Design notes:**
- The dark-mode/system-default override rule for `.toast` (`:root:not([data-theme="light"]) .toast { ... }`) isn't inside a `prefers-color-scheme` media query in this file — it's unconditional whenever `data-theme` isn't explicitly `"light"`, which was already true before this phase and not something this change altered. Because that rule's selector specificity (three combined selectors) is higher than a plain `.toast-success` class alone, the type-modifier rules had to be duplicated under that same `:root:not([data-theme="light"])` prefix to actually win the cascade in the default/dark state — a plain lower-specificity `.toast-success` rule placed after it in source order would have silently lost.
- "Rejected." (in the admin approve/reject flow) is styled as `toastSuccess`, not a negative color, since the color communicates "this action completed without error," not "this is good news for the submitter" — kept consistent with "Approved" using the same styling logic.

## Phase 4.4 — explicit "Got it" / "Review again soon" on Today's queue, persisted "Completed today" section

**Status: implemented and locally verified; not yet deployed.**

| Item | Status |
|---|---|
| Revealing a question's model answer on the Today page no longer auto-marks it complete — it now shows two explicit actions: "Got it" (marks done) and "Review again soon" (keeps it active) | Done |
| "Review again soon" doesn't touch `status='done'`, the daily ledger, or the streak — the question stays in today's active list (and naturally carries over to tomorrow via the existing backlog-priority rule if still unresolved) rather than counting as finished | Done |
| New `POST /api/questions/flag-review` endpoint sets `status='shown'` and `last_result='again'` (the same signal the Daily Review page's own "Review again soon" already writes), logging a `review`/`again` activity row so it also feeds the existing weakest-topic/accuracy stats identically to a spaced-repetition miss | Done |
| A flagged question shows a small "Needs review" tag and, on a later page load, is already revealed (no need to re-click "Show model answer") — giving the previously-unused `'shown'` status column real meaning for the first time | Done |
| New persisted "Completed today" section: `GET /api/queue/today` now also returns `completedQuestions` (today's `status='done'` rows), rendered as a collapsible card below the active list — so completed questions don't just vanish from the page, they're still browsable (with their answer already shown) until midnight, surviving a reload | Done |
| A flagged-for-review question can still later be marked "Got it" — the two actions aren't mutually exclusive across time, they're just "what to do right now" | Done |
| Local verification (Playwright, both desktop and mobile viewports): revealed a question, flagged it for review, confirmed the tag and both buttons persist after reload with the answer already visible; revealed a second question, marked it complete, confirmed it moved into a "Completed today (1)" collapsible section that also survives reload; confirmed the completed item shows a green "Done" pill and its full answer, and that the active list's still-untouched questions are unaffected | Done |
| Deploy | Not yet — pending |

**Design notes:**
- Deliberately did *not* add a way to pull a question back out of "Completed today" into "needs review" — that would require decrementing `daily_quota_ledger.completed` and the user's streak bump to stay consistent, and re-reading the request, "so I can review them if required" reads more plausibly as "so I can browse back and re-check the answer" than "so I can un-complete it." The completed section is read-only by design; revisiting that trade-off is a reasonable follow-up if actually wanted.
- The Daily Review page's spaced-repetition pool only draws from `status='done'` rows, so a question flagged "Review again soon" on the Today page (which deliberately stays `status != 'done'`) won't show up there until it's eventually marked "Got it" — it's meant to resurface in *today's own list* first, exactly as asked, not skip straight into the separate spaced-repetition feature.
- Reused the exact same visual language (`btn-success`/`btn-warn`, "Got it"/"Review again soon") as the pre-existing Daily Review page instead of inventing new terminology, so the concept reads as one consistent mechanic across both places rather than two similar-but-differently-worded features.

## Phase 4.5 — "Need Review" on completed questions, plus Pending/Completed stat tiles

**Status: implemented and locally verified; not yet deployed.**

Follow-up to Phase 4.4: the "Completed today" section was deliberately read-only there. The user asked for exactly the reverse-flow trapdoor that design note flagged as a possible follow-up — a "Need Review" button per completed question that pulls it back out of "Completed today" and into today's active list — plus two new at-a-glance stat tiles up top.

| Item | Status |
|---|---|
| Each card in "Completed today" now has a "Need Review" button | Done |
| Clicking it moves the question back into "Today's questions" (already revealed, tagged "Needs review", both "Got it"/"Review again soon" actions available again) | Done |
| `POST /api/questions/flag-review` (already existing from Phase 4.4) now also handles being called on a `status='done'` row: it decrements `daily_quota_ledger.completed` by 1 (floored at 0, so a duplicate/retry call can't push it negative) so today's target/remaining stay arithmetically consistent with what's actually still sitting in the active list, then applies the same `status='shown'`/`last_result='again'` update as before. The streak is deliberately left untouched either way — un-completing a question isn't treated as "you didn't actually study today" | Done |
| Top stat row gains two tiles: "Pending today" (count of the active list) and "Completed today" (the ledger's completed count), alongside the existing streak/target/quota tiles | Done |
| Verified via direct API calls against the local D1-backed dev server (signup → complete a question → confirm `completed:1`, `completedQuestions` holds it → call `flag-review` on it → confirm `completed:0`, it's back in `questions` with `status:"shown"`/`last_result:"again"` and gone from `completedQuestions` → called `flag-review` again on the now-active question to confirm it does **not** double-decrement) | Done |
| Deploy | Not yet — pending |

**Design notes:**
- One endpoint (`flag-review`) now serves both "don't mark this done yet" (called from the active list) and "actually, un-complete this" (called from the Completed section) — the only difference the handler cares about is whether the row was already `status='done'` when the request came in, which is exactly the condition that decides whether the ledger needs adjusting.
- `.stat-grid` was already `grid-template-columns: repeat(auto-fit, minmax(130px, 1fr))`, so adding two more tiles needed no CSS changes — it wraps cleanly at any width, mobile included.

## Phase 4.6 — round-robin category mixing for the daily queue

**Status: implemented and locally verified; not yet deployed.**

**Bug:** `ensureTodayQueueFilled`'s fresh-question fill picked strictly `ORDER BY topic_order ASC, sort_order ASC LIMIT <fillCount>` — so a user only ever saw questions from the first category (by `topic_order`) until every question in it had been queued at least once, then moved to the second category, and so on. With ~15-20 questions per category and a daily quota well under that, this meant weeks of "Career Story & Self-Presentation" before any other category appeared.

**Fix:** fetch all not-yet-queued question ids (still ordered by `topic_order`/`sort_order`, bounded at 5000 as a safety cap), group them by `topic_order` in memory, then round-robin across the topic groups — one question from each category in turn, cycling back around — until `fillCount` is reached. Within each category, `sort_order` is still respected (round-robin only interleaves *across* categories, it doesn't shuffle within one).

| Item | Status |
|---|---|
| Fresh daily-queue fill now interleaves across every category with unqueued questions instead of draining one category first | Done |
| Verified locally: daily quota 15, 15 available categories → the resulting queue contained all 15 categories, one question each, in a single fetch | Done |
| Deploy | Not yet — pending |

**Design notes:**
- The backlog/"carry-over" half of the fill (`priorityIds`, for questions still unresolved from a prior day) is untouched — it already orders by `queued_for_date`, which is unrelated to this category-skew bug.
- Deliberately round-robin, not fully random (`ORDER BY RANDOM()`), so the mix is predictable and even — every category gets equal representation each pass, rather than random chance letting one category dominate a given day by luck.

## Phase 4.7 — personalized browser tab title

**Status: implemented and locally verified; not yet deployed.**

**Bug:** the `<title>` tag was a hardcoded `Interview Prep — Manoj` in `public/index.html` — every signed-in user, on every device, saw the same name in their browser tab regardless of who they actually were.

**Fix:** the static fallback now just reads `Interview Prep` (shown briefly before JS runs, and on the logged-out auth screen). Once a user is signed in, a new `updateDocumentTitle()` in `app.js` sets `document.title` to `Interview Prep — <first name>` (plus `— <track>` when the user has set what they're preparing for) — e.g. `Interview Prep — Priya — Data Science`. It's called from `renderShell()`, which already runs at boot and after any profile-affecting update, so the tab title stays in sync automatically; the one settings save that changes `track` without already calling `renderShell()` (the "Prep profile" save in `settings.js`) now calls it too.

| Item | Status |
|---|---|
| Static `<title>` no longer hardcodes a name | Done |
| Signed-in title personalized as `Interview Prep — <first name>[ — <track>]` | Done |
| Title refreshes live after changing name or track in Settings, no reload needed | Done |
| Verified via API: confirmed the static title, and confirmed the user payload's `track` is always a string (never `null`) so the trim/template logic can't throw | Done |
| Deploy | Not yet — pending |

## Phase 4.8 — "Read aloud" on Today's questions

**Status: implemented; not yet deployed.**

A "Read aloud" button on each revealed question in the "Today's questions" list (only — not the Completed section, not Daily Review, per explicit scope), using the browser's built-in Web Speech API (`SpeechSynthesisUtterance`) — no new dependency, no server involvement, no new endpoint.

| Item | Status |
|---|---|
| New shared helpers in `app.js`: `isSpeechSupported()`, `stopSpeaking()`, `toggleReadAloud(id, text, onChange)`, `renderReadAloudButton(id)` — `state.speakingId` tracks which question (if any) is currently being read, so the button's icon/label always reflects the right state | Done |
| Button added to each revealed card's action row in `home.js`'s active question list, alongside "Got it"/"Review again soon" | Done |
| Clicking toggles between reading and stopping; clicking a different question's button while one is already reading stops the first and starts the new one (only one utterance in flight at a time, app-wide) | Done |
| Navigating away from the page (via `dispatchRoute`) calls `stopSpeaking()`, so speech never keeps running in the background after leaving Today | Done |
| Button renders as `""` (nothing) on a browser with no `speechSynthesis` support, rather than a dead button | Done |
| Verified: confirmed the served `app.js`/`home.js` bundles parse cleanly and match the source, confirmed all new exports exist and are wired correctly, confirmed `/api/queue/today`'s question shape (`id`, `a`) matches what the click handler looks up. Actual audio playback wasn't verified in this environment (no browser/audio available here) — this is a standard, widely-supported browser API (Chrome/Edge/Safari/Firefox), so recommend a quick manual check in an actual browser before or shortly after deploying | Partially verified |
| Deploy | Not yet — pending |

**Design notes:**
- Deliberately scoped to just the active Today's-questions list per explicit instruction, not the Completed section or the separate Daily Review page — those can be extended the same way later if wanted, since `renderReadAloudButton`/`toggleReadAloud` are already generic (keyed by question id + text, not page-specific).
- The button's text isn't passed via an HTML data-attribute (which would need careful escaping for quotes/HTML entities in longer answers) — the click handler looks the answer text up from `state.todayQueue.questions` by id instead.

## Phase 4.9 — voice/speed/pitch controls for Read aloud

**Status: implemented; not yet deployed.**

Follow-up to Phase 4.8: a new "Read aloud" card in Settings (only rendered when `isSpeechSupported()`) lets the user pick which system voice reads answers aloud, plus speed and pitch, with a "Preview voice" button to hear the current settings without leaving the page.

| Item | Status |
|---|---|
| New `app.js` helpers: `getReadAloudPrefs()`/`setReadAloudPrefs()` (localStorage-backed, same pattern as the existing theme preference — per-browser, not account data) and `getVoiceOptions()` (wraps `speechSynthesis.getVoices()`) | Done |
| `toggleReadAloud` now applies the saved `rate`/`pitch`/`voiceURI` to every utterance it creates, instead of a hardcoded rate | Done |
| Settings → "Read aloud" card: a voice `<select>` (English voices sorted first, but every voice the device exposes is listed — some devices only have a handful), speed slider (0.5x–1.5x), pitch slider (0–2), and a "Preview voice" button that speaks a sample sentence using `toggleReadAloud` with a dedicated `"__preview__"` id | Done |
| Handles async voice loading: `getVoiceOptions()` often returns `[]` on the very first call (notably in Chrome) until the voice list loads — the card also listens for `speechSynthesis.onvoiceschanged` and repopulates the `<select>` when it fires, preserving whatever was already selected/saved | Done |
| Verified: confirmed served `app.js`/`settings.js` bundles parse and match source; confirmed all new imports/exports resolve. Actual voice/audio behavior not verifiable in this environment (no browser here) — recommend a quick manual check | Partially verified |
| Deploy | Not yet — pending |

**Design notes:**
- Voice/speed/pitch preferences live in `localStorage`, not the `users` table — this is a "how my own browser sounds" setting, not account data that should follow the user to another device, so no new migration or `/api/profile` field was added.
- The card only renders on Settings when the browser actually supports speech synthesis, rather than showing dead controls on one that doesn't.

## Phase 4.10 — icon+label styling for "Got it" / "Review again soon"

**Status: implemented; not yet deployed.**

Matches the "Got it" and "Review again soon" buttons to the icon+text look the "Read aloud" button introduced (Phase 4.8) — a checkmark and a repeat/again glyph respectively, using the same `.btn-icon-label` class for spacing/alignment.

| Item | Status |
|---|---|
| New shared icon constants in `app.js`: `CHECK_ICON`, `REPEAT_ICON` | Done |
| Applied to both places these buttons appear: the Today page's active question list (`home.js`) and the Daily Review page (`review.js`) | Done |
| Verified: confirmed served `app.js`/`home.js`/`review.js` bundles parse and match source, spot-checked the SVG markup is well-formed | Done |
| Deploy | Not yet — pending |

**Design note:** the "Need Review" button in the Completed-today section (Phase 4.5) wasn't touched — the user asked specifically about "Got it" and "Review again soon," and that button is a distinct action with different wording, so it was left as a plain text button rather than assumed into scope.

## Phase 4.11 — surface Indian English voices for Read aloud

**Status: implemented; not yet deployed.**

The user asked for an Indian accent option. There's no way for the app to add a new synthetic voice — `SpeechSynthesisUtterance` only ever plays whatever voices the browser/OS actually has installed — but the Settings → Read aloud voice picker (Phase 4.9) already lets you choose *any* installed voice, including an Indian English one if your device has one. This phase just makes that easier to find.

| Item | Status |
|---|---|
| Voice list sort now has three tiers: `en-IN` first, other English variants second, everything else last (previously it was just "English vs. not") | Done |
| An `en-IN` option's label gets a `— India` suffix appended so it's unambiguous in the dropdown | Done |
| Added a `<small>` hint under the Voice field pointing at how to install one on Windows (Settings → Time & Language → Speech → Add voices → English (India)) if none shows up | Done |
| Verified: served `settings.js` bundle parses and matches source | Done |
| Deploy | Not yet — pending |

## Phase 4.12 — dark-mode "Completed today" heading fix, mobile topbar overhaul, Read-aloud wake lock

**Status: implemented and verified with a real Playwright/Chromium browser (installed locally for this phase — see note below); not yet deployed.**

Three unrelated bug reports landed in the same working session, fixed together:

**1. "Completed today" heading unreadable in dark mode.** `.completed-toggle` is a `<button>` that never set its own `color`, so it fell back to the browser's UA-default button text color instead of inheriting the theme's `--text` token — every other clickable text element in the app (`.auth-tab`, `.profile-trigger`) already set `color` explicitly; this one was the one place that got missed. Fixed with `color: inherit`.

**2. Mobile topbar broken — brand alone on its own row, everything else in a horizontally-scrolling row underneath.** Root cause: a `max-width:640px` rule forced the nav onto a second row via a `.topbar-spacer { flex-basis: 100% }` trick, then crammed the nav + theme toggle + profile menu together on that second row with `overflow-x: auto` on just the nav — so the brand ended up alone on row one with nothing else visible, and the row below scrolled sideways. Fixed by converting the nav to icon-only at that breakpoint instead of forcing a row break: each nav button ("Today"/"Stats"/"Admin"/"About") now has an inline SVG icon (`.nav-link-icon`) alongside its existing text label (`.nav-link-label`); on desktop the icon stays hidden (no visual change) and only the label shows; at ≤640px the label hides and the icon shows instead. With icon-only nav, the whole topbar (brand + 4 nav icons + theme toggle + profile avatar) fits comfortably on one row even at a 390px viewport, so the forced-wrap hack and its `overflow-x: auto` were removed entirely — `.topbar`'s pre-existing `flex-wrap: wrap` is left to handle any exceptionally narrow device naturally instead of a manual `order` override.

**3. Read-aloud stops when the phone's screen turns off.** Mobile browsers commonly suspend page JS (and `speechSynthesis` with it) once the screen auto-locks from inactivity. First attempt: a Screen Wake Lock — but the user pushed back on that (correctly): a wake lock forces the screen to stay *on*, which isn't what was wanted; the goal was letting the screen actually turn off while playback keeps going, like a music/podcast app. Replaced with a background-audio keep-alive instead: browsers are far more lenient about suspending a page that's actively playing real `HTMLMediaElement` audio, so a silent, looping WAV (built at runtime as a `Blob`, not a hand-rolled base64 guess — 1 second of 8kHz 8-bit mono silence) plays for the duration of a read-aloud, alongside a Media Session registration (`navigator.mediaSession.metadata`/`playbackState`, plus `pause`/`stop` action handlers wired to `stopSpeaking`) so the OS treats the page as an active background-media session. In practice this keeps `speechSynthesis` alive too, without holding the screen on.

| Item | Status |
|---|---|
| `.completed-toggle` now readable in dark mode | Done |
| Mobile topbar: icon-only nav at ≤640px, forced-wrap/horizontal-scroll hack removed | Done |
| Background-audio keep-alive (silent looped WAV + Media Session) started while reading, stopped on stop/end/navigation — screen is free to turn off | Done |
| CSP updated: added `media-src 'self' blob:` (was missing entirely, so it fell back to `default-src 'self'`, which blocked the blob: audio outright — caught during verification, see below) | Done |
| Verified with a real headless-Chromium Playwright session at a 390×844 mobile viewport: confirmed zero horizontal overflow on the topbar (`scrollWidth === clientWidth`), confirmed nav labels hidden / icons shown, confirmed brand+nav+theme+profile all render on one row without overlapping, confirmed `speechSynthesis.speaking` becomes `true` and stays `true` while the keep-alive audio plays, confirmed `navigator.mediaSession.metadata`/`playbackState` are set correctly on start and reset on stop, and confirmed the blob audio actually loads (no CSP violation) after the `media-src` fix | Done |
| Deploy | Not yet — pending |

**Caveats:**
- This can't help against someone *deliberately* pressing the phone's power button to lock the screen — that's an OS-level suspend no web page can override. It targets the common case that was actually reported: reading stops on its own once the screen times out from inactivity.
- This is a best-effort browser behavior, not a guaranteed API — it leans on browsers generally being lenient about background-suspending an actively-playing media element, which is well-established on Android Chrome; iOS Safari is historically stricter about backgrounded tabs generally, so real-device behavior there is worth spot-checking after deploying.
- **Update after real-device testing: confirmed this does NOT survive an actual screen lock**, on top of the already-known power-button caveat above. The silent-audio + Media Session trick helps with some backgrounding scenarios, but a real OS-level screen lock is a stronger suspend — the browser can cut off the `speechSynthesis` engine's output independently of whether the page's JS/media-session state is still "alive," and there's no standard web-page-only API that reliably prevents that on both Android and iOS. This is a known, widely-hit limitation of the Web Speech API industry-wide, not something further client-side tricks are expected to fix. Decision (with the user): **accept the limitation as-is** — Read aloud works well with the screen on/unlocked; a full screen lock will still interrupt it. The only architecturally reliable fix would be generating real audio server-side via a TTS API and playing it through a genuine `<audio>` element (like a podcast app), which is a materially bigger feature (new backend cost/complexity, and likely loses the "pick any of your device's voices" flexibility from Phase 4.9/4.11 unless the TTS provider offers similar choices) — not pursued for now.
- **Second round of real-device testing (installed PWA, not just a browser tab): same result — reading stops immediately on screen lock either way.** Rules out "maybe an installed PWA gets more lenient background execution" as an easy out; the OS-level screen-lock suspend applies regardless of how the page was launched. Closes out this limitation as fully confirmed — no further client-side avenue left to try short of the server-side real-audio rearchitecture described above.
- **Environment note**: while chasing this down, a stale local `wrangler dev` process kept serving an old build after a source edit (a recurring flakiness in this session's Windows dev environment, previously seen with D1 migration-tracking desyncs and repeated `.wrangler/tmp` bundle-resolution errors) — the CSP fix initially appeared not to take effect until the process was fully killed and `.wrangler` cleared and restarted, which also wiped the local D1 database and required re-running `wrangler d1 migrations apply interview-prep-db --local` to restore it. Worth remembering for future local-only fixes: if a change doesn't seem to take effect, verify by curling the actual response header/body rather than trusting that dev server is watching correctly.
- Playwright + Chromium were installed locally for this phase's verification (`npm install --no-save playwright@1.48.0` plus `npx playwright install chromium`) — installed with `--no-save` so `package.json`/`package-lock.json` are untouched, and `node_modules/` is already gitignored, so nothing needed cleaning up in git. Future phases can reuse this same local install for real-browser checks instead of API-only verification.

## Phase 4.13 — optional PDF upload for the resume-prompt builder

**Status: implemented and verified with a real Playwright/Chromium browser; not yet deployed.**

The user asked whether resume text could be read directly from an uploaded PDF instead of always pasting it in — floating a hybrid (keep paste, add PDF browse) as a fallback if full replacement wasn't a good idea. Recommendation given before building: yes to the hybrid, but flagged clearly that this is **the app's first-ever third-party dependency** — everything until now has been zero-dependency by deliberate choice (an XLSX importer was declined earlier for exactly this reason, and "paste text, not upload" was the original locked-in call on this very feature). User confirmed: build the hybrid.

**What shipped:**
- Vendored a same-origin copy of Mozilla's `pdf.js` v4.0.379 (`public/vendor/pdfjs/pdf.min.mjs` + `pdf.worker.min.mjs`, ~1.3MB combined, plus its Apache-2.0 `LICENSE`) — no CDN, no build step, just static files served by the existing `[assets]` binding like any other file in `public/`.
- New `public/vendor/pdfjs/extract.js`: a small wrapper exporting `extractPdfText(arrayBuffer)`. Lazy-loaded via dynamic `import()` only when a user actually clicks "Browse for a PDF," so it never touches the app's normal page weight. Uses pdf.js's text-layer API only (`getTextContent()`, one page at a time) — no rendering, no glyph rasterization. Returns `""` (never throws) on anything it can't extract usable text from, so the caller always has a single, simple "did this work" check.
- Settings → "Generate questions from your resume": a "Browse for a PDF" button next to the existing paste textarea. On file select, the PDF is parsed **entirely in the browser** (never uploaded anywhere, never touches the Worker) and the extracted text fills the same textarea the paste flow already used — reviewable/editable before generating a prompt, exactly like pasted text. Empty extraction (common for scanned/image-only resumes) shows a warning toast steering the user back to pasting manually instead of failing silently.

| Item | Status |
|---|---|
| pdf.js vendored same-origin, uninstalled from npm afterward (only its built output is kept — `--no-save` avoided touching `package.json`) | Done |
| "Browse for a PDF" button + status line added to the resume-prompt card | Done |
| Extraction pre-fills the existing resume textarea rather than bypassing it — user still reviews/edits before anything is sent to the AI-suggest-role or generate-prompt endpoints | Done |
| Graceful failure: empty/unparseable PDF shows a warning toast with clear next-step guidance, not a silent no-op or a scary error | Done |
| Verified end-to-end with a real Playwright/Chromium session: generated an actual text-based PDF via `page.pdf()`, uploaded it through the real file input, confirmed the extracted text matches the source exactly (including a unique marker string), and confirmed **zero CSP violations** — pdf.js's text-extraction codepath needed no CSP changes at all (no `unsafe-eval`, no additional `script-src`/`worker-src` entries — the existing `script-src 'self' ...` already covers the same-origin worker module) | Done |
| Also verified the failure path: a non-PDF file produces the expected warning toast and leaves the textarea untouched | Done |
| Deploy | Not yet — pending |

**Design notes:**
- Chose pdf.js's `.mjs` (ES module) build specifically because this app already loads all its own code as native ES modules (`<script type="module">`, dynamic `import()` per route) — no bundler, no UMD global needed, it just plugs into the existing architecture.
- `GlobalWorkerOptions.workerSrc` is resolved via `new URL("./pdf.worker.min.mjs", import.meta.url).href` rather than a hardcoded path, so it keeps working regardless of the app's base path.
- Deliberately extraction-only, not rendering — this keeps the vendored footprint to exactly two files and sidesteps pdf.js's much larger and eval-heavier rendering/canvas pipeline entirely, which is also almost certainly why no CSP loosening was needed.
- One environment note from testing: Playwright's own `page.waitForFunction()` helper injects an `eval()`-based polling predicate into the page, which this app's CSP (correctly) blocks — that's a test-harness detail, not an app bug, and was worked around in the test script with manual polling via ordinary `evaluate()`/`$eval()` calls instead.

## Phase 4.14 — opt-in "Keep screen on while reading" toggle

**Status: implemented and verified with a real Playwright/Chromium browser; not yet deployed.**

Follow-up to the confirmed Phase 4.12 limitation (screen lock stops Read aloud, PWA or browser, no client-side avenue around it). Rather than force the screen to stay on for everyone (the original Wake Lock attempt, reverted after the user pushed back — see Phase 4.12), Wake Lock is back as an **explicit, off-by-default opt-in** in Settings, so anyone who'd rather trade battery for uninterrupted reading can turn it on themselves.

| Item | Status |
|---|---|
| New `keepScreenOn` field in the same `readAloudPrefs` localStorage bucket as voice/rate/pitch — defaults to `false` | Done |
| New `isWakeLockSupported()` export plus the wake-lock request/release machinery (re-added from Phase 4.12, since it was fully removed when replaced by the background-audio approach) | Done |
| `toggleReadAloud` now acquires the wake lock only when `keepScreenOn` is true (checked at the moment reading starts), and always releases it on stop/end — same lifecycle as the background-audio keep-alive, running alongside it rather than replacing it (the audio keep-alive still helps with plain tab-backgrounding; the wake lock is specifically for the screen-lock case it can't reach) | Done |
| Settings → "Read aloud" card: a "Keep screen on while reading" checkbox, disabled with an explanatory note on a browser without Wake Lock support, otherwise wired to persist immediately on change | Done |
| Re-acquire-on-visibility-regain logic (from Phase 4.12) restored, now also gated on the preference still being enabled | Done |
| Verified with a real Playwright/Chromium session (a `navigator.wakeLock.request` spy): confirmed **zero** wake-lock calls while the preference is off (today's default, unaffected), confirmed the checkbox persists across a full page reload, and confirmed enabling it makes `toggleReadAloud` call `wakeLock.request()` at exactly the right moment | Done |
| Deploy | Not yet — pending |

**Design notes:**
- Off by default: forcing a battery-draining behavior on every user as a side effect of clicking a "Read aloud" button felt wrong, especially having already walked that back once this session. Opt-in keeps the default experience unchanged and puts the trade-off in the hands of whoever actually wants it.
- The checkbox is `disabled` (not hidden) when Wake Lock isn't supported, with a note explaining why — same pattern already used for the "Voice" picker's degrade-gracefully approach, so an unsupported browser gets an honest explanation rather than a mysteriously inert control.

## Phase 4.15 — group Read-aloud voices by language

**Status: implemented and verified with a real Playwright/Chromium browser (mocked voice list); not yet deployed.**

The Voice picker (Phase 4.9) was a flat list sorted "English variants first." The user asked for real language grouping instead — `<optgroup>`s labeled by language (Hindi, English, etc.), with English and Hindi pinned above every other language.

| Item | Status |
|---|---|
| Voices grouped by BCP-47 primary language subtag (`en`, `hi`, `de`, ...) into `<optgroup>`s | Done |
| Group labels are real language names (`Intl.DisplayNames`, e.g. `"hi"` → "Hindi"), not raw codes — falls back to the raw code if `Intl.DisplayNames` throws | Done |
| English and Hindi groups pinned first (in that order), every other language group alphabetical by its display name after that | Done |
| Within the English group, an India-accent voice still leads (Phase 4.11's behavior, preserved) | Done |
| Each option's label gets a region suffix via `Intl.DisplayNames` region names (e.g. "(India)", "(United Kingdom)") instead of the raw lang code | Done |
| Verified with a real Playwright/Chromium session using a mocked 7-voice list spanning 6 languages: confirmed exact group order (English, Hindi, then German/Japanese/Spanish alphabetically), confirmed the India-accent voice leads within English, confirmed region names render correctly | Done |
| Deploy | Not yet — pending |

**Known cosmetic nit:** a voice whose own `name` already embeds its region (common — e.g. "Microsoft Heera - English (India)") ends up with that appended twice, e.g. "Microsoft Heera - English (India) (India)". Not fixed — reliably detecting "this name already contains a region descriptor" across arbitrary OS/browser voice-naming conventions would need fragile string-matching heuristics for a purely cosmetic gain; the option remains fully identifiable and correctly grouped/selectable either way.

## Phase 4.16 — code-review fixes for the voice-grouping code

**Status: implemented and verified with a real Playwright/Chromium browser; not yet deployed.**

Ran `/code-review` on the Phase 4.15 voice-grouping commit — 7 finder-angle agents in parallel (simplification, efficiency, altitude/generalization, correctness, reuse, and two independent "removed-behavior"/regression angles), then verified each candidate directly against the code. 6 findings survived verification and were fixed; 2 were deliberately excluded (see below).

| Finding | Fix |
|---|---|
| `regionDisplayName(v.lang)` called with unguarded `v.lang` — a voice with `lang === undefined`/`null` threw inside `.map()`, aborting `populateVoices()` before the dropdown ever updates, and since the same function is the `onvoiceschanged` handler it stayed permanently broken | Call site now passes `v.lang \|\| ""`, matching the guard already used one line above for grouping |
| Empty/missing `lang` produced a blank `<optgroup label="">` sorted confusingly close to the pinned groups | Voices with no usable language now go in an explicitly-labeled "Other" group, always placed last (filtered out of the alphabetical sort entirely and appended at the end, rather than relying on how an empty string happens to collate) |
| Region parsing assumed the 2nd subtag is always the region, breaking on script-tagged locales (`zh-Hans-CN` → tried to resolve "Hans" as a region, failed, showed the raw tag) | `regionDisplayName` now scans the subtags after the primary language for the first one that's actually region-shaped (2 letters, or a 3-digit UN M49 code), skipping script/variant subtags like "Hans" |
| The "India accent leads the English group" check used an exact match against `"en-in"`, silently stopping working for any tag with extra subtags appended | Changed to `startsWith("en-in")`, so extended tags still lead |
| Grouping used an exact primary-subtag match, narrower than the old flat-list version's permissive `startsWith("en")` — non-standard tags (a 3-letter `"eng-USA"`, an underscore-separated `"en_IN"`) that used to merge into "English" now got stranded in their own oddly-labeled group | Restored the old permissive behavior specifically for English (the one specially-treated, pinned language): if the raw lowercased tag starts with `"en"`, its group key is canonicalized to `"en"` regardless of exact subtag parsing |
| `Intl.DisplayNames` (language and region formatters) were reconstructed on every call — twice per group per render, once per voice per render, and again on every `onvoiceschanged` firing (which some browsers fire multiple times as voices load asynchronously) | Both formatters are now built once when `wireReadAloudCard` runs (per Settings page visit), not rebuilt inside `populateVoices()` or its helpers |

**Excluded from the fix list (reviewed and deliberately not applied):**
- One angle suggested deriving `PINNED_LANGUAGES` from `navigator.language` instead of hardcoding `["en", "hi"]`. Not applied — the user's explicit request was "Hindi and English will be on top" as a fixed requirement, not "pin whatever language my device happens to be set to." The hardcoding is intentional, not an oversight.
- A stale `speechSynthesis.onvoiceschanged` handler (never unregistered when navigating away from Settings) was flagged by one angle — explicitly noted by that same agent as pre-existing behavior from the prior version of this code, not introduced by the language-grouping diff, so left out of scope for this review's fix pass.

**Verification:** a single Playwright/Chromium test with a 9-voice mocked list deliberately covering every reviewed edge case at once — normal `en-US`/`hi-IN`, an exact `en-IN`, an extended `en-IN-u-va-posix`, an underscore `en_IN`, a 3-letter `eng-USA`, a script-tagged `zh-Hans-CN`, an `undefined` lang, and an empty-string lang — confirmed all six fixes simultaneously: zero crashes/console errors, both non-standard English tags merged correctly into the English group, the extended India tag still led that group, the script-tagged voice resolved to "(China)" instead of a raw tag, and both unknown-language voices landed together in a trailing "Other" group instead of a blank one.

## Phase 4.17 — mobile top nav: active item shows text, others icon-only

**Status: implemented and verified with a real Playwright/Chromium browser; not yet deployed.**

The icon-only mobile nav from Phase 4.12 made every item (Today/Stats/Admin/About) icon-only, all the time. The user wanted it closer to a common mobile pattern instead — shown via a reference screenshot (a rounded highlighted "pill" with icon+text for the current page, plain icons for the rest) — so only the active nav item keeps its label; everything else stays icon-only.

| Item | Status |
|---|---|
| `.nav-link.is-active .nav-link-label` now overrides the mobile breakpoint's `.nav-link-label { display: none; }`, so the active item alone keeps its text visible | Done |
| Active item gets slightly more horizontal padding (`8px 14px` vs `8px` for icon-only items) so the visible label has breathing room, forming the pill look from the reference image | Done |
| No changes needed to the pill's background/color styling — `.nav-link.is-active { background: var(--primary-soft); color: var(--primary); }` already existed from before and was already exactly the look wanted | Done |
| Verified with a real Playwright/Chromium session at 390×844: confirmed the active item's label is visible while all others are icon-only, confirmed this correctly follows navigation (Today → Stats), confirmed the topbar still has zero horizontal overflow, and visually compared screenshots against the reference image | Done |
| Deploy | Not yet — pending |

## Phase 4.18 — app-wide icon+text buttons, modernized Today/Stats dashboards

**Status: implemented and verified with a real Playwright/Chromium browser across every page; not yet deployed.**

The user shared a reference screenshot (a CRM-style UI: rounded dark pill buttons with icon+text, e.g. "⬆ Import" / "⬇ Export" / "+ Add company") and asked to (1) modernize the dashboard with graphs/images/icons and (2) restyle every button, app-wide, to match that icon+text pattern. Confirmed scope first via `AskUserQuestion` before starting, since the reference was clearly from an unrelated app (style reference only, not literal CRM features) and "every button, app-wide" is a large, precedent-setting change: user chose **both** Today and Stats pages for the dashboard pass, and **every button app-wide** for the icon restyle.

**Audit first:** delegated a read-only Explore agent to inventory every plain-text button across the whole app (`public/index.html` + every `public/pages/*.js`) before touching anything — it found 52 buttons needing icons, flagged several ambiguous cases (label-flipping buttons, tab controls, dropdown menu items, glyph-only "✕"/"+" buttons) for manual judgment calls, and confirmed `stats.js` and `test.js`'s MCQ-option buttons needed no icons (dynamic answer content, not fixed UI labels — correctly out of scope).

**Icon library:** ~20 new hand-written SVG icon constants added to `app.js` (`SIGNIN_ICON`, `SIGNUP_ICON`, `KEY_ICON`, `SEND_ICON`, `BACK_ICON`, `SETTINGS_ICON`, `LOGOUT_ICON`, `EYE_ICON`, `PLUS_ICON`, `SHUFFLE_ICON`, `SPARKLE_ICON`, `CLOSE_ICON`, `CAMERA_ICON`, `TRASH_ICON`, `SAVE_ICON`, `DOWNLOAD_ICON`, `UPLOAD_ICON`, `COPY_ICON`, `CHECKLIST_ICON`), plus `SPEAKER_ICON`/`STOP_ICON` (previously module-private, now exported for reuse in Settings). Kept deliberately simple/geometric (circles, straight strokes) rather than intricate glyphs, since these are hand-written paths with no design tool in the loop — verified by screenshot afterward rather than guessed blind.

**Where icons landed** (same semantic icon reused across matching actions for consistency):
- `index.html`: both auth tabs, all 4 auth-form submit buttons, "Forgot password?"/"Back to sign in", and both profile-dropdown items (Settings/Sign out).
- `home.js`: "Got it"/"Review again soon" (already had icons from an earlier phase), "Show model answer", "Request 5 more questions", "Need Review", "Generate today's review", "Start today's test" (sparkle — it's the AI-generated feature).
- `review.js`: "New batch" (shuffle), "Back to Today", "Show model answer".
- `test.js`: "Back to Today".
- `admin.js`: "Review questions"/"Hide questions" (label-flip, icon stays), "Approve", "Reject".
- `about.js`: "Back to sign in" (standalone pre-login view only).
- `settings.js` (27 buttons — the biggest file): Change/Remove picture, Save name/profile/AI provider, Update password, Sign out of all devices, Export progress, Preview/Stop voice (label-flip), Upload a question set/Import from CSV/Download template, Submit for review, the manual-upload form's Remove question/Remove section/Add question/Add section/Submit/Cancel (the old "✕"/"+" glyphs replaced with proper icons), CSV preview's Import/Cancel, Browse for a PDF, Suggest from resume/Generate prompt (label-flip, sparkle), Add category, Copy prompt, Subscribe.
- CSS: `.btn-icon-label` gained `justify-content: center` (needed for full-width `.btn-block` buttons); `.profile-dropdown-item` switched from `display:block` to `display:flex` so its icon+label lays out correctly without fighting `.btn-icon-label`'s own flex rules.

**Label-flipping buttons** (3 of them: admin's "Review questions"↔"Hide questions", Settings' "Preview voice"↔"Stop preview", "Suggest from resume"↔"Thinking…", "Generate prompt"↔"Generating…") previously did `btn.textContent = newLabel`, which would have silently deleted the icon the moment the label changed. Fixed by wrapping just the text in a `<span class="...-label">` and updating only that span's `textContent` (or, for the voice preview button which also swaps icon, replacing just the `<svg>`'s `outerHTML`) — the icon survives every state change now.

**Dashboard modernization:**
- **Today page**: a new radial "today's target" progress ring (pure circle-circumference/stroke-dasharray math, not an SVG chart library) sits next to the existing hero welcome text/linear bar. Each of the 5 stat tiles (Day streak, Longest streak, Pending today, Completed today, Today's target) gained a small icon above its value.
- **Stats page**: same stat-tile icon treatment (Current streak, Longest streak, Logged actions, Overall completion), plus a matching icon on every section header (Focus areas, Your coaching insight, Accuracy trend, Progress by topic, Weakest questions). No new chart type was added here — `stats.js` already had a bar chart (accuracy trend) and CSS-bar progress rows (progress by topic) from earlier phases, which already covered the "graphs" ask reasonably well; this pass focused on icons.

| Item | Status |
|---|---|
| Icon library (20 new + 2 newly-exported) added to `app.js` | Done |
| All 52 previously plain-text buttons across every page now have icon+text | Done |
| 3 label-flipping buttons fixed so their icon survives state changes | Done |
| Radial progress ring added to the Today page hero card | Done |
| Icons added to every stat tile (Today + Stats) and every Stats section header | Done |
| Verified with a real Playwright/Chromium session across every page (auth screen incl. forgot-password, Today revealed + profile dropdown, Stats, full-scroll Settings incl. the manual-upload form, Review, Test, About, and Admin incl. a live pending-set approve/reject/review-toggle check using a disposable test set) at both desktop (1280px) and mobile (390px) viewports — zero console/page errors beyond the expected harmless pre-login 401, zero horizontal overflow on mobile, and every icon rendered as intended (no malformed/invisible SVG paths) | Done |
| Deploy | Not yet — pending |

**Design notes:**
- Every icon reuses the same semantic icon across unrelated buttons that do conceptually the same thing (e.g. `TRASH_ICON` for every "remove/delete" action, `SAVE_ICON` for every "save this form" action) rather than inventing a new glyph per button — keeps the whole app's icon vocabulary small and learnable.
- Deliberately did *not* touch the MCQ answer-option buttons in `test.js` or add icons to `.auth-tab`'s underlying semantics beyond the icon pass already covers — their content is dynamic answer text, not a fixed action label, so an icon there wouldn't mean anything.
- The reference image's literal CRM buttons ("Add company", "Import", "Export" with specific up/down arrow conventions) were treated as a *style* reference only — confirmed with the user before starting — so e.g. "Import" actions here use an up-arrow and "Export"/"Download" actions use a down-arrow, matching the reference's exact (if slightly unconventional) arrow-direction choice, applied to this app's actual CSV/PDF/JSON import-export actions rather than anything CRM-specific.

## Phase 5.0 — v1.2.0 mobile-PWA shell: bottom tab bar, FAB, bottom sheets, swipe-to-grade

**Status: implemented and verified with a real Playwright/Chromium browser at both mobile (390px) and desktop (1280px) widths; not yet deployed.**

Branch: `feature/IntPreparation-v1.2.0-Mobile-PWA-Compatible-Development`, forked from the `v1.1.0` tag on `feature/job-referance-and-application-integration`. Before this phase, two planning artifacts were shared and approved: a four-phase written plan, then a fully interactive clickable prototype (phone-frame mockup with a working drag-to-swipe card, tab switching, and bottom sheets) that the user iterated on directly (adding the center "+" FAB after seeing a CRM reference image). This phase implements Phase 1 of that plan — the app shell/navigation — plus the swipe gesture and bottom-sheet pieces of Phase 3, wired to the real app's real data instead of mock content.

**The core guarantee, and how it's enforced:** every change is scoped to the app's existing `max-width: 640px` breakpoint (the same one already used for the icon-only top nav) or to code paths only a mobile-only element can trigger. Concretely:
- New CSS lives inside the existing `@media (max-width: 640px)` block in `styles.css`; a single new base rule (`.mobile-tab-bar, .sheet-backdrop, .app-sheet { display: none; }`, outside any media query) keeps the whole mobile shell invisible above that width with no gap at the boundary.
- New JS only runs when something only present in the mobile DOM is clicked (the bottom tab bar, the FAB, a sheet row) — `isMobileLayout()` additionally gates the one shared code path (`promptRejectReason`) that's called from both mobile and desktop, so desktop keeps calling the exact same `prompt()` it always did.
- Verified directly, not just assumed: a Playwright pass at 1280px confirmed `.mobile-tab-bar` computed `display: none`, `.topbar-nav`/`.profile-menu` still `flex`/`block` as before, the desktop profile dropdown still opens, and zero horizontal overflow — i.e. an actual before/after-equivalent check, not just "the CSS looks right."

**What shipped:**
- **Bottom tab bar + FAB** (`index.html`, mobile-only markup; wired in `app.js`'s new `wireMobileShell()`): Today / Stats / Admin (hidden for non-admins, same pattern as the existing desktop nav) / Profile, with a raised circular "+" FAB between Stats and Admin matching the reference image. Tapping a tab calls `.click()` on the *existing* corresponding desktop nav button rather than duplicating navigation logic — one source of truth for what each tab does.
- **Bottom sheets** (new exported `openMobileSheet()`/`closeMobileSheets()` in `app.js`, shared by all three):
  - **Profile sheet** (Profile tab) — avatar/name/email, Settings, About, a duplicated Theme toggle (the existing `initTheme()` already binds every `.theme-option` on the page by class, so this second instance needed no new JS — just markup — to stay in sync with the original), Sign out. Settings/About/Sign out rows call `.click()` on their existing desktop counterparts, same reuse pattern as the tabs.
  - **Quick-actions sheet** (FAB) — Upload a question set / Start daily review / Start daily test, each just `navigate()`-ing to the relevant page.
  - **Reject-reason sheet** (Admin → Reject, mobile only) — replaces the browser's plain `prompt()` with a real textarea in a sheet. `admin.js`'s `rejectSet()` now calls a new exported `promptRejectReason(onConfirm)` from `app.js`, which internally branches: desktop gets the identical `prompt()` call it always had, mobile gets the sheet. `admin.js` itself doesn't know or care which happened.
- **Swipe-to-grade on Today's question cards** (`home.js`, mobile only): dragging a revealed card reveals a "GOT IT"/"AGAIN" stamp and, past a 90px threshold, plays a fly-off animation and then calls the *exact same* `completeQuestion()`/`flagForReview()` the existing buttons call — not a reimplementation, just a faster path to the same two functions. A `.closest(".btn")` guard on the drag-start means tapping the existing buttons inside the card is unaffected.
- **Safe-area support**: `viewport-fit=cover` added to the viewport meta; the mobile topbar, tab bar, and sheets all pad for `env(safe-area-inset-top/bottom)` so the app draws correctly around a notch/home-indicator instead of leaving the browser to handle it by default.
- **Service worker cache bump** (`sw.js`: `interview-prep-shell-v1` → `v2`) since shipped shell assets changed.

| Item | Status |
|---|---|
| Bottom tab bar + FAB, wired to real navigation | Done |
| Profile / quick-actions / reject-reason bottom sheets, all wired to real app behavior (not mock content) | Done |
| Swipe-to-grade on Today's cards, calling the real completion/review functions | Done |
| Safe-area insets + `viewport-fit=cover` | Done |
| Service worker cache version bumped | Done |
| Verified at 1280px: `.mobile-tab-bar` hidden, top nav/profile dropdown behave exactly as before, zero horizontal overflow, zero console errors beyond the expected harmless pre-login 401 | Done |
| Verified at 390px: tab navigation, profile sheet (incl. the duplicated theme toggle actually changing the theme), FAB sheet + navigation, and a simulated pointer-drag swipe that was confirmed against real server data (`completed` went from 0 → 1 via `/api/queue/today` after the swipe, not just a visual check) | Done |
| Verified the mobile admin reject-sheet end-to-end with a disposable pending set: typed a real reason, confirmed, and read it back from `/api/admin/approval-history` | Done |
| Deploy | Not yet — pending |

**Deferred from the full 4-phase plan** (deliberately, to keep this phase reviewable — not forgotten): page transitions (View Transitions API), skeleton loading states, pull-to-refresh, and the install banner/iOS install tip are Phase 2 and the rest of Phase 4 from the written plan, not yet built. The shell and gesture work landing in this phase was the highest-impact, most structurally invasive piece and the one both planning artifacts were built around — the remaining phases are lower-risk, additive polish that can land independently whenever asked for next.

**Design notes:**
- The profile sheet's theme-toggle duplication works without any new theme-sync code because `initTheme()` already does `$all(".theme-option")` once at boot and binds every matching element by class — adding a second, always-present (not dynamically inserted) copy in the DOM was enough.
- `promptRejectReason()`'s branch lives entirely in `app.js`, not `admin.js` — `admin.js`'s only change was swapping one line (`prompt(...)`) for a function call that wraps the rest of the existing logic in a callback. This keeps the mobile/desktop branching in one place rather than scattered across every page that might ever need a reason prompt.

## Phase 5.1 — mobile topbar brand text, bigger inline stat-tile icons

**Status: implemented and verified with a real Playwright/Chromium browser at mobile, narrow-desktop, and full-desktop widths; not yet deployed.**

Two quick follow-ups from screenshots of the Phase 5.0 shell on an actual phone.

**1. Mobile topbar showed only the brand icon, no "Interview Prep" text.** Root cause: an existing rule (`.topbar-brand span { display: none; }`) hides the brand text below 860px — written back when the nav links, stat pills, theme toggle, and profile menu all still had to compete for space in that same bar at that width. None of that remains in the topbar once the mobile shell (≤640px) takes over, so there's room for the name again. Fixed with a single override inside the existing mobile-shell CSS block: `.topbar-brand span { display: inline; }`. Verified at three widths: 390px (now visible), 800px — between the two breakpoints, a *narrow desktop/tablet* window where the old nav still shows and still needs the space (stayed hidden, unchanged), and 1280px (unaffected, was always visible).

**2. Stat tiles' icons were too small and stacked above the number** — asked to be bigger and sit inline with the number, label kept on its own line below. Changed on mobile only: the icon and value are now wrapped together in a new `.stat-tile-top` element; the *base* rule keeps them stacked in a column (reproducing the exact previous desktop look, just via the new wrapper instead of a `.stat-tile > svg` direct-child selector), and a mobile-only override switches that wrapper to a row (icon beside the number) and enlarges the icon. First pass went to 22px; after a follow-up "still too small," landed on 30px — close to the height of the number text itself, clearly readable as a deliberate icon rather than a decorative accent. A further follow-up centered the icon+number group as a unit (`justify-content: center`) and center-aligned the label below it; one more follow-up asked for the icon back at the left edge specifically, so `.stat-tile-top` reverted to `justify-content: flex-start` — icon+number sit together on the left again, label stays centered below. Applied to both pages that have stat tiles — Today (`home.js`) and Stats (`stats.js`).

| Item | Status |
|---|---|
| Brand text restored on mobile, narrow-desktop behavior unchanged | Done |
| Stat-tile icons bigger + inline with the number on mobile; desktop verified pixel-equivalent (`.stat-tile-top` computed `flex-direction: column`, matching the old layout) | Done |
| Verified at 390px, 800px, and 1280px widths with a real Playwright/Chromium session | Done |
| Deploy | Not yet — pending |
