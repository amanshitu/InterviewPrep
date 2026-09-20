// Interview Prep Tracker — Cloudflare Worker
//
// Serves the static app (public/) and a small JSON API backed by D1 for
// email+password auth and per-user progress state. The question bank
// itself is static content shipped with the app (public/questions.js) —
// only per-user progress lives in the database.

const SESSION_COOKIE = "session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PASSWORD_RESET_TTL_MS = 30 * 60 * 1000; // 30 minutes

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  // Inline style="" attributes are used throughout app.js's templated markup;
  // rewriting all of them to avoid 'unsafe-inline' isn't worth it for this app.
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "content-type": "application/json; charset=utf-8",
      ...(init.headers || {}),
    },
  });
}

function applySecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if ((headers.get("content-type") || "").includes("text/html")) {
    headers.set("Content-Security-Policy", CONTENT_SECURITY_POLICY);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return out;
}

function randomHex(numBytes) {
  const bytes = new Uint8Array(numBytes);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function hashPassword(password, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: hexToBytes(saltHex),
      iterations: 100000,
      hash: "SHA-256",
    },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

// ---------- BYOK encryption ----------
// Per-user AI provider keys are encrypted at rest with AES-GCM, using a
// master key that only exists as a Worker secret (never in D1). Plaintext
// keys only ever exist in memory for the duration of the request that
// needs them.
async function getMasterKey(env) {
  const raw = hexToBytes(env.AI_KEY_ENCRYPTION_SECRET);
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, ["encrypt", "decrypt"]);
}

async function encryptSecret(env, plaintext) {
  const key = await getMasterKey(env);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder().encode(plaintext);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, enc);
  return { ciphertext: bytesToHex(new Uint8Array(ciphertext)), iv: bytesToHex(iv) };
}

async function decryptSecret(env, ciphertextHex, ivHex) {
  const key = await getMasterKey(env);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: hexToBytes(ivHex) },
    key,
    hexToBytes(ciphertextHex),
  );
  return new TextDecoder().decode(plainBuf);
}

// Reads and parses a JSON request body, defensively capping its size so a
// huge payload can't be used to burn CPU/memory before we've even validated
// anything. Returns { ok: true, body } or { ok: false, status, error }.
async function readJsonBody(request, maxBytes = 10000) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > maxBytes) {
    return { ok: false, status: 413, error: "Request body too large." };
  }
  let text;
  try {
    text = await request.text();
  } catch {
    return { ok: false, status: 400, error: "Invalid request body." };
  }
  if (text.length > maxBytes) {
    return { ok: false, status: 413, error: "Request body too large." };
  }
  try {
    return { ok: true, body: text ? JSON.parse(text) : {} };
  } catch {
    return { ok: false, status: 400, error: "Invalid request body." };
  }
}

function parseCookies(request) {
  const header = request.headers.get("Cookie") || "";
  const out = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k) out[k] = decodeURIComponent(v);
  }
  return out;
}

function sessionCookieHeader(token, maxAgeSeconds) {
  const attrs = [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];
  return attrs.join("; ");
}

function clearCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

function isValidEmail(email) {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ---------- rate limiting ----------
// Tracks request timestamps per (IP, endpoint) in D1 so brute-forcing
// /api/login, /api/signup or /api/password/forgot gets throttled even
// though this Worker has no in-memory state across requests.
async function checkRateLimit(env, request, endpoint, limit = 10, windowMinutes = 15) {
  const ip = request.headers.get("CF-Connecting-IP") || "unknown";
  const windowMs = windowMinutes * 60 * 1000;
  const now = Date.now();
  const windowStartIso = new Date(now - windowMs).toISOString();

  await env.DB.prepare(
    "DELETE FROM rate_limit_attempts WHERE ip = ? AND endpoint = ? AND occurred_at < ?",
  )
    .bind(ip, endpoint, windowStartIso)
    .run();

  const row = await env.DB.prepare(
    "SELECT COUNT(*) as n, MIN(occurred_at) as oldest FROM rate_limit_attempts WHERE ip = ? AND endpoint = ? AND occurred_at >= ?",
  )
    .bind(ip, endpoint, windowStartIso)
    .first();

  if (row && row.n >= limit) {
    const oldestMs = row.oldest ? new Date(row.oldest).getTime() : now;
    const retryAfterSeconds = Math.max(1, Math.ceil((oldestMs + windowMs - now) / 1000));
    return json(
      { error: "Too many attempts. Please try again later." },
      { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } },
    );
  }

  await env.DB.prepare("INSERT INTO rate_limit_attempts (ip, endpoint, occurred_at) VALUES (?, ?, ?)")
    .bind(ip, endpoint, new Date(now).toISOString())
    .run();

  return null;
}

async function getUserFromRequest(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT s.user_id as user_id, s.expires_at as expires_at, u.id as id, u.email as email, u.name as name,
            u.created_at as created_at, u.track as track, u.role as role, u.daily_quota as daily_quota,
            u.streak_count as streak_count, u.streak_longest as streak_longest, u.streak_last_active as streak_last_active,
            u.ai_provider as ai_provider, u.ai_key_ciphertext as ai_key_ciphertext, u.ai_key_iv as ai_key_iv,
            u.headline as headline, u.years_experience as years_experience, u.bio as bio, u.timezone as timezone
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
  )
    .bind(token)
    .first();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return { ...mapUserRow(row), token };
}

// Normalizes a raw D1 users-table row (snake_case columns) into the same
// camelCase shape getUserFromRequest() returns, so handleLogin/handleSignup
// can build a session payload the same way instead of hand-rolling a
// second, easy-to-drift-from-reality object literal (a real earlier bug:
// the login response was missing aiProvider/hasAiKey entirely).
function mapUserRow(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    track: row.track,
    role: row.role,
    dailyQuota: row.daily_quota,
    streakCount: row.streak_count,
    streakLongest: row.streak_longest,
    streakLastActive: row.streak_last_active,
    aiProvider: row.ai_provider,
    aiKeyCiphertext: row.ai_key_ciphertext,
    aiKeyIv: row.ai_key_iv,
    headline: row.headline,
    yearsExperience: row.years_experience,
    bio: row.bio,
    timezone: row.timezone,
  };
}

function userPayload(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    track: user.track,
    role: user.role,
    dailyQuota: user.dailyQuota,
    streak: { count: user.streakCount || 0, longest: user.streakLongest || 0, lastActiveDate: user.streakLastActive || null },
    aiProvider: user.aiProvider || "workers-ai",
    hasAiKey: !!user.aiKeyCiphertext,
    headline: user.headline || "",
    yearsExperience: typeof user.yearsExperience === "number" ? user.yearsExperience : null,
    bio: user.bio || "",
    timezone: user.timezone || "UTC",
  };
}

