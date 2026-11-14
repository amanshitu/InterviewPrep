-- Real spaced-repetition scheduling. Daily Review previously sampled
-- randomly (weighted by streak/last-result) from EVERY completed question
-- with no concept of "not due yet" — a question nailed ten times running
-- competed for a review slot exactly like one just barely recalled. This
-- adds a per-question due_date so Daily Review can prioritize what's
-- actually due, falling back to the existing weighted sampling only to
-- fill out the batch when there's nothing due yet (see src/worker/lib/srs.js
-- for the interval schedule, and queue.js for where due_date gets set/read).
--
-- No backfill needed: NULL due_date (every existing row) is treated as
-- "due now" everywhere this is read, so nothing in anyone's existing
-- review pool disappears.

ALTER TABLE user_question_progress ADD COLUMN due_date TEXT;
ALTER TABLE user_question_progress ADD COLUMN lapses INTEGER NOT NULL DEFAULT 0;

CREATE INDEX idx_uqp_user_status_due ON user_question_progress(user_id, status, due_date);
