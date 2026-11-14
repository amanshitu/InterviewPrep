// Generic key/value platform settings (Admin-toggleable), starting with
// whether invisible Turnstile captcha is enforced. Deliberately small —
// one table, string values, no typed schema — since there's currently
// exactly one setting; add a key here rather than a new table/column if
// a second one comes along.
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
