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

## Phase 5.2 — interactive "This week" chart on Stats

**Status: implemented and verified with a real Playwright/Chromium browser, real backdated activity data; not yet deployed.**

The Stats page's existing charts (accuracy trend, progress-by-topic bars) sit further down the page, past the Focus Areas/Insight cards — on a fresh or lightly-used account they're easy to miss without scrolling. Added a new "This week" card right after the stat tiles, prominent above the fold: a 7-bar chart of questions actually completed each day (not placeholder numbers — built from the same `events` activity-log data every other chart on this page already reads, filtered to `event_type === "reveal"`, the exact event `handleCompleteQuestion` logs once per "Got it").

Made genuinely interactive, not just decorative: tapping/clicking a bar (or focusing it and pressing Enter/Space — each bar is a keyboard-reachable `role="button"`) highlights that bar and swaps in an exact sentence below ("Thursday, Oct 1: 2 questions completed") — there's no hover-only affordance, since a touchscreen has no hover.

Not gated to mobile-only — a content addition like this (more visible real data) is a different kind of change than the app-shell/gesture work in Phase 5.0/5.1, and the Stats page's existing charts were never mobile-gated either, so gating just this one new card would have made the page inconsistent with itself. Verified it renders and reads cleanly at both 390px and 1280px.

| Item | Status |
|---|---|
| New "This week" card with a 7-day bar chart, inserted right after the stat tiles on Stats | Done |
| Real data (filtered `activity_log` reveal events), not sample/fake numbers | Done |
| Tap/click or keyboard (Enter/Space) selects a bar, highlights it, and shows an exact count + date sentence | Done |
| Verified with backdated activity rows inserted directly via D1 (2 days ago: 2, yesterday: 1, today: 2) — confirmed the chart's `data-count` attributes exactly matched, and confirmed tapping the bar with count "2" from two days ago produced the correct date + count sentence | Done |
| Verified rendering at both 390px and 1280px | Done |
| Deploy | Not yet — pending |

## Phase 5.3 — theme toggle visible in the mobile topbar again

**Status: implemented and verified with a real Playwright/Chromium browser; not yet deployed.**

Phase 5.0 hid the topbar's theme toggle on mobile, reasoning its duplicate inside the profile sheet was enough. Asked to bring it back to the top-right corner instead — quicker to reach than an extra tap into the sheet. Removed `.topbar .theme-toggle` from the mobile hide rule; it naturally lands top-right because the existing `.topbar-spacer` (`flex: 1`) has nothing else after it to share space with anymore. The sheet's copy stays too (no reason to remove it — it stays in sync automatically, same as before).

| Item | Status |
|---|---|
| Theme toggle visible again in the mobile topbar's top-right corner | Done |
| Verified it actually changes the theme when tapped, zero horizontal overflow, desktop topbar unaffected (`display: flex`, same as always) | Done |
| Deploy | Not yet — pending |

## Phase 5.4 — collapsible theme toggle in the mobile topbar

**Status: implemented and verified with a real Playwright/Chromium browser; not yet deployed.**

Showing all three theme options (System/Light/Dark) side by side in the topbar felt like more than that one corner needed. Changed to: collapsed to just the current choice (System by default) — tap it to reveal the other two, tap one of those to apply it and collapse back down. New `wireCompactThemeToggle()` in `app.js` adds the show/hide choreography; `initTheme()` (unchanged) still owns actually applying/syncing whichever option gets clicked.

Scoped to the topbar's instance only via its unique `#theme-toggle` id — the profile sheet's own copy (no id, just the shared `.theme-option`/`.theme-toggle` classes) always shows all three, since it has the room there and wasn't the thing asked about.

| Item | Status |
|---|---|
| Topbar theme toggle starts collapsed to just the active option | Done |
| Tapping it expands to show all three; tapping a different one applies it and collapses back to showing just that one | Done |
| Profile sheet's copy untouched — still always shows all three | Done |
| Desktop topbar unaffected — no `is-collapsible` class ever gets added there (`wireCompactThemeToggle()` is a no-op when `isMobileLayout()` is false) | Done |
| Verified the exact visible-option set at each step (collapsed → expanded → collapsed-on-a-different-theme) and confirmed the theme actually applied, plus confirmed desktop shows all three with no collapsible class | Done |
| Deploy | Not yet — pending |

## Phase 5.5 — adjustable answer text size

**Status: implemented and verified with a real Playwright/Chromium browser; not yet deployed.**

A new per-browser reading preference, asked for specifically for Today's questions but built the same way theme/read-aloud settings already are — a real feature (persisted, adjustable any time in Settings), not a one-off CSS bump. Four sizes — Small (14px, today's existing size — nobody's view changes unless they opt in), Medium (16px), Large (18px), Extra large (21px) — applied via a single CSS custom property (`--answer-font-size` on `:root`), so every `.q-answer` anywhere (Today, Daily Review, the admin question-review panel) picks it up for free from one shared rule instead of needing per-page wiring.

New Settings card ("Answer text size") with four buttons, each one rendered *in* its own size as a built-in preview (the "Extra large" button's own label is visibly bigger than "Small"'s) — clicking a button applies it immediately (no page reload needed, since the CSS variable updates live) and persists it to `localStorage`, same pattern as theme/read-aloud prefs. Applies everywhere (not mobile-gated) — a readability preference benefits every device equally, unlike the app-shell/gesture work in recent phases.

| Item | Status |
|---|---|
| New `getAnswerFontSize()`/`setAnswerFontSize()` in `app.js`, applied via a `--answer-font-size` CSS custom property that `.q-answer`'s existing `font-size` rule now reads | Done |
| New "Answer text size" card in Settings with four size options, each previewed at its own actual size | Done |
| Default (Small/14px) is pixel-identical to the answer text's size before this feature existed | Done |
| Verified: default confirmed 14px: selecting "Extra large" confirmed the active button updates, confirmed the *already-revealed* answer's computed font-size actually becomes 21px without a reload, and confirmed the choice survives a full page reload | Done |
| Deploy | Not yet — pending |

## Phase 5.6 — Self Test module with AI feedback and a token-metered quota

**Status: implemented and verified with curl + a real Playwright/Chromium browser; not yet deployed.**

New "Self Test" module: the app picks a random question from the user's own accessible sets, the user writes (or dictates, via Web Speech API) a free-text answer in their own words, and an "Analyze my answer" button sends it to the configured AI (BYOK or the free Workers AI tier, same `callConfiguredAi` helper every other AI feature already uses) for structured feedback — a 1-10 score, strengths, gaps, and a suggestion — after which the model's own saved answer is revealed for comparison. Entry points: a new card on the Today page (next to Daily Review/Daily Test) and a mobile FAB quick action.

The accompanying ask — "allocate some AI token quota to all users, visible in Settings, that can't be exceeded" — is a genuinely different unit from the existing `ai_usage`/`FREE_AI_DAILY_CAP = 20` cap (MCQ generation, Stats insight, resume-prompt generation), which counts *generations per day*, not *tokens*. Reusing it would have under- or over-charged users depending on answer length, so this feature gets its own table instead: `ai_token_usage(user_id, date, tokens_used)` (`migrations/0009_self_test_token_quota.sql`), a `SELF_TEST_TOKEN_DAILY_QUOTA = 6000`/day constant, reset at the user's own midnight via the existing `todayDateStr(user.timezone)` convention, and BYOK-exempt via the existing `usesByok(user)` check — all mirroring the existing cap's precedent exactly, just on a different unit and a separate table so the two caps can't interfere with each other.

Token counts are estimated (~4 characters/token, `estimateTokens()`) since no provider reliably surfaces an exact count through the shared `callConfiguredAi` return shape — surfaced everywhere in the UI as "approximate," never claimed as exact. Enforcement is a hard pre-flight check: estimated cost of the prompt plus a flat 350-token reply allowance is checked and rejected (429) *before* any AI call is made, so a user truly cannot exceed the quota even by one over-budget request; quota is only debited after a successful, parseable AI reply, so a failed/unreachable AI call never burns quota it didn't use.

Dictation (mic button, feature-detected via a new `getSpeechRecognitionCtor()` in `app.js`, hidden entirely where unsupported e.g. Firefox) only ever fills the textarea for the user to review — never auto-submits — matching the same "never send AI content the user hasn't reviewed" principle the PDF-resume-import feature established earlier.

