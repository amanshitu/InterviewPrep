-- A tiny generic key/value table for admin-toggleable platform settings —
-- starting with whether invisible Turnstile captcha is enforced on
-- login/signup/forgot-password. Seeded on, matching today's behavior.
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT REFERENCES users(id)
);

INSERT INTO app_settings (key, value) VALUES ('captcha_enabled', 'true');
