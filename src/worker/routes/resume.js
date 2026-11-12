import { json } from "../lib/http.js";
import { readJsonBody } from "../lib/request.js";
import { callConfiguredAi } from "../lib/ai.js";

// ---------- AI: suggest a target role from resume text ----------
// A small, cheap call (one short line of output) — unlike the deferred
// "generate 40-60 Q&A from a resume" idea, this fits comfortably within
// the existing FREE_AI_DAILY_CAP/BYOK infra with no new accounting.
// Resume text itself is never persisted — it only passes through this
// one request.

function buildRoleSuggestionPrompt(resumeText) {
  return `Based on the resume below, suggest the single best-suited next job target role/title for this person — their most logical next step, given their background and trajectory.

Resume:
"""
${resumeText}
"""

Respond with ONLY the role title itself (e.g. "Senior Engineering Manager"), nothing else — no explanation, no quotes, no punctuation beyond the title, no markdown.`;
}

export async function handleSuggestTargetRole(request, env, user) {
  const parsed = await readJsonBody(request, 30000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const resumeText = (parsed.body.resumeText || "").toString().trim().slice(0, 24000);
  if (!resumeText) return json({ error: "Paste your resume text first." }, { status: 400 });

  const prompt = buildRoleSuggestionPrompt(resumeText);
  const { raw, capped } = await callConfiguredAi(env, user, prompt, "role suggestion");
  if (capped) {
    return json(
      { error: "You've used today's free AI allowance — try again tomorrow, set your own AI key in Settings, or just type a target role.", limited: true },
      { status: 429 },
    );
  }
  if (!raw) {
    return json({ error: "Couldn't generate a suggestion right now — try again, or just type a target role." }, { status: 502 });
  }

  const role = raw
    .toString()
    .trim()
    .replace(/^["'“”]+|["'“”.]+$/g, "")
    .slice(0, 120);
  if (!role) return json({ error: "Couldn't determine a role — try again or enter one manually." }, { status: 502 });

  return json({ role });
}

// ---------- AI: resume-tailored question-generation prompt ----------
// Also a small, cheap call — the AI writes the *instructions* (tailored
// to this resume's actual companies/tech/seniority), not the 40-60 Q&A
// pairs themselves, so this reuses the same cap/BYOK accounting as the
// role suggestion above rather than needing its own budget.

// The part of the prompt that makes the reply actually importable — kept
// deterministic (never AI-generated) since the CSV importer depends on
// this exact contract. Used both as instructions to the model (so it
// knows what to end its own output with) and as a fallback appended
// server-side if the model's reply somehow drops or mangles it.
function resumePromptFormatRules(categories, perCategory) {
  const categoryList = categories.join(", ");
  return `Generate exactly ${perCategory} questions for EACH of these categories: ${categoryList}.

Output ONLY a CSV — no commentary, no markdown code fences, nothing before or after it. Use exactly this header row:
section,question,answer

Rules:
- "section" must be exactly one of: ${categoryList}.
- Each answer must be a detailed, senior-level model answer (3-6 sentences) that references relevant, specific aspects of the resume and target role — not generic advice.
- If a field contains a comma, wrap the whole field in double quotes. If a field contains a double quote, escape it by doubling it ("").
- Do not add row numbers, extra columns, or blank lines.`;
}

function buildPromptGenerationMetaPrompt({ resumeText, targetRole, categories, perCategory }) {
  const categoryList = categories.join(", ");
  return `You are an expert interview coach writing a prompt that will be pasted into a separate AI assistant (ChatGPT or Claude) to generate senior-level interview questions and model answers.

Your ONLY job is to write that prompt's text. Do NOT answer it yourself, do NOT generate any example questions or answers, and do NOT include any actual CSV rows — the other assistant does that part after receiving your prompt. Keep your own output short: 4-6 sentences of tailored framing, nothing more.

Base that framing specifically on this person's actual background — mention their real companies, technologies, seniority signals, and career trajectory from the resume below, so the questions and answers the other assistant later produces end up genuinely specific to them and their target role instead of generic advice.

Target role: ${targetRole}

Resume:
"""
${resumeText}
"""

Immediately after your framing, append the following output-format instructions verbatim — copy them exactly as given here, do not paraphrase, shorten, omit, or add anything after them, since another program will parse the other assistant's eventual reply as a CSV file:

${resumePromptFormatRules(categories, perCategory)}

Respond with ONLY the finished prompt text itself (your framing immediately followed by the verbatim rules above) — no commentary about what you wrote, no markdown code fences, no example rows, nothing before or after it.`;
}

export async function handleGenerateResumePrompt(request, env, user) {
  const parsed = await readJsonBody(request, 30000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const resumeText = (parsed.body.resumeText || "").toString().trim().slice(0, 24000);
  const targetRole = (parsed.body.targetRole || "").toString().trim().slice(0, 120);
  const categories = Array.isArray(parsed.body.categories)
    ? parsed.body.categories.map((c) => String(c).trim()).filter(Boolean).slice(0, 15)
    : [];
  const perCategory = Math.max(3, Math.min(20, parseInt(parsed.body.perCategory, 10) || 10));

  if (!resumeText) return json({ error: "Paste your resume text first." }, { status: 400 });
  if (!targetRole) return json({ error: "Enter a target role." }, { status: 400 });
  if (categories.length === 0) return json({ error: "Pick at least one category." }, { status: 400 });

  const metaPrompt = buildPromptGenerationMetaPrompt({ resumeText, targetRole, categories, perCategory });
  // Generous budget: the framing itself is short, but the verbatim rules
  // block it has to reproduce is a few hundred tokens on its own, and the
  // default 600-token budget was clipping replies mid-instruction.
  const { raw, capped } = await callConfiguredAi(env, user, metaPrompt, "resume prompt generation", 1200);
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
    // Smaller models routinely ignore "no commentary" and prepend a line
    // like "Here is the prompt:" before the actual content — strip it.
    .replace(/^(here'?s|here is)\b[^\n:]*:\s*\n*/i, "")
    .trim();
  // Same models also sometimes wrap the whole reply in one matching pair
  // of quotes, as if quoting it back — unwrap that too.
  if ((prompt.startsWith('"') && prompt.endsWith('"')) || (prompt.startsWith("“") && prompt.endsWith("”"))) {
    prompt = prompt.slice(1, -1).trim();
  }
  if (!prompt.includes("section,question,answer")) {
    prompt += `\n\n${resumePromptFormatRules(categories, perCategory)}`;
  }

  return json({ prompt: prompt.slice(0, 12000) });
}