| Item | Status |
|---|---|
| New `ai_token_usage` table + migration | Done |
| New Self Test page (`public/pages/selftest.js`): random question, free-text or dictated answer, Analyze button, AI feedback display, model-answer reveal, live quota line | Done |
| Entry points: Today-page card, mobile FAB quick action | Done |
| Settings page shows live tokens-used/remaining for the Self Test quota | Done |
| Hard quota enforcement verified: manually set usage to 5,900/6,000 via direct D1 write, confirmed a further analyze request is blocked with 429 *before* any AI call, both via curl and via the real browser UI | Done |
| Verified quota is never debited on a failed/unparseable AI response (confirmed via curl: stayed at 0 after a 502) | Done |
| Verified empty-answer validation, "New question" skip, and the Settings quota card all render and behave correctly end-to-end via Playwright | Done |
| AI feedback content itself not visually verified locally — local Workers AI has no inference simulator (same pre-existing limitation documented for MCQ generation); graceful 502 handling confirmed instead | Known limitation |
| Deploy | Not yet — pending |

## Phase 6.0 — warm visual rebrand (palette + pill buttons)

**Status: implemented and verified with a real Playwright/Chromium browser; not yet deployed.**

First of a planned enhancement batch (Phases 6.0–6.6), prompted by a deep review of the app's full feature set plus a look at a sibling app (MealSathi) for UI inspiration. Decision locked in directly with the user: a full rebrand, not an additive accent picker — the cool indigo default palette is replaced outright with a warm saffron/cream one, and buttons become fully pill-shaped everywhere.

Touched `public/styles.css` only — every color is already referenced through the existing CSS custom-property tokens (`--bg`, `--surface`, `--primary`, etc.), so this was a token-value swap in the `:root` block and both dark-mode override blocks (the `prefers-color-scheme` media query and the explicit `[data-theme="dark"]` override, kept identical to each other as before), not a markup or per-page change. A new `--radius-full: 999px` token was added and wired only into the base `.btn` rule's `border-radius` — deliberately a new token rather than repointing the existing `--radius-sm` (8px), since that token is shared with cards/inputs/tiles which must keep their current rectangular rounding, not become pills.

| Item | Status |
|---|---|
| Warm saffron/cream light palette + warm dark-brown dark palette, both token-only changes | Done |
| All buttons now fully pill-shaped (`--radius-full`), cards/inputs/tiles unaffected | Done |
| Confirmed no hardcoded hex colors exist outside the token blocks (grepped the whole file) | Done |
| Verified login screen, Today, and Settings pages in both light and dark via Playwright/Chromium — text legible, buttons pill-shaped, cards still rectangular | Done |
| Deploy | Not yet — pending |

## Phase 6.1 — Self Test score history + Stats trend chart

**Status: implemented and verified with curl + a real Playwright/Chromium browser; not yet deployed.**

Self Test (Phase 5.6) graded each attempt but never kept a record of past scores. New `self_test_results(user_id, question_id, date, score)` table (`migrations/0010_self_test_history.sql`) — a per-attempt score log, deliberately separate from `ai_token_usage` (which only tracks quota spend, not scores). `handleSelfTestAnalyze` now writes a row after every successfully-parsed analysis; a new `GET /api/self-test/history` returns a user's full history (bounded to the last 500 rows, same bounding convention as `/api/activity?limit=2000`).

Stats page adds a third parallel fetch alongside its existing two, buckets scores by day, averages same-day attempts, and shows the last 14 days with data — the exact bucketing pattern the existing "Accuracy trend" card already uses. Chart rendering reuses that card's hand-built inline-SVG bar chart approach via a small variant (`buildScoreTrendSvg`): bar height still scales 0-100 (score × 10) so it shares the accuracy chart's visual scale, but the printed label is the real 1-10 score, not a percentage.

| Item | Status |
|---|---|
| New `self_test_results` table + migration | Done |
| `handleSelfTestAnalyze` persists a history row per successful analysis | Done |
| New `GET /api/self-test/history` endpoint | Done |
| New "Self Test score trend" card on Stats, same bucketing/card pattern as Accuracy trend | Done |
| Verified end-to-end: seeded 5 days of synthetic scores (6/7/5/8/9) via direct D1, confirmed the history endpoint returns them, confirmed the Stats chart renders with matching bar heights and the correct score labels | Done |
| Deploy | Not yet — pending |

## Phase 6.2 — STAR-method coaching for HR & Behavioral questions

**Status: implemented and verified via curl + a unit check of the parser; not yet deployed.**

Self Test's AI feedback previously graded every question the same way regardless of category. For the whole "HR & Behavioral" set (`question_sets.track = 'hr'` — locked in directly with the user as the scope, rather than a narrower match on topic labels literally containing "Behavioral"), the analysis prompt now also asks the AI to grade STAR (Situation/Task/Action/Result) structure and return an extra `STAR:` line naming what's missing.

Both question-fetching queries (`handleGetSelfTestQuestion` and `handleSelfTestAnalyze`'s lookup) now join `question_sets` to read `track`; `buildSelfTestAnalysisPrompt` takes a new `isBehavioral` flag that appends the STAR instruction only when true; `parseSelfTestFeedback`'s label-lookahead regex was extended to include `STAR` so the new field doesn't get swallowed into `Suggestion`. The Self Test page renders a "STAR structure" line only when the field is present (i.e. only for HR questions) — Mock Interview (Phase 6.3) will get this for free since it reuses the same `handleSelfTestAnalyze` endpoint.

| Item | Status |
|---|---|
| `track` column surfaced through both self-test question queries | Done |
| `buildSelfTestAnalysisPrompt` conditionally appends the STAR instruction for `track === "hr"` | Done |
| `parseSelfTestFeedback` extended to parse an optional `STAR:` line | Done |
| Self Test page shows the STAR line only when present | Done |
| Verified via a temporary debug log (removed before commit): confirmed an `hr`-track question's prompt includes the STAR instruction and a `pm`-track question's does not | Done |
| Verified `parseSelfTestFeedback` against two hand-written synthetic replies (with and without a STAR line) via a disposable Node script — both parsed correctly | Done |
| Deploy | Not yet — pending |

## Phase 6.3 — Mock Interview mode

**Status: implemented and verified with a real Playwright/Chromium browser; not yet deployed.**

A new batch mode built entirely on top of Self Test's existing single-question endpoints (`GET /api/self-test/question`, `POST /api/self-test/analyze`) rather than a new batch-fetch endpoint — deliberately avoids the dedup complexity a true batch endpoint would need (`ORDER BY RANDOM() LIMIT 1` has no "exclude already served" concept today), and means Mock Interview draws from the same Self Test token quota and gets STAR coaching on HR questions for free (Phase 6.2's work applies automatically).

New page `public/pages/mockinterview.js`: the user picks a session length (3/5/8 questions, default 5) from new buttons on a new Today-page card, then answers one question at a time exactly like Self Test (typed or dictated), with each successful analysis pushed into an in-memory `results` array and auto-advancing to the next random question. After the last question, a **session summary** screen shows the average score and a per-question list with individual scores, plus "Start new mock interview" and "Back to Today" actions. Entry points added: a new Today-page card (next to Self Test) and a mobile FAB quick action, mirroring exactly how Self Test's own entry points were added in Phase 5.6. New `/mock-interview` route in `app.js`'s `PAGE_LOADERS`.

| Item | Status |
|---|---|
| New Mock Interview page: sequential questions, per-question analyze, session summary with average score | Done |
| Session-length picker (3/5/8, default 5) on the Today page card | Done |
| Entry points: Today-page card + mobile FAB quick action | Done |
| Verified end-to-end via Playwright: since local Workers AI has no inference simulator (same known limitation as Self Test/MCQ generation), the `/api/self-test/analyze` network call was intercepted and stubbed with synthetic scores (6, 8, 10) to exercise the actual page logic — confirmed all 3 questions were distinct, the session correctly advanced through "Question 1 of 3" → "2 of 3" → "3 of 3," and the summary screen showed the exact average (8.0/10) with 3 correctly-scored per-question rows | Done |
| Deploy | Not yet — pending |

## Phase 6.4 — Chat-bubble framing for Self Test + Mock Interview

**Status: implemented and verified with a real Playwright/Chromium browser; not yet deployed.**

Reframed both AI-conversation pages as an actual conversation rather than a form-plus-result-card: a left-aligned AI bubble for the question, a right-aligned user bubble showing the submitted answer once analyzed, and a left-aligned AI bubble for the feedback (score/strengths/gaps/suggestion/STAR). New shared `renderChatBubble(role, html)` helper in `app.js` and `.chat-bubble`/`.chat-bubble-ai`/`.chat-bubble-user` CSS classes (reusing existing design tokens — `--surface-2`/`--border` for AI, `--primary-soft`/`--primary` for the user side) used by both pages.

This surfaced a real gap in Mock Interview (Phase 6.3): it previously auto-advanced to the next question immediately after a successful analysis, so the per-question feedback was computed but never actually shown to the user. Fixed as part of this phase: analyzing a question now pauses on a "Next question" / "See session summary" button so the feedback bubble is genuinely read before moving on — `analyzeAndAdvance` was split into `analyzeAnswer` (shows feedback, stays put) and a new `advanceToNext` (clears state and loads the next question or finishes the session). The session summary's per-question list also now renders as compact AI/user bubble pairs (question, then score) instead of plain stat cards.

