export const DELETION_GRACE_PERIOD_DAYS = 30;

export function purgeDateFor(requestedAtIso) {
  const d = new Date(requestedAtIso);
  d.setUTCDate(d.getUTCDate() + DELETION_GRACE_PERIOD_DAYS);
  return d;
}

// Hard-deletes everything personal to this account. Content the user
// contributed that's already shared with others (a published question set)
// is left in place — deleting it out from under every subscriber would be a
// bigger surprise than keeping an orphaned owner_user_id, same tradeoff
// MealSathi/CosmoTracker's own account-deletion flows make. Audit-trail
// rows where this user is the *reporter* (question_reports.reported_by,
// admin_audit_log) are left too, for the same reason an audit log shouldn't
// retroactively lose entries.
export async function purgeUserCompletely(env, userId) {
  const statements = [
    "DELETE FROM sessions WHERE user_id = ?",
    "DELETE FROM user_question_progress WHERE user_id = ?",
    "DELETE FROM user_categories WHERE user_id = ?",
    "DELETE FROM user_question_sets WHERE user_id = ?",
    "DELETE FROM daily_quota_ledger WHERE user_id = ?",
    "DELETE FROM daily_test_results WHERE user_id = ?",
    "DELETE FROM ai_usage WHERE user_id = ?",
    "DELETE FROM ai_stats_insights WHERE user_id = ?",
    "DELETE FROM push_subscriptions WHERE user_id = ?",
    "DELETE FROM activity_log WHERE user_id = ?",
    "DELETE FROM email_verifications WHERE user_id = ?",
    "DELETE FROM password_resets WHERE user_id = ?",
    "DELETE FROM users WHERE id = ?",
  ].map((sql) => env.DB.prepare(sql).bind(userId));
  await env.DB.batch(statements);
}

// Called from the existing hourly scheduled() handler (see
// src/worker/routes/push.js's handleScheduled, which this runs alongside)
// — no new Cron Trigger needed.
export async function purgeExpiredAccountDeletions(env) {
  const cutoff = new Date(Date.now() - DELETION_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000).toISOString();
  const { results } = await env.DB.prepare(
    "SELECT id FROM users WHERE deletion_requested_at IS NOT NULL AND deletion_requested_at <= ?",
  )
    .bind(cutoff)
    .all();
  for (const row of results || []) {
    await purgeUserCompletely(env, row.id);
  }
}
