import { json } from "../lib/http.js";
import { readJsonBody } from "../lib/request.js";
import { logAdminAction } from "../lib/audit.js";

// ---------- general app feedback (bugs, feature requests, praise) ----------

const CATEGORIES = new Set(["bug", "feature", "general", "praise"]);

export async function handleSubmitFeedback(request, env, user) {
  const parsed = await readJsonBody(request, 3000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const message = (parsed.body.message || "").toString().trim().slice(0, 2000);
  const category = CATEGORIES.has(parsed.body.category) ? parsed.body.category : "general";
  if (!message) return json({ error: "Write a message first." }, { status: 400 });

  const id = crypto.randomUUID();
  await env.DB.prepare(
    "INSERT INTO feedback (id, user_id, category, message, status, created_at) VALUES (?, ?, ?, ?, 'open', ?)",
  )
    .bind(id, user.id, category, message, new Date().toISOString())
    .run();

  return json({ ok: true });
}

export async function handleAdminListFeedback(request, env, user) {
  const rows = await env.DB.prepare(
    `SELECT f.id as id, f.category as category, f.message as message, f.status as status,
            f.created_at as created_at, f.resolved_at as resolved_at,
            u.name as user_name, u.email as user_email,
            resolver.name as resolver_name
     FROM feedback f
     JOIN users u ON u.id = f.user_id
     LEFT JOIN users resolver ON resolver.id = f.resolved_by
     ORDER BY CASE f.status WHEN 'open' THEN 0 ELSE 1 END ASC,
              CASE WHEN f.status = 'open' THEN f.created_at END ASC,
              CASE WHEN f.status != 'open' THEN f.resolved_at END DESC
     LIMIT 300`,
  ).all();
  return json({ feedback: rows.results || [] });
}

export async function handleAdminResolveFeedback(request, env, user, feedbackId) {
  const row = await env.DB.prepare("SELECT id FROM feedback WHERE id = ?").bind(feedbackId).first();
  if (!row) return json({ error: "Feedback not found." }, { status: 404 });

  await env.DB.prepare("UPDATE feedback SET status = 'resolved', resolved_at = ?, resolved_by = ? WHERE id = ?")
    .bind(new Date().toISOString(), user.id, feedbackId)
    .run();

  await logAdminAction(env, user, "feedback_resolved", "feedback", feedbackId);
  return json({ ok: true });
}
