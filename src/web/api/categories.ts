import { apiFetch, apiPost } from "./client";
import type { Category } from "./types";

export function listCategories(): Promise<{ categories: Category[] }> {
  return apiFetch<{ categories: Category[] }>("/api/categories");
}

export function enrollCategory(categoryId: string): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>("/api/categories/enroll", { categoryId });
}

export function switchCategory(categoryId: string): Promise<{ ok: true; activeCategoryId: string }> {
  return apiPost<{ ok: true; activeCategoryId: string }>("/api/categories/switch", { categoryId });
}
