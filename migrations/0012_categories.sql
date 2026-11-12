-- Multi-category platform, Phase 7.0: schema foundation.
--
-- Today every user gets the same combined pool of official "Interview Prep"
-- sets. This introduces categories (Interview Prep, and later things like
-- Railway Exam / Police Exam) as a first-class concept a user can enroll in
-- more than one of at once, with a server-side "active category" (like the
-- existing users.timezone) rather than a parameter threaded through every
-- request.
--
-- Migration preserves exact current behavior for existing users: they're
-- backfilled into exactly one category ('interview-prep') with their
-- existing quota/streak values copied across byte-for-byte, and that
-- category is set active. Nothing about their queue/streak/quota changes
-- until they explicitly enroll in a second category.

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE question_set_categories (
  set_id TEXT NOT NULL REFERENCES question_sets(id),
  category_id TEXT NOT NULL REFERENCES categories(id),
  PRIMARY KEY (set_id, category_id)
);

CREATE TABLE user_categories (
  user_id TEXT NOT NULL REFERENCES users(id),
  category_id TEXT NOT NULL REFERENCES categories(id),
  enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
  daily_quota INTEGER NOT NULL DEFAULT 10,
  streak_count INTEGER NOT NULL DEFAULT 0,
  streak_longest INTEGER NOT NULL DEFAULT 0,
  streak_last_active TEXT,
  PRIMARY KEY (user_id, category_id)
);

ALTER TABLE users ADD COLUMN active_category_id TEXT REFERENCES categories(id);

-- Backfill: one default category, every existing official set tagged into
-- it (same ownership condition handleSignup already uses to find official
-- sets), every existing user enrolled with their current quota/streak
-- copied across, and made active.
INSERT INTO categories (id, name, description) VALUES
  ('interview-prep', 'Interview Prep', 'HR/behavioral, delivery, people management, technical architecture, and AI/product interview practice.');

INSERT INTO question_set_categories (set_id, category_id)
  SELECT id, 'interview-prep' FROM question_sets WHERE owner_user_id IS NULL;

INSERT INTO user_categories (user_id, category_id, daily_quota, streak_count, streak_longest, streak_last_active)
  SELECT id, 'interview-prep', daily_quota, streak_count, streak_longest, streak_last_active FROM users;

UPDATE users SET active_category_id = 'interview-prep';
