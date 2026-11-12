import { apiFetch } from "./client";
import type { ActivityEvent } from "./account";

export interface StatsTopic {
  topic: string;
  total: number;
  completed: number;
  completionPct: number;
  attempts: number;
  accuracyPct: number | null;
}

export interface StatsProgressResponse {
  topics: StatsTopic[];
  overall: { totalQuestions: number; totalCompleted: number; completionPct: number };
  focusAreas: (StatsTopic & { focusScore: number })[];
}

export function getStatsProgress(): Promise<StatsProgressResponse> {
  return apiFetch<StatsProgressResponse>("/api/stats/progress");
}

export function getStatsInsight(): Promise<{ insight: string; generatedBy: string | null; cached: boolean }> {
  return apiFetch("/api/stats/insight");
}

export function getActivity(limit?: number): Promise<{ events: (ActivityEvent & { question_text?: string | null })[] }> {
  const qs = limit ? `?limit=${limit}` : "";
  return apiFetch(`/api/activity${qs}`);
}

export function getAiUsage(): Promise<{ unlimited: boolean; used: number; cap: number | null }> {
  return apiFetch("/api/ai-usage");
}
