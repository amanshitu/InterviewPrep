import { randomHex } from "./crypto.js";

// Every mutating admin action should call this — who did what, to what, and
// when. Previously nothing recorded this at all: an admin editing a
// question, resolving a report, or approving a question set left no trace
// of which admin acted. `detail` is a free-form string (often JSON-stringified)
// for anything useful beyond the target id, e.g. the fields a question edit
// changed. Never throws into the caller's response path — an audit-log
// write failing must not block the action it's recording.
export async function logAdminAction(env, adminUser, action, targetType, targetId, detail) {
  try {
    await env.DB.prepare(
      "INSERT INTO admin_audit_log (id, admin_user_id, action, target_type, target_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
      .bind(randomHex(16), adminUser.id, action, targetType || null, targetId || null, detail || null, new Date().toISOString())
      .run();
  } catch (err) {
    console.error(`[admin-audit] failed to log action=${action} target=${targetType}:${targetId}: ${err && err.message ? err.message : err}`);
  }
}
