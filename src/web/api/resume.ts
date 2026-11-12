import { apiPost } from "./client";

export function suggestRole(resumeText: string): Promise<{ role: string }> {
  return apiPost<{ role: string }>("/api/resume/suggest-role", { resumeText });
}

export interface GeneratePromptRequest {
  resumeText: string;
  targetRole: string;
  categories: string[];
  perCategory?: number;
}

export function generatePrompt(body: GeneratePromptRequest): Promise<{ prompt: string }> {
  return apiPost<{ prompt: string }>("/api/resume/generate-prompt", body);
}
