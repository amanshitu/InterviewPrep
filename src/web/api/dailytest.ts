import { apiFetch, apiPost } from "./client";

export interface DailyTestQuestion {
  id: string;
  q: string;
  topic_label: string;
  options: string[];
  answered: boolean;
  selectedIndex: number | null;
  correct: boolean | null;
  correctIndex: number | null;
}

export function getTodaysTest(): Promise<{ date: string; questions: DailyTestQuestion[] }> {
  return apiFetch("/api/test/today");
}

export function answerTestQuestion(
  questionId: string,
  selectedIndex: number,
): Promise<{ ok: true; correct: boolean; correctIndex: number }> {
  return apiPost("/api/test/answer", { question_id: questionId, selected_index: selectedIndex });
}
