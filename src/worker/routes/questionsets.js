import { json } from "../lib/http.js";
import { readJsonBody } from "../lib/request.js";
import { callConfiguredAi } from "../lib/ai.js";

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
  const requestedCategoryId = body.categoryId ? String(body.categoryId).trim() : null;

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

  // A set can now be explicitly tagged to ANY active category (not just the
  // user's current one) — lets users add questions to a category they
  // aren't even enrolled in. Falls back to the user's active category when
  // no (valid) categoryId is given, for backward compatibility with any
  // other caller of this endpoint.
  let categoryId = user.activeCategoryId || null;
  if (requestedCategoryId) {
    const category = await env.DB.prepare("SELECT id FROM categories WHERE id = ? AND is_active = 1").bind(requestedCategoryId).first();
    if (category) categoryId = category.id;
  }

  // Admins adding questions directly to a chosen category publish
  // immediately — their own approval IS the review step, so routing their
  // own uploads through the private→submit→approve pipeline they
  // themselves operate would be pure busywork. Everyone else keeps the
  // existing private-first flow.
  const visibility = user.role === "admin" && categoryId ? "shared" : "private";

  const setId = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO question_sets (id, owner_user_id, title, track, visibility, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(setId, user.id, title, track, visibility, now)
    .run();

  const stmts = [];
  // Tag the new set into the resolved category so it actually shows up in
  // that category's daily queue - the queue-building query
  // (getTodayQueueQuestions) requires a question_set_categories row for
  // every category, with no exception for a user's own private sets, so
  // without this a freshly uploaded set was previously invisible
  // everywhere until an admin separately approved and category-tagged it
  // (which only happens for sets submitted for *sharing*, not for private
  // personal use).
  if (categoryId) {
    stmts.push(
      env.DB.prepare(
        "INSERT INTO question_set_categories (set_id, category_id) VALUES (?, ?) ON CONFLICT(set_id, category_id) DO NOTHING",
      ).bind(setId, categoryId),
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

  return json({ set: { id: setId, title, track, visibility } });
}

// ---------- AI: category-scoped question-generation prompt ----------
// Mirrors resume.js's buildPromptGenerationMetaPrompt pattern: the AI writes
// a tailored *prompt* grounded in the chosen category's real name/
// description, not the Q&A content itself — the user pastes that prompt
// into their own ChatGPT/Claude, then pastes the reply back in to import.

function categoryPromptFormatRules(count) {
  return `Generate exactly ${count} questions total, organized into logical sub-topic sections appropriate for this category (group related questions under a shared section label; use as many or as few distinct sections as make sense for ${count} questions).

Output ONLY a CSV — no commentary, no markdown code fences, nothing before or after it. Use exactly this header row:
section,question,answer

Rules:
- Each answer must be accurate, specific, and exam/interview-appropriate for this category — not generic filler.
- If a field contains a comma, wrap the whole field in double quotes. If a field contains a double quote, escape it by doubling it ("").
- Do not add row numbers, extra columns, or blank lines.`;
}

function buildCategoryPromptMetaPrompt({ categoryName, categoryDescription, topics, count }) {
  return `You are an expert exam/interview-prep content writer writing a prompt that will be pasted into a separate AI assistant (ChatGPT or Claude) to generate questions and model answers for a specific prep category on a study app.

Your ONLY job is to write that prompt's text. Do NOT answer it yourself, do NOT generate any example questions or answers, and do NOT include any actual CSV rows — the other assistant does that part after receiving your prompt. Keep your own framing short: 3-5 sentences, nothing more.

Category: ${categoryName}
Category description: ${categoryDescription || "(no description given)"}
${topics ? `Focus specifically on these topics/areas within the category: ${topics}` : "Cover a broad, representative spread of sub-topics within this category."}

Base your framing on the category's actual real-world subject matter — be specific about the kind of questions and difficulty level appropriate for it (e.g. competitive-exam trivia vs. senior interview judgment questions — infer which fits from the category name/description), so the other assistant produces genuinely useful, on-topic content instead of generic placeholder questions.

Immediately after your framing, append the following output-format instructions verbatim — copy them exactly as given here, do not paraphrase, shorten, omit, or add anything after them, since another program will parse the other assistant's eventual reply as a CSV file:

${categoryPromptFormatRules(count)}

Respond with ONLY the finished prompt text itself (your framing immediately followed by the verbatim rules above) — no commentary about what you wrote, no markdown code fences, no example rows, nothing before or after it.`;
}

export async function handleGenerateCategoryPrompt(request, env, user) {
  const parsed = await readJsonBody(request, 4000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const categoryId = (parsed.body.categoryId || "").toString().trim();
  const topics = (parsed.body.topics || "").toString().trim().slice(0, 500);
  const count = Math.max(5, Math.min(60, parseInt(parsed.body.count, 10) || 20));

  if (!categoryId) return json({ error: "Pick a category first." }, { status: 400 });
  const category = await env.DB.prepare("SELECT id, name, description FROM categories WHERE id = ? AND is_active = 1")
    .bind(categoryId)
    .first();
  if (!category) return json({ error: "That category wasn't found." }, { status: 404 });

  const metaPrompt = buildCategoryPromptMetaPrompt({ categoryName: category.name, categoryDescription: category.description, topics, count });
  // Generous budget: the framing itself is short, but the verbatim rules
  // block it has to reproduce is a few hundred tokens on its own, and the
  // default 600-token budget was clipping replies mid-instruction (same
  // issue resume.js's equivalent endpoint hit).
  const { raw, capped } = await callConfiguredAi(env, user, metaPrompt, "category prompt generation", 1200);
  if (capped) {
    return json(
      { error: "You've used today's free AI allowance — try again tomorrow, or set your own AI key in Settings.", limited: true },
      { status: 429 },
    );
  }
  if (!raw) {
    return json({ error: "Couldn't generate a prompt right now — try again." }, { status: 502 });
  }

  let prompt = raw
    .toString()
    .trim()
    .replace(/^```[a-z]*\n?/i, "")
    .replace(/```$/, "")
    .replace(/^(here'?s|here is)\b[^\n:]*:\s*\n*/i, "")
    .trim();
  if ((prompt.startsWith('"') && prompt.endsWith('"')) || (prompt.startsWith("“") && prompt.endsWith("”"))) {
    prompt = prompt.slice(1, -1).trim();
  }
  if (!prompt.includes("section,question,answer")) {
    prompt += `\n\n${categoryPromptFormatRules(count)}`;
  }

  return json({ prompt: prompt.slice(0, 12000) });
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
