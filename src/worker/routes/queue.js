import { json } from "../lib/http.js";
import { readJsonBody } from "../lib/request.js";
import { todayDateStr } from "../lib/datetime.js";
import { nextDueDate } from "../lib/srs.js";

// ---------- daily queue / quota-carryover engine ----------
// See DEVELOPMENT.md "Locked decisions" for the carry-over rule this
// implements: the daily target stays flat at the user's quota; unfinished
// questions from a prior day get priority in today's queue, capped at 1x
// the daily quota worth of backlog per day.

const EXTRA_BATCH = 5;

export async function getOrCreateTodayLedger(env, userId, categoryId, dailyQuota, today) {
  await env.DB.prepare(
    `INSERT INTO daily_quota_ledger (user_id, category_id, date, base_quota, extra_requested, completed)
     VALUES (?, ?, ?, ?, 0, 0) ON CONFLICT(user_id, category_id, date) DO NOTHING`,
  )
    .bind(userId, categoryId, today, dailyQuota)
    .run();
  return env.DB.prepare("SELECT * FROM daily_quota_ledger WHERE user_id = ? AND category_id = ? AND date = ?")
    .bind(userId, categoryId, today)
    .first();
}

// A question only counts toward "today's queue" for a given category if its
// set is tagged into that category (question_set_categories). This is also
// how a shared question (tagged into 2+ categories) naturally shows up in
// each enrolled category's queue while its progress stays one shared row —
// no category column needed on user_question_progress itself.
async function ensureTodayQueueFilled(env, user, today) {
  const categoryId = user.activeCategoryId;
  const ledger = await getOrCreateTodayLedger(env, user.id, categoryId, user.dailyQuota, today);
  const target = ledger.base_quota + ledger.extra_requested;

  const alreadyQueuedRow = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM user_question_progress p
     JOIN questions q ON q.id = p.question_id
     JOIN question_set_categories qsc ON qsc.set_id = q.set_id AND qsc.category_id = ?
     WHERE p.user_id = ? AND p.queued_for_date = ? AND p.status != 'done'`,
  )
    .bind(categoryId, user.id, today)
    .first();
  const alreadyQueued = (alreadyQueuedRow && alreadyQueuedRow.n) || 0;

  const needed = target - ledger.completed - alreadyQueued;
  if (needed <= 0) return ledger;

  const carryCap = user.dailyQuota;
  const priorityLimit = Math.min(needed, carryCap);
  const priorityRows = await env.DB.prepare(
    `SELECT p.question_id as question_id FROM user_question_progress p
     JOIN questions q ON q.id = p.question_id
     JOIN question_set_categories qsc ON qsc.set_id = q.set_id AND qsc.category_id = ?
     WHERE p.user_id = ? AND p.status != 'done' AND p.queued_for_date IS NOT NULL AND p.queued_for_date < ?
     ORDER BY p.queued_for_date ASC LIMIT ?`,
  )
    .bind(categoryId, user.id, today, priorityLimit)
    .all();
  const priorityIds = (priorityRows.results || []).map((r) => r.question_id);

  const fillCount = needed - priorityIds.length;
  let freshIds = [];
  if (fillCount > 0) {
    // Pull every not-yet-queued question (bounded generously) and round-robin
    // across topics rather than draining topic_order 1 first — otherwise a
    // user only ever sees the first category until it's fully exhausted.
    const freshRows = await env.DB.prepare(
      `SELECT q.id as id, q.topic_order as topic_order FROM questions q
       JOIN user_question_sets uqs ON uqs.set_id = q.set_id AND uqs.user_id = ?
       JOIN question_set_categories qsc ON qsc.set_id = q.set_id AND qsc.category_id = ?
       LEFT JOIN user_question_progress p ON p.user_id = ? AND p.question_id = q.id
       WHERE p.question_id IS NULL
       ORDER BY q.topic_order ASC, q.sort_order ASC LIMIT 5000`,
    )
      .bind(user.id, categoryId, user.id)
      .all();
    const byTopic = new Map();
    for (const r of freshRows.results || []) {
      if (!byTopic.has(r.topic_order)) byTopic.set(r.topic_order, []);
      byTopic.get(r.topic_order).push(r.id);
    }
    const topicQueues = Array.from(byTopic.values());
    let i = 0;
    while (freshIds.length < fillCount && topicQueues.some((q) => q.length > 0)) {
      const queue = topicQueues[i % topicQueues.length];
      if (queue.length > 0) freshIds.push(queue.shift());
      i += 1;
    }
  }

  const allIds = priorityIds.concat(freshIds);
  if (allIds.length) {
    const stmts = allIds.map((qid) =>
      env.DB.prepare(
        `INSERT INTO user_question_progress (user_id, question_id, status, queued_for_date, times_shown, correct_streak)
         VALUES (?, ?, 'queued', ?, 0, 0)
         ON CONFLICT(user_id, question_id) DO UPDATE SET queued_for_date = excluded.queued_for_date
         WHERE user_question_progress.status != 'done'`,
      ).bind(user.id, qid, today),
    );
    await env.DB.batch(stmts);
  }
  return ledger;
}

async function getTodayQueueQuestions(env, user, today) {
  const rows = await env.DB.prepare(
    `SELECT q.id as id, q.q as q, q.a as a, q.topic_label as topic_label, q.set_id as set_id,
            p.status as status, p.last_result as last_result
     FROM user_question_progress p
     JOIN questions q ON q.id = p.question_id
     JOIN question_set_categories qsc ON qsc.set_id = q.set_id AND qsc.category_id = ?
     WHERE p.user_id = ? AND p.queued_for_date = ? AND p.status != 'done'
     ORDER BY q.topic_order ASC, q.sort_order ASC`,
  )
    .bind(user.activeCategoryId, user.id, today)
    .all();
  return rows.results || [];
}

// Today's already-completed questions, kept alongside the active list so
// the UI can show a browsable "Completed today" section that survives a
// page reload — otherwise a done question just vanishes from the queue
// entirely, with no way to glance back at it without opening Daily Review.
async function getTodayCompletedQuestions(env, user, today) {
  const rows = await env.DB.prepare(
    `SELECT q.id as id, q.q as q, q.a as a, q.topic_label as topic_label, p.last_shown_at as last_shown_at
     FROM user_question_progress p
     JOIN questions q ON q.id = p.question_id
     JOIN question_set_categories qsc ON qsc.set_id = q.set_id AND qsc.category_id = ?
     WHERE p.user_id = ? AND p.queued_for_date = ? AND p.status = 'done'
     ORDER BY p.last_shown_at DESC`,
  )
    .bind(user.activeCategoryId, user.id, today)
    .all();
  return rows.results || [];
}

// How many of this user's completed questions (in the active category) are
// actually due for Daily Review today — surfaced on Today's "Daily review"
// card so the new due-date scheduling (see lib/srs.js) is something a user
// can see, not just an invisible backend change. NULL due_date counts as
// due, same convention as handleGetReview's own selection.
async function getDueReviewCount(env, user, today) {
  const row = await env.DB.prepare(
    `SELECT COUNT(*) as n FROM user_question_progress p
     JOIN questions q ON q.id = p.question_id
     JOIN question_set_categories qsc ON qsc.set_id = q.set_id AND qsc.category_id = ?
     WHERE p.user_id = ? AND p.status = 'done' AND (p.due_date IS NULL OR p.due_date <= ?)`,
  )
    .bind(user.activeCategoryId, user.id, today)
    .first();
  return (row && row.n) || 0;
}

export async function handleGetTodayQueue(request, env, user) {
  const today = todayDateStr(user.timezone);
  await ensureTodayQueueFilled(env, user, today);
  const ledger = await getOrCreateTodayLedger(env, user.id, user.activeCategoryId, user.dailyQuota, today);
  const questions = await getTodayQueueQuestions(env, user, today);
  const completedQuestions = await getTodayCompletedQuestions(env, user, today);
  const dueForReview = await getDueReviewCount(env, user, today);
  const target = ledger.base_quota + ledger.extra_requested;
  return json({
    date: today,
    target,
    completed: ledger.completed,
    remaining: Math.max(0, target - ledger.completed),
    questions,
    completedQuestions,
    dueForReview,
  });
}

export async function handleCompleteQuestion(request, env, user) {
  const parsed = await readJsonBody(request, 2000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const questionId = (parsed.body.question_id || "").toString();
  if (!questionId) return json({ error: "Missing question_id." }, { status: 400 });

  const today = todayDateStr(user.timezone);
  const now = new Date().toISOString();
  await getOrCreateTodayLedger(env, user.id, user.activeCategoryId, user.dailyQuota, today);

  const existing = await env.DB.prepare("SELECT status, correct_streak FROM user_question_progress WHERE user_id = ? AND question_id = ?")
    .bind(user.id, questionId)
    .first();
  const wasAlreadyDone = !!(existing && existing.status === "done");

  // Marking a question "done" is a successful recall for spaced-repetition
  // purposes — bump the streak (box level) and schedule its next Daily
  // Review appearance accordingly (see lib/srs.js), the same as a "got it"
  // grading on an already-completed question gets via handleReviewResult.
  const newStreak = ((existing && existing.correct_streak) || 0) + 1;
  const dueDate = nextDueDate(today, newStreak);

  await env.DB.prepare(
    `INSERT INTO user_question_progress (user_id, question_id, status, queued_for_date, first_shown_at, last_shown_at, times_shown, correct_streak, last_result, due_date)
     VALUES (?, ?, 'done', ?, ?, ?, 1, ?, 'got_it', ?)
     ON CONFLICT(user_id, question_id) DO UPDATE SET
       status = 'done',
       first_shown_at = COALESCE(user_question_progress.first_shown_at, excluded.first_shown_at),
       last_shown_at = excluded.last_shown_at,
       times_shown = user_question_progress.times_shown + 1,
       correct_streak = excluded.correct_streak,
       last_result = 'got_it',
       due_date = excluded.due_date`,
  )
    .bind(user.id, questionId, today, now, now, newStreak, dueDate)
    .run();

  if (!wasAlreadyDone) {
    await env.DB.prepare("UPDATE daily_quota_ledger SET completed = completed + 1 WHERE user_id = ? AND category_id = ? AND date = ?")
      .bind(user.id, user.activeCategoryId, today)
      .run();

    // Streak bump — same "consecutive calendar day" rule as before, now
    // per-category (user_categories) instead of one global streak on users,
    // so consistent practice in one category doesn't carry another's streak.
    const y = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    if (user.streakLastActive !== today) {
      const newCount = user.streakLastActive === y ? (user.streakCount || 0) + 1 : 1;
      const newLongest = Math.max(user.streakLongest || 0, newCount);
      await env.DB.prepare(
        "UPDATE user_categories SET streak_count = ?, streak_longest = ?, streak_last_active = ? WHERE user_id = ? AND category_id = ?",
      )
        .bind(newCount, newLongest, today, user.id, user.activeCategoryId)
        .run();
    }
  }

  const topicRow = await env.DB.prepare("SELECT topic_label FROM questions WHERE id = ?").bind(questionId).first();
  await env.DB.prepare(
    "INSERT INTO activity_log (user_id, occurred_at, event_type, topic_id, question_id, result, category_id) VALUES (?, ?, 'reveal', ?, ?, NULL, ?)",
  )
    .bind(user.id, now, topicRow ? topicRow.topic_label : null, questionId, user.activeCategoryId)
    .run();

  return json({ ok: true });
}

// The "Review again soon" / "Need Review" counterpart to completing a
// question — used on the Today page both for a question the user has just
// looked at but doesn't want to mark done yet, AND for pulling an
// already-completed question back out of "Completed today" for another
// look. Either way it does NOT touch the streak. If the question was
// already status='done', its ledger completed-count is decremented so
// today's target/remaining stay consistent with what's actually still in
// the active queue; if it wasn't done yet, the ledger is left untouched —
// the question simply stays in today's active queue (and naturally
// carries over to tomorrow via the existing backlog-priority rule in
// ensureTodayQueueFilled) rather than counting as finished. Reuses the
// same last_result='again' signal the Daily Review page's "Review again
// soon" already writes, so it also feeds weakest-topic/accuracy stats
// identically.
export async function handleFlagQuestionForReview(request, env, user) {
  const parsed = await readJsonBody(request, 2000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const questionId = (parsed.body.question_id || "").toString();
  if (!questionId) return json({ error: "Missing question_id." }, { status: 400 });

  const today = todayDateStr(user.timezone);
  const now = new Date().toISOString();
  await getOrCreateTodayLedger(env, user.id, user.activeCategoryId, user.dailyQuota, today);

  const existing = await env.DB.prepare("SELECT status, lapses FROM user_question_progress WHERE user_id = ? AND question_id = ?")
    .bind(user.id, questionId)
    .first();
  const wasDone = !!(existing && existing.status === "done");
  const newLapses = ((existing && existing.lapses) || 0) + 1;

  if (wasDone) {
    await env.DB.prepare(
      "UPDATE daily_quota_ledger SET completed = MAX(0, completed - 1) WHERE user_id = ? AND category_id = ? AND date = ?",
    )
      .bind(user.id, user.activeCategoryId, today)
      .run();
  }

  // Resets the streak (box level) to 0 — this question leaves the 'done'
  // pool entirely (back into today's active queue), so its due_date is
  // moot until it's completed again; that next completion recomputes it
  // from the now-reset streak via handleCompleteQuestion above.
  await env.DB.prepare(
    `INSERT INTO user_question_progress (user_id, question_id, status, queued_for_date, first_shown_at, last_shown_at, times_shown, correct_streak, last_result, lapses)
     VALUES (?, ?, 'shown', ?, ?, ?, 1, 0, 'again', ?)
     ON CONFLICT(user_id, question_id) DO UPDATE SET
       status = 'shown',
       first_shown_at = COALESCE(user_question_progress.first_shown_at, excluded.first_shown_at),
       last_shown_at = excluded.last_shown_at,
       times_shown = user_question_progress.times_shown + 1,
       correct_streak = 0,
       last_result = 'again',
       lapses = excluded.lapses`,
  )
    .bind(user.id, questionId, today, now, now, newLapses)
    .run();

  const topicRow = await env.DB.prepare("SELECT topic_label FROM questions WHERE id = ?").bind(questionId).first();
  await env.DB.prepare(
    "INSERT INTO activity_log (user_id, occurred_at, event_type, topic_id, question_id, result, category_id) VALUES (?, ?, 'review', ?, ?, 'again', ?)",
  )
    .bind(user.id, now, topicRow ? topicRow.topic_label : null, questionId, user.activeCategoryId)
    .run();

  return json({ ok: true });
}

export async function handleRequestMore(request, env, user) {
  const today = todayDateStr(user.timezone);
  const ledger = await getOrCreateTodayLedger(env, user.id, user.activeCategoryId, user.dailyQuota, today);
  const target = ledger.base_quota + ledger.extra_requested;
  if (ledger.completed < target) {
    return json({ error: "You still have questions left in today's queue." }, { status: 400 });
  }

  await env.DB.prepare("UPDATE daily_quota_ledger SET extra_requested = extra_requested + ? WHERE user_id = ? AND category_id = ? AND date = ?")
    .bind(EXTRA_BATCH, user.id, user.activeCategoryId, today)
    .run();

  await ensureTodayQueueFilled(env, user, today);
  const questions = await getTodayQueueQuestions(env, user, today);
  return json({ questions });
}

export async function handleReviewResult(request, env, user) {
  const parsed = await readJsonBody(request, 2000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const questionId = (parsed.body.question_id || "").toString();
  const result = (parsed.body.result || "").toString();
  if (!questionId || (result !== "got_it" && result !== "again")) {
    return json({ error: "Invalid review result." }, { status: 400 });
  }

  const today = todayDateStr(user.timezone);
  const now = new Date().toISOString();
  const existing = await env.DB.prepare("SELECT correct_streak, lapses FROM user_question_progress WHERE user_id = ? AND question_id = ?")
    .bind(user.id, questionId)
    .first();
  const newStreak = result === "got_it" ? ((existing && existing.correct_streak) || 0) + 1 : 0;
  const newLapses = result === "again" ? ((existing && existing.lapses) || 0) + 1 : (existing && existing.lapses) || 0;
  const dueDate = nextDueDate(today, newStreak);

  await env.DB.prepare(
    `UPDATE user_question_progress SET last_result = ?, correct_streak = ?, times_shown = times_shown + 1, last_shown_at = ?, due_date = ?, lapses = ?
     WHERE user_id = ? AND question_id = ?`,
  )
    .bind(result, newStreak, now, dueDate, newLapses, user.id, questionId)
    .run();

  const topicRow = await env.DB.prepare("SELECT topic_label FROM questions WHERE id = ?").bind(questionId).first();
  await env.DB.prepare(
    "INSERT INTO activity_log (user_id, occurred_at, event_type, topic_id, question_id, result, category_id) VALUES (?, ?, 'review', ?, ?, ?, ?)",
  )
    .bind(user.id, now, topicRow ? topicRow.topic_label : null, questionId, result, user.activeCategoryId)
    .run();

  return json({ ok: true });
}

// Weighted-random pick of up to `n` items from `list` (mutates a local
// copy, not `list` itself) — same heuristic as before the due_date change:
// never-shown and recently-failed items are favored, a long correct streak
// fades a question out. Kept as the tie-breaker/ordering WITHIN whichever
// due-ness tier handleGetReview is currently drawing from, not as the sole
// selection mechanism anymore.
function weightedSample(list, n) {
  const weighted = list.map((item) => {
    let w = 1;
    if (!item.times_shown) w = 1.6;
    else if (item.last_result === "again") w = 3;
    else w = Math.max(0.35, 1 - (item.correct_streak || 0) * 0.15);
    return { item, w };
  });
  const chosen = [];
  const take = Math.min(n, weighted.length);
  for (let i = 0; i < take; i++) {
    const totalW = weighted.reduce((s, x) => s + x.w, 0);
    let r = Math.random() * totalW;
    let idx = 0;
    for (; idx < weighted.length; idx++) {
      r -= weighted[idx].w;
      if (r <= 0) break;
    }
    idx = Math.min(idx, weighted.length - 1);
    chosen.push(weighted[idx].item);
    weighted.splice(idx, 1);
  }
  return chosen;
}

export async function handleGetReview(request, env, user) {
  const url = new URL(request.url);
  const count = Math.min(20, Math.max(1, parseInt(url.searchParams.get("count") || "15", 10) || 15));
  const today = todayDateStr(user.timezone);

  const rows = await env.DB.prepare(
    `SELECT p.question_id as id, q.q as q, q.a as a, q.topic_label as topic_label,
            p.last_result as last_result, p.correct_streak as correct_streak, p.times_shown as times_shown,
            p.due_date as due_date
     FROM user_question_progress p
     JOIN questions q ON q.id = p.question_id
     JOIN question_set_categories qsc ON qsc.set_id = q.set_id AND qsc.category_id = ?
     WHERE p.user_id = ? AND p.status = 'done'`,
  )
    .bind(user.activeCategoryId, user.id)
    .all();

  const pool = rows.results || [];
  if (pool.length === 0) return json({ questions: [] });

  // This is what makes Daily Review an actual spaced-repetition queue
  // instead of a uniform sample over everything ever completed: a question
  // nailed five times running has a due_date weeks out and won't compete
  // for a review slot against one still being actively forgotten. NULL
  // due_date (every row from before this feature shipped) counts as due
  // now, so nothing already in a user's review pool silently disappears.
  const due = pool.filter((item) => !item.due_date || item.due_date <= today);
  const notYetDue = pool.filter((item) => item.due_date && item.due_date > today);

  let chosen = weightedSample(due, count);
  if (chosen.length < count) {
    chosen = chosen.concat(weightedSample(notYetDue, count - chosen.length));
  }
  return json({ questions: chosen });
}
