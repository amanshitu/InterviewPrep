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
            u.streak_count as streak_count, u.streak_longest as streak_longest, u.streak_last_active as streak_last_active
     FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?`,
  )
    .bind(token)
    .first();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    token,
    track: row.track,
    role: row.role,
    dailyQuota: row.daily_quota,
    streakCount: row.streak_count,
    streakLongest: row.streak_longest,
    streakLastActive: row.streak_last_active,
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
  };
}

function clampQuota(n) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v)) return 10;
  return Math.min(50, Math.max(5, v));
}

function todayDateStr() {
  return new Date().toISOString().slice(0, 10);
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
    "INSERT INTO users (id, email, name, password_hash, salt, created_at, track, daily_quota) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, email, name, passwordHash, salt, now, track, dailyQuota)
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

  return startSession(env, id, {
    id, email, name, createdAt: now, track, role: "user", dailyQuota,
    streak: { count: 0, longest: 0, lastActiveDate: null },
  });
}

async function handleLogin(request, env) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.body;
  const email = (body.email || "").toString().trim().toLowerCase();
  const password = (body.password || "").toString();

  const user = await env.DB.prepare(
    `SELECT id, email, name, password_hash, salt, created_at, track, role, daily_quota,
            streak_count, streak_longest, streak_last_active
     FROM users WHERE email = ?`,
  )
    .bind(email)
    .first();

  if (!user) return json({ error: "Incorrect email or password." }, { status: 401 });

  const computed = await hashPassword(password, user.salt);
  if (computed !== user.password_hash) {
    return json({ error: "Incorrect email or password." }, { status: 401 });
  }

  return startSession(env, user.id, {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.created_at,
    track: user.track,
    role: user.role,
    dailyQuota: user.daily_quota,
    streak: { count: user.streak_count || 0, longest: user.streak_longest || 0, lastActiveDate: user.streak_last_active },
  });
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
  return startSession(env, user.id, {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    track: user.track,
    role: user.role,
    dailyQuota: user.dailyQuota,
    streak: { count: user.streakCount || 0, longest: user.streakLongest || 0, lastActiveDate: user.streakLastActive },
  });
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
  return json({
    user: {
      id: user.id, email: user.email, name, createdAt: user.createdAt, track: user.track,
      role: user.role, dailyQuota: user.dailyQuota,
      streak: { count: user.streakCount || 0, longest: user.streakLongest || 0, lastActiveDate: user.streakLastActive },
    },
  });
}

async function handleUpdateProfile(request, env, user) {
  const parsed = await readJsonBody(request, 2000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.body;
  const track = body.track !== undefined ? (body.track ? String(body.track).trim().slice(0, 120) : null) : user.track;
  const dailyQuota = body.dailyQuota !== undefined ? clampQuota(body.dailyQuota) : user.dailyQuota;

  await env.DB.prepare("UPDATE users SET track = ?, daily_quota = ? WHERE id = ?")
    .bind(track, dailyQuota, user.id)
    .run();

  return json({
    user: {
      id: user.id, email: user.email, name: user.name, createdAt: user.createdAt, track, role: user.role, dailyQuota,
      streak: { count: user.streakCount || 0, longest: user.streakLongest || 0, lastActiveDate: user.streakLastActive },
    },
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
  const today = todayDateStr();
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

  const today = todayDateStr();
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
  const today = todayDateStr();
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
  const parsed = await readJsonBody(request, 80000);
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
