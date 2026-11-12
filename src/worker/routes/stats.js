import { json } from "../lib/http.js";
import { todayDateStr } from "../lib/datetime.js";
import { usesByok, FREE_AI_DAILY_CAP, callConfiguredAi } from "../lib/ai.js";

// ---------- Stats: per-topic progress + accuracy (for "target areas") ----------
// Completion counts come from the relational content model (every set a
// user can see has a row in user_question_sets, per the signup/subscribe
// flow) joined against their per-question progress; accuracy reuses the
// same activity_log aggregation handleGetStatsInsight does, just exposed
// as raw per-topic numbers instead of folded into an AI prompt.

export async function handleGetStatsProgress(request, env, user) {
  const totalsRows = await env.DB.prepare(
    `SELECT q.topic_label as topic, COUNT(*) as total,
            SUM(CASE WHEN p.status = 'done' THEN 1 ELSE 0 END) as completed,
            MIN(q.topic_order) as minOrder
     FROM questions q
     JOIN user_question_sets uqs ON uqs.set_id = q.set_id AND uqs.user_id = ?
     JOIN question_set_categories qsc ON qsc.set_id = q.set_id AND qsc.category_id = ?
     LEFT JOIN user_question_progress p ON p.user_id = ? AND p.question_id = q.id
     GROUP BY q.topic_label
     ORDER BY minOrder ASC`,
  )
    .bind(user.id, user.activeCategoryId, user.id)
    .all();

  const accuracyRows = await env.DB.prepare(
    `SELECT topic_id as topic, COUNT(*) as attempts,
            SUM(CASE WHEN result = 'again' THEN 1 ELSE 0 END) as againCount
     FROM activity_log
     WHERE user_id = ? AND category_id = ? AND event_type = 'review' AND result IS NOT NULL AND topic_id IS NOT NULL
     GROUP BY topic_id`,
  )
    .bind(user.id, user.activeCategoryId)
    .all();

  const accuracyByTopic = {};
  (accuracyRows.results || []).forEach((r) => {
    accuracyByTopic[r.topic] = { attempts: r.attempts, againCount: r.againCount };
  });

  let totalQuestions = 0;
  let totalCompleted = 0;
  const topics = (totalsRows.results || []).map((r) => {
    const total = r.total || 0;
    const completed = r.completed || 0;
    totalQuestions += total;
    totalCompleted += completed;
    const acc = accuracyByTopic[r.topic];
    const accuracyPct = acc && acc.attempts >= 2 ? Math.round(((acc.attempts - acc.againCount) / acc.attempts) * 100) : null;
    return {
      topic: r.topic,
      total,
      completed,
      completionPct: total ? Math.round((completed / total) * 100) : 0,
      attempts: acc ? acc.attempts : 0,
      accuracyPct,
    };
  });

  // "Focus areas" — topics that are either mostly untouched or where the
  // user struggles once they do attempt them, ranked worst-first. Needs
  // at least a little signal (some completion or some attempts) so a
  // brand-new topic with 0/0 doesn't dominate the list ahead of real gaps.
  const focusAreas = topics
    .filter((t) => t.total > 0 && (t.completed > 0 || t.completionPct < 100))
    .map((t) => {
      const completionGap = 1 - t.completed / t.total;
      const accuracyGap = t.accuracyPct === null ? 0 : 1 - t.accuracyPct / 100;
      return { ...t, focusScore: completionGap * 0.6 + accuracyGap * 0.4 };
    })
    .sort((a, b) => b.focusScore - a.focusScore)
    .slice(0, 3);

  return json({
    topics,
    overall: {
      totalQuestions,
      totalCompleted,
      completionPct: totalQuestions ? Math.round((totalCompleted / totalQuestions) * 100) : 0,
    },
    focusAreas,
  });
}

// ---------- AI: personalized Stats insight (cached once per user/day) ----------

