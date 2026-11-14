// Invisible Turnstile captcha, gating login/signup/forgot-password. Browser
// -> this Worker -> Cloudflare's siteverify -> this Worker's own handler.
// Never calls siteverify from the browser. Fails closed: any network error,
// non-2xx, or non-JSON body from siteverify is treated as a failed check.
// The site key/secret pair is admin-configurable (Admin -> the Turnstile
// card) rather than fixed at deploy time — see settings.js's
// getTurnstileConfig for the admin-UI-or-env-fallback resolution.
import { getTurnstileConfig } from "./settings.js";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(env, token, remoteIp) {
  const config = await getTurnstileConfig(env);
  // Not configured anywhere (e.g. a fresh local clone) — don't hard-block
  // every auth flow over a missing dev secret.
  if (!config) return true;
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false;

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: config.secret,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
    });
    if (!res.ok) {
      console.error(`[turnstile] siteverify returned ${res.status}`);
      return false;
    }
    const result = await res.json();
    if (!result.success) {
      // Logged so a real failure (expired/reused token, a widget domain
      // that doesn't match the hostname this is served from, etc.) is
      // diagnosable from `wrangler tail` instead of just "it failed".
      console.error(`[turnstile] siteverify failed: ${JSON.stringify(result["error-codes"] || result)}`);
    }
    return !!result.success;
  } catch (err) {
    console.error(`[turnstile] siteverify request failed: ${err && err.message ? err.message : err}`);
    return false;
  }
}
