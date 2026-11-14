import { apiFetch, apiPost } from "./client";

export type FeedbackCategory = "bug" | "feature" | "general" | "praise";

export function submitFeedback(message: string, category: FeedbackCategory): Promise<{ ok: true }> {
  return apiPost("/api/feedback", { message, category });
}

export interface FeedbackEntry {
  id: string;
  category: FeedbackCategory;
  message: string;
  status: "open" | "resolved";
  created_at: string;
  resolved_at: string | null;
  user_name: string;
  user_email: string;
  resolver_name: string | null;
}

export function getFeedback(): Promise<{ feedback: FeedbackEntry[] }> {
  return apiFetch("/api/admin/feedback");
}

export function resolveFeedback(id: string): Promise<{ ok: true }> {
  return apiPost(`/api/admin/feedback/${encodeURIComponent(id)}/resolve`);
}
