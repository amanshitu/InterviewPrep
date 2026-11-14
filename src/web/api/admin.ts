import { apiFetch, apiPatch, apiPost } from "./client";
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
  openReportCount: number;
  openFeedbackCount: number;
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

export interface QuestionReport {
  id: string;
  question_id: string;
  reason: string;
  status: "open" | "resolved" | "dismissed";
  created_at: string;
  resolved_at: string | null;
  reporter_name: string;
  reporter_email: string;
  resolver_name: string | null;
  q: string | null;
  a: string | null;
  topic_label: string | null;
  set_id: string | null;
  set_title: string | null;
}

export function getQuestionReports(): Promise<{ reports: QuestionReport[] }> {
  return apiFetch("/api/admin/question-reports");
}

export function resolveQuestionReport(reportId: string, action: "resolved" | "dismissed"): Promise<{ ok: true }> {
  return apiPost(`/api/admin/question-reports/${encodeURIComponent(reportId)}/resolve`, { action });
}

export interface AdminQuestionSearchResult {
  id: string;
  q: string;
  a: string;
  topic_label: string;
  set_id: string;
  set_title: string | null;
}

export function searchQuestions(query: string): Promise<{ questions: AdminQuestionSearchResult[] }> {
  return apiFetch(`/api/admin/questions/search?q=${encodeURIComponent(query)}`);
}

export function updateQuestion(id: string, body: { q: string; a: string; topic_label?: string }): Promise<{ ok: true }> {
  return apiPatch(`/api/admin/questions/${encodeURIComponent(id)}`, body);
}

export interface AuditLogEntry {
  id: string;
  action: string;
  target_type: string | null;
  target_id: string | null;
  detail: string | null;
  created_at: string;
  admin_name: string;
  admin_email: string;
}

export function getAuditLog(): Promise<{ entries: AuditLogEntry[] }> {
  return apiFetch("/api/admin/audit-log");
}
