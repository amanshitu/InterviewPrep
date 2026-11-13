import { apiFetch, apiPost } from "./client";
import type { Category, PublicCategory } from "./types";

export function listCategories(): Promise<{ categories: Category[] }> {
  return apiFetch<{ categories: Category[] }>("/api/categories");
}

// Unauthenticated — used by the signup form's category picker, before
// there's a session to call listCategories() with.
export function listPublicCategories(): Promise<{ categories: PublicCategory[] }> {
  return apiFetch<{ categories: PublicCategory[] }>("/api/categories/public");
}

export function enrollCategory(categoryId: string): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>("/api/categories/enroll", { categoryId });
}

export function switchCategory(categoryId: string): Promise<{ ok: true; activeCategoryId: string }> {
  return apiPost<{ ok: true; activeCategoryId: string }>("/api/categories/switch", { categoryId });
}

export function unenrollCategory(categoryId: string): Promise<{ ok: true; activeCategoryId: string | null }> {
  return apiPost<{ ok: true; activeCategoryId: string | null }>("/api/categories/unenroll", { categoryId });
}
