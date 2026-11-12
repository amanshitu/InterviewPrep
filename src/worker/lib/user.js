import { WORKERS_AI_MODEL_IDS, DEFAULT_WORKERS_AI_MODEL } from "./ai.js";

// Normalizes a raw D1 users-table row (snake_case columns) into the same
// camelCase shape getUserFromRequest() returns, so handleLogin/handleSignup
// can build a session payload the same way instead of hand-rolling a
// second, easy-to-drift-from-reality object literal (a real earlier bug:
// the login response was missing aiProvider/hasAiKey entirely).
export function mapUserRow(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    createdAt: row.created_at,
    track: row.track,
    role: row.role,
    activeCategoryId: row.active_category_id,
    dailyQuota: row.daily_quota,
    streakCount: row.streak_count,
    streakLongest: row.streak_longest,
    streakLastActive: row.streak_last_active,
    aiProvider: row.ai_provider,
    aiKeyCiphertext: row.ai_key_ciphertext,
    aiKeyIv: row.ai_key_iv,
    headline: row.headline,
    yearsExperience: row.years_experience,
    bio: row.bio,
    timezone: row.timezone,
    workersAiModel: row.workers_ai_model,
    avatarData: row.avatar_data,
  };
}

export function userPayload(user) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt,
    track: user.track,
    role: user.role,
    activeCategoryId: user.activeCategoryId,
    dailyQuota: user.dailyQuota,
    streak: { count: user.streakCount || 0, longest: user.streakLongest || 0, lastActiveDate: user.streakLastActive || null },
    aiProvider: user.aiProvider || "workers-ai",
    hasAiKey: !!user.aiKeyCiphertext,
    headline: user.headline || "",
    yearsExperience: typeof user.yearsExperience === "number" ? user.yearsExperience : null,
    bio: user.bio || "",
    timezone: user.timezone || "UTC",
    workersAiModel: WORKERS_AI_MODEL_IDS.includes(user.workersAiModel) ? user.workersAiModel : DEFAULT_WORKERS_AI_MODEL,
    avatarData: user.avatarData || null,
  };
}

export function clampQuota(n) {
  const v = parseInt(n, 10);
  if (!Number.isFinite(v)) return 10;
  return Math.min(50, Math.max(5, v));
}

// Every response that hands the frontend a user object (signup, login,
// password change, /api/me) needs enrolledCategories for the category
// switcher — it's not part of userPayload() itself since it's a list, not
// a scalar column joinable in the same query as getUserFromRequest's hot
// path (that one only needs the scalar activeCategoryId).
export async function getEnrolledCategories(env, userId) {
  const { results } = await env.DB.prepare(
    `SELECT c.id as id, c.name as name FROM categories c
     JOIN user_categories uc ON uc.category_id = c.id
     WHERE uc.user_id = ? ORDER BY c.name ASC`,
  )
    .bind(userId)
    .all();
  return results || [];
}

export async function userPayloadWithCategories(env, user) {
  return { ...userPayload(user), enrolledCategories: await getEnrolledCategories(env, user.id) };
}

export function defaultState() {
  return {
    version: 2,
    topics: {},
    streak: { count: 0, longest: 0, lastActiveDate: null },
    questionStats: {},
  };
}
