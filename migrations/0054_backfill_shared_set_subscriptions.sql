-- Broadens signup/enroll auto-subscription from "owner_user_id IS NULL"
-- to "visibility = 'shared'" (see auth.js/categories.js comments) now that
-- question-set creation is admin-only, so an admin-owned set is just as
-- "official" as a NULL-owner one. That only changes behavior going
-- forward; this is the one-time catch-up for every ALREADY-enrolled user
-- against every ALREADY-shared set that the old, narrower filter missed —
-- caught one concretely (a 5-question "Police Exam — AI generated" set,
-- shared and tagged into police-exam, but never subscribed to anyone) while
-- auditing this change, and this covers any other instance of the same gap
-- rather than special-casing just that one set. Idempotent (NOT EXISTS
-- guard), same pattern as 0022/0050/0051's own backfills.

INSERT INTO user_question_sets (user_id, set_id, subscribed_at)
SELECT uc.user_id, qsc.set_id, datetime('now')
FROM user_categories uc
JOIN question_set_categories qsc ON qsc.category_id = uc.category_id
JOIN question_sets qs ON qs.id = qsc.set_id
WHERE qs.visibility = 'shared'
  AND NOT EXISTS (
    SELECT 1 FROM user_question_sets uqs WHERE uqs.user_id = uc.user_id AND uqs.set_id = qsc.set_id
  );
