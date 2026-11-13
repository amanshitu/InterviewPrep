import { json } from "../lib/http.js";
import { readJsonBody } from "../lib/request.js";
import { mapUserRow, getEnrolledCategories } from "../lib/user.js";
import { handleGetStatsProgress } from "./stats.js";
import { handleGetActivity } from "./account.js";
import { handleGetSelfTestHistory } from "./selftest.js";

// ---------- admin: dashboard overview + user directory ----------

// Four cheap COUNT(*) queries for the admin dashboard's KPI row. No single
// query combines all four cleanly (different tables, different filters),
// and at this app's scale there's no need to — four COUNTs is still trivial.
export async function handleAdminOverview(request, env, user) {
  const [totalUsers, totalCategories, totalQuestionSets, pendingApprovalCount] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) as n FROM users").first(),
    env.DB.prepare("SELECT COUNT(*) as n FROM categories WHERE is_active = 1").first(),
    env.DB.prepare("SELECT COUNT(*) as n FROM question_sets").first(),
    env.DB.prepare("SELECT COUNT(*) as n FROM question_sets WHERE visibility = 'pending'").first(),
  ]);
  return json({
    totalUsers: totalUsers?.n || 0,
    totalCategories: totalCategories?.n || 0,
    totalQuestionSets: totalQuestionSets?.n || 0,
    pendingApprovalCount: pendingApprovalCount?.n || 0,
  });
}

// Paginated user directory. Enrolled categories are fetched in a second
// query (IN (...) over the page's user ids) and merged in JS, rather than
// a JSON-aggregating SQL function, to match this codebase's existing
// plain-join style (see handleAdminApprovalHistory/handleListCategories).
export async function handleAdminUsers(request, env, user) {
  const url = new URL(request.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "50", 10) || 50));
  const offset = (page - 1) * pageSize;

  const [totalRow, usersRows] = await Promise.all([
    env.DB.prepare("SELECT COUNT(*) as n FROM users").first(),
    env.DB.prepare(
      "SELECT id, name, email, role, created_at FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?",
    )
      .bind(pageSize, offset)
      .all(),
  ]);

  const rows = usersRows.results || [];
  const userIds = rows.map((r) => r.id);
  let categoriesByUser = new Map();
  if (userIds.length) {
    const placeholders = userIds.map(() => "?").join(",");
    const { results } = await env.DB.prepare(
      `SELECT uc.user_id as user_id, c.id as id, c.name as name
       FROM user_categories uc JOIN categories c ON c.id = uc.category_id
       WHERE uc.user_id IN (${placeholders})`,
    )
      .bind(...userIds)
      .all();
    categoriesByUser = new Map();
    for (const r of results || []) {
      if (!categoriesByUser.has(r.user_id)) categoriesByUser.set(r.user_id, []);
      categoriesByUser.get(r.user_id).push({ id: r.id, name: r.name });
    }
  }

  return json({
    users: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role,
      createdAt: r.created_at,
      enrolledCategories: categoriesByUser.get(r.id) || [],
    })),
    total: totalRow?.n || 0,
  });
}

// Read-only view of any user's own Stats page data, for support/debugging
// (e.g. "why doesn't this user see any questions"). Reuses the exact same
// per-user stats logic the user's own Stats page calls
// (handleGetStatsProgress/handleGetActivity/handleGetSelfTestHistory) by
// building a user object for the admin-chosen target id instead of the
// session user, rather than duplicating any of that SQL.
//
// A user can be enrolled in multiple categories, each with its own
// independent quota/streak/question pool/progress — Today only ever shows
// the ONE currently-active one. So this takes an optional ?categoryId= to
// let an admin inspect any category the target user is enrolled in, not
// just whichever one happens to be active right now; it's validated
// against that user's own enrolledCategories (never an arbitrary id) and
// falls back to their current activeCategoryId when omitted or invalid.
export async function handleAdminUserStats(request, env, admin, targetUserId) {
  const row = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(targetUserId).first();
  if (!row) return json({ error: "User not found." }, { status: 404 });
  const targetUser = mapUserRow(row);
  const enrolledCategories = await getEnrolledCategories(env, targetUserId);

  const url = new URL(request.url);
  const requestedCategoryId = url.searchParams.get("categoryId");
  const categoryId = enrolledCategories.some((c) => c.id === requestedCategoryId)
    ? requestedCategoryId
    : targetUser.activeCategoryId;
  targetUser.activeCategoryId = categoryId;

  const [progressRes, activityRes, selfTestRes] = await Promise.all([
    handleGetStatsProgress(request, env, targetUser),
    handleGetActivity(request, env, targetUser),
    handleGetSelfTestHistory(request, env, targetUser),
  ]);
  const [progress, activity, selfTestHistory] = await Promise.all([
    progressRes.json(),
    activityRes.json(),
    selfTestRes.json(),
  ]);

  return json({
    user: { id: row.id, name: row.name, email: row.email, track: row.track, dailyQuota: row.daily_quota },
    categoryId,
    enrolledCategories,
    progress,
    activity: activity.events || [],
    selfTestHistory: selfTestHistory.history || [],
  });
}

