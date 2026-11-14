-- purgeUserCompletely() (src/worker/lib/accountDeletion.js) hard-deletes a
-- user's own data but deliberately keeps rows where this user is only the
-- *attribution* on someone else's record (an admin action, a question
-- report, a resolved-by stamp) — an audit trail shouldn't retroactively
-- lose entries just because the account that created them is gone. That
-- only works if those columns aren't a live `REFERENCES users(id)` FK,
-- since SQLite's default NO ACTION blocks deleting a still-referenced row.
-- This was never actually exercised end-to-end before now, so every one of
-- these columns was still a live FK — rebuild each table to drop it.
--
-- `feedback.user_id` and `ai_reports.user_id` are untouched here: those
-- rows *are* the user's own submitted content, so account purge deletes
-- them outright instead (see the accountDeletion.js change alongside this
-- migration) rather than needing to keep a dangling attribution.

PRAGMA defer_foreign_keys = TRUE;

CREATE TABLE admin_audit_log_new (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO admin_audit_log_new SELECT * FROM admin_audit_log;
DROP TABLE admin_audit_log;
ALTER TABLE admin_audit_log_new RENAME TO admin_audit_log;
CREATE INDEX idx_admin_audit_log_created ON admin_audit_log(created_at);

CREATE TABLE question_reports_new (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id),
  reported_by TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);
INSERT INTO question_reports_new SELECT * FROM question_reports;
DROP TABLE question_reports;
ALTER TABLE question_reports_new RENAME TO question_reports;
CREATE INDEX idx_question_reports_status ON question_reports(status, created_at);
CREATE INDEX idx_question_reports_question ON question_reports(question_id);

CREATE TABLE feedback_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  category TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);
INSERT INTO feedback_new SELECT * FROM feedback;
DROP TABLE feedback;
ALTER TABLE feedback_new RENAME TO feedback;
CREATE INDEX idx_feedback_status ON feedback(status, created_at);

CREATE TABLE ai_reports_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  content_type TEXT NOT NULL,
  content_snapshot TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT
);
INSERT INTO ai_reports_new SELECT * FROM ai_reports;
DROP TABLE ai_reports;
ALTER TABLE ai_reports_new RENAME TO ai_reports;
CREATE INDEX idx_ai_reports_status ON ai_reports(status, created_at);

CREATE TABLE app_settings_new (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT,
  updated_by TEXT
);
INSERT INTO app_settings_new SELECT * FROM app_settings;
DROP TABLE app_settings;
ALTER TABLE app_settings_new RENAME TO app_settings;
