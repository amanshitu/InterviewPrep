-- Per-user daily AI usage counter (only counted against the shared,
-- free Workers AI resource — BYOK users are bounded by their own
-- provider/key, not this cap) and a cache for the AI-generated Stats
-- insight (personalized, so per-user unlike the global mcq_variants
-- cache), regenerated at most once per user per day.

CREATE TABLE IF NOT EXISTS ai_usage (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, date)
);

CREATE TABLE IF NOT EXISTS ai_stats_insights (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  insight TEXT NOT NULL,
  generated_by TEXT,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);
