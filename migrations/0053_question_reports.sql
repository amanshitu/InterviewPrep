-- Lets any user flag a question/answer as wrong, confusing, or otherwise
-- needing a fix, and lets an admin see every open report and edit the
-- question directly from there. One question can accumulate more than one
-- report before an admin gets to it (no uniqueness constraint) — each is
-- its own row with its own reporter and reason, since two users might flag
-- the same question for different reasons.

CREATE TABLE question_reports (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES questions(id),
  reported_by TEXT NOT NULL REFERENCES users(id),
  reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open', -- 'open' | 'resolved' | 'dismissed'
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  resolved_by TEXT REFERENCES users(id)
);

CREATE INDEX idx_question_reports_status ON question_reports(status, created_at);
CREATE INDEX idx_question_reports_question ON question_reports(question_id);
