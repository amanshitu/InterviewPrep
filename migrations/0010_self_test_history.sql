-- Per-attempt Self Test score history, so Stats can show a trend over time.
-- Separate from ai_token_usage (which only tracks quota spend, not scores).
CREATE TABLE self_test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id),
  question_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  score INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_self_test_results_user_date ON self_test_results(user_id, date);
