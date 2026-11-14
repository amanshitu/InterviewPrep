import { json } from "../lib/http.js";
import { readJsonBody, parseCookies, isValidEmail } from "../lib/request.js";
import { randomHex, hashPassword } from "../lib/crypto.js";
import { SESSION_COOKIE, clearCookieHeader, startSession } from "../lib/session.js";
import { clampQuota, mapUserRow, userPayloadWithCategories, defaultState } from "../lib/user.js";
import { normalizeTimezone } from "../lib/datetime.js";
import { verifyTurnstile } from "../lib/turnstile.js";
import { isCaptchaEnabled } from "../lib/settings.js";
import { checkRateLimit } from "../lib/ratelimit.js";
import { sendPasswordResetEmail, sendVerificationEmail } from "../lib/email.js";

const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function turnstileFailure() {
  return json({ error: "Please complete the verification check and try again." }, { status: 403 });
}

// Admin-toggleable (Admin -> captcha switch, Settings -> app_settings) —
// when off, every signup/login/forgot-password request skips Turnstile
// entirely rather than calling siteverify with no token to check.
async function checkCaptcha(env, token, ip) {
  if (!(await isCaptchaEnabled(env))) return true;
  return verifyTurnstile(env, token, ip);
}

async function createEmailVerification(env, userId) {
  await env.DB.prepare("DELETE FROM email_verifications WHERE user_id = ?").bind(userId).run();
  const token = randomHex(32);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO email_verifications (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(token, userId, new Date(now).toISOString(), new Date(now + EMAIL_VERIFICATION_TTL_MS).toISOString())
    .run();
  return token;
}

export async function handleSignup(request, env) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.body;
  const name = (body.name || "").toString().trim();
  const email = (body.email || "").toString().trim().toLowerCase();
  const password = (body.password || "").toString();
  const track = body.track ? String(body.track).trim().slice(0, 120) : null;
  const dailyQuota = clampQuota(body.dailyQuota);
  const headline = body.headline ? String(body.headline).trim().slice(0, 140) : null;
  const timezone = normalizeTimezone(body.timezone);
  const requestedCategoryId = body.categoryId ? String(body.categoryId).trim() : null;

  if (!name) return json({ error: "Please enter your name." }, { status: 400 });
  if (!isValidEmail(email)) return json({ error: "Please enter a valid email." }, { status: 400 });
  if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, { status: 400 });

  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await checkCaptcha(env, body.turnstileToken, ip))) return turnstileFailure();

  // The signup form always sends a categoryId (it's a required picker, not
  // free text), but we fall back to the original 'interview-prep' default
  // for any other caller of this endpoint (an unrecognized or missing id)
  // rather than rejecting the whole signup over a category mismatch.
  let categoryId = "interview-prep";
  if (requestedCategoryId) {
    const category = await env.DB.prepare("SELECT id FROM categories WHERE id = ? AND is_active = 1").bind(requestedCategoryId).first();
    if (category) categoryId = category.id;
  }

  // This is a small, invite-only app shared with a handful of known people,
  // so revealing that an email is already registered (rather than genericizing
  // this message) is an acceptable trade-off — it saves a confused "why isn't
  // my invite working" round trip, and there's no meaningful enumeration risk
  // at this scale. The forgot-password endpoint below stays fully generic,
  // since that one's reachable by anyone with just an email address.
  const existing = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (existing) return json({ error: "An account with that email already exists." }, { status: 409 });

  const id = crypto.randomUUID();
  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  const now = new Date().toISOString();

  await env.DB.prepare(
    "INSERT INTO users (id, email, name, password_hash, salt, created_at, track, daily_quota, headline, timezone) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, email, name, passwordHash, salt, now, track, dailyQuota, headline, timezone)
    .run();

  await env.DB.prepare(
    "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)",
  )
    .bind(id, JSON.stringify(defaultState()), now)
    .run();

  // Every account starts subscribed to every shared set — originally just
  // owner_user_id IS NULL (the official HR/behavioral curriculum), broadened
  // to all visibility='shared' once question-set creation became admin-only:
  // an admin-created set still has owner_user_id set to the admin's own id,
  // and with no more self-service community submission flow, "shared" now
  // means "admin-published," so the distinction this filter used to make no
  // longer carries meaning — everything shared should reach everyone.
  const officialSets = await env.DB.prepare("SELECT id FROM question_sets WHERE visibility = 'shared'").all();
  const subs = (officialSets.results || []).map((s) =>
    env.DB.prepare(
      "INSERT INTO user_question_sets (user_id, set_id, subscribed_at) VALUES (?, ?, ?) ON CONFLICT(user_id, set_id) DO NOTHING",
    ).bind(id, s.id, now),
  );
  if (subs.length) await env.DB.batch(subs);

  // Every account starts enrolled in — and active on — whichever category
  // they picked on the signup form, with the quota they signed up with.
  await env.DB.prepare(
    "INSERT INTO user_categories (user_id, category_id, daily_quota) VALUES (?, ?, ?)",
  )
    .bind(id, categoryId, dailyQuota)
    .run();
  await env.DB.prepare("UPDATE users SET active_category_id = ? WHERE id = ?").bind(categoryId, id).run();

  const verifyToken = await createEmailVerification(env, id);
  const origin = new URL(request.url).origin;
  await sendVerificationEmail(env, { to: email, verifyLink: `${origin}/api/auth/verify-email?token=${verifyToken}` });

  return startSession(
    env,
    id,
    await userPayloadWithCategories(env, {
      id, email, name, createdAt: now, track, role: "user", dailyQuota,
      activeCategoryId: categoryId,
      streakCount: 0, streakLongest: 0, streakLastActive: null,
      aiProvider: null, aiKeyCiphertext: null, aiKeyIv: null,
      headline, yearsExperience: null, bio: null, timezone,
      emailVerified: false, deletionRequestedAt: null,
    }),
    request,
  );
}