function clampQuota(n) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v)) return 10;
  return Math.min(50, Math.max(5, v));
}

// Everything keyed by "today" (the daily quota ledger, the daily test set,
// AI usage caps) should reset at the user's own midnight, not an arbitrary
// UTC one — defaults to UTC only if the stored timezone is missing/invalid.
function todayDateStr(timezone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const VALID_TIMEZONE_FALLBACK = "UTC";
function normalizeTimezone(tz) {
  if (!tz || typeof tz !== "string") return VALID_TIMEZONE_FALLBACK;
  try {
    Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz.slice(0, 60);
  } catch {
    return VALID_TIMEZONE_FALLBACK;
  }
}

const EXTRA_BATCH = 5;

function defaultState() {
  return {
    version: 2,
    topics: {},
    streak: { count: 0, longest: 0, lastActiveDate: null },
    questionStats: {},
  };
}

async function handleSignup(request, env) {
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

  if (!name) return json({ error: "Please enter your name." }, { status: 400 });
  if (!isValidEmail(email)) return json({ error: "Please enter a valid email." }, { status: 400 });
  if (password.length < 8) return json({ error: "Password must be at least 8 characters." }, { status: 400 });

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

  // Every account starts subscribed to all official (non-user-owned) sets —
  // that's the shared HR/behavioral etc. curriculum everyone gets by default.
  const officialSets = await env.DB.prepare("SELECT id FROM question_sets WHERE owner_user_id IS NULL").all();
  const subs = (officialSets.results || []).map((s) =>
    env.DB.prepare(
      "INSERT INTO user_question_sets (user_id, set_id, subscribed_at) VALUES (?, ?, ?) ON CONFLICT(user_id, set_id) DO NOTHING",
    ).bind(id, s.id, now),
  );
  if (subs.length) await env.DB.batch(subs);

  return startSession(
    env,
    id,
    userPayload({
      id, email, name, createdAt: now, track, role: "user", dailyQuota,
      streakCount: 0, streakLongest: 0, streakLastActive: null,
      aiProvider: null, aiKeyCiphertext: null, aiKeyIv: null,
      headline, yearsExperience: null, bio: null, timezone,
    }),
  );
}

async function handleLogin(request, env) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.body;
  const email = (body.email || "").toString().trim().toLowerCase();
  const password = (body.password || "").toString();

  const user = await env.DB.prepare(
    `SELECT id, email, name, password_hash, salt, created_at, track, role, daily_quota,
            streak_count, streak_longest, streak_last_active,
            ai_provider, ai_key_ciphertext, ai_key_iv, headline, years_experience, bio, timezone
     FROM users WHERE email = ?`,
  )
    .bind(email)
    .first();

  if (!user) return json({ error: "Incorrect email or password." }, { status: 401 });

  const computed = await hashPassword(password, user.salt);
  if (computed !== user.password_hash) {
    return json({ error: "Incorrect email or password." }, { status: 401 });
  }

  return startSession(env, user.id, userPayload(mapUserRow(user)));
}

async function startSession(env, userId, sessionUser) {
  const token = randomHex(32);
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(token, userId, new Date(now).toISOString(), expiresAt)
    .run();

  return json(
    { user: sessionUser },
    {
      status: 200,
      headers: { "Set-Cookie": sessionCookieHeader(token, SESSION_TTL_MS / 1000) },
    },
  );
}

async function handleLogout(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (token) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
  }
  return json({ ok: true }, { headers: { "Set-Cookie": clearCookieHeader() } });
}

// ---------- password reset / change ----------

async function handleForgotPassword(request, env) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const email = (parsed.body.email || "").toString().trim().toLowerCase();

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
  // No email provider is wired up yet (see README) — log the link so it can
  // be picked up from `wrangler dev` output locally or `wrangler tail` in
  // production. Swap this for a real provider call before sharing widely.
  console.log(`[password reset] ${email} -> ${resetLink} (expires in 30 min)`);

  return genericResponse;
}

async function handleResetPassword(request, env) {
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

async function handleChangePassword(request, env, user) {
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
  return startSession(env, user.id, userPayload(user));
}

async function handleRevokeAllSessions(request, env, user) {
  await env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id).run();
  return json({ ok: true }, { headers: { "Set-Cookie": clearCookieHeader() } });
}

async function handleUpdateAccount(request, env, user) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const name = (parsed.body.name || "").toString().trim();
  if (!name) return json({ error: "Please enter your name." }, { status: 400 });

  await env.DB.prepare("UPDATE users SET name = ? WHERE id = ?").bind(name, user.id).run();
  return json({ user: userPayload({ ...user, name }) });
}

const AI_PROVIDERS = ["workers-ai", "openai", "anthropic"];

