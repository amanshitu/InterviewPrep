// Invisible Turnstile captcha, gating login/signup/forgot-password. Browser
// -> this Worker -> Cloudflare's siteverify -> this Worker's own handler.
// Never calls siteverify from the browser. Fails closed: any network error,
// non-2xx, or non-JSON body from siteverify is treated as a failed check.
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verifyTurnstile(env, token, remoteIp) {
  // No secret configured (e.g. a fresh local clone before TURNSTILE_SECRET
  // is set) — don't hard-block every auth flow over a missing dev secret.
  if (!env.TURNSTILE_SECRET) return true;
  if (typeof token !== "string" || token.length === 0 || token.length > 2048) return false;

  try {
    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        secret: env.TURNSTILE_SECRET,
        response: token,
        ...(remoteIp ? { remoteip: remoteIp } : {}),
      }),
    });
    if (!res.ok) return false;
    const result = await res.json();
    return !!result.success;
  } catch (err) {
    console.error(`[turnstile] siteverify request failed: ${err && err.message ? err.message : err}`);
    return false;
  }
}
