# ExamStreak — Functional Documentation

What the product does and how someone actually uses it, section by section.
For architecture, data model, and security internals, see
[`docs/TECHNICAL.md`](TECHNICAL.md). For setup and local dev, see the root
[`README.md`](../README.md).

## 1. What it is

ExamStreak is a daily interview- and exam-prep tracker. Every account gets
a track (e.g. "Engineering Management", "Railway Exam", "SSC") and a daily
quota of questions; each day it hands the user a fresh batch sized to that
quota, mixes in spaced-repetition review of everything they've already
covered, and layers on AI-assisted practice (a multiple-choice daily test,
an AI-graded self test, and a simulated mock interview).

Two kinds of accounts: **user** (the default — everyone doing prep) and
**admin** (moderates shared content, resolves reports/feedback, manages
categories, and now controls one platform-wide setting: the login
captcha). Everything in sections 3–9 is for `user` accounts; section 10
covers the admin side.

## 2. Public / marketing pages (no login required)

Reachable from the root domain before signing in:

| Page | Purpose |
|---|---|
| `/home` | Marketing landing page — what the app does, why, call to action to sign up. Visiting `/` while signed out redirects here. |
| `/about` | Longer "what is this and who's it for" page. |
| `/guide` | Illustrated quick-start guide: setting up your prep, the daily loop, where to get help — matches MealSathi/CosmoTracker's visual-guide format. |
| `/faq` | Common questions. |
| `/privacy`, `/terms` | Legal pages. |
| `/press` | Press/media page. |
| `/grievance` | How to escalate a complaint or issue that isn't a normal bug report. |
| `/login` | Sign-in, sign-up, and forgot/reset password — see section 3. |

All of these (plus `/login`) are sibling routes outside the authenticated
app shell — no sidebar, no session required. Every other path redirects a
signed-out visitor to `/login`; only `/` redirects to `/home` instead,
since that's the one URL a brand-new visitor is most likely to land on
cold.

## 3. Account lifecycle

### Sign up
From `/login`'s sign-up tab: name, email, password (8+ characters), a
free-text **track** (e.g. "Engineering Management", "Railway Exam" — this
becomes the account's first category), and a **daily quota** (5–50,
defaults to 10). On success the account is auto-enrolled in every
official (admin-approved, shared) question set for that track and lands
on Today.

Login, sign-up, and forgot-password are all gated by an invisible
Cloudflare Turnstile check (no user-visible challenge in normal cases) —
unless an admin has turned it off platform-wide (section 10).

### Forgot / reset password
"Forgot password" on the login screen emails a single-use reset link (30
minutes). If no email provider is configured, the link is logged to the
Worker's console instead — only relevant for local development.

### Email verification
A dismissible, snoozable banner appears once an account is 24+ hours old
and still unverified, nudging the user to confirm their email (24-hour
link). This is a soft nudge, not a gate — nothing in the app is blocked
behind a confirmed email.

### Sessions ("where you're signed in")
Settings → Account lists every active session (device/browser, IP,
last-seen time) with a per-session revoke button, so a user can kick a
session they don't recognize without changing their password.

### Deleting an account
Settings → Data → "Delete my account" schedules deletion 30 days out
(shown as a plain date) and is cancelable any time up to that date from
the same page. A user who changes their mind just clicks cancel — nothing
is lost until the 30 days actually elapse. After that, an hourly
background job permanently removes the account and everything personal
to it (progress, sessions, feedback, AI reports, etc.); a published
question set they contributed stays available to everyone still using it,
and any report/audit-log entry they're named in keeps their user ID as a
historical record rather than disappearing.

### Login lockout
Repeated failed logins throttle both the originating IP and the specific
email being attempted, independently — so a distributed attempt spread
across many IPs against one account is still caught.

## 4. Categories and tracks

A **category** is a prep track (Engineering Management, Railway Exam, SSC,
Banking, Teaching, Mathematics, the shared HR/behavioral interview
curriculum, etc.). Settings → Prep profile lets a user:

- See every category they're enrolled in, with the question count in each.
- **Switch** which one is active — this re-keys Today, Review, Daily Test,
  Self Test, and Stats to that category's content and quota.
- **Enroll** in an additional category (auto-subscribes to every official
  set in it, then switches to it).
- **Unenroll** — progress in that category is kept, so re-enrolling later
  picks up exactly where they left off.

## 5. The daily loop

### Today (`/`)
The home screen once signed in. Shows a welcome card and today's queue —
unfinished questions from a prior day appear first (up to the daily quota
worth of backlog), then new questions to fill the rest of the quota.
Clicking **"Show model answer"** on a question reveals the answer inline
and marks it done, updating the header's progress counter. Once every
question in the queue is revealed, a **"Request 5 more questions"**
button appears for anyone who wants to keep going past their quota that
day. A **"Generate today's review"** button also lives here, producing a
review batch (section below) without needing to leave Today.

### Review (`/review`)
Spaced-repetition practice. Every question a user has answered gets a
`due_date` based on a Leitner-box schedule — answer correctly and the gap
before it's due again grows (1, 2, 4, 8… up to 180 days); miss it and it
resets to the front of the line. Review surfaces due questions first,
filling any remaining slots from the rest of the pool, each with a
**reveal** step and a **"Got it" / "Review again"** choice that feeds back
into that schedule.