async function handleUpdateProfile(request, env, user) {
  const parsed = await readJsonBody(request, 4000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.body;
  const track = body.track !== undefined ? (body.track ? String(body.track).trim().slice(0, 120) : null) : user.track;
  const dailyQuota = body.dailyQuota !== undefined ? clampQuota(body.dailyQuota) : user.dailyQuota;
  const headline = body.headline !== undefined ? (body.headline ? String(body.headline).trim().slice(0, 140) : null) : user.headline;
  const bio = body.bio !== undefined ? (body.bio ? String(body.bio).trim().slice(0, 600) : null) : user.bio;
  const yearsExperience =
    body.yearsExperience !== undefined
      ? (body.yearsExperience === null || body.yearsExperience === "" ? null : Math.max(0, Math.min(60, parseInt(body.yearsExperience, 10) || 0)))
      : user.yearsExperience;
  const timezone = body.timezone !== undefined ? normalizeTimezone(body.timezone) : user.timezone;

  let aiProvider = user.aiProvider;
  let aiKeyCiphertext = user.aiKeyCiphertext;
  let aiKeyIv = user.aiKeyIv;

  if (body.aiApiKey === "") {
    // Explicit clear: drop back to the shared Workers AI default.
    aiProvider = null;
    aiKeyCiphertext = null;
    aiKeyIv = null;
  } else if (typeof body.aiApiKey === "string" && body.aiApiKey.trim()) {
    const provider = AI_PROVIDERS.includes(body.aiProvider) ? body.aiProvider : "openai";
    if (provider === "workers-ai") {
      return json({ error: "Workers AI doesn't need an API key — clear the key field instead." }, { status: 400 });
    }
    const enc = await encryptSecret(env, body.aiApiKey.trim());
    aiProvider = provider;
    aiKeyCiphertext = enc.ciphertext;
    aiKeyIv = enc.iv;
  } else if (body.aiProvider === "workers-ai") {
    aiProvider = null;
    aiKeyCiphertext = null;
    aiKeyIv = null;
  }

  await env.DB.prepare(
    `UPDATE users SET track = ?, daily_quota = ?, ai_provider = ?, ai_key_ciphertext = ?, ai_key_iv = ?,
            headline = ?, bio = ?, years_experience = ?, timezone = ? WHERE id = ?`,
  )
    .bind(track, dailyQuota, aiProvider, aiKeyCiphertext, aiKeyIv, headline, bio, yearsExperience, timezone, user.id)
    .run();

  return json({
    user: userPayload({
      ...user, track, dailyQuota, aiProvider, aiKeyCiphertext, aiKeyIv, headline, bio, yearsExperience, timezone,
    }),
  });
}

// ---------- progress state ----------

async function handleGetState(request, env, user) {
  const row = await env.DB.prepare("SELECT state_json FROM user_state WHERE user_id = ?")
    .bind(user.id)
    .first();
  if (!row) return json({ state: defaultState() });
  try {
    return json({ state: JSON.parse(row.state_json) });
  } catch {
    return json({ state: defaultState() });
  }
}

async function handlePutState(request, env, user) {
  const parsed = await readJsonBody(request, 260000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.body;
  const state = body && body.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return json({ error: "State must be a JSON object." }, { status: 400 });
  }
  const serialized = JSON.stringify(state);
  if (serialized.length > 200000) {
    return json({ error: "State too large." }, { status: 413 });
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
  )
    .bind(user.id, serialized, now)
    .run();

  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  if (events.length) {
    const stmts = events.map((e) =>
      env.DB.prepare(
        "INSERT INTO activity_log (user_id, occurred_at, event_type, topic_id, question_id, result) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(
        user.id,
        typeof e.occurred_at === "string" && e.occurred_at ? e.occurred_at : now,
        String(e.event_type || "").slice(0, 32),
        e.topic_id ? String(e.topic_id).slice(0, 64) : null,
        e.question_id ? String(e.question_id).slice(0, 64) : null,
        e.result ? String(e.result).slice(0, 32) : null,
      ),
    );
    await env.DB.batch(stmts);
  }

  return json({ ok: true, updated_at: now });
}

async function handleGetActivity(request, env, user) {
  const url = new URL(request.url);
  const limit = Math.min(2000, Math.max(1, parseInt(url.searchParams.get("limit") || "1000", 10) || 1000));
  // Left-joined so old, pre-relational activity rows (question_id referring
  // to a question that may since have been removed) still come back.
  const rows = await env.DB.prepare(
    `SELECT a.occurred_at as occurred_at, a.event_type as event_type, a.topic_id as topic_id,
            a.question_id as question_id, a.result as result, q.q as question_text
     FROM activity_log a
     LEFT JOIN questions q ON q.id = a.question_id
     WHERE a.user_id = ? ORDER BY a.occurred_at DESC LIMIT ?`,
  )
    .bind(user.id, limit)
    .all();
  return json({ events: rows.results || [] });
}

async function handleExportProgress(request, env, user) {
  const rows = await env.DB.prepare(
    "SELECT question_id, status, first_shown_at, last_shown_at, last_result, times_shown, correct_streak FROM user_question_progress WHERE user_id = ?",
  )
    .bind(user.id)
    .all();
  return json({
    exportedAt: new Date().toISOString(),
    user: { name: user.name, email: user.email, track: user.track, dailyQuota: user.dailyQuota },
    streak: { count: user.streakCount || 0, longest: user.streakLongest || 0, lastActiveDate: user.streakLastActive },
    progress: rows.results || [],
  });
}

// ---------- daily queue / quota-carryover engine ----------
// See DEVELOPMENT.md "Locked decisions" for the carry-over rule this
// implements: the daily target stays flat at the user's quota; unfinished
// questions from a prior day get priority in today's queue, capped at 1x
// the daily quota worth of backlog per day.

async function getOrCreateTodayLedger(env, userId, dailyQuota, today) {
  await env.DB.prepare(
    `INSERT INTO daily_quota_ledger (user_id, date, base_quota, extra_requested, completed)
     VALUES (?, ?, ?, 0, 0) ON CONFLICT(user_id, date) DO NOTHING`,
  )
    .bind(userId, today, dailyQuota)
    .run();
  return env.DB.prepare("SELECT * FROM daily_quota_ledger WHERE user_id = ? AND date = ?")
    .bind(userId, today)
    .first();
}

async function ensureTodayQueueFilled(env, user, today) {
  const ledger = await getOrCreateTodayLedger(env, user.id, user.dailyQuota, today);
  const target = ledger.base_quota + ledger.extra_requested;

  const alreadyQueuedRow = await env.DB.prepare(
    "SELECT COUNT(*) as n FROM user_question_progress WHERE user_id = ? AND queued_for_date = ? AND status != 'done'",
  )
    .bind(user.id, today)
    .first();
  const alreadyQueued = (alreadyQueuedRow && alreadyQueuedRow.n) || 0;

  const needed = target - ledger.completed - alreadyQueued;
  if (needed <= 0) return ledger;

  const carryCap = user.dailyQuota;
  const priorityLimit = Math.min(needed, carryCap);
  const priorityRows = await env.DB.prepare(
    `SELECT question_id FROM user_question_progress
     WHERE user_id = ? AND status != 'done' AND queued_for_date IS NOT NULL AND queued_for_date < ?
     ORDER BY queued_for_date ASC LIMIT ?`,
  )
    .bind(user.id, today, priorityLimit)
    .all();
  const priorityIds = (priorityRows.results || []).map((r) => r.question_id);

  const fillCount = needed - priorityIds.length;
  let freshIds = [];
  if (fillCount > 0) {
    const freshRows = await env.DB.prepare(
      `SELECT q.id as id FROM questions q
       JOIN user_question_sets uqs ON uqs.set_id = q.set_id AND uqs.user_id = ?
       LEFT JOIN user_question_progress p ON p.user_id = ? AND p.question_id = q.id
       WHERE p.question_id IS NULL
       ORDER BY q.topic_order ASC, q.sort_order ASC LIMIT ?`,
    )
      .bind(user.id, user.id, fillCount)
      .all();
    freshIds = (freshRows.results || []).map((r) => r.id);
  }

  const allIds = priorityIds.concat(freshIds);
  if (allIds.length) {
    const stmts = allIds.map((qid) =>
      env.DB.prepare(
        `INSERT INTO user_question_progress (user_id, question_id, status, queued_for_date, times_shown, correct_streak)
         VALUES (?, ?, 'queued', ?, 0, 0)
         ON CONFLICT(user_id, question_id) DO UPDATE SET queued_for_date = excluded.queued_for_date
         WHERE user_question_progress.status != 'done'`,
      ).bind(user.id, qid, today),
    );
    await env.DB.batch(stmts);
  }
  return ledger;
}

async function getTodayQueueQuestions(env, user, today) {
  const rows = await env.DB.prepare(
    `SELECT q.id as id, q.q as q, q.a as a, q.topic_label as topic_label, q.set_id as set_id
     FROM user_question_progress p
     JOIN questions q ON q.id = p.question_id
     WHERE p.user_id = ? AND p.queued_for_date = ? AND p.status != 'done'
     ORDER BY q.topic_order ASC, q.sort_order ASC`,
  )
    .bind(user.id, today)
    .all();
  return rows.results || [];
}

async function handleGetTodayQueue(request, env, user) {
  const today = todayDateStr(user.timezone);
  await ensureTodayQueueFilled(env, user, today);
  const ledger = await getOrCreateTodayLedger(env, user.id, user.dailyQuota, today);
  const questions = await getTodayQueueQuestions(env, user, today);
  const target = ledger.base_quota + ledger.extra_requested;
  return json({
    date: today,
    target,
    completed: ledger.completed,
    remaining: Math.max(0, target - ledger.completed),
    questions,
  });
}

async function handleCompleteQuestion(request, env, user) {
  const parsed = await readJsonBody(request, 2000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const questionId = (parsed.body.question_id || "").toString();
  if (!questionId) return json({ error: "Missing question_id." }, { status: 400 });

  const today = todayDateStr(user.timezone);
  const now = new Date().toISOString();
  await getOrCreateTodayLedger(env, user.id, user.dailyQuota, today);

  const existing = await env.DB.prepare("SELECT status FROM user_question_progress WHERE user_id = ? AND question_id = ?")
    .bind(user.id, questionId)
    .first();
  const wasAlreadyDone = !!(existing && existing.status === "done");

  await env.DB.prepare(
    `INSERT INTO user_question_progress (user_id, question_id, status, queued_for_date, first_shown_at, last_shown_at, times_shown, correct_streak)
     VALUES (?, ?, 'done', ?, ?, ?, 1, 0)
     ON CONFLICT(user_id, question_id) DO UPDATE SET
       status = 'done',
       first_shown_at = COALESCE(user_question_progress.first_shown_at, excluded.first_shown_at),
       last_shown_at = excluded.last_shown_at,
       times_shown = user_question_progress.times_shown + 1`,
  )
    .bind(user.id, questionId, today, now, now)
    .run();

  if (!wasAlreadyDone) {
    await env.DB.prepare("UPDATE daily_quota_ledger SET completed = completed + 1 WHERE user_id = ? AND date = ?")
      .bind(user.id, today)
      .run();

    // Streak bump — same "consecutive calendar day" rule as before, now
    // stored directly on the user row instead of inside a JSON blob.
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (user.streakLastActive !== today) {
      const newCount = user.streakLastActive === y ? (user.streakCount || 0) + 1 : 1;
      const newLongest = Math.max(user.streakLongest || 0, newCount);
      await env.DB.prepare("UPDATE users SET streak_count = ?, streak_longest = ?, streak_last_active = ? WHERE id = ?")
        .bind(newCount, newLongest, today, user.id)
        .run();
    }
  }

  const topicRow = await env.DB.prepare("SELECT topic_label FROM questions WHERE id = ?").bind(questionId).first();
  await env.DB.prepare(
    "INSERT INTO activity_log (user_id, occurred_at, event_type, topic_id, question_id, result) VALUES (?, ?, 'reveal', ?, ?, NULL)",
  )
    .bind(user.id, now, topicRow ? topicRow.topic_label : null, questionId)
    .run();

  return json({ ok: true });
}

async function handleRequestMore(request, env, user) {
  const today = todayDateStr(user.timezone);
  const ledger = await getOrCreateTodayLedger(env, user.id, user.dailyQuota, today);
  const target = ledger.base_quota + ledger.extra_requested;
  if (ledger.completed < target) {
    return json({ error: "You still have questions left in today's queue." }, { status: 400 });
  }

  await env.DB.prepare("UPDATE daily_quota_ledger SET extra_requested = extra_requested + ? WHERE user_id = ? AND date = ?")
    .bind(EXTRA_BATCH, user.id, today)
    .run();

  await ensureTodayQueueFilled(env, user, today);
  const questions = await getTodayQueueQuestions(env, user, today);
  return json({ questions });
}

async function handleReviewResult(request, env, user) {
  const parsed = await readJsonBody(request, 2000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const questionId = (parsed.body.question_id || "").toString();
  const result = (parsed.body.result || "").toString();
  if (!questionId || (result !== "got_it" && result !== "again")) {
    return json({ error: "Invalid review result." }, { status: 400 });
  }

  const now = new Date().toISOString();
  const existing = await env.DB.prepare("SELECT correct_streak FROM user_question_progress WHERE user_id = ? AND question_id = ?")
    .bind(user.id, questionId)
    .first();
  const newStreak = result === "got_it" ? ((existing && existing.correct_streak) || 0) + 1 : 0;

  await env.DB.prepare(
    `UPDATE user_question_progress SET last_result = ?, correct_streak = ?, times_shown = times_shown + 1, last_shown_at = ?
     WHERE user_id = ? AND question_id = ?`,
  )
    .bind(result, newStreak, now, user.id, questionId)
    .run();

  const topicRow = await env.DB.prepare("SELECT topic_label FROM questions WHERE id = ?").bind(questionId).first();
  await env.DB.prepare(
    "INSERT INTO activity_log (user_id, occurred_at, event_type, topic_id, question_id, result) VALUES (?, ?, 'review', ?, ?, ?)",
  )
    .bind(user.id, now, topicRow ? topicRow.topic_label : null, questionId, result)
    .run();

  return json({ ok: true });
}

async function handleGetReview(request, env, user) {
  const url = new URL(request.url);
  const count = Math.min(20, Math.max(1, parseInt(url.searchParams.get("count") || "15", 10) || 15));

  const rows = await env.DB.prepare(
    `SELECT p.question_id as id, q.q as q, q.a as a, q.topic_label as topic_label,
            p.last_result as last_result, p.correct_streak as correct_streak, p.times_shown as times_shown
     FROM user_question_progress p
     JOIN questions q ON q.id = p.question_id
     WHERE p.user_id = ? AND p.status = 'done'`,
  )
    .bind(user.id)
    .all();

  const pool = rows.results || [];
  if (pool.length === 0) return json({ questions: [] });

  const weighted = pool.map((item) => {
    let w = 1;
    if (!item.times_shown) w = 1.6;
    else if (item.last_result === "again") w = 3;
    else w = Math.max(0.35, 1 - (item.correct_streak || 0) * 0.15);
    return { item, w };
  });

  const chosen = [];
  const n = Math.min(count, weighted.length);
  for (let i = 0; i < n; i++) {
    const totalW = weighted.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * totalW;
    let idx = 0;
    for (; idx < weighted.length; idx++) {
      r -= weighted[idx].w;
      if (r <= 0) break;
    }
    idx = Math.min(idx, weighted.length - 1);
    chosen.push(weighted[idx].item);
    weighted.splice(idx, 1);
  }
  return json({ questions: chosen });
}

// ---------- user-submitted question sets ----------

async function handleCreateQuestionSet(request, env, user) {
  // Raised from 80000 so a CSV-imported set (client-parsed into this same
  // JSON shape) with a few hundred rows still fits.
  const parsed = await readJsonBody(request, 300000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.body;
  const title = (body.title || "").toString().trim();
  const track = body.track ? String(body.track).trim().slice(0, 120) : null;
  const sections = Array.isArray(body.sections) ? body.sections : [];

  if (!title) return json({ error: "Please enter a title for your question set." }, { status: 400 });
  if (sections.length === 0) return json({ error: "Add at least one section." }, { status: 400 });

  for (const section of sections) {
    const label = ((section && section.label) || "").toString().trim();
    const questions = Array.isArray(section && section.questions) ? section.questions : [];
    if (!label) return json({ error: "Every section needs a label." }, { status: 400 });
    if (questions.length === 0) return json({ error: `Section "${label}" needs at least one question.` }, { status: 400 });
    for (const q of questions) {
      if (!q || !String(q.q || "").trim() || !String(q.a || "").trim()) {
        return json({ error: `Every question in "${label}" needs both a question and an answer.` }, { status: 400 });
      }
    }
  }

  const setId = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO question_sets (id, owner_user_id, title, track, visibility, created_at) VALUES (?, ?, ?, ?, 'private', ?)",
  )
    .bind(setId, user.id, title, track, now)
    .run();

  const stmts = [];
  sections.forEach((section, topicOrder) => {
    const label = String(section.label).trim();
    section.questions.forEach((q, sortOrder) => {
      stmts.push(
        env.DB.prepare(
          "INSERT INTO questions (id, set_id, topic_label, topic_order, sort_order, q, a, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(crypto.randomUUID(), setId, label, topicOrder, sortOrder, String(q.q).trim(), String(q.a).trim(), now),
      );
    });
  });
  stmts.push(
    env.DB.prepare(
      "INSERT INTO user_question_sets (user_id, set_id, subscribed_at) VALUES (?, ?, ?) ON CONFLICT(user_id, set_id) DO NOTHING",
    ).bind(user.id, setId, now),
  );
  await env.DB.batch(stmts);

  return json({ set: { id: setId, title, track, visibility: "private" } });
}

async function handleListMySets(request, env, user) {
  const rows = await env.DB.prepare(
    "SELECT id, title, track, visibility, created_at, rejected_reason FROM question_sets WHERE owner_user_id = ? ORDER BY created_at DESC",
  )
    .bind(user.id)
    .all();
  return json({ sets: rows.results || [] });
}

async function handleSubmitSet(request, env, user, setId) {
  const row = await env.DB.prepare("SELECT owner_user_id, visibility FROM question_sets WHERE id = ?")
    .bind(setId)
    .first();
  if (!row || row.owner_user_id !== user.id) return json({ error: "Question set not found." }, { status: 404 });
  if (row.visibility !== "private" && row.visibility !== "rejected") {
    return json({ error: "Only a private or rejected set can be submitted for review." }, { status: 400 });
  }
  await env.DB.prepare("UPDATE question_sets SET visibility = 'pending', rejected_reason = NULL WHERE id = ?")
    .bind(setId)
    .run();
  return json({ ok: true });
}

async function handleSubscribeSet(request, env, user, setId) {
  const row = await env.DB.prepare("SELECT visibility FROM question_sets WHERE id = ?").bind(setId).first();
  if (!row || row.visibility !== "shared") {
    return json({ error: "This question set isn't available to subscribe to." }, { status: 400 });
  }
  await env.DB.prepare(
    "INSERT INTO user_question_sets (user_id, set_id, subscribed_at) VALUES (?, ?, ?) ON CONFLICT(user_id, set_id) DO NOTHING",
  )
    .bind(user.id, setId, new Date().toISOString())
    .run();
  return json({ ok: true });
}

async function handleListSuggestions(request, env, user) {
  // Shared, user-submitted sets (not the official ones, which everyone is
  // already auto-subscribed to) that this user hasn't picked up yet — sets
  // matching the user's own track are surfaced first.
  const rows = await env.DB.prepare(
    `SELECT qs.id as id, qs.title as title, qs.track as track, u.name as owner_name
     FROM question_sets qs
     LEFT JOIN users u ON u.id = qs.owner_user_id
     WHERE qs.visibility = 'shared' AND qs.owner_user_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM user_question_sets WHERE user_id = ? AND set_id = qs.id)
     ORDER BY (qs.track IS NOT NULL AND qs.track = ?) DESC, qs.created_at DESC`,
  )
    .bind(user.id, user.track || "")
    .all();
  return json({ sets: rows.results || [] });
}

// ---------- admin: question-set approval queue ----------

async function handleAdminPendingSets(request, env, user) {
  const rows = await env.DB.prepare(
    `SELECT qs.id as id, qs.title as title, qs.track as track, qs.created_at as created_at,
            u.name as owner_name, u.email as owner_email,
            (SELECT COUNT(*) FROM questions WHERE set_id = qs.id) as question_count
     FROM question_sets qs LEFT JOIN users u ON u.id = qs.owner_user_id
     WHERE qs.visibility = 'pending' ORDER BY qs.created_at ASC`,
  ).all();
  return json({ sets: rows.results || [] });
}

async function handleApproveSet(request, env, user, setId) {
  const row = await env.DB.prepare("SELECT visibility FROM question_sets WHERE id = ?").bind(setId).first();
  if (!row || row.visibility !== "pending") return json({ error: "This set isn't pending review." }, { status: 400 });
  await env.DB.prepare(
    "UPDATE question_sets SET visibility = 'shared', approved_at = ?, approved_by = ?, rejected_reason = NULL WHERE id = ?",
  )
    .bind(new Date().toISOString(), user.id, setId)
    .run();
  return json({ ok: true });
}

async function handleRejectSet(request, env, user, setId) {
  const parsed = await readJsonBody(request, 2000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const reason = (parsed.body.reason || "").toString().trim().slice(0, 300) || "No reason given.";
  const row = await env.DB.prepare("SELECT visibility FROM question_sets WHERE id = ?").bind(setId).first();
  if (!row || row.visibility !== "pending") return json({ error: "This set isn't pending review." }, { status: 400 });
  await env.DB.prepare("UPDATE question_sets SET visibility = 'rejected', rejected_reason = ? WHERE id = ?")
    .bind(reason, setId)
    .run();
  return json({ ok: true });
}

// ---------- AI: MCQ generation (once per question, cached forever) ----------

const TEST_SIZE = 10;
// @cf/meta/llama-3.1-8b-instruct (without -fp8) is deprecated as of 2026-05-30 —
// verified live against this account's catalog via `wrangler ai models`.
const WORKERS_AI_MODEL = "@cf/meta/llama-3.1-8b-instruct-fp8";

function buildMcqPrompt(question, answer) {
  return `You are creating a multiple-choice quiz question from an interview question and its model answer.

Question: ${question}

Model answer: ${answer}

Produce a JSON object with exactly this shape, and nothing else — no markdown fences, no commentary:
{"options": ["...", "...", "...", "..."], "correct_index": 0}

Rules:
- Exactly 4 short options (one sentence each, plain text).
- Exactly one option must be a faithful short paraphrase of the model answer's core point.
- The other three must be plausible but incorrect for this specific question.
- "correct_index" is the 0-based index of the correct option in "options".`;
}

function parseMcqJson(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(obj.options) || obj.options.length !== 4) return null;
    if (!Number.isInteger(obj.correct_index) || obj.correct_index < 0 || obj.correct_index > 3) return null;
    return { options: obj.options.map((o) => String(o).slice(0, 300)), correctIndex: obj.correct_index };
  } catch {
    return null;
  }
}

// Used only if the model call fails or returns something unparsable, so the
// daily test never hard-breaks on an AI hiccup — just degrades in quality.
function fallbackMcq(answer) {
  const correct = String(answer).slice(0, 160);
  return {
    options: [
      correct,
      "An unrelated approach that doesn't address the question.",
      "The opposite of the recommended approach.",
      "None of the above.",
    ],
    correctIndex: 0,
  };
}

async function callWorkersAi(env, prompt) {
  const result = await env.AI.run(WORKERS_AI_MODEL, {
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
  });
  return result && result.response;
}

async function callOpenAi(apiKey, prompt) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status})`);
  const data = await res.json();
  return data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
}

async function callAnthropic(apiKey, prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 400,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic request failed (${res.status})`);
  const data = await res.json();
  return data.content && data.content[0] && data.content[0].text;
}

