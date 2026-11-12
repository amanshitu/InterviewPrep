import { decryptSecret } from "./crypto.js";
import { todayDateStr } from "./datetime.js";

export const AI_PROVIDERS = ["workers-ai", "openai", "anthropic"];

// A curated, verified-live (via `wrangler ai models` against this account's
// actual catalog) set of general-purpose text models spanning a few
// different vendors/architectures — not just size variants of one family —
// so a deprecation like @cf/meta/llama-3.1-8b-instruct's (without -fp8, on
// 2026-05-30, which silently broke MCQ generation until caught in
// production) doesn't take out every option at once. Users can switch in
// Settings if their current pick starts erroring; this list is the
// server-side allowlist, so keep public/pages/settings.js's copy in sync.
export const WORKERS_AI_MODELS = [
  { id: "@cf/meta/llama-3.1-8b-instruct-fp8", label: "Llama 3.1 8B (default)" },
  { id: "@cf/meta/llama-3.2-3b-instruct", label: "Llama 3.2 3B (smaller, faster)" },
  { id: "@cf/mistral/mistral-7b-instruct-v0.2-lora", label: "Mistral 7B" },
  { id: "@cf/google/gemma-2b-it-lora", label: "Gemma 2B (fastest)" },
  { id: "@cf/zai-org/glm-4.7-flash", label: "GLM 4.7 Flash" },
  { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B (higher quality, costs more of your daily cap)" },
];
export const WORKERS_AI_MODEL_IDS = WORKERS_AI_MODELS.map((m) => m.id);
export const DEFAULT_WORKERS_AI_MODEL = WORKERS_AI_MODELS[0].id;

export function resolveWorkersAiModel(user) {
  return WORKERS_AI_MODEL_IDS.includes(user.workersAiModel) ? user.workersAiModel : DEFAULT_WORKERS_AI_MODEL;
}

async function callWorkersAi(env, prompt, model, maxTokens = 600) {
  const result = await env.AI.run(model || DEFAULT_WORKERS_AI_MODEL, {
    messages: [{ role: "user", content: prompt }],
    temperature: 0.4,
    max_tokens: maxTokens,
  });
  return result && result.response;
}

async function callOpenAi(apiKey, prompt, maxTokens = 600) {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
      max_tokens: maxTokens,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI request failed (${res.status})`);
  const data = await res.json();
  return data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content;
}

async function callAnthropic(apiKey, prompt, maxTokens = 600) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-3-5-haiku-20241022",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic request failed (${res.status})`);
  const data = await res.json();
  return data.content && data.content[0] && data.content[0].text;
}

// ---------- AI usage capping ----------
// The shared Workers AI free tier is one pool for the whole account, so
// one user completing hundreds of brand-new questions in a day could
// eat everyone else's quota. BYOK users pay for (and are limited by)
// their own key, so the cap only applies when using the shared default.
export const FREE_AI_DAILY_CAP = 20;

export function usesByok(user) {
  return !!(user.aiProvider && user.aiProvider !== "workers-ai" && user.aiKeyCiphertext);
}

// Atomically increments today's usage counter iff it's under the cap —
// the conditional UPDATE either changes a row or it doesn't, so this is
// race-safe under concurrent requests (unlike a read-then-write check).
async function checkAndIncrementAiUsage(env, userId, today) {
  await env.DB.prepare("INSERT INTO ai_usage (user_id, date, count) VALUES (?, ?, 0) ON CONFLICT(user_id, date) DO NOTHING")
    .bind(userId, today)
    .run();
  const result = await env.DB.prepare("UPDATE ai_usage SET count = count + 1 WHERE user_id = ? AND date = ? AND count < ?")
    .bind(userId, today, FREE_AI_DAILY_CAP)
    .run();
  const allowed = !!(result.meta && result.meta.changes > 0);
  const row = await env.DB.prepare("SELECT count FROM ai_usage WHERE user_id = ? AND date = ?").bind(userId, today).first();
  return { allowed, used: (row && row.count) || 0, cap: FREE_AI_DAILY_CAP };
}

// Calls whichever provider the user is configured for. When using the
// shared Workers AI default, this first spends one unit of the daily
// cap — if the cap is already used up, returns null without calling
// anything (the caller falls back to a generic response and, for
// cacheable results, must NOT persist that fallback permanently).
export async function callConfiguredAi(env, user, prompt, label, maxTokens = 600) {
  if (usesByok(user)) {
    try {
      const apiKey = await decryptSecret(env, user.aiKeyCiphertext, user.aiKeyIv);
      const raw =
        user.aiProvider === "anthropic"
          ? await callAnthropic(apiKey, prompt, maxTokens)
          : await callOpenAi(apiKey, prompt, maxTokens);
      return { raw, generatedBy: user.aiProvider, capped: false };
    } catch (err) {
      console.error(`[${label}] provider=${user.aiProvider} error=${err && err.message ? err.message : err}`);
      return { raw: null, generatedBy: user.aiProvider, capped: false };
    }
  }

  const usage = await checkAndIncrementAiUsage(env, user.id, todayDateStr(user.timezone));
  if (!usage.allowed) {
    return { raw: null, generatedBy: "workers-ai", capped: true };
  }
  const model = resolveWorkersAiModel(user);
  try {
    const raw = await callWorkersAi(env, prompt, model, maxTokens);
    return { raw, generatedBy: "workers-ai", model, capped: false };
  } catch (err) {
    console.error(`[${label}] provider=workers-ai model=${model} error=${err && err.message ? err.message : err}`);
    return { raw: null, generatedBy: "workers-ai", model, capped: false };
  }
}
