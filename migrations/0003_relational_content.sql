-- Phase 1 of the multi-tenant redesign: relational question content,
-- per-user profile fields, and the daily quota/backlog engine.
-- Additive only. `user_state` (the old JSON-blob table) is left untouched
-- as a fallback until this phase is confirmed stable.

ALTER TABLE users ADD COLUMN track TEXT;
ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN daily_quota INTEGER NOT NULL DEFAULT 10;
ALTER TABLE users ADD COLUMN streak_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN streak_longest INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN streak_last_active TEXT;

-- Added now (cheap) even though Phase 2 is what actually uses these.
ALTER TABLE users ADD COLUMN ai_provider TEXT;
ALTER TABLE users ADD COLUMN ai_key_ciphertext TEXT;
ALTER TABLE users ADD COLUMN ai_key_iv TEXT;

CREATE TABLE IF NOT EXISTS question_sets (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT,              -- NULL = official/system set
  title TEXT NOT NULL,
  track TEXT,
  visibility TEXT NOT NULL DEFAULT 'private',  -- 'private' | 'pending' | 'shared' | 'rejected'
  created_at TEXT NOT NULL,
  approved_at TEXT,
  approved_by TEXT,
  rejected_reason TEXT
);

CREATE INDEX IF NOT EXISTS idx_question_sets_visibility_track ON question_sets(visibility, track);

CREATE TABLE IF NOT EXISTS questions (
  id TEXT PRIMARY KEY,
  set_id TEXT NOT NULL,
  topic_label TEXT NOT NULL,
  topic_order INTEGER NOT NULL DEFAULT 0,   -- section ordering within the set
  sort_order INTEGER NOT NULL DEFAULT 0,    -- question ordering within its topic
  q TEXT NOT NULL,
  a TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_questions_set ON questions(set_id, topic_order, sort_order);

CREATE TABLE IF NOT EXISTS user_question_sets (
  user_id TEXT NOT NULL,
  set_id TEXT NOT NULL,
  subscribed_at TEXT NOT NULL,
  PRIMARY KEY (user_id, set_id)
);

CREATE TABLE IF NOT EXISTS user_question_progress (
  user_id TEXT NOT NULL,
  question_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued',   -- 'queued' | 'shown' | 'done'
  queued_for_date TEXT,                    -- date this question was placed in a daily queue
  first_shown_at TEXT,
  last_shown_at TEXT,
  last_result TEXT,                        -- 'got_it' | 'again' | NULL
  times_shown INTEGER NOT NULL DEFAULT 0,
  correct_streak INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, question_id)
);

CREATE INDEX IF NOT EXISTS idx_uqp_user_status ON user_question_progress(user_id, status);
CREATE INDEX IF NOT EXISTS idx_uqp_user_queued_date ON user_question_progress(user_id, queued_for_date);

CREATE TABLE IF NOT EXISTS daily_quota_ledger (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  base_quota INTEGER NOT NULL,   -- snapshot of the user's quota setting that day
  extra_requested INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

-- Schema-only in Phase 1; Phase 2 is what actually populates/reads these.
CREATE TABLE IF NOT EXISTS mcq_variants (
  question_id TEXT PRIMARY KEY,
  options_json TEXT NOT NULL,
  correct_index INTEGER NOT NULL,
  generated_by TEXT,
  generated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  question_id TEXT NOT NULL,
  selected_index INTEGER,
  correct INTEGER NOT NULL,
  answered_at TEXT NOT NULL,
  UNIQUE(user_id, date, question_id)
);