// ---------- AI usage capping ----------
// The shared Workers AI free tier is one pool for the whole account, so
// one user completing hundreds of brand-new questions in a day could
// eat everyone else's quota. BYOK users pay for (and are limited by)
// their own key, so the cap only applies when using the shared default.
const FREE_AI_DAILY_CAP = 20;

function usesByok(user) {
  return !!(user.aiProvider && user.aiProvider !== "workers-ai" && user.aiKeyCiphertext);
}

// Atomically increments today's usage counter iff it's under the cap —
// the conditional UPDATE either changes a row or it doesn't, so this is
// race-safe under concurrent requests (unlike a read-then-write check).
async function checkAndIncrementAiUsage(env, userId, today) {
  await env.DB.prepare("INSERT INTO ai_usage (user_id, date, count) VALUES (?, ?, 0) ON CONFLICT(user_id, date) DO NOTHING")
    .bind(userId, today)
    .run();
  const result = await env.DB.prepare("UPDATE ai_usage SET count = count + 1 WHERE user_id = ? AND date = ? AND count < ?")
    .bind(userId, today, FREE_AI_DAILY_CAP)
    .run();
  const allowed = !!(result.meta && result.meta.changes > 0);
  const row = await env.DB.prepare("SELECT count FROM ai_usage WHERE user_id = ? AND date = ?").bind(userId, today).first();
  return { allowed, used: (row && row.count) || 0, cap: FREE_AI_DAILY_CAP };
}