export async function handleGetStatsInsight(request, env, user) {
  const today = todayDateStr(user.timezone);
  const cached = await env.DB.prepare("SELECT insight, generated_by FROM ai_stats_insights WHERE user_id = ? AND category_id = ? AND date = ?")
    .bind(user.id, user.activeCategoryId, today)
    .first();
  if (cached) return json({ insight: cached.insight, generatedBy: cached.generated_by, cached: true });

  const rows = await env.DB.prepare(
    `SELECT topic_id, result FROM activity_log
     WHERE user_id = ? AND category_id = ? AND event_type = 'review' AND result IS NOT NULL
     ORDER BY occurred_at DESC LIMIT 300`,
  )
    .bind(user.id, user.activeCategoryId)
    .all();
  const events = rows.results || [];

  if (events.length < 3) {
    return json({
      insight: "Not enough review history yet for a personalized insight — keep completing daily reviews and check back.",
      generatedBy: null,
      cached: false,
    });
  }

  const topicAgg = {};
  events.forEach((e) => {
    if (!e.topic_id) return;
    topicAgg[e.topic_id] = topicAgg[e.topic_id] || { total: 0, again: 0 };
    topicAgg[e.topic_id].total++;
    if (e.result === "again") topicAgg[e.topic_id].again++;
  });
  const weakTopics = Object.entries(topicAgg)
    .map(([label, v]) => ({ label, rate: v.again / v.total, total: v.total }))
    .filter((x) => x.total >= 2)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 3);

  const profileBits = [
    user.track ? `preparing for: ${user.track}` : null,
    user.headline ? `current role: ${user.headline}` : null,
    typeof user.yearsExperience === "number" ? `${user.yearsExperience} years of experience` : null,
    user.bio ? `background: ${user.bio}` : null,
  ].filter(Boolean);

  const summary = `${profileBits.length ? profileBits.join("; ") + ". " : ""}Current streak: ${user.streakCount || 0} days (longest ${user.streakLongest || 0}). Graded reviews so far: ${events.length}. Weakest topics: ${
    weakTopics.length
      ? weakTopics.map((t) => `${t.label} (marked "review again" on ${Math.round(t.rate * 100)}% of ${t.total} attempts)`).join("; ")
      : "none stand out yet"
  }.`;
  const prompt = `You are a supportive interview-prep coach. Based on this user's profile and stats, write a short, specific, encouraging insight (2-3 sentences, plain text, no markdown) and one concrete suggestion for what to focus on next — tailor it to their stated role/experience/goal when given.\n\nProfile & stats: ${summary}`;

  const { raw, generatedBy, capped } = await callConfiguredAi(env, user, prompt, "stats insight");
  if (capped) {
    return json({
      insight: null,
      limited: true,
      cap: FREE_AI_DAILY_CAP,
      message: "You've used today's free AI insight/test-generation allowance — try again tomorrow, or set your own AI key in Settings for unlimited use.",
    });
  }

  const insight = (raw && raw.trim().slice(0, 600)) || "Keep at it — steady daily review is what moves the needle most, and there isn't a clear weak spot yet to call out.";
  await env.DB.prepare(
    `INSERT INTO ai_stats_insights (user_id, category_id, date, insight, generated_by, generated_at) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id, category_id, date) DO UPDATE SET insight = excluded.insight, generated_by = excluded.generated_by, generated_at = excluded.generated_at`,
  )
    .bind(user.id, user.activeCategoryId, today, insight, generatedBy, new Date().toISOString())
    .run();

  return json({ insight, generatedBy, cached: false });
}

export async function handleGetAiUsage(request, env, user) {
  if (usesByok(user)) return json({ unlimited: true, used: 0, cap: null });
  const today = todayDateStr(user.timezone);
  const row = await env.DB.prepare("SELECT count FROM ai_usage WHERE user_id = ? AND date = ?").bind(user.id, today).first();
  return json({ unlimited: false, used: (row && row.count) || 0, cap: FREE_AI_DAILY_CAP });
}