// ---------- admin: question-set approval queue ----------

export async function handleAdminPendingSets(request, env, user) {
  const rows = await env.DB.prepare(
    `SELECT qs.id as id, qs.title as title, qs.track as track, qs.created_at as created_at,
            u.name as owner_name, u.email as owner_email,
            (SELECT COUNT(*) FROM questions WHERE set_id = qs.id) as question_count
     FROM question_sets qs LEFT JOIN users u ON u.id = qs.owner_user_id
     WHERE qs.visibility = 'pending' ORDER BY qs.created_at ASC`,
  ).all();
  return json({ sets: rows.results || [] });
}

// categoryIds is optional — lets an admin tag a newly-approved set into one
// or more categories (e.g. a shared "General Knowledge" set serving both
// Railway and Police) right at approval time, since there's no earlier
// submitter-side tagging step. Replaces any existing tags for the set
// rather than only adding, so re-tagging an already-shared set is one call.
export async function handleApproveSet(request, env, user, setId) {
  const parsed = await readJsonBody(request, 2000);
  const categoryIds = parsed.ok && Array.isArray(parsed.body.categoryIds)
    ? parsed.body.categoryIds.map((c) => String(c)).filter(Boolean).slice(0, 20)
    : [];

  const row = await env.DB.prepare("SELECT visibility FROM question_sets WHERE id = ?").bind(setId).first();
  if (!row || row.visibility !== "pending") return json({ error: "This set isn't pending review." }, { status: 400 });
  await env.DB.prepare(
    `UPDATE question_sets SET visibility = 'shared', approved_at = ?, approved_by = ?,
            rejected_reason = NULL, rejected_at = NULL, rejected_by = NULL WHERE id = ?`,
  )
    .bind(new Date().toISOString(), user.id, setId)
    .run();

  if (categoryIds.length) {
    await env.DB.prepare("DELETE FROM question_set_categories WHERE set_id = ?").bind(setId).run();
    const stmts = categoryIds.map((categoryId) =>
      env.DB.prepare(
        "INSERT INTO question_set_categories (set_id, category_id) VALUES (?, ?) ON CONFLICT(set_id, category_id) DO NOTHING",
      ).bind(setId, categoryId),
    );
    await env.DB.batch(stmts);
  }

  return json({ ok: true });
}

export async function handleRejectSet(request, env, user, setId) {
  const parsed = await readJsonBody(request, 2000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const reason = (parsed.body.reason || "").toString().trim().slice(0, 300) || "No reason given.";
  const row = await env.DB.prepare("SELECT visibility FROM question_sets WHERE id = ?").bind(setId).first();
  if (!row || row.visibility !== "pending") return json({ error: "This set isn't pending review." }, { status: 400 });
  await env.DB.prepare(
    "UPDATE question_sets SET visibility = 'rejected', rejected_reason = ?, rejected_at = ?, rejected_by = ? WHERE id = ?",
  )
    .bind(reason, new Date().toISOString(), user.id, setId)
    .run();
  return json({ ok: true });
}

// Lets an admin inspect a set's actual questions before deciding — used
// both from the pending queue (review before approving) and from the
// history view (re-check what an already-decided set contained).
export async function handleAdminGetSetQuestions(request, env, user, setId) {
  const rows = await env.DB.prepare(
    "SELECT q, a, topic_label FROM questions WHERE set_id = ? ORDER BY topic_order ASC, sort_order ASC",
  )
    .bind(setId)
    .all();
  return json({ questions: rows.results || [] });
}

// Audit trail: every set that's been decided one way or the other, who
// decided it, and how many questions were in it at that time.
export async function handleAdminApprovalHistory(request, env, user) {
  const rows = await env.DB.prepare(
    `SELECT qs.id as id, qs.title as title, qs.track as track, qs.visibility as visibility,
            qs.created_at as created_at, qs.approved_at as approved_at, qs.rejected_at as rejected_at,
            qs.rejected_reason as rejected_reason,
            owner.name as owner_name, owner.email as owner_email,
            actor.name as actor_name, actor.email as actor_email,
            (SELECT COUNT(*) FROM questions WHERE set_id = qs.id) as question_count
     FROM question_sets qs
     LEFT JOIN users owner ON owner.id = qs.owner_user_id
     LEFT JOIN users actor ON actor.id = COALESCE(qs.approved_by, qs.rejected_by)
     WHERE qs.visibility IN ('shared', 'rejected') AND qs.owner_user_id IS NOT NULL
     ORDER BY COALESCE(qs.approved_at, qs.rejected_at, qs.created_at) DESC
     LIMIT 200`,
  ).all();
  return json({ history: rows.results || [] });
}
