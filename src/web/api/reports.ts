import { apiPost } from "./client";

export function reportQuestion(questionId: string, reason: string): Promise<{ ok: true }> {
  return apiPost(`/api/questions/${encodeURIComponent(questionId)}/report`, { reason });
}
