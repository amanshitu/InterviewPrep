-- General app feedback (bug reports, feature requests, praise, anything
-- not tied to one specific question — that's what question_reports is
-- for). One free-text message plus an optional category tag; admins mark
-- it read/resolved from the new Admin Feedback tab, same shape as
-- question_reports' own status lifecycle for consistency.

CREATE TABLE feedback (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  category TEXT NOT NULL DEFAULT 'general', -- 'bug' | 'feature' | 'general' | 'praise'
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'resolved'
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT REFERENCES users(id)
);

CREATE INDEX idx_feedback_status ON feedback(status, created_at);
