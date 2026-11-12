import { json } from "../lib/http.js";
import { readJsonBody } from "../lib/request.js";

// ---------- user-submitted question sets ----------

export async function handleCreateQuestionSet(request, env, user) {
  // Raised from 80000, then 300000 — a CSV-imported set (client-parsed into
  // this same JSON shape) with several hundred detailed rows can run well
  // past 300KB once re-serialized as JSON (per-field quoting/escaping adds
  // real overhead over the raw CSV size), which is what "Request body too
  // large" on import traced back to.
  const parsed = await readJsonBody(request, 2000000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.body;
  const title = (body.title || "").toString().trim();
  const track = body.track ? String(body.track).trim().slice(0, 120) : null;
  const sections = Array.isArray(body.sections) ? body.sections : [];

  if (!title) return json({ error: "Please enter a title for your question set." }, { status: 400 });
  if (sections.length === 0) return json({ error: "Add at least one section." }, { status: 400 });

  for (const section of sections) {
    const label = ((section && section.label) || "").toString().trim();
    const questions = Array.isArray(section && section.questions) ? section.questions : [];
    if (!label) return json({ error: "Every section needs a label." }, { status: 400 });
    if (questions.length === 0) return json({ error: `Section "${label}" needs at least one question.` }, { status: 400 });
    for (const q of questions) {
      if (!q || !String(q.q || "").trim() || !String(q.a || "").trim()) {
        return json({ error: `Every question in "${label}" needs both a question and an answer.` }, { status: 400 });
      }
    }
  }

  const setId = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO question_sets (id, owner_user_id, title, track, visibility, created_at) VALUES (?, ?, ?, ?, 'private', ?)",
  )
    .bind(setId, user.id, title, track, now)
    .run();

  const stmts = [];
  // Tag the new set into whichever category the user is currently working
  // in, so it actually shows up in that category's daily queue - the
  // queue-building query (getTodayQueueQuestions) requires a
  // question_set_categories row for every category, with no exception for
  // a user's own private sets, so without this a freshly uploaded set was
  // previously invisible everywhere until an admin separately approved and
  // category-tagged it (which only happens for sets submitted for
  // *sharing*, not for private personal use).
  if (user.activeCategoryId) {
    stmts.push(
      env.DB.prepare(
        "INSERT INTO question_set_categories (set_id, category_id) VALUES (?, ?) ON CONFLICT(set_id, category_id) DO NOTHING",
      ).bind(setId, user.activeCategoryId),
    );
  }
  sections.forEach((section, topicOrder) => {
    const label = String(section.label).trim();
    section.questions.forEach((q, sortOrder) => {
      stmts.push(
        env.DB.prepare(
          "INSERT INTO questions (id, set_id, topic_label, topic_order, sort_order, q, a, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
        ).bind(crypto.randomUUID(), setId, label, topicOrder, sortOrder, String(q.q).trim(), String(q.a).trim(), now),
      );
    });
  });
  stmts.push(
    env.DB.prepare(
      "INSERT INTO user_question_sets (user_id, set_id, subscribed_at) VALUES (?, ?, ?) ON CONFLICT(user_id, set_id) DO NOTHING",
    ).bind(user.id, setId, now),
  );
  await env.DB.batch(stmts);

  return json({ set: { id: setId, title, track, visibility: "private" } });
}

export async function handleListMySets(request, env, user) {
  const rows = await env.DB.prepare(
    `SELECT qs.id as id, qs.title as title, qs.track as track, qs.visibility as visibility, qs.created_at as created_at, qs.rejected_reason as rejected_reason,
            (SELECT COUNT(*) FROM questions q WHERE q.set_id = qs.id) as question_count,
            (SELECT GROUP_CONCAT(c.name, ', ') FROM question_set_categories qsc JOIN categories c ON c.id = qsc.category_id WHERE qsc.set_id = qs.id) as category_names
     FROM question_sets qs WHERE qs.owner_user_id = ? ORDER BY qs.created_at DESC`,
  )
    .bind(user.id)
    .all();
  return json({ sets: rows.results || [] });
}

// Powers the header's book-icon stat pill — "yours" is everything this user
// can see (official + subscribed shared sets + their own), "total" is every
// question anyone on the platform has ever added, regardless of visibility.
export async function handleGetBankCount(request, env, user) {
  const yoursRow = await env.DB.prepare(
    `SELECT COUNT(*) as c FROM questions q JOIN user_question_sets uqs ON uqs.set_id = q.set_id AND uqs.user_id = ?`,
  )
    .bind(user.id)
    .first();
  const totalRow = await env.DB.prepare("SELECT COUNT(*) as c FROM questions").first();
  return json({ yours: yoursRow.c, total: totalRow.c });
}

export async function handleSubmitSet(request, env, user, setId) {
  const row = await env.DB.prepare("SELECT owner_user_id, visibility FROM question_sets WHERE id = ?")
    .bind(setId)
    .first();
  if (!row || row.owner_user_id !== user.id) return json({ error: "Question set not found." }, { status: 404 });
  if (row.visibility !== "private" && row.visibility !== "rejected") {
    return json({ error: "Only a private or rejected set can be submitted for review." }, { status: 400 });
  }
  await env.DB.prepare("UPDATE question_sets SET visibility = 'pending', rejected_reason = NULL WHERE id = ?")
    .bind(setId)
    .run();
  return json({ ok: true });
}

export async function handleSubscribeSet(request, env, user, setId) {
  const row = await env.DB.prepare("SELECT visibility FROM question_sets WHERE id = ?").bind(setId).first();
  if (!row || row.visibility !== "shared") {
    return json({ error: "This question set isn't available to subscribe to." }, { status: 400 });
  }
  await env.DB.prepare(
    "INSERT INTO user_question_sets (user_id, set_id, subscribed_at) VALUES (?, ?, ?) ON CONFLICT(user_id, set_id) DO NOTHING",
  )
    .bind(user.id, setId, new Date().toISOString())
    .run();
  return json({ ok: true });
}

export async function handleListSuggestions(request, env, user) {
  // Shared, user-submitted sets (not the official ones, which everyone is
  // already auto-subscribed to) that this user hasn't picked up yet — sets
  // matching the user's own track are surfaced first. Scoped to the user's
  // active category (same question_set_categories join the daily queue
  // itself uses) so a user working on Railway Exam isn't suggested a set
  // an admin only ever tagged into Police Exam, and vice versa.
  const rows = await env.DB.prepare(
    `SELECT qs.id as id, qs.title as title, qs.track as track, u.name as owner_name
     FROM question_sets qs
     JOIN question_set_categories qsc ON qsc.set_id = qs.id AND qsc.category_id = ?
     LEFT JOIN users u ON u.id = qs.owner_user_id
     WHERE qs.visibility = 'shared' AND qs.owner_user_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM user_question_sets WHERE user_id = ? AND set_id = qs.id)
     ORDER BY (qs.track IS NOT NULL AND qs.track = ?) DESC, qs.created_at DESC`,
  )
    .bind(user.activeCategoryId, user.id, user.track || "")
    .all();
  return json({ sets: rows.results || [] });
}
