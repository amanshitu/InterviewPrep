import { callConfiguredAi } from "./ai.js";

function buildMcqPrompt(question, answer) {
  return `You are creating a multiple-choice quiz question from an interview question and its model answer.

Question: ${question}

Model answer: ${answer}

Produce a JSON object with exactly this shape, and nothing else — no markdown fences, no commentary:
{"options": ["...", "...", "...", "..."], "correct_index": 0}

Rules:
- Exactly 4 short options (one sentence each, plain text).
- Exactly one option must be a faithful short paraphrase of the model answer's core point.
- The other three must be plausible but incorrect for this specific question.
- "correct_index" is the 0-based index of the correct option in "options".`;
}

function parseMcqJson(raw) {
  if (!raw) return null;
  let text = String(raw).trim();
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) text = fenced[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const obj = JSON.parse(text.slice(start, end + 1));
    if (!Array.isArray(obj.options) || obj.options.length !== 4) return null;
    if (!Number.isInteger(obj.correct_index) || obj.correct_index < 0 || obj.correct_index > 3) return null;
    return { options: obj.options.map((o) => String(o).slice(0, 300)), correctIndex: obj.correct_index };
  } catch {
    return null;
  }
}

// Used only if the model call fails or returns something unparsable, so the
// daily test never hard-breaks on an AI hiccup — just degrades in quality.
function fallbackMcq(answer) {
  const correct = String(answer).slice(0, 160);
  return {
    options: [
      correct,
      "An unrelated approach that doesn't address the question.",
      "The opposite of the recommended approach.",
      "None of the above.",
    ],
    correctIndex: 0,
  };
}

async function generateMcq(env, user, question, answer) {
  const prompt = buildMcqPrompt(question, answer);
  const { raw, generatedBy, model, capped } = await callConfiguredAi(env, user, prompt, "mcq generation");
  // Record the specific model alongside the provider (e.g.
  // "workers-ai:@cf/meta/llama-3.1-8b-instruct-fp8") so a future admin
  // tool could identify and regenerate MCQs from a model that's since
  // been deprecated, without needing to redo everything.
  const generatedByDetailed = model ? `${generatedBy}:${model}` : generatedBy;
  return { ...(parseMcqJson(raw) || fallbackMcq(answer)), generatedBy: generatedByDetailed, ephemeral: capped };
}

export async function getOrCreateMcqVariant(env, user, question) {
  const existing = await env.DB.prepare("SELECT options_json, correct_index FROM mcq_variants WHERE question_id = ?")
    .bind(question.id)
    .first();
  if (existing) return { options: JSON.parse(existing.options_json), correctIndex: existing.correct_index };

  const generated = await generateMcq(env, user, question.q, question.a);
  if (generated.ephemeral) {
    // Rate-limited, not a real (if low-quality) AI answer — don't cache
    // this permanently, so a later, uncapped request can generate it
    // properly instead of every future user being stuck with a filler.
    return { options: generated.options, correctIndex: generated.correctIndex };
  }

  await env.DB.prepare(
    "INSERT INTO mcq_variants (question_id, options_json, correct_index, generated_by, generated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(question_id) DO NOTHING",
  )
    .bind(question.id, JSON.stringify(generated.options), generated.correctIndex, generated.generatedBy, new Date().toISOString())
    .run();

  // Re-read so a concurrent generation race converges on one canonical variant.
  const row = await env.DB.prepare("SELECT options_json, correct_index FROM mcq_variants WHERE question_id = ?")
    .bind(question.id)
    .first();
  return { options: JSON.parse(row.options_json), correctIndex: row.correct_index };
}
