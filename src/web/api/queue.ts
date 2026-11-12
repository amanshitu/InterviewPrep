import { apiFetch, apiPost } from "./client";
import type { Question } from "./types";

export interface TodayQueueResponse {
  date: string;
  target: number;
  completed: number;
  remaining: number;
  questions: Question[];
  completedQuestions: Question[];
}

export function getTodayQueue(): Promise<TodayQueueResponse> {
  return apiFetch<TodayQueueResponse>("/api/queue/today");
}

export function completeQuestion(questionId: string): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>("/api/questions/complete", { question_id: questionId });
}

export function flagForReview(questionId: string): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>("/api/questions/flag-review", { question_id: questionId });
}

export function requestMoreQuestions(): Promise<{ questions: Question[] }> {
  return apiPost<{ questions: Question[] }>("/api/questions/request-more");
}

export function submitReviewResult(questionId: string, result: "got_it" | "again"): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>("/api/questions/review-result", { question_id: questionId, result });
}

export function getReview(count?: number): Promise<{ questions: Question[] }> {
  const qs = count ? `?count=${count}` : "";
  return apiFetch<{ questions: Question[] }>(`/api/review${qs}`);
}

export function getBankCount(): Promise<{ yours: number; total: number }> {
  return apiFetch<{ yours: number; total: number }>("/api/questions/bank-count");
}

export interface QuestionSetSection {
  label: string;
  questions: { q: string; a: string }[];
}

export interface CreateQuestionSetRequest {
  title: string;
  track?: string | null;
  sections: QuestionSetSection[];
}

export function createQuestionSet(
  body: CreateQuestionSetRequest,
): Promise<{ set: { id: string; title: string; track: string | null; visibility: string } }> {
  return apiPost("/api/question-sets", body);
}

export interface MyQuestionSet {
  id: string;
  title: string;
  track: string | null;
  visibility: string;
  created_at: string;
  rejected_reason: string | null;
  question_count: number;
}

export function getMyQuestionSets(): Promise<{ sets: MyQuestionSet[] }> {
  return apiFetch<{ sets: MyQuestionSet[] }>("/api/question-sets/mine");
}

export interface SuggestedQuestionSet {
  id: string;
  title: string;
  track: string | null;
  owner_name: string | null;
}

export function getSuggestedSets(): Promise<{ sets: SuggestedQuestionSet[] }> {
  return apiFetch<{ sets: SuggestedQuestionSet[] }>("/api/question-sets/suggestions");
}

export function submitQuestionSet(id: string): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>(`/api/question-sets/${encodeURIComponent(id)}/submit`);
}

export function subscribeToSet(id: string): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>(`/api/question-sets/${encodeURIComponent(id)}/subscribe`);
}
