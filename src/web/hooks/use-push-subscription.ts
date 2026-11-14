import { useCallback, useEffect, useState } from "react";
import { getVapidPublicKey, subscribePush, unsubscribePush } from "../api/push";

// Shared by NotificationsSection (the actual Settings toggle) and
// EnableNotificationsBanner (the proactive nudge) so the subscribe/
// unsubscribe flow — service worker registration, permission prompt, VAPID
// key fetch — lives in exactly one place.
export function isPushSupported(): boolean {
  return "serviceWorker" in navigator && "PushManager" in window && typeof Notification !== "undefined";
}

function urlBase64ToUint8Array(base64Url: string): Uint8Array {
  const padding = "=".repeat((4 - (base64Url.length % 4)) % 4);
  const base64 = (base64Url + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const output = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) output[i] = raw.charCodeAt(i);
  return output;
}

export function usePushSubscription() {
  const supported = isPushSupported();
  const [subscribed, setSubscribed] = useState(false);
  const [denied, setDenied] = useState(false);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    if (!supported) return;
    await navigator.serviceWorker.register("/sw.js").catch(() => { /* best-effort */ });
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    setSubscribed(!!sub);
    setDenied(Notification.permission === "denied");
    setReady(true);
  }, [supported]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const subscribe = useCallback(async (): Promise<{ ok: true } | { ok: false; reason: "permission-denied" | "not-configured" | "error"; message?: string }> => {
    try {
      const reg = await navigator.serviceWorker.ready;
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return { ok: false, reason: "permission-denied" };
      const { publicKey } = await getVapidPublicKey();
      if (!publicKey) return { ok: false, reason: "not-configured" };
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });
      const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      await subscribePush({ endpoint: subJson.endpoint, keys: subJson.keys });
      await refresh();
      return { ok: true };
    } catch (err) {
      return { ok: false, reason: "error", message: err instanceof Error ? err.message : undefined };
    }
  }, [refresh]);

  const unsubscribe = useCallback(async () => {
    const reg = await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) {
      await unsubscribePush(existing.endpoint);
      await existing.unsubscribe();
    }
    await refresh();
  }, [refresh]);

  return { supported, subscribed, denied, ready, subscribe, unsubscribe };
}
