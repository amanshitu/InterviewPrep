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
    "SELECT s.user_id as user_id, s.expires_at as expires_at, u.id as id, u.email as email, u.name as name, u.created_at as created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ?",
  )
    .bind(token)
    .first();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return { id: row.id, email: row.email, name: row.name, createdAt: row.created_at, token };
}

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
    "INSERT INTO users (id, email, name, password_hash, salt, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, email, name, passwordHash, salt, now)
    .run();

  await env.DB.prepare(
    "INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)",
  )
    .bind(id, JSON.stringify(defaultState()), now)
    .run();

  return startSession(env, id, { id, email, name, createdAt: now });
}

async function handleLogin(request, env) {
  const parsed = await readJsonBody(request);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.body;
  const email = (body.email || "").toString().trim().toLowerCase();
  const password = (body.password || "").toString();

  const user = await env.DB.prepare(
    "SELECT id, email, name, password_hash, salt, created_at FROM users WHERE email = ?",
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
  });
}

async function startSession(env, userId, userPayload) {
  const token = randomHex(32);
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)",
  )
    .bind(token, userId, new Date(now).toISOString(), expiresAt)
    .run();

  return json(
    { user: userPayload },
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
  return json({ user: { id: user.id, email: user.email, name, createdAt: user.createdAt } });
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
  const rows = await env.DB.prepare(
    "SELECT occurred_at, event_type, topic_id, question_id, result FROM activity_log WHERE user_id = ? ORDER BY occurred_at DESC LIMIT ?",
  )
    .bind(user.id, limit)
    .all();
  return json({ events: rows.results || [] });
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
          return applySecurityHeaders(
            json({ user: { id: user.id, email: user.email, name: user.name, createdAt: user.createdAt } }),
          );
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
        if (url.pathname === "/api/password/change" && request.method === "POST") {
          return applySecurityHeaders(await handleChangePassword(request, env, user));
        }
        if (url.pathname === "/api/account" && request.method === "PATCH") {
          return applySecurityHeaders(await handleUpdateAccount(request, env, user));
        }
        if (url.pathname === "/api/sessions/revoke-all" && request.method === "POST") {
          return applySecurityHeaders(await handleRevokeAllSessions(request, env, user));
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
