import { json } from "./http.js";
import { mapUserRow } from "./user.js";
import { parseCookies } from "./request.js";
import { randomHex } from "./crypto.js";

export const SESSION_COOKIE = "session";
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export function sessionCookieHeader(token, maxAgeSeconds) {
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

export function clearCookieHeader() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export async function getUserFromRequest(request, env) {
  const cookies = parseCookies(request);
  const token = cookies[SESSION_COOKIE];
  if (!token) return null;
  const row = await env.DB.prepare(
    `SELECT s.id as session_id, s.user_id as user_id, s.expires_at as expires_at, u.id as id, u.email as email, u.name as name,
            u.created_at as created_at, u.track as track, u.role as role,
            u.active_category_id as active_category_id,
            COALESCE(uc.daily_quota, u.daily_quota) as daily_quota,
            COALESCE(uc.streak_count, u.streak_count) as streak_count,
            COALESCE(uc.streak_longest, u.streak_longest) as streak_longest,
            COALESCE(uc.streak_last_active, u.streak_last_active) as streak_last_active,
            u.ai_provider as ai_provider, u.ai_key_ciphertext as ai_key_ciphertext, u.ai_key_iv as ai_key_iv,
            u.headline as headline, u.years_experience as years_experience, u.bio as bio, u.timezone as timezone,
            u.workers_ai_model as workers_ai_model, u.avatar_data as avatar_data,
            u.email_verified as email_verified, u.deletion_requested_at as deletion_requested_at
     FROM sessions s JOIN users u ON u.id = s.user_id
     LEFT JOIN user_categories uc ON uc.user_id = u.id AND uc.category_id = u.active_category_id
     WHERE s.token = ?`,
  )
    .bind(token)
    .first();
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) {
    await env.DB.prepare("DELETE FROM sessions WHERE token = ?").bind(token).run();
    return null;
  }
  return { ...mapUserRow(row), token, sessionId: row.session_id };
}

// `request` is optional so existing callers (if any slip through a refactor)
// still work — a session row just won't get device info for that login.
// Called from GET /api/me (once per app load, not per API call — the hot
// getUserFromRequest path intentionally never writes) so the "Where you're
// signed in" list has a reasonably fresh last-active time without adding a
// write to every authenticated request.
export async function touchSessionLastSeen(env, token) {
  await env.DB.prepare("UPDATE sessions SET last_seen_at = ? WHERE token = ?")
    .bind(new Date().toISOString(), token)
    .run();
}

export async function startSession(env, userId, sessionUser, request) {
  const token = randomHex(32);
  const id = randomHex(16);
  const now = Date.now();
  const expiresAt = new Date(now + SESSION_TTL_MS).toISOString();
  const ip = request ? request.headers.get("CF-Connecting-IP") : null;
  const userAgent = request ? request.headers.get("User-Agent") : null;
  const nowIso = new Date(now).toISOString();
  await env.DB.prepare(
    "INSERT INTO sessions (id, token, user_id, created_at, expires_at, ip_address, user_agent, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(id, token, userId, nowIso, expiresAt, ip, userAgent, nowIso)
    .run();

  return json(
    { user: sessionUser },
    {
      status: 200,
      headers: { "Set-Cookie": sessionCookieHeader(token, SESSION_TTL_MS / 1000) },
    },
  );
}

// ---------- session list / per-device revoke (Settings → Sessions) ----------

export async function listSessions(env, userId) {
  const { results } = await env.DB.prepare(
    "SELECT id, created_at, last_seen_at, ip_address, user_agent FROM sessions WHERE user_id = ? ORDER BY COALESCE(last_seen_at, created_at) DESC",
  )
    .bind(userId)
    .all();
  return results || [];
}

// Only ever deletes a row that both matches the given id AND belongs to
// this user — never trust a session id alone, it's just a client-supplied
// string in the URL.
export async function revokeSessionById(env, userId, sessionId) {
  await env.DB.prepare("DELETE FROM sessions WHERE id = ? AND user_id = ?").bind(sessionId, userId).run();
}