async function handleGetAiUsage(request, env, user) {
  if (usesByok(user)) return json({ unlimited: true, used: 0, cap: null });
  const today = todayDateStr(user.timezone);
  const row = await env.DB.prepare("SELECT count FROM ai_usage WHERE user_id = ? AND date = ?").bind(user.id, today).first();
  return json({ unlimited: false, used: (row && row.count) || 0, cap: FREE_AI_DAILY_CAP });
}

// Calls whichever provider the user is configured for. When using the
// shared Workers AI default, this first spends one unit of the daily
// cap — if the cap is already used up, returns null without calling
// anything (the caller falls back to a generic response and, for
// cacheable results, must NOT persist that fallback permanently).
async function callConfiguredAi(env, user, prompt, label) {
  if (usesByok(user)) {
    try {
      const apiKey = await decryptSecret(env, user.aiKeyCiphertext, user.aiKeyIv);
      const raw = user.aiProvider === "anthropic" ? await callAnthropic(apiKey, prompt) : await callOpenAi(apiKey, prompt);
      return { raw, generatedBy: user.aiProvider, capped: false };
    } catch (err) {
      console.error(`[${label}] provider=${user.aiProvider} error=${err && err.message ? err.message : err}`);
      return { raw: null, generatedBy: user.aiProvider, capped: false };
    }
  }

  const usage = await checkAndIncrementAiUsage(env, user.id, todayDateStr(user.timezone));
  if (!usage.allowed) {
    return { raw: null, generatedBy: "workers-ai", capped: true };
  }
  try {
    const raw = await callWorkersAi(env, prompt);
    return { raw, generatedBy: "workers-ai", capped: false };
  } catch (err) {
    console.error(`[${label}] provider=workers-ai error=${err && err.message ? err.message : err}`);
    return { raw: null, generatedBy: "workers-ai", capped: false };
  }
}

