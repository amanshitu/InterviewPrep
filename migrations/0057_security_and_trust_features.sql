-- Supports several features in one batch: email verification, self-serve
-- account deletion with a grace period, an admin audit log, AI-output
-- quality reports (Self Test feedback / coaching insight — separate from
-- question_reports since those reference a real questions.id and these
-- don't), and session metadata for a more useful "where you're signed in"
-- list.

ALTER TABLE users ADD COLUMN email_verified INTEGER NOT NULL DEFAULT 0;
-- NULL = not scheduled for deletion. Set when a user confirms self-serve
-- deletion; the hourly scheduled() handler purges accounts past the grace
-- period (see src/worker/lib/accountDeletion.js).
ALTER TABLE users ADD COLUMN deletion_requested_at TEXT;

CREATE TABLE email_verifications (
  token TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX idx_email_verifications_user ON email_verifications(user_id);

-- Nullable so existing sessions (created before this migration) don't need
-- a backfill — they simply show no device info until their next renewal.
ALTER TABLE sessions ADD COLUMN ip_address TEXT;
ALTER TABLE sessions ADD COLUMN user_agent TEXT;
ALTER TABLE sessions ADD COLUMN last_seen_at TEXT;

CREATE TABLE admin_audit_log (
  id TEXT PRIMARY KEY,
  admin_user_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  detail TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_admin_audit_log_created ON admin_audit_log(created_at);

CREATE TABLE ai_reports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  content_type TEXT NOT NULL, -- 'self_test_feedback' | 'coaching_insight'
  content_snapshot TEXT NOT NULL,
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'resolved' | 'dismissed'
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT REFERENCES users(id)
);
CREATE INDEX idx_ai_reports_status ON ai_reports(status, created_at);
