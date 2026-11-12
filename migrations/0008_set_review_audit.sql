-- Mirrors approved_at/approved_by for the rejection path, so the admin
-- review-history view can show who acted on a set and when regardless of
-- which way the decision went.
ALTER TABLE question_sets ADD COLUMN rejected_at TEXT;
ALTER TABLE question_sets ADD COLUMN rejected_by TEXT;