async function generateMcq(env, user, question, answer) {
  const prompt = buildMcqPrompt(question, answer);
  const { raw, generatedBy, capped } = await callConfiguredAi(env, user, prompt, "mcq generation");
  return { ...(parseMcqJson(raw) || fallbackMcq(answer)), generatedBy, ephemeral: capped };
}

async function getOrCreateMcqVariant(env, user, question) {
  const existing = await env.DB.prepare("SELECT options_json, correct_index FROM mcq_variants WHERE question_id = ?")
    .bind(question.id)
    .first();
  if (existing) return { options: JSON.parse(existing.options_json), correctIndex: existing.correct_index };

  const generated = await generateMcq(env, user, question.q, question.a);
  if (generated.ephemeral) {
    // Rate-limited, not a real (if low-quality) AI answer — don't cache
    // this permanently, so a later, uncapped request can generate it
    // properly instead of every future user being stuck with a filler.
    return { options: generated.options, correctIndex: generated.correctIndex };
  }

  await env.DB.prepare(
    "INSERT INTO mcq_variants (question_id, options_json, correct_index, generated_by, generated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(question_id) DO NOTHING",
  )
    .bind(question.id, JSON.stringify(generated.options), generated.correctIndex, generated.generatedBy, new Date().toISOString())
    .run();

  // Re-read so a concurrent generation race converges on one canonical variant.
  const row = await env.DB.prepare("SELECT options_json, correct_index FROM mcq_variants WHERE question_id = ?")
    .bind(question.id)
    .first();
  return { options: JSON.parse(row.options_json), correctIndex: row.correct_index };
}

