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

**Known trade-offs, not blocking:**
- PWA icons are a flat brand-color square with a checkmark, generated programmatically — functional (satisfies installability requirements) but not real designed artwork. Swap `public/icons/*.png` for real icons later if desired; `scripts/generate-icons.js` isn't needed once you do.
- The reject-reason prompt in the Admin view uses the browser's native `prompt()` rather than a custom modal — simplest thing that works for a low-traffic, admin-only interaction.
- `mcq_variants`' global (not per-user) caching, noted back in the Phase 1 planning review, is now visibly relevant here too: a user-submitted set's MCQs get generated using whichever AI provider the *first* person to reach a "done" question on that set happens to have configured.
