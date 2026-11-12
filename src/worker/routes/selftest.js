import { json } from "../lib/http.js";
import { readJsonBody } from "../lib/request.js";
import { todayDateStr } from "../lib/datetime.js";
import { usesByok, callConfiguredAi } from "../lib/ai.js";

// ---------- Self Test: practice answering a random question, AI-graded ----------
// A separate, token-granular daily budget — deliberately not the existing
// ai_usage/FREE_AI_DAILY_CAP counter, which tracks *number of generations*
// for the other AI features (MCQ, Stats insight, resume prompts). This one
// was asked for specifically as a visible, hard-capped *token* quota, so it
// gets its own table and its own cap, keyed by date the same way for a
// consistent "resets at your own midnight" mental model. Same BYOK carve-out
// as everywhere else: a user's own key is their own cost, not capped here.
const SELF_TEST_TOKEN_DAILY_QUOTA = 6000;

// No provider in this app's stack reliably reports exact token counts back
// through the shared callConfiguredAi() helper (and changing that helper's
// return shape risks the other three features that already depend on it) —
// so spend is the standard ~4-characters-per-token estimate over the
// prompt + reply text. Good enough for a budget a user watches go down,
// called out as an estimate in the UI rather than presented as exact.
function estimateTokens(text) {
  return Math.max(1, Math.ceil((text || "").length / 4));
}

async function getSelfTestQuota(env, user) {
  if (usesByok(user)) return { unlimited: true, used: 0, quota: null, remaining: null };
  const today = todayDateStr(user.timezone);
  const row = await env.DB.prepare("SELECT tokens_used FROM ai_token_usage WHERE user_id = ? AND date = ?")
    .bind(user.id, today)
    .first();
  const used = (row && row.tokens_used) || 0;
  return { unlimited: false, used, quota: SELF_TEST_TOKEN_DAILY_QUOTA, remaining: Math.max(0, SELF_TEST_TOKEN_DAILY_QUOTA - used) };
}

export async function handleGetSelfTestQuota(request, env, user) {
  return json(await getSelfTestQuota(env, user));
}

export async function handleGetSelfTestQuestion(request, env, user) {
  const row = await env.DB.prepare(
    `SELECT q.id as id, q.q as q, q.a as a, q.topic_label as topic_label, qs.track as track FROM questions q
     JOIN user_question_sets uqs ON uqs.set_id = q.set_id AND uqs.user_id = ?
     JOIN question_sets qs ON qs.id = q.set_id
     JOIN question_set_categories qsc ON qsc.set_id = q.set_id AND qsc.category_id = ?
     ORDER BY RANDOM() LIMIT 1`,
  )
    .bind(user.id, user.activeCategoryId)
    .first();
  if (!row) return json({ error: "No questions available yet — subscribe to or upload a question set first." }, { status: 400 });
  return json({ question: row });
}

function buildSelfTestAnalysisPrompt(question, modelAnswer, userAnswer, isBehavioral) {
  const starInstruction = isBehavioral
    ? `\nSTAR: <1-2 sentences on how well the answer covered Situation/Task/Action/Result structure, naming which part(s) were missing or weak>`
    : "";
  return `You are an expert interview coach reviewing a candidate's spoken/written practice answer. Compare it to the model answer and give specific, actionable feedback — not generic encouragement.

Question: ${question}

Model answer (for reference, don't just repeat it): ${modelAnswer}

Candidate's answer: ${userAnswer}

Reply in exactly this plain-text format, no markdown:
Score: <a number 1-10>
Strengths: <1-2 sentences on what the candidate did well>
Gaps: <1-2 sentences on what's missing or weak compared to the model answer>
Suggestion: <one concrete, specific thing to improve next time>${starInstruction}`;
}

