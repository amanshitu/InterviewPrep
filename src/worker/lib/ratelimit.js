import { json } from "./http.js";

// ---------- rate limiting ----------
// Tracks request timestamps per (IP, endpoint) in D1 so brute-forcing
// /api/login, /api/signup or /api/password/forgot gets throttled even
// though this Worker has no in-memory state across requests.
export async function checkRateLimit(env, request, endpoint, limit = 10, windowMinutes = 15) {
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