| Item | Status |
|---|---|
| Shared `renderChatBubble` helper + chat-bubble CSS classes | Done |
| Self Test: question/answer/feedback rendered as a 3-bubble conversation | Done |
| Mock Interview: same 3-bubble conversation per question, now with an explicit pause-to-read step before advancing (fixes a gap where feedback was computed but never shown) | Done |
| Mock Interview summary: per-question list as compact bubble pairs | Done |
| Verified via Playwright (network-stubbed analyze responses, same approach as Phase 6.3): Self Test shows exactly 3 bubbles in AI/user/AI order; Mock Interview correctly stays on "Question N of 3" after analyzing (does not auto-advance), updates the continue button's label on the final question ("See session summary"), and the summary renders 6 bubbles (3 question/score pairs) with the correct average | Done |
| Deploy | Not yet — pending |

## Phase 6.5 — question-count badge on "My question sets"

**Status: implemented and verified with curl + a real Playwright/Chromium browser; not yet deployed.**

"My question sets" already showed a color-coded visibility status pill (`renderSetStatusPill`); the only thing missing per the enhancement batch was a question-count chip. `handleListMySets` now returns a `question_count` per set via a correlated subquery against `questions`; the settings page renders it as a small neutral pill (reusing the existing `.pill-not_started` gray style, visually distinct from the colored status pill) right next to the status badge, with correct singular/plural ("1 question" vs "2 questions").

| Item | Status |
|---|---|
| `handleListMySets` returns `question_count` per set | Done |
| Question-count chip rendered next to the existing status pill, correct singular/plural | Done |
| Verified via direct D1 seeding of 4 sets (private/pending/shared/rejected, with 2/0/1/0 questions respectively) — confirmed the API returns the right counts and the Settings page renders all 4 badge combinations correctly | Done |
| Deploy | Not yet — pending |

## Phase 6.6 — Push notifications (daily streak reminder)

**Status: implemented and verified locally (crypto round-trip + a real Chromium browser subscribe/unsubscribe); the VAPID private key secret has NOT yet been registered against the live Cloudflare account — deploy blocked on that step.**

The last and largest item of the enhancement batch: a daily browser notification nudging a user who still has incomplete questions for the day. Built entirely with native WebCrypto — no npm dependency — matching this app's established dependency-light convention (CSV import, PDF text extraction, and the resume-prompt builder all made the same call rather than reaching for a library).

New `push_subscriptions(user_id, endpoint, p256dh, auth, last_push_sent_date)` table (`migrations/0011_push_subscriptions.sql`). New `src/webpush.js` implements RFC 8291 message encryption (ECDH + HKDF + AES-128-GCM) and RFC 8292 VAPID JWT signing (ES256), both via `crypto.subtle` directly. Three new endpoints: `GET /api/push/vapid-public-key`, `POST /api/push/subscribe`, `POST /api/push/unsubscribe`. A new `scheduled` export runs hourly (`wrangler.toml` `[triggers]`); for each subscription it computes the owner's current local hour from their saved timezone (same `Intl`-based approach as `todayDateStr`), and — once per local day, at 7pm local time, only if they still have incomplete questions queued for today — sends a reminder via `sendWebPush`, recording `last_push_sent_date` to prevent double-sends. A dead/expired subscription (404/410 response) is removed automatically. `public/sw.js` gained `push` and `notificationclick` listeners (cache version bumped to v3). Settings gained a "Notifications" card with an enable/disable toggle that requests permission, subscribes via `pushManager.subscribe`, and posts the subscription to the backend.

A VAPID ECDSA P-256 key pair was generated locally (disposable script, not committed). The public key is a plain `wrangler.toml` var (`VAPID_PUBLIC_KEY`, safe to expose); the private key was written directly to the gitignored `.dev.vars` as `VAPID_PRIVATE_KEY_JWK` for local testing — it was never printed to a terminal or committed anywhere.

| Item | Status |
|---|---|
| `push_subscriptions` table + migration | Done |
| `src/webpush.js`: VAPID JWT signing + RFC 8291 message encryption, both via native WebCrypto | Done |
| Subscribe/unsubscribe/vapid-public-key endpoints | Done |
| Hourly `scheduled` handler: per-user local-hour gating, once-per-local-day dedup, pending-question check, dead-subscription cleanup | Done |
| `sw.js` push + notificationclick listeners | Done |
| Settings "Notifications" card (enable/disable toggle) | Done |
| **Crypto correctness verified independently of any push service**: a disposable Node script generated a fake "browser" subscriber key pair, called the real `sendWebPush()` with a stubbed `fetch` to capture the encrypted wire body, then decrypted it back using the subscriber's private key exactly as a real browser would — confirmed the decrypted payload matched the original JSON byte-for-byte. The VAPID JWT's ES256 signature was separately verified against its own public key | Done |
| Verified the `scheduled` handler's gating logic locally via `wrangler dev --local` + `/cdn-cgi/local/scheduled` (local cron trigger) and the Workers Logs observability query API: confirmed local-hour computation, confirmed a real send attempt is made when a pending question exists (correctly failed against a fake unreachable endpoint, left for retry — not marked as sent), and confirmed the send is correctly skipped once all of a user's questions are marked done (all via a temporary debug log, removed before commit) | Done |
| Verified the full real-browser flow via Playwright/Chromium: enabling reminders actually created a working `PushSubscription` (a real `fcm.googleapis.com` endpoint) and saved it server-side; disabling removed it both client-side (`getSubscription()` returns null afterward) and the server-side D1 row | Done |
| **VAPID_PRIVATE_KEY_JWK has not been registered as a live Worker secret** — `wrangler secret put` against the real Cloudflare account is a deliberate pause point (writes to shared/production infrastructure), held for explicit confirmation before running | Blocked — pending confirmation |
| Deploy | Not yet — pending (and blocked on the secret above regardless) |

## Phase 6.7 — selectable accent colors

**Status: implemented and verified with a real Playwright/Chromium browser; not yet deployed.**

After the Phase 6.0 rebrand, asked for additional modern theme options on top of the new warm default rather than only the one fixed palette. New "Accent color" card in Settings with 6 swatches (Terracotta — the default, Ocean, Forest, Plum, Rose, Slate); picking one re-themes the app live by overriding only the brand/interactive tokens (`--primary`/`--primary-strong`/`--primary-soft`/`--on-primary`) via a `[data-accent="x"]` attribute on `<html>` — `--bg`/`--surface`/`--text`/`--accent` (the separate decorative streak-icon token)/`--warn`/`--danger` etc. all stay the warm neutral base regardless of accent choice, same as the base theme's own light/dark split.

Each non-default accent gets the same 3-block CSS pattern the base light/dark theme already uses (a light default, a `prefers-color-scheme: dark` block, and an explicit `data-theme="dark"` block) so every accent looks right in every theme combination, not just light mode. Persisted to `localStorage` (same pattern as theme/answer-font-size/read-aloud prefs) and replayed before first paint by the same inline `<head>` script that already prevents a theme flash — which meant recomputing that script's CSP hash (`script-src`), since its text changed; verified via Playwright that no CSP violation occurred after the change (confirmed only the expected pre-login 401 console entry, nothing else).

| Item | Status |
|---|---|
| 6 selectable accents, each with light + dark variants, scoped to only the brand/interactive tokens | Done |
| New Settings "Accent color" card, swatch buttons previewing each accent's actual color | Done |
| Inline flash-prevention `<head>` script extended to also replay the saved accent; CSP `script-src` hash recomputed to match | Done |
| Verified: default (Terracotta) matches the Phase 6.0 rebrand exactly; switching to another accent (Ocean) live-updates `--primary` and every element that reads it (brand wordmark, buttons, avatar, active nav) while leaving the base cream/brown surfaces untouched; confirmed via Chromium console that the recomputed CSP hash didn't break the inline script (no CSP-violation console errors, only the expected pre-login 401) | Done |
| Deploy | Not yet — pending |

## Phase 6.8 — collapsible, categorized Settings page

**Status: implemented and verified with a real Playwright/Chromium browser; not yet deployed.**

Settings had grown to ~16 cards in one long scroll (Account, Prep profile, AI provider, Accent color, Answer text size, Self Test usage, Read aloud, Notifications, Change password, Sessions, My question sets, Generate from resume, Suggested sets, Export data). Grouped into 7 categories — Account, Prep profile, Appearance & Accessibility, AI & Usage, Notifications, Question Sets, Data — each a native `<details>`/`<summary>` element rather than a hand-rolled accordion, which gives keyboard/accessibility support for free and makes "expand all / collapse all" trivial (just setting `.open` on every `<details>`). All categories default to expanded, so nothing that was visible before is hidden unless the user chooses to collapse it.