export async function handleLogin(request, env) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.body;
  const email = (body.email || "").toString().trim().toLowerCase();
  const password = (body.password || "").toString();

  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await checkCaptcha(env, body.turnstileToken, ip))) return turnstileFailure();

  // Per-account lockout, on top of the per-IP one the router already
  // applies — throttles a distributed attempt that spreads across many IPs
  // but keeps guessing the same account.
  if (email) {
    const accountLimited = await checkRateLimit(env, request, "login-account", 10, 15, `account:${email}`);
    if (accountLimited) return accountLimited;
  }

  const user = await env.DB.prepare(
    `SELECT u.id as id, u.email as email, u.name as name, u.password_hash as password_hash, u.salt as salt,
            u.created_at as created_at, u.track as track, u.role as role,
            u.active_category_id as active_category_id,
            COALESCE(uc.daily_quota, u.daily_quota) as daily_quota,
            COALESCE(uc.streak_count, u.streak_count) as streak_count,
            COALESCE(uc.streak_longest, u.streak_longest) as streak_longest,
            COALESCE(uc.streak_last_active, u.streak_last_active) as streak_last_active,
            u.ai_provider as ai_provider, u.ai_key_ciphertext as ai_key_ciphertext, u.ai_key_iv as ai_key_iv,
            u.headline as headline, u.years_experience as years_experience, u.bio as bio, u.timezone as timezone,
            u.workers_ai_model as workers_ai_model, u.avatar_data as avatar_data
     FROM users u
     LEFT JOIN user_categories uc ON uc.user_id = u.id AND uc.category_id = u.active_category_id
     WHERE u.email = ?`,
  )
    .bind(email)
    .first();

  if (!user) return json({ error: "Incorrect email or password." }, { status: 401 });

  const computed = await hashPassword(password, user.salt);
  if (computed !== user.password_hash) {
    return json({ error: "Incorrect email or password." }, { status: 401 });
  }

  return startSession(env, user.id, await userPayloadWithCategories(env, mapUserRow(user)), request);
}

export async function handleLogout(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }
  return json({ ok: true }, { headers: { "Set-Cookie": clearCookieHeader() } });
}

// ---------- password reset / change ----------

export async function handleForgotPassword(request, env) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const email = (parsed.body.email || "").toString().trim().toLowerCase();

  const ip = request.headers.get("CF-Connecting-IP");
  if (!(await checkCaptcha(env, parsed.body.turnstileToken, ip))) return turnstileFailure();

  // Always the same response, whether or not the account exists — this
  // endpoint is reachable by anyone with just an email address, so it must
  // never reveal account existence.
  const genericResponse = json({
    ok: true,
    message: "If that email is registered, we've sent a password reset link.",
  });

  if (!isValidEmail(email)) return genericResponse;

  const user = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(email).first();
  if (!user) return genericResponse;

  await env.DB.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(user.id).run();

  const token = randomHex(32);
  const now = Date.now();
  await env.DB.prepare(
    "INSERT INTO password_resets (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(token, user.id, new Date(now).toISOString(), new Date(now + PASSWORD_RESET_TTL_MS).toISOString())
    .run();

  const origin = new URL(request.url).origin;
  const resetLink = `${origin}/?reset=${token}`;
  await sendPasswordResetEmail(env, { to: email, resetLink });

  return genericResponse;
}

