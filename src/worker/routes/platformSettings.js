import { json } from "../lib/http.js";
import { readJsonBody } from "../lib/request.js";
import { getSetting, isCaptchaEnabled, setSetting } from "../lib/settings.js";
import { logAdminAction } from "../lib/audit.js";

// ---------- platform settings (currently just the captcha toggle) ----------

// Public, unauthenticated — the Login page needs to know whether to even
// load the Turnstile script before a visitor has a session.
export async function handlePublicConfig(request, env) {
  return json({ captchaEnabled: await isCaptchaEnabled(env) });
}

export async function handleAdminGetSettings(request, env) {
  return json({ captchaEnabled: (await getSetting(env, "captcha_enabled", "true")) !== "false" });
}

export async function handleAdminSetCaptchaEnabled(request, env, user) {
  const parsed = await readJsonBody(request, 200);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const enabled = !!parsed.body.enabled;
  await setSetting(env, "captcha_enabled", enabled ? "true" : "false", user.id);
  await logAdminAction(env, user, enabled ? "captcha_enabled" : "captcha_disabled", "app_settings", "captcha_enabled");
  return json({ ok: true, captchaEnabled: enabled });
}
