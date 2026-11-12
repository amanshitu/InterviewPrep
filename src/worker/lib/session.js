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
    `SELECT s.user_id as user_id, s.expires_at as expires_at, u.id as id, u.email as email, u.name as name,
            u.created_at as created_at, u.track as track, u.role as role,
            u.active_category_id as active_category_id,
            COALESCE(uc.daily_quota, u.daily_quota) as daily_quota,
            COALESCE(uc.streak_count, u.streak_count) as streak_count,
            COALESCE(uc.streak_longest, u.streak_longest) as streak_longest,
            COALESCE(uc.streak_last_active, u.streak_last_active) as streak_last_active,
            u.ai_provider as ai_provider, u.ai_key_ciphertext as ai_key_ciphertext, u.ai_key_iv as ai_key_iv,
            u.headline as headline, u.years_experience as years_experience, u.bio as bio, u.timezone as timezone,
            u.workers_ai_model as workers_ai_model, u.avatar_data as avatar_data
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
  return { ...mapUserRow(row), token };
}

export async function startSession(env, userId, sessionUser) {
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
