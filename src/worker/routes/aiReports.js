import { json } from "../lib/http.js";
import { readJsonBody } from "../lib/request.js";
import { logAdminAction } from "../lib/audit.js";

// ---------- AI output quality reports (Self Test feedback, coaching insight) ----------
// Separate from question_reports: those reference a real questions.id;
// these flag a specific piece of *generated* text that has no id of its
// own, so a snapshot of the flagged content is stored directly instead.

const CONTENT_TYPES = new Set(["self_test_feedback", "coaching_insight"]);

export async function handleReportAiContent(request, env, user) {
  const parsed = await readJsonBody(request, 4000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const contentType = CONTENT_TYPES.has(parsed.body.contentType) ? parsed.body.contentType : null;
  const contentSnapshot = (parsed.body.contentSnapshot || "").toString().trim().slice(0, 3000);
  const reason = (parsed.body.reason || "").toString().trim().slice(0, 500);
  if (!contentType) return json({ error: "Unknown content type." }, { status: 400 });
  if (!contentSnapshot) return json({ error: "Nothing to report." }, { status: 400 });
  if (!reason) return json({ error: "Please describe what's wrong." }, { status: 400 });

  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO ai_reports (id, user_id, content_type, content_snapshot, reason, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)",
  )
    .bind(id, user.id, contentType, contentSnapshot, reason, new Date().toISOString())
    .run();

  return json({ ok: true });
}

export async function handleAdminListAiReports(request, env, user) {
  const rows = await env.DB.prepare(
    `SELECT r.id as id, r.content_type as content_type, r.content_snapshot as content_snapshot, r.reason as reason,
            r.status as status, r.created_at as created_at, r.resolved_at as resolved_at,
            reporter.name as reporter_name, reporter.email as reporter_email,
            resolver.name as resolver_name
     FROM ai_reports r
     JOIN users reporter ON reporter.id = r.user_id
     LEFT JOIN users resolver ON resolver.id = r.resolved_by
     ORDER BY CASE r.status WHEN 'open' THEN 0 ELSE 1 END ASC,
              CASE WHEN r.status = 'open' THEN r.created_at END ASC,
              CASE WHEN r.status != 'open' THEN r.resolved_at END DESC
     LIMIT 300`,
  ).all();
  return json({ reports: rows.results || [] });
}

export async function handleAdminResolveAiReport(request, env, user, reportId) {
  const parsed = await readJsonBody(request, 500);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const action = (parsed.body.action || "").toString();
  if (action !== "resolved" && action !== "dismissed") {
    return json({ error: "action must be 'resolved' or 'dismissed'." }, { status: 400 });
  }
  const report = await env.DB.prepare("SELECT id FROM ai_reports WHERE id = ?").bind(reportId).first();
  if (!report) return json({ error: "Report not found." }, { status: 404 });

  await env.DB.prepare("UPDATE ai_reports SET status = ?, resolved_at = ?, resolved_by = ? WHERE id = ?")
    .bind(action, new Date().toISOString(), user.id, reportId)
    .run();

  await logAdminAction(env, user, `ai_report_${action}`, "ai_report", reportId);
  return json({ ok: true });
}
