import { json } from "../lib/http.js";
import { readJsonBody } from "../lib/request.js";
import { encryptSecret } from "../lib/crypto.js";
import { clampQuota, userPayloadWithCategories, defaultState } from "../lib/user.js";
import { normalizeTimezone } from "../lib/datetime.js";
import { AI_PROVIDERS, WORKERS_AI_MODEL_IDS, DEFAULT_WORKERS_AI_MODEL } from "../lib/ai.js";

export async function handleGetMe(request, env, user) {
  return json({ user: await userPayloadWithCategories(env, user) });
}

// Client-side canvas resizing (settings.js) keeps real uploads far below
// this — it's a hard backstop against an oversized data URL landing in D1.
const MAX_AVATAR_DATA_URL_LENGTH = 400000;

export async function handleUpdateAccount(request, env, user) {
  const parsed = await readJsonBody(request, MAX_AVATAR_DATA_URL_LENGTH + 2000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const name = (parsed.body.name || "").toString().trim();
  if (!name) return json({ error: "Please enter your name." }, { status: 400 });

  let avatarData = user.avatarData || null;
  if (Object.prototype.hasOwnProperty.call(parsed.body, "avatarData")) {
    const raw = parsed.body.avatarData;
    if (raw === null) {
      avatarData = null;
    } else if (typeof raw === "string" && /^data:image\/(png|jpeg|webp);base64,/.test(raw)) {
      if (raw.length > MAX_AVATAR_DATA_URL_LENGTH) {
        return json({ error: "Image is too large. Please choose a smaller picture." }, { status: 400 });
      }
      avatarData = raw;
    } else {
      return json({ error: "Invalid image data." }, { status: 400 });
    }
  }

  await env.DB.prepare("UPDATE users SET name = ?, avatar_data = ? WHERE id = ?").bind(name, avatarData, user.id).run();
  return json({ user: await userPayloadWithCategories(env, { ...user, name, avatarData }) });
}

export async function handleUpdateProfile(request, env, user) {
  const parsed = await readJsonBody(request, 4000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.body;
  const track = body.track !== undefined ? (body.track ? String(body.track).trim().slice(0, 120) : null) : user.track;
  const dailyQuota = body.dailyQuota !== undefined ? clampQuota(body.dailyQuota) : user.dailyQuota;
  const headline = body.headline !== undefined ? (body.headline ? String(body.headline).trim().slice(0, 140) : null) : user.headline;
  const bio = body.bio !== undefined ? (body.bio ? String(body.bio).trim().slice(0, 600) : null) : user.bio;
  const yearsExperience =
    body.yearsExperience !== undefined
      ? (body.yearsExperience === null || body.yearsExperience === "" ? null : Math.max(0, Math.min(60, parseInt(body.yearsExperience, 10) || 0)))
      : user.yearsExperience;
  const timezone = body.timezone !== undefined ? normalizeTimezone(body.timezone) : user.timezone;
  const workersAiModel =
    body.workersAiModel !== undefined
      ? (WORKERS_AI_MODEL_IDS.includes(body.workersAiModel) ? body.workersAiModel : DEFAULT_WORKERS_AI_MODEL)
      : user.workersAiModel;

  let aiProvider = user.aiProvider;
  let aiKeyCiphertext = user.aiKeyCiphertext;
  let aiKeyIv = user.aiKeyIv;

  if (body.aiApiKey === "") {
    // Explicit clear: drop back to the shared Workers AI default.
    aiProvider = null;
    aiKeyCiphertext = null;
    aiKeyIv = null;
  } else if (typeof body.aiApiKey === "string" && body.aiApiKey.trim()) {
    const provider = AI_PROVIDERS.includes(body.aiProvider) ? body.aiProvider : "openai";
    if (provider === "workers-ai") {
      return json({ error: "Workers AI doesn't need an API key — clear the key field instead." }, { status: 400 });
    }
    const enc = await encryptSecret(env, body.aiApiKey.trim());
    aiProvider = provider;
    aiKeyCiphertext = enc.ciphertext;
    aiKeyIv = enc.iv;
  } else if (body.aiProvider === "workers-ai") {
    aiProvider = null;
    aiKeyCiphertext = null;
    aiKeyIv = null;
  }

  await env.DB.prepare(
    `UPDATE users SET track = ?, ai_provider = ?, ai_key_ciphertext = ?, ai_key_iv = ?,
            headline = ?, bio = ?, years_experience = ?, timezone = ?, workers_ai_model = ? WHERE id = ?`,
  )
    .bind(track, aiProvider, aiKeyCiphertext, aiKeyIv, headline, bio, yearsExperience, timezone, workersAiModel, user.id)
    .run();
  // Quota is per-category (user_categories), not a column on users — update
  // the active category's row, same one getUserFromRequest/handleLogin read.
  if (user.activeCategoryId) {
    await env.DB.prepare("UPDATE user_categories SET daily_quota = ? WHERE user_id = ? AND category_id = ?")
      .bind(dailyQuota, user.id, user.activeCategoryId)
      .run();
  }

  return json({
    user: await userPayloadWithCategories(env, {
      ...user, track, dailyQuota, aiProvider, aiKeyCiphertext, aiKeyIv, headline, bio, yearsExperience, timezone, workersAiModel,
    }),
  });
}

// ---------- progress state ----------

export async function handleGetState(request, env, user) {
  const row = await env.DB.prepare("SELECT state_json FROM user_state WHERE user_id = ?")
    .bind(user.id)
    .first();
  if (!row) return json({ state: defaultState() });
  try {
    return json({ state: JSON.parse(row.state_json) });
  } catch {
    return json({ state: defaultState() });
  }
}

export async function handlePutState(request, env, user) {
  const parsed = await readJsonBody(request, 260000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const body = parsed.body;
  const state = body && body.state;
  if (!state || typeof state !== "object" || Array.isArray(state)) {
    return json({ error: "State must be a JSON object." }, { status: 400 });
  }
  const serialized = JSON.stringify(state);
  if (serialized.length > 200000) {
    return json({ error: "State too large." }, { status: 413 });
  }
  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO user_state (user_id, state_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET state_json = excluded.state_json, updated_at = excluded.updated_at`,
  )
    .bind(user.id, serialized, now)
    .run();

  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  if (events.length) {
    const stmts = events.map((e) =>
      env.DB.prepare(
        "INSERT INTO activity_log (user_id, occurred_at, event_type, topic_id, question_id, result) VALUES (?, ?, ?, ?, ?, ?)",
      ).bind(
        user.id,
        typeof e.occurred_at === "string" && e.occurred_at ? e.occurred_at : now,
        String(e.event_type || "").slice(0, 32),
        e.topic_id ? String(e.topic_id).slice(0, 64) : null,
        e.question_id ? String(e.question_id).slice(0, 64) : null,
        e.result ? String(e.result).slice(0, 32) : null,
      ),
    );
    await env.DB.batch(stmts);
  }

  return json({ ok: true, updated_at: now });
}

export async function handleGetActivity(request, env, user) {
  const url = new URL(request.url);
  const limit = Math.min(2000, Math.max(1, parseInt(url.searchParams.get("limit") || "1000", 10) || 1000));
  // Left-joined so old, pre-relational activity rows (question_id referring
  // to a question that may since have been removed) still come back.
  const rows = await env.DB.prepare(
    `SELECT a.occurred_at as occurred_at, a.event_type as event_type, a.topic_id as topic_id,
            a.question_id as question_id, a.result as result, q.q as question_text
     FROM activity_log a
     LEFT JOIN questions q ON q.id = a.question_id
     WHERE a.user_id = ? AND a.category_id = ? ORDER BY a.occurred_at DESC LIMIT ?`,
  )
    .bind(user.id, user.activeCategoryId, limit)
    .all();
  return json({ events: rows.results || [] });
}

export async function handleExportProgress(request, env, user) {
  const rows = await env.DB.prepare(
    "SELECT question_id, status, first_shown_at, last_shown_at, last_result, times_shown, correct_streak FROM user_question_progress WHERE user_id = ?",
  )
    .bind(user.id)
    .all();
  return json({
    exportedAt: new Date().toISOString(),
    user: { name: user.name, email: user.email, track: user.track, dailyQuota: user.dailyQuota },
    streak: { count: user.streakCount || 0, longest: user.streakLongest || 0, lastActiveDate: user.streakLastActive },
    progress: rows.results || [],
  });
}