// ---------- AI: personalized Stats insight (cached once per user/day) ----------

async function handleGetStatsInsight(request, env, user) {
  const today = todayDateStr(user.timezone);
  const cached = await env.DB.prepare("SELECT insight, generated_by FROM ai_stats_insights WHERE user_id = ? AND date = ?")
    .bind(user.id, today)
    .first();
  if (cached) return json({ insight: cached.insight, generatedBy: cached.generated_by, cached: true });

  const rows = await env.DB.prepare(
    `SELECT topic_id, result FROM activity_log
     WHERE user_id = ? AND event_type = 'review' AND result IS NOT NULL
     ORDER BY occurred_at DESC LIMIT 300`,
  )
    .bind(user.id)
    .all();
  const events = rows.results || [];

  if (events.length < 3) {
    return json({
      insight: "Not enough review history yet for a personalized insight — keep completing daily reviews and check back.",
      generatedBy: null,
      cached: false,
    });
  }

  const topicAgg = {};
  events.forEach((e) => {
    if (!e.topic_id) return;
    topicAgg[e.topic_id] = topicAgg[e.topic_id] || { total: 0, again: 0 };
    topicAgg[e.topic_id].total++;
    if (e.result === "again") topicAgg[e.topic_id].again++;
  });
  const weakTopics = Object.entries(topicAgg)
    .map(([label, v]) => ({ label, rate: v.again / v.total, total: v.total }))
    .filter((x) => x.total >= 2)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 3);

  const profileBits = [
    user.track ? `preparing for: ${user.track}` : null,
    user.headline ? `current role: ${user.headline}` : null,
    typeof user.yearsExperience === "number" ? `${user.yearsExperience} years of experience` : null,
    user.bio ? `background: ${user.bio}` : null,
  ].filter(Boolean);

  const summary = `${profileBits.length ? profileBits.join("; ") + ". " : ""}Current streak: ${user.streakCount || 0} days (longest ${user.streakLongest || 0}). Graded reviews so far: ${events.length}. Weakest topics: ${
    weakTopics.length
      ? weakTopics.map((t) => `${t.label} (marked "review again" on ${Math.round(t.rate * 100)}% of ${t.total} attempts)`).join("; ")
      : "none stand out yet"
  }.`;
  const prompt = `You are a supportive interview-prep coach. Based on this user's profile and stats, write a short, specific, encouraging insight (2-3 sentences, plain text, no markdown) and one concrete suggestion for what to focus on next — tailor it to their stated role/experience/goal when given.\n\nProfile & stats: ${summary}`;

  const { raw, generatedBy, capped } = await callConfiguredAi(env, user, prompt, "stats insight");
  if (capped) {
    return json({
      insight: null,
      limited: true,
      cap: FREE_AI_DAILY_CAP,
      message: "You've used today's free AI insight/test-generation allowance — try again tomorrow, or set your own AI key in Settings for unlimited use.",
    });
  }

  const insight = (raw && raw.trim().slice(0, 600)) || "Keep at it — steady daily review is what moves the needle most, and there isn't a clear weak spot yet to call out.";
  await env.DB.prepare(
    `INSERT INTO ai_stats_insights (user_id, date, insight, generated_by, generated_at) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(user_id, date) DO UPDATE SET insight = excluded.insight, generated_by = excluded.generated_by, generated_at = excluded.generated_at`,
  )
    .bind(user.id, today, insight, generatedBy, new Date().toISOString())
    .run();

  return json({ insight, generatedBy, cached: false });
}

// ---------- daily multiple-choice test ----------

async function handleGetTodayTest(request, env, user) {
  const today = todayDateStr(user.timezone);
  const testQuery = `SELECT t.question_id as id, t.selected_index as selected_index, t.correct as correct,
            q.q as q, q.a as a, q.topic_label as topic_label
     FROM daily_test_results t JOIN questions q ON q.id = t.question_id
     WHERE t.user_id = ? AND t.date = ? ORDER BY t.id ASC`;

  let testRows = ((await env.DB.prepare(testQuery).bind(user.id, today).all()).results) || [];

  if (testRows.length === 0) {
    const pool = await env.DB.prepare(
      `SELECT q.id as id FROM user_question_progress p JOIN questions q ON q.id = p.question_id
       WHERE p.user_id = ? AND p.status = 'done' ORDER BY RANDOM() LIMIT ?`,
    )
      .bind(user.id, TEST_SIZE)
      .all();
    const ids = (pool.results || []).map((r) => r.id);
    if (ids.length) {
      const now = new Date().toISOString();
      const stmts = ids.map((qid) =>
        env.DB.prepare(
          "INSERT INTO daily_test_results (user_id, date, question_id, selected_index, correct, answered_at) VALUES (?, ?, ?, NULL, 0, ?) ON CONFLICT(user_id, date, question_id) DO NOTHING",
        ).bind(user.id, today, qid, now),
      );
      await env.DB.batch(stmts);
      testRows = ((await env.DB.prepare(testQuery).bind(user.id, today).all()).results) || [];
    }
  }

  const questions = [];
  for (const row of testRows) {
    const variant = await getOrCreateMcqVariant(env, user, { id: row.id, q: row.q, a: row.a });
    questions.push({
      id: row.id,
      q: row.q,
      topic_label: row.topic_label,
      options: variant.options,
      answered: row.selected_index !== null,
      selectedIndex: row.selected_index,
      correct: row.selected_index !== null ? !!row.correct : null,
      correctIndex: row.selected_index !== null ? variant.correctIndex : null,
    });
  }

  return json({ date: today, questions });
}

