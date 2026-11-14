import { json } from "../lib/http.js";
import { readJsonBody } from "../lib/request.js";
import { logAdminAction } from "../lib/audit.js";

// ---------- question reports (user-reported + admin review/fix) ----------

export async function handleReportQuestion(request, env, user, questionId) {
  const parsed = await readJsonBody(request, 1000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const reason = (parsed.body.reason || "").toString().trim().slice(0, 500);
  if (!reason) return json({ error: "Please describe what's wrong." }, { status: 400 });

  const question = await env.DB.prepare("SELECT id FROM questions WHERE id = ?").bind(questionId).first();
  if (!question) return json({ error: "Question not found." }, { status: 404 });

  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO question_reports (id, question_id, reported_by, reason, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)",
  )
    .bind(id, questionId, user.id, reason, new Date().toISOString())
    .run();

  return json({ ok: true });
}

// Open reports first (oldest first, so the longest-ignored issue surfaces
// first), then resolved/dismissed most-recent-first as a short audit trail.
// Joins in the question's current text — not a snapshot from report time —
// since an admin needs to see what the question looks like *now*, which
// may already reflect a fix from an earlier report on the same question.
export async function handleAdminListReports(request, env, user) {
  const rows = await env.DB.prepare(
    `SELECT r.id as id, r.question_id as question_id, r.reason as reason, r.status as status,
            r.created_at as created_at, r.resolved_at as resolved_at,
            reporter.name as reporter_name, reporter.email as reporter_email,
            resolver.name as resolver_name,
            q.q as q, q.a as a, q.topic_label as topic_label, q.set_id as set_id,
            qs.title as set_title
     FROM question_reports r
     JOIN users reporter ON reporter.id = r.reported_by
     LEFT JOIN users resolver ON resolver.id = r.resolved_by
     LEFT JOIN questions q ON q.id = r.question_id
     LEFT JOIN question_sets qs ON qs.id = q.set_id
     ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END ASC,
              CASE WHEN r.status = 'open' THEN r.created_at END ASC,
              CASE WHEN r.status != 'open' THEN r.resolved_at END DESC
     LIMIT 300`,
  ).all();
  return json({ reports: rows.results || [] });
}

export async function handleAdminResolveReport(request, env, user, reportId) {
  const parsed = await readJsonBody(request, 500);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const action = (parsed.body.action || "").toString();
  if (action !== "resolved" && action !== "dismissed") {
    return json({ error: "action must be 'resolved' or 'dismissed'." }, { status: 400 });
  }
  const report = await env.DB.prepare("SELECT id FROM question_reports WHERE id = ?").bind(reportId).first();
  if (!report) return json({ error: "Report not found." }, { status: 404 });

  await env.DB.prepare(
    "UPDATE question_reports SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?",
  )
    .bind(action, new Date().toISOString(), user.id, reportId)
    .run();

  await logAdminAction(env, user, `question_report_${action}`, "question_report", reportId);
  return json({ ok: true });
}
