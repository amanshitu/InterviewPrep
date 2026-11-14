import { apiFetch, apiFetchBlob, apiPatch, apiPost, apiPut } from "./client";
import type { User } from "./types";

export interface UserResponse {
  user: User;
}

export function getMe(): Promise<UserResponse> {
  return apiFetch<UserResponse>("/api/me");
}

export interface UpdateAccountRequest {
  name: string;
  avatarData?: string | null;
}

export function updateAccount(body: UpdateAccountRequest): Promise<UserResponse> {
  return apiPatch<UserResponse>("/api/account", body);
}

export interface UpdateProfileRequest {
  track?: string | null;
  dailyQuota?: number;
  headline?: string | null;
  bio?: string | null;
  yearsExperience?: number | null;
  timezone?: string;
  workersAiModel?: string;
  aiProvider?: "workers-ai" | "openai" | "anthropic";
  aiApiKey?: string;
}

export function updateProfile(body: UpdateProfileRequest): Promise<UserResponse> {
  return apiPatch<UserResponse>("/api/profile", body);
}

// App-state blob: the client's own topic/streak/questionStats snapshot
// (distinct from the relational per-question progress rows the rest of the
// API reads/writes) — see defaultState() in src/worker.js for its shape.
export interface AppState {
  version: number;
  topics: Record<string, unknown>;
  streak: { count: number; longest: number; lastActiveDate: string | null };
  questionStats: Record<string, unknown>;
}

export function getState(): Promise<{ state: AppState }> {
  return apiFetch<{ state: AppState }>("/api/state");
}

export interface ActivityEvent {
  occurred_at?: string;
  event_type: string;
  topic_id?: string | null;
  question_id?: string | null;
  result?: string | null;
}

export function putState(state: AppState, events?: ActivityEvent[]): Promise<{ ok: true; updated_at: string }> {
  return apiPut("/api/state", { state, events });
}

export function exportProgress(): Promise<Blob> {
  return apiFetchBlob("/api/export/progress");
}

export interface DeletionRequestResponse {
  ok: true;
  deletionRequestedAt: string;
  purgeDate: string;
  gracePeriodDays: number;
}

export function requestAccountDeletion(password: string): Promise<DeletionRequestResponse> {
  return apiPost<DeletionRequestResponse>("/api/account/delete-request", { password });
}

export function cancelAccountDeletion(): Promise<UserResponse> {
  return apiPost<UserResponse>("/api/account/delete-cancel");
}
