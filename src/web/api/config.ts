import { apiFetch } from "./client";

export interface PublicConfig {
  captchaEnabled: boolean;
}

// Unauthenticated — the Login page needs this before there's a session,
// to decide whether to even load the Turnstile script.
export function getPublicConfig(): Promise<PublicConfig> {
  return apiFetch<PublicConfig>("/api/config");
}
