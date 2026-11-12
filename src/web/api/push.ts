import { apiFetch, apiPost } from "./client";

export function getVapidPublicKey(): Promise<{ publicKey: string | null }> {
  return apiFetch("/api/push/vapid-public-key");
}

export interface PushSubscriptionKeys {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export function subscribePush(subscription: PushSubscriptionKeys): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>("/api/push/subscribe", subscription);
}

export function unsubscribePush(endpoint: string): Promise<{ ok: true }> {
  return apiPost<{ ok: true }>("/api/push/unsubscribe", { endpoint });
}