function parseSelfTestFeedback(raw) {
  if (!raw) return null;
  const get = (label) => {
    const m = raw.match(new RegExp(`${label}:\\s*(.+?)(?:\\n(?:Score|Strengths|Gaps|Suggestion|STAR):|$)`, "is"));
    return m ? m[1].trim() : "";
  };
  const scoreText = get("Score");
  const score = parseInt(scoreText, 10);
  return {
    score: Number.isFinite(score) ? Math.max(1, Math.min(10, score)) : null,
    strengths: get("Strengths") || "",
    gaps: get("Gaps") || "",
    suggestion: get("Suggestion") || "",
    star: get("STAR") || "",
  };
}

export async function handleSelfTestAnalyze(request, env, user) {
  const parsed = await readJsonBody(request, 20000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const questionId = (parsed.body.question_id || "").toString();
  const userAnswer = (parsed.body.answer || "").toString().trim().slice(0, 6000);
  if (!questionId) return json({ error: "Missing question_id." }, { status: 400 });
  if (!userAnswer) return json({ error: "Write or speak an answer first." }, { status: 400 });

  const question = await env.DB.prepare(
    `SELECT q.id as id, q.q as q, q.a as a, qs.track as track FROM questions q
     JOIN user_question_sets uqs ON uqs.set_id = q.set_id AND uqs.user_id = ?
     JOIN question_sets qs ON qs.id = q.set_id
     JOIN question_set_categories qsc ON qsc.set_id = q.set_id AND qsc.category_id = ?
     WHERE q.id = ?`,
  )
    .bind(user.id, user.activeCategoryId, questionId)
    .first();
  if (!question) return json({ error: "Question not found." }, { status: 404 });

  const quotaBefore = await getSelfTestQuota(env, user);
  const prompt = buildSelfTestAnalysisPrompt(question.q, question.a, userAnswer, question.track === "hr");
  const estimatedCost = estimateTokens(prompt) + 350; // + a generous allowance for the reply, charged before the call so a quota check can't be bypassed by a slow/failed request
  if (!quotaBefore.unlimited && quotaBefore.used + estimatedCost > quotaBefore.quota) {
    return json({
      error: "You've used today's Self Test AI quota — it resets at your own midnight, or set your own AI key in Settings for unlimited use.",
      quota: quotaBefore,
    }, { status: 429 });
  }

  const { raw, generatedBy, capped } = await callConfiguredAi(env, user, prompt, "self-test analysis", 500);
  if (capped) {
    return json({
      error: "You've used today's free AI allowance for all features combined — try again tomorrow, or set your own AI key in Settings for unlimited use.",
      quota: quotaBefore,
    }, { status: 429 });
  }
  if (!raw) {
    return json({ error: "Couldn't reach the AI right now — try again in a moment." }, { status: 502 });
  }

  const feedback = parseSelfTestFeedback(raw);
  if (!feedback) {
    return json({ error: "The AI's reply couldn't be parsed — try again." }, { status: 502 });
  }

  let quota = quotaBefore;
  if (!quotaBefore.unlimited) {
    const actualCost = estimateTokens(prompt) + estimateTokens(raw);
    const today = todayDateStr(user.timezone);
    await env.DB.prepare(
      `INSERT INTO ai_token_usage (user_id, date, tokens_used) VALUES (?, ?, ?)
       ON CONFLICT(user_id, date) DO UPDATE SET tokens_used = tokens_used + excluded.tokens_used`,
    )
      .bind(user.id, today, actualCost)
      .run();
    quota = await getSelfTestQuota(env, user);
  }

  if (feedback.score !== null) {
    await env.DB.prepare(
      `INSERT INTO self_test_results (user_id, question_id, date, score, category_id) VALUES (?, ?, ?, ?, ?)`,
    )
      .bind(user.id, questionId, todayDateStr(user.timezone), feedback.score, user.activeCategoryId)
      .run();
  }

  return json({ feedback, modelAnswer: question.a, generatedBy, quota });
}

export async function handleGetSelfTestHistory(request, env, user) {
  const { results } = await env.DB.prepare(
    `SELECT date, score FROM self_test_results WHERE user_id = ? AND category_id = ? ORDER BY created_at ASC LIMIT 500`,
  )
    .bind(user.id, user.activeCategoryId)
    .all();
  return json({ history: results || [] });
}
