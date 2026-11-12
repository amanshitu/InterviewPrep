-- Multi-category platform, Phase 7.3: Stats becomes category-aware.
--
-- activity_log.category_id is a plain additive column (not part of any
-- key) — lets the accuracy-by-topic query filter correctly instead of
-- blending two categories' activity if they happen to reuse a topic_label
-- string. Backfilled to 'interview-prep' for existing rows.
--
-- ai_stats_insights' PRIMARY KEY (user_id, date) needs to become
-- (user_id, category_id, date) — one cached coaching insight per category
-- per day, not one blended insight across everything. Same SQLite
-- can't-alter-a-constraint-in-place rebuild as the earlier phases.

ALTER TABLE activity_log ADD COLUMN category_id TEXT;
UPDATE activity_log SET category_id = 'interview-prep' WHERE category_id IS NULL;

CREATE TABLE ai_stats_insights_new (
  user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  date TEXT NOT NULL,
  insight TEXT NOT NULL,
  generated_by TEXT,
  generated_at TEXT NOT NULL,
  PRIMARY KEY (user_id, category_id, date)
);

INSERT INTO ai_stats_insights_new (user_id, category_id, date, insight, generated_by, generated_at)
  SELECT user_id, 'interview-prep', date, insight, generated_by, generated_at FROM ai_stats_insights;

DROP TABLE ai_stats_insights;
ALTER TABLE ai_stats_insights_new RENAME TO ai_stats_insights;
