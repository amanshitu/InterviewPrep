import { json } from "../lib/http.js";
import { readJsonBody } from "../lib/request.js";

// ---------- categories (multi-category platform) ----------

// Unauthenticated listing for the signup form's category picker — same
// rows as handleListCategories below, minus the per-user `enrolled` flag
// (there's no user yet at signup time). Kept deliberately read-only and
// free of any user-supplied input, so no rate limiting beyond what the
// platform already applies to every request.
export async function handleListPublicCategories(request, env) {
  const { results } = await env.DB.prepare(
    `SELECT id, name, description FROM categories WHERE is_active = 1 ORDER BY name ASC`,
  ).all();
  return json({ categories: results || [] });
}

export async function handleListCategories(request, env, user) {
  const { results } = await env.DB.prepare(
    `SELECT c.id as id, c.name as name, c.description as description,
            uc.user_id IS NOT NULL as enrolled
     FROM categories c
     LEFT JOIN user_categories uc ON uc.category_id = c.id AND uc.user_id = ?
     WHERE c.is_active = 1
     ORDER BY c.name ASC`,
  )
    .bind(user.id)
    .all();
  return json({ categories: (results || []).map((r) => ({ ...r, enrolled: !!r.enrolled })) });
}

export async function handleEnrollCategory(request, env, user) {
  const parsed = await readJsonBody(request, 500);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const categoryId = (parsed.body.categoryId || "").toString();
  const category = await env.DB.prepare("SELECT id FROM categories WHERE id = ? AND is_active = 1").bind(categoryId).first();
  if (!category) return json({ error: "Unknown category." }, { status: 404 });

  await env.DB.prepare(
    "INSERT INTO user_categories (user_id, category_id, daily_quota) VALUES (?, ?, 10) ON CONFLICT(user_id, category_id) DO NOTHING",
  )
    .bind(user.id, categoryId)
    .run();
  return json({ ok: true });
}

export async function handleSwitchCategory(request, env, user) {
  const parsed = await readJsonBody(request, 500);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const categoryId = (parsed.body.categoryId || "").toString();
  const enrollment = await env.DB.prepare("SELECT user_id FROM user_categories WHERE user_id = ? AND category_id = ?")
    .bind(user.id, categoryId)
    .first();
  if (!enrollment) return json({ error: "You're not enrolled in that category yet." }, { status: 400 });

  await env.DB.prepare("UPDATE users SET active_category_id = ? WHERE id = ?").bind(categoryId, user.id).run();
  return json({ ok: true, activeCategoryId: categoryId });
}

// A user must always stay enrolled in at least one category (Today/Stats/
// Daily Test/etc. all key off a single activeCategoryId, so leaving zero
// would dangle it with nothing to fall back to) — enforced here, not just
// in the UI, since this is a real invariant the rest of the app depends on.
// Progress/streak/quota history for the category is left untouched (it's
// keyed by user_categories' own row being gone, not deleted separately),
// so re-enrolling later picks back up where it left off. Unenrolling the
// currently-active category switches to another enrolled one automatically.
export async function handleUnenrollCategory(request, env, user) {
  const parsed = await readJsonBody(request, 500);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const categoryId = (parsed.body.categoryId || "").toString();

  const enrollment = await env.DB.prepare("SELECT user_id FROM user_categories WHERE user_id = ? AND category_id = ?")
    .bind(user.id, categoryId)
    .first();
  if (!enrollment) return json({ error: "You're not enrolled in that category." }, { status: 400 });

  const countRow = await env.DB.prepare("SELECT COUNT(*) as n FROM user_categories WHERE user_id = ?").bind(user.id).first();
  if ((countRow?.n || 0) <= 1) {
    return json({ error: "You must stay enrolled in at least one category." }, { status: 400 });
  }

  await env.DB.prepare("DELETE FROM user_categories WHERE user_id = ? AND category_id = ?").bind(user.id, categoryId).run();

  let activeCategoryId = user.activeCategoryId;
  if (activeCategoryId === categoryId) {
    const next = await env.DB.prepare("SELECT category_id FROM user_categories WHERE user_id = ? ORDER BY enrolled_at ASC LIMIT 1")
      .bind(user.id)
      .first();
    activeCategoryId = next ? next.category_id : null;
    await env.DB.prepare("UPDATE users SET active_category_id = ? WHERE id = ?").bind(activeCategoryId, user.id).run();
  }

  return json({ ok: true, activeCategoryId });
}

export async function handleCreateCategory(request, env, user) {
  const parsed = await readJsonBody(request, 2000);
  if (!parsed.ok) return json({ error: parsed.error }, { status: parsed.status });
  const name = (parsed.body.name || "").toString().trim().slice(0, 80);
  const description = parsed.body.description ? String(parsed.body.description).trim().slice(0, 300) : null;
  if (!name) return json({ error: "Please enter a category name." }, { status: 400 });

  const slugBase = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "category";
  let id = slugBase;
  let suffix = 1;
  while (await env.DB.prepare("SELECT id FROM categories WHERE id = ?").bind(id).first()) {
    suffix += 1;
    id = `${slugBase}-${suffix}`;
  }

  await env.DB.prepare("INSERT INTO categories (id, name, description) VALUES (?, ?, ?)")
    .bind(id, name, description)
    .run();
  return json({ ok: true, category: { id, name, description } });
}