export async function handleResetPassword(request, env) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const token = (parsed.body.token || "").toString();
  const password = (parsed.body.password || "").toString();

  if (!token) return json({ error: "Missing reset token." }, { status: 400 });
  if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, { status: 400 });

  const row = await env.DB.prepare(
    "SELECT user_id, expires_at FROM password_resets WHERE token = ?",
  )
    .bind(token)
    .first();

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    if (row) await env.DB.prepare("DELETE FROM password_resets WHERE token = ?").bind(token).run();
    return json({ error: "This reset link is invalid or has expired." }, { status: 400 });
  }

  const salt = randomHex(16);
  const passwordHash = await hashPassword(password, salt);
  await env.DB.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?")
    .bind(passwordHash, salt, row.user_id)
    .run();

  // A stolen session shouldn't survive a reset, and the token is single-use.
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id).run();
  await env.DB.prepare("DELETE FROM password_resets WHERE user_id = ?").bind(row.user_id).run();

  return json({ ok: true, message: "Password updated. Please sign in." });
}

export async function handleChangePassword(request, env, user) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const currentPassword = (parsed.body.currentPassword || "").toString();
  const newPassword = (parsed.body.newPassword || "").toString();

  if (newPassword.length < 8) return json({ error: "New password must be at least 8 characters." }, { status: 400 });

  const row = await env.DB.prepare("SELECT password_hash, salt FROM users WHERE id = ?")
    .bind(user.id)
    .first();
  const computed = await hashPassword(currentPassword, row.salt);
  if (computed !== row.password_hash) {
    return json({ error: "Current password is incorrect." }, { status: 401 });
  }

  const newSalt = randomHex(16);
  const newHash = await hashPassword(newPassword, newSalt);
  await env.DB.prepare("UPDATE users SET password_hash = ?, salt = ? WHERE id = ?")
    .bind(newHash, newSalt, user.id)
    .run();

  // Rotate the session: issue a fresh token, drop the old one.
  await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(user.token).run();
  return startSession(env, user.id, await userPayloadWithCategories(env, user));
}

export async function handleRevokeAllSessions(request, env, user) {
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
  return json({ ok: true }, { headers: { "Set-Cookie": clearCookieHeader() } });
}

// ---------- email verification ----------

// A GET link clicked from the verification email — no auth required (the
// token itself is the proof), single-use, expires in 24h.
export async function handleVerifyEmail(request, env) {
  const token = new URL(request.url).searchParams.get("token") || "";
  const row = await env.DB.prepare("SELECT user_id, expires_at FROM email_verifications WHERE token = ?")
    .bind(token)
    .first();

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    if (row) await env.DB.prepare("DELETE FROM email_verifications WHERE token = ?").bind(token).run();
    return new Response(verifyResultPage(false), { status: 400, headers: { "content-type": "text/html; charset=utf-8" } });
  }

  await env.DB.prepare("UPDATE users SET email_verified = 1 WHERE id = ?").bind(row.user_id).run();
  await env.DB.prepare("DELETE FROM email_verifications WHERE user_id = ?").bind(row.user_id).run();

  return new Response(verifyResultPage(true), { status: 200, headers: { "content-type": "text/html; charset=utf-8" } });
}

// A tiny standalone page rather than a JSON response — this link is opened
// directly from an email client, not called by the frontend.
function verifyResultPage(success) {
  const title = success ? "Email verified" : "Link expired";
  const body = success
    ? "Your email address is verified. You can close this tab and keep using ExamStreak."
    : "This verification link is invalid or has expired. Sign in and request a new one from Settings.";
  return `<!doctype html><html><head><meta charset="utf-8"><title>${title} — ExamStreak</title>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:420px;margin:15vh auto;padding:0 24px;text-align:center;color:#1f2937}
    a{color:#3730a3}</style></head>
    <body><h1>${title}</h1><p>${body}</p><p><a href="/login">Back to ExamStreak</a></p></body></html>`;
}

export async function handleResendVerification(request, env, user) {
  if (user.emailVerified) return json({ error: "Your email is already verified." }, { status: 400 });
  const verifyToken = await createEmailVerification(env, user.id);
  const origin = new URL(request.url).origin;
  await sendVerificationEmail(env, { to: user.email, verifyLink: `${origin}/api/auth/verify-email?token=${verifyToken}` });
  return json({ ok: true, message: "Verification email sent." });
}
