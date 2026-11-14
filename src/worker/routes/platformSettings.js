import { json } from "../lib/http.js";
import { isValidEmail, readJsonBody } from "../lib/request.js";
import {
  getBrevoStatus,
  getSetting,
  getTurnstileStatus,
  isCaptchaEnabled,
  setBrevoConfig,
  setSetting,
  setTurnstileConfig,
} from "../lib/settings.js";
import { logAdminAction } from "../lib/audit.js";

// ---------- platform settings (captcha toggle + Turnstile + Brevo email config) ----------

// Public, unauthenticated — the Login page needs this before there's a
// session: whether to even load the Turnstile script, and which site key
// to render it with (site keys are meant to be client-visible — only the
// secret half is sensitive).
export async function handlePublicConfig(request, env) {
  const [captchaEnabled, turnstile] = await Promise.all([isCaptchaEnabled(env), getTurnstileStatus(env)]);
  return json({ captchaEnabled, turnstileSiteKey: turnstile.siteKey });
}

export async function handleAdminGetSettings(request, env) {
  const [captchaEnabled, brevo, turnstile] = await Promise.all([
    getSetting(env, "captcha_enabled", "true").then((v) => v !== "false"),
    getBrevoStatus(env),
    getTurnstileStatus(env),
  ]);
  return json({
    captchaEnabled,
    brevoConfigured: brevo.configured,
    brevoSenderEmail: brevo.senderEmail,
    brevoSenderName: brevo.senderName,
    turnstileConfigured: turnstile.configured,
    turnstileSiteKey: turnstile.siteKey,
  });
}

export async function handleAdminSetCaptchaEnabled(request, env, user) {
  const parsed = await readJsonBody(request, 200);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const enabled = !!parsed.body.enabled;
  await setSetting(env, "captcha_enabled", enabled ? "true" : "false", user.id);
  await logAdminAction(env, user, enabled ? "captcha_enabled" : "captcha_disabled", "app_settings", "captcha_enabled");
  return json({ ok: true, captchaEnabled: enabled });
}

// `apiKey` is optional on every call after the first — omitting it (or
// sending "") keeps whatever key is already saved, same convention as the
// BYOK AI key field in Settings, so re-saving just the sender name doesn't
// force re-entering the key every time.
export async function handleAdminSetBrevoConfig(request, env, user) {
  const parsed = await readJsonBody(request, 1000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const senderEmail = String(parsed.body.senderEmail || "").trim();
  const senderName = String(parsed.body.senderName || "").trim();
  const apiKey = String(parsed.body.apiKey || "").trim();
  if (!isValidEmail(senderEmail)) return json({ error: "Enter a valid sender email address." }, { status: 400 });
  const existing = await getBrevoStatus(env);
  if (!apiKey && !existing.configured) return json({ error: "An API key is required the first time Brevo is configured." }, { status: 400 });
  await setBrevoConfig(env, { apiKey: apiKey || undefined, senderEmail, senderName }, user.id);
  await logAdminAction(env, user, "brevo_config_updated", "app_settings", "brevo", apiKey ? "sender + key updated" : "sender updated");
  const updated = await getBrevoStatus(env);
  return json({ ok: true, brevoConfigured: updated.configured, brevoSenderEmail: updated.senderEmail, brevoSenderName: updated.senderName });
}

// `secret` is optional on every call after the first — same "leave it
// blank to keep the existing one" convention as Brevo's API key above.
// The site key isn't secret, so it's always required and always updated.
export async function handleAdminSetTurnstileConfig(request, env, user) {
  const parsed = await readJsonBody(request, 500);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const siteKey = String(parsed.body.siteKey || "").trim();
  const secret = String(parsed.body.secret || "").trim();
  if (!siteKey) return json({ error: "Enter a site key." }, { status: 400 });
  const existing = await getTurnstileStatus(env);
  if (!secret && !existing.configured) return json({ error: "A secret key is required the first time Turnstile is configured." }, { status: 400 });
  await setTurnstileConfig(env, { siteKey, secret: secret || undefined }, user.id);
  await logAdminAction(env, user, "turnstile_config_updated", "app_settings", "turnstile", secret ? "site key + secret updated" : "site key updated");
  const updated = await getTurnstileStatus(env);
  return json({ ok: true, turnstileConfigured: updated.configured, turnstileSiteKey: updated.siteKey });
}
