-- Per-user daily token budget for the Self Test feature (practice
-- answering a random question, get AI feedback). Separate from the
-- existing ai_usage count-based cap (which covers MCQ generation, the
-- Stats insight, and resume-prompt generation) — this one tracks actual
-- token spend, since the user asked specifically for a visible,
-- hard-capped *token* quota for this feature. Keyed by date like
-- ai_usage, for the same "resets at your own midnight" mental model.
CREATE TABLE IF NOT EXISTS ai_token_usage (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  tokens_used INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);