Existing card-building functions (`buildAiProviderCard()`, `buildQuestionSetsCard()`, etc.) were untouched — `render()` now just collects each category's card elements into an array and wraps them with a new `buildSettingsCategory(title, cards)` helper instead of appending them directly to the page. No per-field event wiring changed, since `$(id, view)` already searches the whole subtree regardless of nesting depth.

| Item | Status |
|---|---|
| 7 categories, each a native `<details>`, defaulting to open | Done |
| "Expand all" / "Collapse all" toolbar buttons | Done |
| Individual category toggling independent of the others | Done |
| Verified via Playwright: all 7 category titles present and open on load; Collapse all closes every one; Expand all reopens every one; clicking a single category's summary toggles only that one while the rest stay open | Done |
| Deploy | Not yet — pending |

## Phase 6.9 — pull-to-refresh on mobile

**Status: implemented and verified with a real Playwright/Chromium browser (synthetic touch events); not yet deployed.**

Reported as "fluctuating" — the browser's own rubber-band bounce at the top of `#main` (the actual scroll container, `overflow-y:auto`, not `body`) had no purpose since nothing used it, just visual jank. Replaced with a real pull-to-refresh gesture, mobile-only (same `isMobileLayout()` convention as the rest of the mobile shell): `overscroll-behavior-y: contain` on `.main` stops the native bounce so it can't fight the custom gesture, and a new `wirePullToRefresh()` (wired once at boot, alongside `wireMobileShell()`) tracks touch drags on `#main`.

A pull only engages when the drag starts at `scrollTop === 0` and is clearly vertical (`|deltaY| > |deltaX|`) — guards against hijacking a horizontal swipe-to-grade gesture on a question card, and against doing anything once the page has scrolled at all. A damped pull (0.5×) drives a small floating indicator (reusing `--surface`/`--border`/`--primary` tokens) that fades in, flips its arrow 180° once past a 70px threshold to signal "release to refresh," and spins on release. The refresh itself is a real `location.reload()` rather than a soft per-page re-render — deliberately, so it behaves identically regardless of what's on screen, including mid-session pages like Mock Interview, instead of needing special-cased "safe to soft-refresh" logic per page. Service worker cache bumped to v4 (shell assets changed).

| Item | Status |
|---|---|
| `overscroll-behavior-y: contain` on `.main` (mobile only) replaces the native bounce | Done |
| New floating pull indicator, hidden by default outside the mobile breakpoint (fixed a real bug caught during testing: without an explicit desktop `display:none`, it rendered as a stray unstyled icon above `<main>` on desktop) | Done |
| `wirePullToRefresh()`: starts only at `scrollTop === 0`, dominant-direction guard against horizontal swipes, damped drag, threshold-based "ready" state | Done |
| Verified via synthetic `TouchEvent`s in a real Chromium browser (mobile viewport): a vertical drag past the 70px damped threshold correctly reaches the "ready" state (arrow flips); a mostly-horizontal drag correctly does **not** engage the gesture; confirmed the indicator is fully hidden (`display: none`) on a desktop-width viewport and `flex` on mobile | Done |
| Deploy | Not yet — pending |

### Phase 6.9 fix — soft refresh instead of a hard reload

The initial version triggered `location.reload()` on release, which — correctly reported back — still "fluctuated," now showing a flash of the (hidden) auth screen before the current screen reappeared. Root cause: a hard reload re-runs the entire boot sequence (`checkSession()` → auth screen shown until `/api/me` resolves → app shell shown), which is visible even when the session is perfectly valid the whole time, since nothing about it was actually broken — the user was simply never logged out.

Replaced with a genuine soft refresh, `refreshCurrentScreen()`: re-checks the session in place (`checkSession()`, updates `state.currentUser`, re-renders the shell's stat pills via the already-exported `renderShell()`) and re-renders the current route (`dispatchRoute(location.pathname)`, same function used for back/forward navigation), plus a `refreshBankStats()` call for the header's bank-count pill. No navigation ever occurs, so the app shell, topbar, and bottom nav never unmount, and the auth screen is never shown. Also added a smooth CSS transition for the indicator's return-to-hidden animation (previously an instant snap outside the active drag).

| Item | Status |
|---|---|
| Replaced `location.reload()` with `refreshCurrentScreen()`: re-check session, refresh shell stat pills, re-render current route in place | Done |
| Smooth transition added for the indicator's return/hide animation (was an instant snap) | Done |
| Verified via Playwright: zero `framenavigated` events during a full pull-release cycle; the auth screen's `hidden` state polled continuously through the refresh window and never flipped to visible; confirmed the expected API calls (`/api/me`, `/api/questions/bank-count`, and the current page's own data endpoint) actually fire, proving this is a genuine data refresh and not a no-op | Done |
| Deploy | Not yet — pending |

### Phase 6.9 fix #2 — disabled the browser's own native pull-to-refresh

Reported again after fix #1 shipped: still reloading. Root cause this time was different from the first fix — a second, independent source of the same symptom. `overscroll-behavior-y: contain` had only been applied to `.main`, the inner div that actually scrolls (`overflow-y: auto`). But `html`/`body` themselves never scroll at all (since `#main` does all the scrolling internally), so from the *browser's* point of view the document is permanently "at the top" — which is exactly the condition Chrome's own native pull-to-refresh (a separate feature from this app's custom gesture, triggering an actual full navigation reload) watches for, regardless of any JS running on `#main`. `.main`'s own `overscroll-behavior` has no effect on that, because it only governs whether *its own* overscroll chains up to its parent — it says nothing about the document root's behavior.

