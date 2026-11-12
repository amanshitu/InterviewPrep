-- Multi-category platform, Phase 7.2: Daily Test and Self Test history
-- become category-aware.
--
-- daily_test_results' UNIQUE(user_id, date, question_id) needs to become
-- UNIQUE(user_id, category_id, date, question_id) so each category gets
-- its own daily MCQ test — same rebuild requirement as 0013's ledger
-- (SQLite can't alter a UNIQUE constraint in place).
--
-- self_test_results gets a plain additive category_id column (not part of
-- any key) — not used for scoping yet, just lets a later phase (Stats)
-- break self-test score trends down per category.

CREATE TABLE daily_test_results_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  date TEXT NOT NULL,
  question_id TEXT NOT NULL,
  selected_index INTEGER,
  correct INTEGER NOT NULL,
  answered_at TEXT NOT NULL,
  UNIQUE(user_id, category_id, date, question_id)
);

INSERT INTO daily_test_results_new (id, user_id, category_id, date, question_id, selected_index, correct, answered_at)
  SELECT id, user_id, 'interview-prep', date, question_id, selected_index, correct, answered_at FROM daily_test_results;

DROP TABLE daily_test_results;
ALTER TABLE daily_test_results_new RENAME TO daily_test_results;

ALTER TABLE self_test_results ADD COLUMN category_id TEXT;
UPDATE self_test_results SET category_id = 'interview-prep' WHERE category_id IS NULL;