### Daily Test (`/test`)
A 10-question AI-generated multiple-choice test drawn from the user's
question pool — real questions, AI-generated wrong-answer distractors
(cached once per question so they don't change on a retake). One attempt
per day; each answer locks in once selected.

### Self Test (`/self-test`)
A random question is posed; the user writes (or speaks) their own answer
in free form, and an AI grades it against the model answer, returning a
score out of 10 plus written feedback on how the response compares.

### Mock Interview (`/mock-interview`)
A simulated back-and-forth interview conversation (chat-bubble UI, same
styling as Self Test's feedback) — "Start new mock interview" begins a
fresh session.

### Stats (`/stats`)
Current streak and longest streak, trend charts (review accuracy, Self
Test score, Daily Test accuracy — each over the last N days), and an
AI-generated "coaching insight" paragraph summarizing recent performance
and suggesting what to focus on next. Insight generation is capped
per-day for the shared free AI tier; unlimited for anyone using their own
AI key (see section 7).

## 6. Settings (`/settings`)

Six tabs, URL-addressable (`?tab=...`) so a link can deep-link straight to
one:

| Tab | Contents |
|---|---|
| **Account** | Name/email, change password, sessions list (section 3). |
| **Prep profile** | Category enrollment/switching (section 4), headline/years-experience/bio/timezone. |
| **Appearance & Accessibility** | Light/dark/system theme, 9 accent colors, font size, read-aloud preferences. |
| **AI & Usage** | Bring-your-own-key (BYOK) setup for OpenAI/Anthropic/Workers AI, or stick with the shared free tier; shows current usage against the daily cap. |
| **Notifications** | Push-notification subscribe/unsubscribe for the daily reminder. |
| **Data** | Export your data, delete your account (section 3). |

Uploading or managing shared question sets is **admin-only** — a regular
account's daily content comes entirely from whatever official sets exist
for their enrolled categories plus anything an admin approves later; there
is no self-serve upload path for a normal user.

## 7. AI features and usage limits

Three places use AI: Daily Test's distractor generation, Self Test's
grading/feedback, and Stats' coaching insight. By default every account
shares a small free daily allowance (Workers AI). Settings → AI & Usage
lets a user plug in their own OpenAI, Anthropic, or Workers AI key
instead — once configured, that account's AI usage is unlimited (capped
only by their own provider account, not this app). Keys are encrypted at
rest and never shown back in full once saved.

## 8. Notifications

- **Push notifications**: opt-in daily reminder, managed from Settings →
  Notifications.
- **In-app banner**: a proactive "enable notifications" prompt appears for
  users who haven't opted in yet, dismissible per-session.
- **Email**: password-reset and verification links only — there's no
  marketing/digest email today.

## 9. Content lifecycle (question sets)

- **Official sets** (admin-created or admin-approved) are auto-approved
  and immediately shared — every new account in that category is
  auto-subscribed.
- **User-submitted sets** start `private`, move to `pending` once
  submitted for sharing, and an admin reviews them into `shared` (now
  visible to every enrollee of that category) or `rejected` (with a
  reason the submitter can see).
- **Reporting a bad question**: any user can flag a specific
  question/answer as wrong or confusing from wherever they encounter it;
  this goes to Admin → Reports.
- **General feedback**: bugs, feature ideas, or anything not tied to one
  specific question goes through Admin → Feedback instead.
- **AI-output reports**: if an AI-generated Self Test grade or Stats
  insight seems wrong, that can be flagged too — tracked separately from
  question reports since there's no underlying question to point at.

## 10. Admin (`/admin`, admin accounts only)

A platform-wide **captcha on/off switch** sits at the top of every admin
tab — flips whether login/signup/forgot-password require the invisible
Turnstile check, with no redeploy needed. Every toggle is recorded in the
audit log. Below it, eight tabs:

| Tab | Purpose |
|---|---|
| **Pending Approvals** | Review question sets submitted for sharing; approve (optionally into specific categories) or reject with a reason. |
| **Reports** | Every open question report; fix the question directly from here, or search for and edit any question even if nobody's reported it. |
| **Feedback** | General app feedback — mark read/resolved. |
| **Question Sets** | Upload/import new official question sets (CSV), manage the category-specific AI prompt used for distractor/grading generation, manage the résumé-to-prompt feature, and review AI-suggested sets. |
| **Categories** | Create/manage categories (tracks). |
| **History** | Past approve/reject decisions — who decided, when, how many questions. |
| **Users** | User directory — browse accounts, drill into any user's stats and activity. |
| **Audit Log** | Every admin mutation (question edits, report/feedback resolutions, set approvals/rejections, the captcha toggle, viewing a user's stats) with who did it and when. |

## 11. What happens when you're signed out mid-session

Every page re-checks the session on load. A session that's expired or been
revoked (e.g. from the Sessions list, section 3) redirects to `/login` the
next time any authenticated page is visited — there's no silent "still
looks logged in" state.