Fix: added `overscroll-behavior-y: contain` on `html` itself, applied unconditionally (not mobile-gated like the rest of the pull-to-refresh work, since it's a one-line, harmless, universally-correct setting) — this is the standard, documented way to disable a browser's native pull-to-refresh.

| Item | Status |
|---|---|
| `overscroll-behavior-y: contain` added to `html` (document root), on top of the existing `.main` rule | Done |
| Verified computed style: `html` now reports `overscroll-behavior-y: contain` at both desktop and mobile widths; `.main` continues to report `contain` only at the mobile breakpoint, as before | Done |
| Re-verified the full custom gesture still works identically after this change (zero navigations, genuine `/api/me` + bank-count + current-page data refresh) | Done |
| **Known test-environment limit**: Chrome's native pull-to-refresh is part of the browser's own UI chrome, not the page's rendered DOM — it cannot be triggered or observed through a headless/automated browser the way the custom in-page gesture can. The CSS property is the correct, documented fix either way, but final confirmation that the native browser gesture itself no longer appears can only come from testing on a real phone after deploy | Noted |
| Deploy | Not yet — pending |

## Phase 6.10 — offline awareness (connectivity banner + pull-to-refresh gating)

**Status: implemented and verified with a real Playwright/Chromium browser; not yet deployed.**

Asked to study how a sibling app (MealSathi) handles pull-to-refresh and offline support, and bring the same behavior here. MealSathi's offline story turns out to be two separate things: (1) a persistent "You're offline" status bar driven by `navigator.onLine` + online/offline events, shown on every screen, and (2) every pull-to-refresh instance passes `disabled={!online}` so the gesture simply never arms while offline — no failed network attempt, no dead spinner. Their deeper offline data layer (IndexedDB personal-data cache + Workbox-cached published-content routes) is built on React Query/Vite-PWA tooling this app doesn't have and would be a substantial new subsystem on its own, not a drop-in port — flagged back to the user as a separate, bigger decision rather than silently attempting a mismatched reimplementation.

Ported the two directly-applicable pieces: a new `#offline-banner` (shown on auth/about/app screens alike, not gated by login, since connectivity is ongoing state independent of whether you're signed in yet) wired by a new `wireConnectionStatus()` called unconditionally at script load; and a new exported `isOnline()` helper added to `wirePullToRefresh()`'s existing guard conditions (alongside the mobile-only and scrollTop-zero checks), so the gesture never arms offline, same as MealSathi.

| Item | Status |
|---|---|
| Persistent "You're offline" banner, shown on every screen regardless of auth state | Done |
| Pull-to-refresh gated on `isOnline()` — never arms while offline | Done |
| Verified via Playwright (`page.context().setOffline()`): banner correctly shows/hides across the online→offline→online transitions, visible on the pre-login auth screen too; confirmed a full touch drag sequence while offline does not add the `is-dragging` class (gesture never armed) | Done |
| Deploy | Not yet — pending |

## Phase 7.0 — multi-category platform: schema foundation

**Status: implemented and verified against local D1; not yet deployed. First phase of a planned 7.0–7.6 batch (see the approved plan for the full design) to let one account prepare for multiple distinct purposes — today's Interview Prep content, plus future categories like Railway Exam / Police Exam / other govt exams — each with its own daily quota and streak, with specific content shareable across categories (e.g. a "General Knowledge" set serving both Railway and Police).**

Today every user got the exact same combined pool of 5 official sets, auto-subscribed at signup with no choice — `question_sets.track`/`users.track` are both free text with almost no functional effect (confirmed: `track` only nudges suggestion sort order, gates nothing). This phase introduces `categories` as a first-class concept without touching any existing behavior: new `categories`, `question_set_categories` (many-to-many — a set can serve 2+ categories), and `user_categories` (per-user-per-category enrollment + quota/streak) tables, plus `users.active_category_id`. Migration backfills exactly one category (`interview-prep`), tags all 5 existing official sets into it, and copies every existing user's current `daily_quota`/`streak_count`/`streak_longest`/`streak_last_active` into a `user_categories` row for it, setting it active.

Key design decisions locked in with the user before this was built: progress on a shared question is **global, not per-category** (completing a shared question marks it done everywhere it's shared — this is also why `user_question_progress` needed zero changes); a user can be enrolled in **multiple categories at once with a switcher** (not one category per account); streak/quota become **per-category** (consistent practice in Railway vs. Interview Prep are distinct accomplishments) while the existing AI quotas (`ai_usage`, `ai_token_usage`) **stay global per user** (cost-control — making them per-category would let one account multiply its free AI budget by enrolling in more categories). "Active category" is stored server-side (`users.active_category_id`, same pattern as the existing `users.timezone`) rather than threaded as a parameter through every request — this is what keeps the remaining phases from needing to touch ~40 existing endpoint signatures.

| Item | Status |
|---|---|
| `categories`, `question_set_categories`, `user_categories` tables + `users.active_category_id` | Done |
| Backfill: one `interview-prep` category, all 5 official sets tagged into it, every existing user enrolled with current quota/streak copied across, set active | Done |
| Verified zero behavior change: compared `users` vs. the new `user_categories` row for several existing accounts — `daily_quota`/`streak_count`/`streak_longest`/`streak_last_active` match exactly, `active_category_id` correctly set to `interview-prep` | Done |
| Deploy | Not yet — pending |

## Phase 7.1 — category-aware queue, quota, streak, and category endpoints

**Status: implemented and verified end-to-end via curl against local D1; not yet deployed.**

Makes the daily queue, quota ledger, and streak actually scope to a user's active category, on top of Phase 7.0's schema foundation. `daily_quota_ledger`'s primary key had to be rebuilt from `(user_id, date)` to `(user_id, category_id, date)` (migration `0013_category_scoped_ledger.sql`) — SQLite can't alter a primary key in place, and the old PK would otherwise reject a second category's ledger row for the same calendar day. Existing rows backfilled to `interview-prep`, same as Phase 7.0.

Every query that decides "what's in today's queue for this category" now joins through the new `question_set_categories` table, filtered to `user.activeCategoryId` — `ensureTodayQueueFilled`'s fresh-candidate query, its backlog-carryover priority query, the already-queued count, `getTodayQueueQuestions`, and `getTodayCompletedQuestions`. Crucially, `user_question_progress` itself needed **zero** schema change: a shared question's set is simply tagged into 2+ categories, so the existing `WHERE p.question_id IS NULL` exclusion (globally keyed) is what makes "progress shared globally" fall out for free — once a shared question is done via one category, it's automatically excluded from every other category's queue too, with no extra code.

Streak and quota moved off `users` onto `user_categories`, read via a `LEFT JOIN user_categories uc ON uc.user_id = u.id AND uc.category_id = u.active_category_id` added to `getUserFromRequest` and `handleLogin`'s queries (with `COALESCE(uc.*, u.*)` as a defensive fallback) — this is the key simplification from the plan: every other handler that reads `user.dailyQuota`/`user.streakCount`/etc. needed **zero changes**, since they just keep reading the same in-memory `user` object, which now transparently reflects the active category.

New endpoints: `GET /api/categories` (list + enrollment status), `POST /api/categories/enroll`, `POST /api/categories/switch` (validates the user is actually enrolled first). `GET /api/me` now returns `activeCategoryId` and `enrolledCategories`.

| Item | Status |
|---|---|
| `daily_quota_ledger` rebuilt with `category_id` in its primary key | Done |
| Queue-fill, carryover, and completed/active question queries all scoped via `question_set_categories` | Done |
| Streak/quota read from `user_categories` (active category), with every existing handler reading `user.dailyQuota`/`streakCount` unchanged | Done |
| `handleCompleteQuestion`/`handleFlagQuestionForReview`/`handleRequestMore`/`handleUpdateProfile` updated to write to the active category's ledger/enrollment row instead of `users` | Done |
| New `GET /api/categories`, `POST /api/categories/enroll`, `POST /api/categories/switch`; `GET /api/me` gains `activeCategoryId` + `enrolledCategories` | Done |
| **Verified end-to-end against local D1**: seeded a second category ("Railway Exam") with a Railway-only question set and a question set shared between Railway and Interview Prep (simulating "GK shared with Police/Railway"). Confirmed: (1) switching active category to Railway shows *only* Railway + shared-GK questions — zero leakage of Interview Prep's hr/pm/em/tech/ai content; (2) completing the shared GK question under Railway bumps Railway's completed count; (3) switching back to Interview Prep shows its streak/quota completely untouched (still 0/0, independent of Railway's activity); (4) the shared GK question does not reappear in Interview Prep's *active* queue (globally done) but correctly still shows in Interview Prep's "completed today" list too, since it really was completed today regardless of which category surfaced it | Done |
| Deploy | Not yet — pending |

## Phase 7.2 — category-aware Self Test, Mock Interview, and Daily Test

**Status: implemented and verified end-to-end via curl against local D1; not yet deployed.**

Extends category-scoping to the remaining practice surfaces. `daily_test_results`' `UNIQUE(user_id, date, question_id)` had to be rebuilt into `UNIQUE(user_id, category_id, date, question_id)` (migration `0014_test_history_categories.sql`, same table-rebuild requirement as Phase 7.1's ledger — SQLite can't alter a UNIQUE constraint in place) so each category gets its own daily MCQ test. `self_test_results` got a plain additive `category_id` column.

`handleGetSelfTestQuestion` and `handleSelfTestAnalyze`'s question lookup both gained the same `question_set_categories` join used in Phase 7.1's queue, scoped to `user.activeCategoryId`. `handleGetSelfTestHistory` now filters by `category_id` too, so the Stats "Self Test score trend" chart (Phase 6.1) only ever shows the active category's scores. `handleGetTodayTest`'s MCQ pool-building query (drawn from `status='done'` questions) gained the same category join, and `handleAnswerTest`/the pool-insert both key on `(user_id, category_id, date, question_id)`. Mock Interview needed **zero changes** — it already reuses `handleSelfTestAnalyze`/`handleGetSelfTestQuestion` as-is (by design, from Phase 6.3), so it inherits category-scoping for free.

| Item | Status |
|---|---|
| `daily_test_results` rebuilt with `category_id` in its unique key | Done |
| `self_test_results` gains an additive `category_id` column | Done |
| Self Test question selection + analyze-question-lookup scoped to the active category | Done |
| Self Test history (`/api/self-test/history`) filtered by active category | Done |
| Daily Test's MCQ pool-building and answer-persistence scoped to the active category | Done |
| Mock Interview inherits category-scoping automatically (reuses Self Test's endpoints, no changes needed) | Done |
| **Verified end-to-end against local D1**: seeded a Railway-only question; confirmed Self Test under Railway returns *only* that question (not Interview Prep's); completed it, confirmed Railway's Daily Test pool contains exactly that one question while Interview Prep's Daily Test stays empty (zero leakage); inserted category-tagged `self_test_results` rows and confirmed `/api/self-test/history` returns only the active category's scores when switching between categories | Done |
| Deploy | Not yet — pending |

## Phase 7.3 — category-aware Stats and Daily Review

**Status: implemented and verified end-to-end via curl against local D1; not yet deployed.**

Finishes category-scoping the remaining read surfaces. `activity_log` gained a plain additive `category_id` column (not part of any key — every row's `id INTEGER PRIMARY KEY AUTOINCREMENT` was never involved in a uniqueness constraint tying category in, so no table rebuild needed here, unlike the ledger/test-results tables in Phases 7.1/7.2). `ai_stats_insights`' `PRIMARY KEY (user_id, date)` did need the same rebuild treatment as before, becoming `(user_id, category_id, date)` — one cached AI coaching insight per category per day, not one blended insight across everything (migration `0015_stats_categories.sql`).

`handleGetStatsProgress`'s topic-totals query gained the `question_set_categories` join, and its accuracy query now filters `activity_log` by `category_id` too — this specifically matters because two categories could reuse the same `topic_label` string (e.g. both have a "Behavioral" topic) and would otherwise blend their progress/accuracy into one row. All four of the live `activity_log` insert sites (`handleCompleteQuestion`, `handleFlagQuestionForReview`, `handleReviewResult`, `handleAnswerTest`) now carry `category_id = user.activeCategoryId`; the legacy, unused `PUT /api/state` insert path is deliberately left without one (dead code, not worth entangling). `handleGetActivity` (`/api/activity`, which feeds Stats' "This week" and "Accuracy trend" charts) and `handleGetStatsInsight`'s cache read/write both filter by active category too.

Also brought **Daily Review** (`handleGetReview`) into the category-scoping pattern — it wasn't explicitly called out in the plan's Phase 7.2 list, but the same `question_set_categories` join was clearly needed for consistency: without it, switching to Railway and opening Daily Review would have pulled from the user's entire completed-question history across every category, not just Railway's.

| Item | Status |
|---|---|
| `activity_log` gains a plain additive `category_id` column | Done |
| `ai_stats_insights` rebuilt with `category_id` in its primary key | Done |
| `handleGetStatsProgress`'s topic totals + accuracy both scoped to the active category | Done |
| All 4 live `activity_log` insert sites now carry the active category | Done |
| `handleGetActivity` (Stats' chart data feed) and `handleGetStatsInsight`'s cache both filtered by active category | Done |
| Daily Review (`handleGetReview`) brought into the same category-scoping pattern, for consistency with Self Test/Daily Test | Done |
| **Verified end-to-end against local D1**: completing a Railway-only question shows it (and only it) in Stats' topic breakdown, the raw activity feed, and Daily Review's pool while active=Railway; switching back to Interview Prep shows all three as completely empty for that same activity — zero cross-category leakage anywhere in Stats | Done |
| Deploy | Not yet — pending |

## Phase 7.4 — category switcher (profile dropdown + mobile sheet)

**Status: implemented and verified with a real Playwright/Chromium browser; not yet deployed.**

The frontend piece that makes Phases 7.0–7.3's backend work actually usable: a category switcher in the desktop profile dropdown and the mobile profile sheet (the two places identity-scoped chrome already lives — both already fully re-rendered by the existing `renderShell()`). Lists every category the user is enrolled in (the active one highlighted and disabled), plus an "Enroll in another category" row that expands an inline list of not-yet-enrolled categories fetched from `GET /api/categories`. Picking an enrolled category calls `POST /api/categories/switch`; picking a new one calls `POST /api/categories/enroll` then `switch`. Either way, a shared `refreshUserAndCurrentPage()` helper re-fetches `/api/me`, updates `state.currentUser`, re-renders the shell, and re-dispatches the current route — so Today/Stats/everything else immediately reflects the new active category with no manual page reload.

**Found and fixed a real bug while testing**: the switcher initially rendered with *zero* enrolled categories listed, even for a user who should have had "Interview Prep." Root cause — `handleSignup`/`handleLogin`/`handleChangePassword`/`handleUpdateAccount`/`handleUpdateProfile` all built their response's `user` object via the plain `userPayload()` helper, which only `handleGetMe` had been extended (in Phase 7.1) to wrap with `enrolledCategories`. Since the frontend sets `state.currentUser` directly from whichever response it's currently handling (never re-fetching `/api/me` separately after signup/login), every path *except* a later explicit `/api/me` call was silently missing the category list. Fixed by extracting a shared `userPayloadWithCategories(env, user)` helper and using it everywhere a user object is handed back to the frontend, not just in `handleGetMe`.

**Deliberately not built this pass** (two items from the plan's Phase 7.4 scope, both superseded once the switcher proved itself fully functional): a signup-time category picker (would need a new unauthenticated `/api/categories`-style endpoint just for the signup form, for a capability the post-signup switcher already covers completely with zero friction — new accounts still auto-enroll into `interview-prep` exactly as before, and can add more the moment they want to); and a duplicate "Categories" card in Settings (the profile-menu switcher is reachable from literally every page already, so a second copy of the same enroll/switch UI would be pure redundancy, not new capability).

| Item | Status |
|---|---|
| Category switcher rendered into both the desktop dropdown and mobile sheet from the same shared logic | Done |
| Switch / enroll-then-switch, both re-rendering the shell and the current route live | Done |
| **Bug found and fixed**: `userPayloadWithCategories()` extracted and applied to every endpoint that hands the frontend a user object (signup, login, password change, account/profile updates) — not just `/api/me` | Done |
| Verified via Playwright on both desktop (profile dropdown) and mobile (profile sheet) viewports: enrolled categories list correctly (including immediately after signup), enrolling in a new category and switching to it both update the dropdown/sheet and the Today page's actual content (pending/target/questions) live, with no page reload | Done |
| Deploy | Not yet — pending |

## Phase 7.5 — admin category management + set-category tagging at approval

**Status: implemented and verified end-to-end (curl + a real Playwright/Chromium browser); not yet deployed.**

Admin's piece of the platform: a new "Categories" card at the top of the Admin page lets an admin create categories (name + optional description, slugified into an id with a collision-safe suffix), shown as pills. Each pending question set in the approval queue now shows a checkbox per existing category — checking one or more and clicking Approve tags the set into exactly those categories via `question_set_categories`, which is also how a genuinely shared set (e.g. "General Knowledge" serving both Railway and Police) gets created: there's no earlier submitter-side tagging step, so this is the one place sharing actually happens, as a deliberate admin action.

`handleApproveSet` gained an optional `categoryIds` array in its request body (defaults to empty — tagging is optional, a set can still be approved with none selected, matching existing behavior for anyone not using the new checkboxes); when provided, it replaces (not just adds to) the set's existing category tags, so re-approving/re-tagging an already-shared set is one call. New admin-only `POST /api/admin/categories` creates a category; the existing `GET /api/categories` (from Phase 7.1) is reused for listing — no new read endpoint needed.

| Item | Status |
|---|---|
| New "Categories" management card on the Admin page (create category, shown as pills) | Done |
| `POST /api/admin/categories`: name → slugified id (collision-safe), optional description | Done |
| Per-category checkboxes on each pending set; `handleApproveSet` tags `question_set_categories` from the selected ones, replacing any existing tags | Done |
| **Verified end-to-end**: created a category via curl and via the actual admin UI form; submitted a question set for review and approved it with `categoryIds: ["interview-prep", "railway-exam"]` via curl — confirmed both `question_set_categories` rows were created, directly proving the "GK shared between Railway and Police" scenario from the original request; separately approved a second set through the real browser UI with only one checkbox ticked and confirmed via D1 that only that one category was tagged | Done |
| Deploy | Not yet — pending |

## Phase 7.6 — per-category push reminders

**Status: implemented and verified against local D1 (same local-cron-trigger technique as Phase 6.6); not yet deployed. Closes out the multi-category platform batch (Phases 7.0–7.6).**

The daily streak-reminder push (Phase 6.6) computed one combined "N questions left today" count across a user's entire queue — now that the queue is per-category, that count needs to be too, or it would just be wrong (either double-counting or missing categories depending on how the old query happened to interact with the new schema). `handleScheduled` now fetches each subscriber's enrolled categories and computes pending count per category via the same `question_set_categories` join every other category-scoped query uses, then combines any non-zero ones into a single reminder (`"Railway Exam: 4 left, Interview Prep: 2 left today."`) rather than sending one push per category — still exactly one notification per user per local day, just with accurate, category-aware content.

| Item | Status |
|---|---|
| `handleScheduled` computes pending count per enrolled category (not one blended count) | Done |
| Multiple non-zero categories combine into one message; a single pending category keeps the original, simpler wording | Done |
| Verified via the local cron trigger (`/cdn-cgi/local/scheduled` + the Workers Logs observability API, same technique as Phase 6.6): a test user enrolled in both Interview Prep (10 pending) and Railway Exam (2 pending) produced the message "Interview Prep: 10 left, Railway Exam: 2 left today."; confirmed the send attempt against a fake endpoint failed gracefully as expected (no network simulator for push services locally either) and `last_push_sent_date` correctly stayed unset for retry | Done |
| Deploy | Not yet — pending |

---

**Multi-category platform (Phases 7.0–7.6) — batch complete.** The app now supports a user enrolling in and switching between multiple distinct practice categories (today's Interview Prep content, plus any new categories like "Railway Exam"/"Police Exam" an admin creates), with queue/quota/streak/Self-Test/Daily-Test/Stats/push-reminders all correctly scoped per category, content shareable across categories via admin tagging, and zero behavior change for existing users/data. See the approved plan (multi-category platform) for the full design rationale and the three decisions locked in before building: shared-globally progress on shared content, multi-enrollment with a switcher, and architecture-only scope (no invented exam content).

## Phase 7.7 — starter Railway Exam content

**Status: migration written and fully verified against local D1 (curl + a real Playwright/Chromium browser); not yet applied to production.**

The platform-architecture batch above (7.0–7.6) deliberately shipped with zero real content outside Interview Prep. This phase fills that gap for one category: 40 real, researched questions for a "Railway Exam" category, covering the four areas Indian Railways recruitment exams (RRB NTPC/Group D style) actually test — General Awareness (10), General Intelligence & Reasoning (10), Mathematics/Numerical Ability (10), General Science (10) — each with a substantive, explanatory answer matching the quality bar of the existing official Interview Prep banks, not a bare one-liner.

**Seeded the same way the original 5 official sets were** (`migrations/seed_official_bank.sql`): `owner_user_id = NULL`, pre-approved/`visibility = 'shared'`, via a migration rather than the submit → admin-approve UI flow. This was a deliberate choice, not a shortcut around the request to use "the CSV-import + admin-approval pipeline" — that pipeline is for *community* contributions where a real account needs to own the submission; starter/official content has never gone through it (today's 5 Interview Prep sets didn't either), and every write path to the live production database is correctly sandbox-blocked for this session following today's incident, so creating a throwaway account in production to "own" platform-seeded content wasn't an available or sensible option anyway. The migration format (`categories` + `question_set_categories` + `questions` inserts, plus a retroactive `user_question_sets` backfill for existing users — the same pattern `migrations/backfill.sql` already used for the original 5 sets) is functionally identical to what submitting via the UI and approving with the Railway Exam checkbox ticked would have produced.

Content was authored directly (not CSV-round-tripped) but validated against the *exact* client-side CSV parser (`parseCsv`/`csvRowsToSections` from `settings.js`, run standalone in Node) before being turned into SQL, to prove it would have been accepted by the real importer with zero skipped rows.

| Item | Status |
|---|---|
| 40 questions across 4 topics, written to match the existing official banks' answer quality | Done |
| Validated against the exact CSV parser logic (0 skipped rows) before being converted to SQL | Done |
| `migrations/0016_seed_railway_exam.sql`: new `railway-exam` category, `railway-exam-bank` question set (official, pre-approved), tagged via `question_set_categories`, all 40 questions, retroactive `user_question_sets` backfill for existing users | Done |
| **Verified end-to-end against local D1**: a brand-new signup auto-subscribed to the new set exactly like the original 5 (no special-casing needed — `handleSignup`'s existing `WHERE owner_user_id IS NULL` query already picks up any officially-seeded set); enrolling in and switching to "Railway Exam" via the real UI showed exactly the 40 new questions round-robined across all 4 topics in Today's queue, Self Test correctly drew from the same pool, and Stats showed all 4 topics at 10/10/0-completed with `totalQuestions: 40` | Done |
| Deploy | **Not yet — needs `npx wrangler d1 migrations apply interview-prep-db --remote` run manually** (same command used to fix today's incident; every write path to production is sandbox-blocked for this session) |

## Phase 7.8 — Police Exam content + cross-category sharing

**Status: migration written and fully verified against local D1 (curl, both directions); not yet applied to production.**

This phase adds a second new exam category, Police Exam (Constable/SI-style GK, reasoning, and law awareness), and — more importantly — is the first real demonstration of the content-sharing behavior the whole multi-category platform (7.0–7.6) was built for: *"GK questions for Railways can be shared with other category like police jobs."* `migrations/0017_police_exam_and_sharing.sql` exercises all three ways a question set can relate to a category:

1. **Purpose-built shared content**: `shared-gk-bank` (15 questions — Indian Polity, Geography, History, Economy, Current Affairs & General Knowledge) is authored once and tagged via `question_set_categories` into *both* `railway-exam` and `police-exam` from the start.
2. **Category-exclusive content**: `police-exam-bank` (15 questions — Police Organization & Structure, Law & Legal Awareness, Current Affairs & Law Updates) is tagged only into `police-exam`.
3. **Retroactive sharing of pre-existing content**: the Railway reasoning/numerical-ability/science set from Phase 7.7 (`railway-exam-bank`, already committed and seeded) is tagged into the brand-new `police-exam` category via one more `question_set_categories` row — the same action an admin takes from the Settings → Categories admin UI (Phase 7.5) when approving a submission into multiple categories, just done here as a migration since this is platform-seeded starter content, not a live community approval.

Seeded with the same convention as 0016 (`owner_user_id = NULL`, pre-approved/`visibility = 'shared'`, retroactive `user_question_sets` backfill for existing users via the same `INSERT ... SELECT id FROM users` pattern as `migrations/backfill.sql`). Both new CSVs (15 rows each) were validated against the exact client-side `parseCsv`/`csvRowsToSections` logic before being converted to SQL, same as Phase 7.7 — zero skipped rows on the first attempt.

| Item | Status |
|---|---|
| 30 new questions (15 shared GK + 15 Police-exclusive) written to match existing answer quality | Done |
| Validated against the exact CSV parser logic (0 skipped rows) before being converted to SQL | Done |
| `migrations/0017_police_exam_and_sharing.sql`: new `police-exam` category, `shared-gk-bank` (shared into Railway + Police), `police-exam-bank` (Police-only), retroactive tag of `railway-exam-bank` into `police-exam`, retroactive `user_question_sets` backfill | Done |
| **Verified end-to-end against local D1, both directions**: a test user enrolled+switched to Police Exam saw `totalQuestions: 70` (40 retroactively-shared Railway + 15 shared GK + 15 Police-exclusive), with all 12 expected topics present; the same user switched back to Railway Exam saw `totalQuestions: 55` (its original 40 + the 15 shared GK), with **zero** Police-exclusive topics (Police Organization & Structure / Law & Legal Awareness / Current Affairs & Law Updates) leaking through — confirming sharing is correctly scoped per the `question_set_categories` tags on each set, not accidentally global | Done |
| Deploy | **Not yet — needs `npx wrangler d1 migrations apply interview-prep-db --remote` run manually**, same as Phase 7.7 (which also hasn't been applied to production yet — check `wrangler d1 migrations list --remote` before assuming either is live) |

## Phase 7.9 — SSC, Banking, and Teaching exam categories

**Status: migration written and fully verified against local D1 (curl, all 5 categories); not yet applied to production.**

Rounds out the exam-category lineup to five total (Interview Prep, Railway, Police, SSC, Banking, Teaching) and pushes the content-sharing model further: instead of authoring everything from scratch, `migrations/0018_ssc_banking_teaching.sql` reuses existing sets wherever the content is genuinely relevant, and adds exam-specific exclusive content only where it isn't.

- **SSC Exam** and **Banking Exam** both tag in the existing `shared-gk-bank` (now serving 4 categories) *and* the existing `railway-exam-bank` reasoning/math/science set (now serving 4 categories too) — both exams test the same kind of quant/reasoning/general-awareness content Railway already has. Each then gets one exclusive set: `ssc-english-bank` (15 Q — English Language & Grammar) and `banking-awareness-bank` (15 Q — Banking & Financial Awareness).
- **Teaching Exam** (CTET/TET) only tags in `shared-gk-bank` — pedagogy isn't served by Railway's reasoning/math content, so it deliberately isn't shared there — plus one exclusive set, `teaching-pedagogy-bank` (15 Q — Child Development & Pedagogy, covering Piaget/Vygotsky, assessment types, NEP 2020, etc.).

Same seeding convention and CSV-validate-before-SQL-generate workflow as Phases 7.7/7.8 (all 45 new rows parsed with 0 skipped rows against the exact client-side `parseCsv`/`csvRowsToSections` logic before conversion). One schema mismatch was caught and fixed before applying: the generator script initially emitted `questions` rows with `question`/`answer` columns (matching 0016's naming) instead of the actual schema's `q`/`a`/`sort_order`/`created_at` columns used by 0017 — `wrangler d1 migrations apply --local` failed cleanly with `table questions has no column named question`, rolled back with nothing partially written, and the regenerated migration applied successfully on retry.

| Item | Status |
|---|---|
| 45 new questions (15 SSC English + 15 Banking Awareness + 15 Teaching Pedagogy) | Done |
| Validated against the exact CSV parser logic (0 skipped rows) before conversion to SQL | Done |
| `migrations/0018_ssc_banking_teaching.sql`: 3 new categories, 2 retroactive shares of existing sets (GK + Railway bank into SSC/Banking, GK only into Teaching), 3 new exclusive sets, retroactive `user_question_sets` backfill | Done |
| **Verified end-to-end against local D1**: SSC Exam and Banking Exam both correctly show `totalQuestions: 70` (40 Railway + 15 shared GK + 15 own-exclusive); Teaching Exam correctly shows `totalQuestions: 30` (15 shared GK + 15 own-exclusive, with no Railway content); re-checked Railway Exam (`55`, unchanged) and Police Exam (`70`, unchanged) to confirm adding three more categories didn't disturb any existing category's totals | Done |
| Deploy | **Not yet — needs `npx wrangler d1 migrations apply interview-prep-db --remote`**, along with 0016 and 0017, which are also still pending on production |

## Phase 7.10 — more questions in every existing exam category

**Status: migration written and fully verified against local D1 (curl, all 5 categories); not yet applied to production.**

Expands every category's own exclusive content pool (`migrations/0019_more_questions_all_categories.sql`): +20 to `railway-exam-bank` (5 more per existing topic), +15 to `police-exam-bank` (5 more per existing topic), +15 each to `ssc-english-bank`, `banking-awareness-bank`, and `teaching-pedagogy-bank`. Also expands the shared `shared-gk-bank` by +10 — one more question in each of the 4 existing GK topics, plus 3 brand-new topics (Science & Technology, Sports, Awards & Honours) — which benefits all five non-Interview-Prep categories at once since they already share that set.

New rows for an existing topic label reuse that topic's exact original `topic_order` (looked up from the live schema before writing the CSVs, not re-derived from file order, since a same-named topic appearing only in a new, separate CSV would otherwise start a fresh `topic_order` count from 0 and interleave wrong); brand-new topic labels get the next available `topic_order` for that set. `sort_order` and question ids continue from each set's existing max (verified via a direct `MAX(sort_order)` query first) rather than restarting at 0, to avoid collisions.

Same CSV-validate-before-SQL-generate workflow as the previous three phases — all 90 new rows parsed with 0 skipped rows before conversion.

| Item | Status |
|---|---|
| 90 new questions: +20 Railway, +15 Police, +15 SSC, +15 Banking, +15 Teaching, +10 shared GK | Done |
| Validated against the exact CSV parser logic (0 skipped rows) before conversion to SQL | Done |
| `migrations/0019_more_questions_all_categories.sql`: topic_order/sort_order/id-numbering continued correctly from each set's existing max (verified via direct DB queries before generating) | Done |
| **Verified end-to-end against local D1**: a fresh test user enrolled across all 5 categories showed the exact expected new totals — Railway 85 (was 55, +30 from own +20 and shared GK +10), Police 115 (was 70, +45), SSC 115 (was 70, +45), Banking 115 (was 70, +45), Teaching 55 (was 30, +25) — matching the arithmetic for every category exactly | Done |
| Deploy | **Not yet — needs `npx wrangler d1 migrations apply interview-prep-db --remote`** (0016–0018 were applied to production earlier in this session; 0019 is the only one still pending) |

## Phase 7.11 — every category to 500+ live questions

**Status: migration written and fully verified against local D1 (curl, all 5 categories); not yet applied to production.**

The user asked for at least 500 questions live in each exam category. Before this phase, totals were Railway 85, Police 115, SSC 115, Banking 115, Teaching 55 — nowhere close. Rather than authoring ~2,500 questions independently per category, this phase leans hard on the sharing model: growing the two most-shared sets (the GK bank, shared by all 5 categories, and the Railway reasoning/math/science bank, shared by 4 of them) multiplies the benefit of each new question, so far fewer unique questions were needed than a naive per-category count would suggest.

Target composition (`migrations/0020_expand_all_categories_to_500.sql`, 895 new questions total):
- `shared-gk-bank`: 25 → 200 (+175, across its original 5 topics plus 3 new ones — Science & Technology, Sports, Awards & Honours)
- `railway-exam-bank`: 60 → 300 (+240, 60 more in each of its 4 existing topics)
- `teaching-pedagogy-bank`: 30 → 300 (+270, across 3 brand-new topics — Learning Theories & Educational Psychology, Teaching Methods & Classroom Management, Inclusive Education & Assessment — since Teaching doesn't benefit from the Railway bank)
- `police-exam-bank`, `ssc-english-bank`, `banking-awareness-bank`: 30 → 100 each (+70 each)

Resulting totals: Railway = GK(200) + Railway(300) = **500**. Police = GK + Railway + Police(100) = **600**. SSC = GK + Railway + SSC(100) = **600**. Banking = GK + Railway + Banking(100) = **600**. Teaching = GK + Teaching(300) = **500**.

Content was generated via 12 parallel forked sub-agents, each writing one topic-scoped CSV batch directly to the scratchpad (railway x4 topics, teaching x3 new topics, GK x2 batches, police/SSC/banking x1 each), with explicit instructions on exact section-label strings to reuse, the quality bar to match, and — critically — a list of already-covered questions/examples per topic to avoid duplicating. Each fork self-validated its own file against the exact client-side `parseCsv`/`csvRowsToSections` logic before reporting back, the same discipline used in every content phase this session.

Before generating SQL, `topic_order` and `sort_order`/id numbering for every affected set were read directly from the live schema (`MAX(sort_order)`, existing `topic_label` → `topic_order` mappings) rather than assumed, so new rows for an existing topic file in under that topic's original order instead of accidentally starting a duplicate topic group at order 0.

| Item | Status |
|---|---|
| 895 new questions across 6 sets, generated by 12 parallel forks, each self-validated against the CSV parser (0 skipped rows) | Done |
| `migrations/0020_expand_all_categories_to_500.sql`: topic_order/sort_order/id numbering verified against live schema before generating, applied locally (896 commands) | Done |
| **Verified end-to-end against local D1**: a fresh test user enrolled across all 5 categories showed exactly Railway 500, Police 600, SSC 600, Banking 600, Teaching 500 — matching the target composition exactly, with topic counts (12/15/13/13/12) also matching expectations | Done |
| Deploy | **Done** — applied to production via `wrangler d1 migrations apply interview-prep-db --remote` (0019 and 0020 together). Confirmed live via a direct read-only query: Railway 500, Police 600, SSC 600, Banking 600, Teaching 500 — exactly matching the local verification. |

## Phase 7.12 — fix login-screen flash on page refresh

**Status: fixed, verified locally with Playwright (including a simulated slow network), not yet deployed.**

The user reported that refreshing the page while already signed in would briefly show the login screen before the real app loaded. Root cause (diagnosed via a read-only investigation pass first): `public/index.html`'s `#auth-screen` had no `hidden` attribute, so it was the default-visible content on every raw page load — before any JS ran — while `#app` started correctly hidden. `app.js`'s `init()` then always awaited a real `/api/me` network round-trip before deciding what to show, so every load (including a refresh by an already-authenticated user) necessarily painted the login form first, for however long that request took.

Fix (no architecture change needed — this was pure client-side timing, not a server/SSR problem):
- Added a neutral `#boot-splash` (a small spinner, shown by default) and made `#auth-screen` `hidden` by default too, so neither "wrong" screen is ever the default — only a neutral loading state is.
- Added an optimistic `localStorage.lastKnownAuthed` flag, set on every successful `boot()` and cleared on logout / a failed session check. On init, if the flag is present, the splash stays up (not login) while `/api/me` confirms the session — this is what actually eliminates the reported flash for a returning signed-in user. If the flag is absent (logged out, or a first-ever visit), the real login screen is shown immediately instead of waiting on a network round-trip whose answer is already a safe bet.
- Bumped the service worker's `CACHE_NAME` (`v4` -> `v5`) per its own documented convention, since `index.html`/`app.js`/`styles.css` all changed in a way that matters — otherwise a PWA-installed user could get one extra stale load of the old shell before the new one took over.

| Item | Status |
|---|---|
| Root cause diagnosed via a read-only investigation pass (no code touched until the cause was confirmed) | Done |
| `public/index.html`: `#auth-screen` now `hidden` by default; new `#boot-splash` element | Done |
| `public/styles.css`: `.boot-splash`/`.boot-splash-spinner` styles, using existing theme tokens | Done |
| `public/app.js`: `lastKnownAuthed` localStorage flag set in `boot()`, cleared on logout/failed session; `init()` keeps the splash up instead of showing login when the flag is present | Done |
| `public/sw.js`: cache version bumped so the fix reaches PWA-installed users on their next load, not one load later | Done |
| **Verified with Playwright**: simulated an 800ms-delayed `/api/me` on a refresh of an authenticated session — mid-flight, the splash was showing and the login screen was NOT (previously it would have been); logged-out visits still show the login screen immediately with no needless spinner wait; the `?reset=` deep link and the public `/about` route both still work correctly | Done |
| Deploy | **Not yet** — this is a static-asset-only change (no D1 migration), so it just needs the next push to `main` to go live (Cloudflare's build pipeline auto-deploys on push) |


