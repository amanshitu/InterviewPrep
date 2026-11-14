import { json } from "../lib/http.js";
import { readJsonBody } from "../lib/request.js";
import { todayDateStr } from "../lib/datetime.js";
import { getOrCreateMcqVariant } from "../lib/mcq.js";

// ---------- AI: MCQ generation (once per question, cached forever) ----------
const TEST_SIZE = 10;

// ---------- daily multiple-choice test ----------

export async function handleGetTodayTest(request, env, user) {
  const today = todayDateStr(user.timezone);
  const categoryId = user.activeCategoryId;
  const testQuery = `SELECT t.question_id as id, t.selected_index as selected_index, t.correct as correct,
            q.q as q, q.a as a, q.topic_label as topic_label
     FROM daily_test_results t JOIN questions q ON q.id = t.question_id
     WHERE t.user_id = ? AND t.category_id = ? AND t.date = ? ORDER BY t.id ASC`;

  let testRows = ((await env.DB.prepare(testQuery).bind(user.id, categoryId, today).all()).results) || [];

  if (testRows.length === 0) {
    const pool = await env.DB.prepare(
      `SELECT q.id as id FROM user_question_progress p
       JOIN questions q ON q.id = p.question_id
       JOIN question_set_categories qsc ON qsc.set_id = q.set_id AND qsc.category_id = ?
       WHERE p.user_id = ? AND p.status = 'done' ORDER BY RANDOM() LIMIT ?`,
    )
      .bind(categoryId, user.id, TEST_SIZE)
      .all();
    const ids = (pool.results || []).map((r) => r.id);
    if (ids.length) {
      const now = new Date().toISOString();
      const stmts = ids.map((qid) =>
        env.DB.prepare(
          "INSERT INTO daily_test_results (user_id, category_id, date, question_id, selected_index, correct, answered_at) VALUES (?, ?, ?, ?, NULL, 0, ?) ON CONFLICT(user_id, category_id, date, question_id) DO NOTHING",
        ).bind(user.id, categoryId, today, qid, now),
      );
      await env.DB.batch(stmts);
      testRows = ((await env.DB.prepare(testQuery).bind(user.id, categoryId, today).all()).results) || [];
    }
  }

  // Generating a never-before-tested question's MCQ variant means an AI
  // call; running those one at a time for up to TEST_SIZE questions could
  // take tens of seconds end-to-end (and risk the request timing out)
  // before any response reaches the client. Run them concurrently instead
  // — each question's cache lookup/insert is independent (keyed by its own
  // question_id), so there's no cross-question race to worry about.
  const variants = await Promise.all(
    testRows.map((row) => getOrCreateMcqVariant(env, user, { id: row.id, q: row.q, a: row.a })),
  );
  const questions = testRows.map((row, i) => {
    const variant = variants[i];
    return {
      id: row.id,
      q: row.q,
      topic_label: row.topic_label,
      options: variant.options,
      answered: row.selected_index !== null,
      selectedIndex: row.selected_index,
      correct: row.selected_index !== null ? !!row.correct : null,
      correctIndex: row.selected_index !== null ? variant.correctIndex : null,
    };
  });

  return json({ date: today, questions });
}

export async function handleAnswerTest(request, env, user) {
  const parsed = await readJsonBody(request, 2000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const questionId = (parsed.body.question_id || "").toString();
  const selectedIndex = parseInt(parsed.body.selected_index, 10);
  if (!questionId || !Number.isInteger(selectedIndex) || selectedIndex < 0 || selectedIndex > 3) {
    return json({ error: "Invalid answer." }, { status: 400 });
  }

  const variant = await env.DB.prepare("SELECT correct_index FROM mcq_variants WHERE question_id = ?")
    .bind(questionId)
    .first();
  if (!variant) return json({ error: "No test question found for this id." }, { status: 404 });

  const today = todayDateStr(user.timezone);
  const now = new Date().toISOString();
  const correct = selectedIndex === variant.correct_index ? 1 : 0;

  await env.DB.prepare(
    `INSERT INTO daily_test_results (user_id, category_id, date, question_id, selected_index, correct, answered_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, category_id, date, question_id) DO UPDATE SET selected_index = excluded.selected_index, correct = excluded.correct, answered_at = excluded.answered_at`,
  )
    .bind(user.id, user.activeCategoryId, today, questionId, selectedIndex, correct, now)
    .run();

  await env.DB.prepare(
    "INSERT INTO activity_log (user_id, occurred_at, event_type, topic_id, question_id, result, category_id) VALUES (?, ?, 'test_answer', NULL, ?, ?, ?)",
  )
    .bind(user.id, now, questionId, correct ? "got_it" : "again", user.activeCategoryId)
    .run();

  return json({ ok: true, correct: !!correct, correctIndex: variant.correct_index });
}
