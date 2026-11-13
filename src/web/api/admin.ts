import { apiFetch, apiPost } from "./client";
import type { StatsProgressResponse } from "./stats";
import type { ActivityEvent } from "./account";

export interface PendingQuestionSet {
  id: string;
  title: string;
  track: string | null;
  created_at: string;
  owner_name: string | null;
  owner_email: string | null;
  question_count: number;
}

export function getPendingSets(): Promise<{ sets: PendingQuestionSet[] }> {
  return apiFetch("/api/admin/pending-sets");
}

export interface ApprovalHistoryEntry {
  id: string;
  title: string;
  track: string | null;
  visibility: string;
  created_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  rejected_reason: string | null;
  owner_name: string | null;
  owner_email: string | null;
  actor_name: string | null;
  actor_email: string | null;
  question_count: number;
}

export function getApprovalHistory(): Promise<{ history: ApprovalHistoryEntry[] }> {
  return apiFetch("/api/admin/approval-history");
}

export function createCategory(
  name: string,
  description?: string,
): Promise<{ ok: true; category: { id: string; name: string; description: string | null } }> {
  return apiPost("/api/admin/categories", { name, description });
}

export function approveSet(id: string, categoryIds?: string[]): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>(`/api/admin/question-sets/${encodeURIComponent(id)}/approve`, { categoryIds });
}

export function rejectSet(id: string, reason: string): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>(`/api/admin/question-sets/${encodeURIComponent(id)}/reject`, { reason });
}

export function getSetQuestions(id: string): Promise<{ questions: { q: string; a: string; topic_label: string }[] }> {
  return apiFetch(`/api/admin/question-sets/${encodeURIComponent(id)}/questions`);
}

export interface AdminOverview {
  totalUsers: number;
  totalCategories: number;
  totalQuestionSets: number;
  pendingApprovalCount: number;
}

export function getOverview(): Promise<AdminOverview> {
  return apiFetch("/api/admin/overview");
}

export interface AdminUserRow {
  id: string;
  name: string;
  email: string;
  role: "user" | "admin";
  createdAt: string;
  enrolledCategories: { id: string; name: string }[];
}

export function getUsers(page = 1, pageSize = 50): Promise<{ users: AdminUserRow[]; total: number }> {
  return apiFetch(`/api/admin/users?page=${page}&pageSize=${pageSize}`);
}

export interface AdminUserStatsResponse {
  user: { id: string; name: string; email: string; track: string | null; dailyQuota: number };
  categoryId: string | null;
  enrolledCategories: { id: string; name: string }[];
  progress: StatsProgressResponse;
  activity: (ActivityEvent & { question_text?: string | null })[];
  selfTestHistory: { date: string; score: number }[];
}

export function getUserStats(userId: string, categoryId?: string): Promise<AdminUserStatsResponse> {
  const qs = categoryId ? `?categoryId=${encodeURIComponent(categoryId)}` : "";
  return apiFetch(`/api/admin/users/${encodeURIComponent(userId)}/stats${qs}`);
}
