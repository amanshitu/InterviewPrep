// Generic key/value platform settings (Admin-toggleable): whether invisible
// Turnstile captcha is enforced, and where/how outgoing email is sent
// (Brevo). Deliberately small — one table, string values, no typed schema.
import { encryptSecret, decryptSecret } from "./crypto.js";

export async function getSetting(env, key, fallback) {
  const row = await env.DB.prepare("SELECT value FROM app_settings WHERE key = ?").bind(key).first();
  return row ? row.value : fallback;
}

export async function setSetting(env, key, value, adminUserId) {
  await env.DB.prepare(
    `INSERT INTO app_settings (key, value, updated_at, updated_by) VALUES (?, ?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at, updated_by = excluded.updated_by`,
  )
    .bind(key, value, new Date().toISOString(), adminUserId || null)
    .run();
}

export async function isCaptchaEnabled(env) {
  return (await getSetting(env, "captcha_enabled", "true")) !== "false";
}

// ---------- Brevo (transactional email) ----------
// The API key is the only piece worth protecting here (it can send mail as
// this domain), so it's AES-GCM encrypted at rest with the same master key
// already used for BYOK AI keys (crypto.js) rather than stored as plain
// text in app_settings like the other string settings. Sender email/name
// aren't secret, so they stay plain.
const BREVO_API_KEY_SETTING = "brevo_api_key_encrypted"; // JSON { ciphertext, iv }
const BREVO_SENDER_EMAIL_SETTING = "brevo_sender_email";
const BREVO_SENDER_NAME_SETTING = "brevo_sender_name";

/** Null if Brevo isn't configured yet (no key or no sender address saved). */
export async function getBrevoConfig(env) {
  const [encryptedRaw, senderEmail, senderName] = await Promise.all([
    getSetting(env, BREVO_API_KEY_SETTING, null),
    getSetting(env, BREVO_SENDER_EMAIL_SETTING, null),
    getSetting(env, BREVO_SENDER_NAME_SETTING, "ExamStreak"),
  ]);
  if (!encryptedRaw || !senderEmail) return null;
  const { ciphertext, iv } = JSON.parse(encryptedRaw);
  const apiKey = await decryptSecret(env, ciphertext, iv);
  return { apiKey, senderEmail, senderName };
}

/** Cheap presence check for the admin UI — doesn't decrypt the key. */
export async function getBrevoStatus(env) {
  const [encryptedRaw, senderEmail, senderName] = await Promise.all([
    getSetting(env, BREVO_API_KEY_SETTING, null),
    getSetting(env, BREVO_SENDER_EMAIL_SETTING, null),
    getSetting(env, BREVO_SENDER_NAME_SETTING, "ExamStreak"),
  ]);
  return { configured: Boolean(encryptedRaw && senderEmail), senderEmail: senderEmail || "", senderName };
}

// `apiKey` left blank/undefined keeps whatever key is already saved — same
// "leave it blank to keep the existing one" convention as the BYOK AI key
// field in Settings.
export async function setBrevoConfig(env, { apiKey, senderEmail, senderName }, adminUserId) {
  if (apiKey) {
    const { ciphertext, iv } = await encryptSecret(env, apiKey);
    await setSetting(env, BREVO_API_KEY_SETTING, JSON.stringify({ ciphertext, iv }), adminUserId);
  }
  await setSetting(env, BREVO_SENDER_EMAIL_SETTING, senderEmail, adminUserId);
  await setSetting(env, BREVO_SENDER_NAME_SETTING, senderName || "ExamStreak", adminUserId);
}

// ---------- Turnstile (login/signup/forgot-password captcha) ----------
// Same admin-editable, encrypted-secret shape as Brevo above. The site key
// isn't secret (it's meant to be embedded in client-side JS), so it stays
// plain; the secret is AES-GCM encrypted. `TURNSTILE_FALLBACK_SITE_KEY` /
// `env.TURNSTILE_SECRET` are the original pre-admin-UI values (a real
// widget already created for this deploy) — kept as a fallback so an
// existing deploy keeps working unchanged until an admin saves a value
// here, rather than silently breaking captcha on the next deploy.
const TURNSTILE_SITE_KEY_SETTING = "turnstile_site_key";
const TURNSTILE_SECRET_SETTING = "turnstile_secret_encrypted"; // JSON { ciphertext, iv }
const TURNSTILE_FALLBACK_SITE_KEY = "0x4AAAAAAGAj3gS_ioNKxux4";

/** Null if Turnstile isn't configured anywhere (admin UI or env fallback). */
export async function getTurnstileConfig(env) {
  const [siteKey, encryptedRaw] = await Promise.all([
    getSetting(env, TURNSTILE_SITE_KEY_SETTING, null),
    getSetting(env, TURNSTILE_SECRET_SETTING, null),
  ]);
  if (siteKey && encryptedRaw) {
    const { ciphertext, iv } = JSON.parse(encryptedRaw);
    const secret = await decryptSecret(env, ciphertext, iv);
    return { siteKey, secret };
  }
  if (env.TURNSTILE_SECRET) {
    return { siteKey: TURNSTILE_FALLBACK_SITE_KEY, secret: env.TURNSTILE_SECRET };
  }
  return null;
}

/** Cheap presence check for the admin UI and the public /api/config route — doesn't decrypt the secret. */
export async function getTurnstileStatus(env) {
  const [siteKey, encryptedRaw] = await Promise.all([
    getSetting(env, TURNSTILE_SITE_KEY_SETTING, null),
    getSetting(env, TURNSTILE_SECRET_SETTING, null),
  ]);
  if (siteKey && encryptedRaw) return { configured: true, siteKey };
  return { configured: Boolean(env.TURNSTILE_SECRET), siteKey: TURNSTILE_FALLBACK_SITE_KEY };
}

// `secret` left blank/undefined keeps whatever secret is already saved —
// same convention as Brevo's API key field.
export async function setTurnstileConfig(env, { siteKey, secret }, adminUserId) {
  await setSetting(env, TURNSTILE_SITE_KEY_SETTING, siteKey, adminUserId);
  if (secret) {
    const { ciphertext, iv } = await encryptSecret(env, secret);
    await setSetting(env, TURNSTILE_SECRET_SETTING, JSON.stringify({ ciphertext, iv }), adminUserId);
  }
}
