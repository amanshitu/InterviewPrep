-- Additive migration: account essentials, security hardening, activity history.
-- Applied with --remote against the existing interview-prep-db (do not edit 0001_init.sql).

-- Short-lived password reset tokens. One active token per user in practice —
-- handleForgotPassword deletes any previous ones before inserting a new row.
CREATE TABLE IF NOT EXISTS password_resets (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

-- Per-IP, per-endpoint request timestamps for basic brute-force rate limiting
-- on /api/login, /api/signup, /api/password/forgot. Rows older than the
-- rate-limit window are pruned lazily on each check.
CREATE TABLE IF NOT EXISTS rate_limit_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip TEXT NOT NULL,
  endpoint TEXT NOT NULL,
  occurred_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_rate_limit_lookup ON rate_limit_attempts(ip, endpoint, occurred_at);

-- Append-only history of reveal/review actions. user_state.questionStats only
-- keeps the latest result per question, so this is the source for the Stats
-- view's accuracy trend and weakest-topic/question rankings.
CREATE TABLE IF NOT EXISTS activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  occurred_at TEXT NOT NULL,
  event_type TEXT NOT NULL,
  topic_id TEXT,
  question_id TEXT,
  result TEXT
);

CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id, occurred_at);
