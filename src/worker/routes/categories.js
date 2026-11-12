import { json } from "../lib/http.js";
import { readJsonBody } from "../lib/request.js";

// ---------- categories (multi-category platform) ----------
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
