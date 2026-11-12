import { apiFetch, apiPost } from "./client";
import type { Question } from "./types";

export interface SelfTestQuota {
  unlimited: boolean;
  used: number;
  quota: number | null;
  remaining: number;
}

export function getSelfTestQuota(): Promise<SelfTestQuota> {
  return apiFetch<SelfTestQuota>("/api/self-test/quota");
}

export function getSelfTestQuestion(): Promise<{ question: Question & { track: string | null } }> {
  return apiFetch("/api/self-test/question");
}

export interface SelfTestFeedback {
  score: number | null;
  strengths: string;
  gaps: string;
  suggestion: string;
  star: string;
}

export interface SelfTestAnalyzeResponse {
  feedback: SelfTestFeedback;
  modelAnswer: string;
  generatedBy: string;
  quota: SelfTestQuota;
}

export function analyzeSelfTestAnswer(questionId: string, answer: string): Promise<SelfTestAnalyzeResponse> {
  return apiPost<SelfTestAnalyzeResponse>("/api/self-test/analyze", { question_id: questionId, answer });
}

export function getSelfTestHistory(): Promise<{ history: { date: string; score: number }[] }> {
  return apiFetch("/api/self-test/history");
}
