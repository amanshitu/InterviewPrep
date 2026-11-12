-- Multi-category platform, Phase 7.1: daily_quota_ledger becomes
-- per-(user, category, date) instead of per-(user, date) — the daily
-- target/queue-fill pacing needs to be separate per category a user is
-- enrolled in. SQLite can't alter a PRIMARY KEY in place, so this rebuilds
-- the table (the original (user_id, date) PK would otherwise reject a
-- second category's ledger row for the same calendar day).
--
-- Existing rows are backfilled to 'interview-prep' — the same default
-- category every existing user was enrolled into in migration 0012.

CREATE TABLE daily_quota_ledger_new (
  user_id TEXT NOT NULL,
  category_id TEXT NOT NULL,
  date TEXT NOT NULL,
  base_quota INTEGER NOT NULL,
  extra_requested INTEGER NOT NULL DEFAULT 0,
  completed INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (user_id, category_id, date)
);

INSERT INTO daily_quota_ledger_new (user_id, category_id, date, base_quota, extra_requested, completed)
  SELECT user_id, 'interview-prep', date, base_quota, extra_requested, completed FROM daily_quota_ledger;

DROP TABLE daily_quota_ledger;
ALTER TABLE daily_quota_ledger_new RENAME TO daily_quota_ledger;