async function handleAnswerTest(request, env, user) {
  const parsed = await readJsonBody(request, 2000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const questionId = (parsed.body.question_id || "").toString();
  const selectedIndex = parseInt(parsed.body.selected_index, 10);
  if (!questionId || !Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3) {
    return json({ error: "Invalid answer." }, { status: 400 });
  }

  const variant = await env.DB.prepare("SELECT correct_index FROM mcq_variants WHERE question_id = ?")
    .bind(questionId)
    .first();
  if (!variant) return json({ error: "No test question found for this id." }, { status: 404 });

  const today = todayDateStr(user.timezone);
  const now = new Date().toISOString();
  const correct = selectedIndex === variant.correct_index ? 1 : 0;

  await env.DB.prepare(
    `INSERT INTO daily_test_results (user_id, date, question_id, selected_index, correct, answered_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, date, question_id) DO UPDATE SET selected_index = excluded.selected_index, correct = excluded.correct, answered_at = excluded.answered_at`,
  )
    .bind(user.id, today, questionId, selectedIndex, correct, now)
    .run();

  await env.DB.prepare(
    "INSERT INTO activity_log (user_id, occurred_at, event_type, topic_id, question_id, result) VALUES (?, ?, 'test_answer', NULL, ?, ?)",
  )
    .bind(user.id, now, questionId, correct ? "got_it" : "again")
    .run();

  return json({ ok: true, correct: !!correct, correctIndex: variant.correct_index });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        if (url.pathname === "/api/signup" && request.method === "POST") {
          const limited = await checkRateLimit(env, request, "signup");
          if (limited) return applySecurityHeaders(limited);
          return applySecurityHeaders(await handleSignup(request, env));
        }
        if (url.pathname === "/api/login" && request.method === "POST") {
          const limited = await checkRateLimit(env, request, "login");
          if (limited) return applySecurityHeaders(limited);
          return applySecurityHeaders(await handleLogin(request, env));
        }
        if (url.pathname === "/api/logout" && request.method === "POST") {
          return applySecurityHeaders(await handleLogout(request, env));
        }
        if (url.pathname === "/api/password/forgot" && request.method === "POST") {
          const limited = await checkRateLimit(env, request, "password-forgot");
          if (limited) return applySecurityHeaders(limited);
          return applySecurityHeaders(await handleForgotPassword(request, env));
        }
        if (url.pathname === "/api/password/reset" && request.method === "POST") {
          const limited = await checkRateLimit(env, request, "password-reset");
          if (limited) return applySecurityHeaders(limited);
          return applySecurityHeaders(await handleResetPassword(request, env));
        }

        // Everything below requires an authenticated session.
        const user = await getUserFromRequest(request, env);
        if (!user) return applySecurityHeaders(json({ error: "Not authenticated." }, { status: 401 }));

        if (url.pathname === "/api/me" && request.method === "GET") {
          return applySecurityHeaders(json({ user: userPayload(user) }));
        }
        if (url.pathname === "/api/state" && request.method === "GET") {
          return applySecurityHeaders(await handleGetState(request, env, user));
        }
        if (url.pathname === "/api/state" && request.method === "PUT") {
          return applySecurityHeaders(await handlePutState(request, env, user));
        }
        if (url.pathname === "/api/activity" && request.method === "GET") {
          return applySecurityHeaders(await handleGetActivity(request, env, user));
        }
        if (url.pathname === "/api/export/progress" && request.method === "GET") {
          return applySecurityHeaders(await handleExportProgress(request, env, user));
        }
        if (url.pathname === "/api/password/change" && request.method === "POST") {
          return applySecurityHeaders(await handleChangePassword(request, env, user));
        }
        if (url.pathname === "/api/account" && request.method === "PATCH") {
          return applySecurityHeaders(await handleUpdateAccount(request, env, user));
        }
        if (url.pathname === "/api/profile" && request.method === "PATCH") {
          return applySecurityHeaders(await handleUpdateProfile(request, env, user));
        }
        if (url.pathname === "/api/sessions/revoke-all" && request.method === "POST") {
          return applySecurityHeaders(await handleRevokeAllSessions(request, env, user));
        }
        if (url.pathname === "/api/queue/today" && request.method === "GET") {
          return applySecurityHeaders(await handleGetTodayQueue(request, env, user));
        }
        if (url.pathname === "/api/questions/complete" && request.method === "POST") {
          return applySecurityHeaders(await handleCompleteQuestion(request, env, user));
        }
        if (url.pathname === "/api/questions/request-more" && request.method === "POST") {
          return applySecurityHeaders(await handleRequestMore(request, env, user));
        }
        if (url.pathname === "/api/questions/review-result" && request.method === "POST") {
          return applySecurityHeaders(await handleReviewResult(request, env, user));
        }
        if (url.pathname === "/api/review" && request.method === "GET") {
          return applySecurityHeaders(await handleGetReview(request, env, user));
        }
        if (url.pathname === "/api/question-sets" && request.method === "POST") {
          return applySecurityHeaders(await handleCreateQuestionSet(request, env, user));
        }
        if (url.pathname === "/api/question-sets/mine" && request.method === "GET") {
          return applySecurityHeaders(await handleListMySets(request, env, user));
        }
        if (url.pathname === "/api/ai-usage" && request.method === "GET") {
          return applySecurityHeaders(await handleGetAiUsage(request, env, user));
        }
        if (url.pathname === "/api/stats/insight" && request.method === "GET") {
          return applySecurityHeaders(await handleGetStatsInsight(request, env, user));
        }
        if (url.pathname === "/api/question-sets/suggestions" && request.method === "GET") {
          return applySecurityHeaders(await handleListSuggestions(request, env, user));
        }

        const setAction = url.pathname.match(/^\/api\/question-sets\/([^/]+)\/(submit|subscribe)$/);
        if (setAction && request.method === "POST") {
          const [, setId, action] = setAction;
          if (action === "submit") return applySecurityHeaders(await handleSubmitSet(request, env, user, setId));
          return applySecurityHeaders(await handleSubscribeSet(request, env, user, setId));
        }

        const adminSetAction = url.pathname.match(/^\/api\/admin\/question-sets\/([^/]+)\/(approve|reject)$/);
        if (adminSetAction && request.method === "POST") {
          if (user.role !== "admin") return applySecurityHeaders(json({ error: "Forbidden." }, { status: 403 }));
          const [, setId, action] = adminSetAction;
          if (action === "approve") return applySecurityHeaders(await handleApproveSet(request, env, user, setId));
          return applySecurityHeaders(await handleRejectSet(request, env, user, setId));
        }
        if (url.pathname === "/api/admin/pending-sets" && request.method === "GET") {
          if (user.role !== "admin") return applySecurityHeaders(json({ error: "Forbidden." }, { status: 403 }));
          return applySecurityHeaders(await handleAdminPendingSets(request, env, user));
        }

        if (url.pathname === "/api/test/today" && request.method === "GET") {
          return applySecurityHeaders(await handleGetTodayTest(request, env, user));
        }
        if (url.pathname === "/api/test/answer" && request.method === "POST") {
          return applySecurityHeaders(await handleAnswerTest(request, env, user));
        }

        return applySecurityHeaders(json({ error: "Not found." }, { status: 404 }));
      } catch (err) {
        return applySecurityHeaders(
          json({ error: "Server error.", detail: String(err && err.message ? err.message : err) }, { status: 500 }),
        );
      }
    }

    // Static app (public/) — index.html, app.js, styles.css, questions.js
    const assetResponse = await env.ASSETS.fetch(request);
    return applySecurityHeaders(assetResponse);
  },
};
