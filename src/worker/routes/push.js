import { json } from "../lib/http.js";
import { readJsonBody } from "../lib/request.js";
import { todayDateStr, localHourFor } from "../lib/datetime.js";
import { sendWebPush } from "../lib/webpush.js";

export async function handlePushSubscribe(request, env, user) {
  const parsed = await readJsonBody(request, 4000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const { endpoint, keys } = parsed.body || {};
  if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
    return json({ error: "Invalid push subscription." }, { status: 400 });
  }
  await env.DB.prepare(
    `INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth) VALUES (?, ?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
  )
    .bind(user.id, endpoint, keys.p256dh, keys.auth)
    .run();
  return json({ ok: true });
}

export async function handlePushUnsubscribe(request, env, user) {
  const parsed = await readJsonBody(request, 4000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const { endpoint } = parsed.body || {};
  if (!endpoint) return json({ error: "Missing endpoint." }, { status: 400 });
  await env.DB.prepare("DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?")
    .bind(endpoint, user.id)
    .run();
  return json({ ok: true });
}

const PUSH_REMINDER_LOCAL_HOUR = 19; // 7pm in each subscriber's own timezone

// Runs hourly (wrangler.toml [triggers]). For each subscription whose
// owner's local time is currently the reminder hour and who hasn't been
// sent a reminder yet today (their own local date), sends a nudge if they
// still have incomplete questions in today's queue. One row's
// last_push_sent_date prevents double-sends within the same local day.
export async function handleScheduled(env) {
  const { results: subs } = await env.DB.prepare(
    `SELECT ps.id as id, ps.endpoint as endpoint, ps.p256dh as p256dh, ps.auth as auth, ps.last_push_sent_date as last_push_sent_date,
            u.id as user_id, u.timezone as timezone
     FROM push_subscriptions ps JOIN users u ON u.id = ps.user_id`,
  ).all();
  if (!subs || !subs.length) return;
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY_JWK) return;
  const vapidPrivateJwk = JSON.parse(env.VAPID_PRIVATE_KEY_JWK);

  for (const sub of subs) {
    const localHour = localHourFor(sub.timezone);
    if (localHour !== PUSH_REMINDER_LOCAL_HOUR) continue;
    const today = todayDateStr(sub.timezone);
    if (sub.last_push_sent_date === today) continue;

    // Pending is now per-category (each enrolled category has its own
    // queue/quota) — compute each separately via the same
    // question_set_categories join every other category-scoped query uses,
    // then combine any non-zero ones into a single reminder rather than
    // sending one push per category.
    const { results: enrolled } = await env.DB.prepare(
      "SELECT c.id as id, c.name as name FROM categories c JOIN user_categories uc ON uc.category_id = c.id WHERE uc.user_id = ?",
    )
      .bind(sub.user_id)
      .all();
    const perCategoryPending = [];
    for (const cat of enrolled || []) {
      const row = await env.DB.prepare(
        `SELECT COUNT(*) as n FROM user_question_progress p
         JOIN questions q ON q.id = p.question_id
         JOIN question_set_categories qsc ON qsc.set_id = q.set_id AND qsc.category_id = ?
         WHERE p.user_id = ? AND p.queued_for_date = ? AND p.status != 'done'`,
      )
        .bind(cat.id, sub.user_id, today)
        .first();
      if (row && row.n) perCategoryPending.push({ name: cat.name, n: row.n });
    }
    if (!perCategoryPending.length) continue;

    const body = perCategoryPending.length === 1
      ? `You still have ${perCategoryPending[0].n} question${perCategoryPending[0].n === 1 ? "" : "s"} left today.`
      : perCategoryPending.map((c) => `${c.name}: ${c.n} left`).join(", ") + " today.";

    try {
      const resp = await sendWebPush(
        { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
        { title: "ExamStreak", body, url: "/" },
        env.VAPID_PUBLIC_KEY,
        vapidPrivateJwk,
        "mailto:support@example.com",
      );
      if (resp.status === 404 || resp.status === 410) {
        // Dead/expired subscription — remove it so future runs don't keep trying it.
        await env.DB.prepare("DELETE FROM push_subscriptions WHERE id = ?").bind(sub.id).run();
        continue;
      }
      if (resp.ok) {
        await env.DB.prepare("UPDATE push_subscriptions SET last_push_sent_date = ? WHERE id = ?").bind(today, sub.id).run();
      }
    } catch {
      // Network/crypto failure — leave the subscription as-is, retried next hour.
    }
  }
}
