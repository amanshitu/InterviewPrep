import { apiPost } from "./client";
import type { User } from "./types";

export interface SignupRequest {
  name: string;
  email: string;
  password: string;
  track?: string;
  dailyQuota?: number;
  headline?: string;
  timezone?: string;
  categoryId?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UserResponse {
  user: User;
}

export function signup(body: SignupRequest): Promise<UserResponse> {
  return apiPost<UserResponse>("/api/signup", body);
}

export function login(body: LoginRequest): Promise<UserResponse> {
  return apiPost<UserResponse>("/api/login", body);
}

export function logout(): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>("/api/logout");
}

export function forgotPassword(email: string): Promise<{ ok: true; message: string }> {
  return apiPost("/api/password/forgot", { email });
}

export function resetPassword(token: string, password: string): Promise<{ ok: true; message: string }> {
  return apiPost("/api/password/reset", { token, password });
}

export function changePassword(currentPassword: string, newPassword: string): Promise<UserResponse> {
  return apiPost<UserResponse>("/api/password/change", { currentPassword, newPassword });
}

export function revokeAllSessions(): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>("/api/sessions/revoke-all");
}
