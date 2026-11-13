import { useEffect, useState } from "react";
import { getVapidPublicKey, subscribePush, unsubscribePush } from "../../api/push";
import { useToast } from "../../hooks/use-toast";
import { BellIcon } from "./icons";
import { PrimaryButton, SecondaryButton, SectionCard } from "./SectionCard";

function isPushSupported(): boolean {
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

export function NotificationsSection() {
  const toast = useToast();
  const [supported] = useState(isPushSupported());
  const [subscribed, setSubscribed] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [toggling, setToggling] = useState(false);

  async function refresh() {
    if (!supported) return;
    // Idempotent — harmless if the old app's shell already registered
    // this on a prior page load; required here in case this is the first
    // page the visitor has loaded under the new React pages.
    await navigator.serviceWorker.register("/sw.js").catch(() => { /* best-effort */ });
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    setSubscribed(!!sub);
    setBlocked(Notification.permission === "denied");
    setReady(true);
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleToggle() {
    setToggling(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();
      if (existing) {
        await unsubscribePush(existing.endpoint);
        await existing.unsubscribe();
        toast.success("Reminders turned off.");
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== "granted") {
          toast.warning("Notifications permission wasn't granted.");
          return;
        }
        const { publicKey } = await getVapidPublicKey();
        if (!publicKey) {
          toast.error("Push isn't configured on the server yet.");
          return;
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
        });
        const subJson = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        await subscribePush({ endpoint: subJson.endpoint, keys: subJson.keys });
        toast.success("Reminders turned on.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update notification settings.");
    }
    await refresh();
    setToggling(false);
  }

  if (!supported) return null;

  const statusText = subscribed ? "Reminders are on." : blocked ? "Blocked — enable notifications for this site in your browser settings first." : "Reminders are off.";
  const ButtonComponent = subscribed ? SecondaryButton : PrimaryButton;

  return (
    <SectionCard title="Notifications" subtitle="Get a browser reminder once a day if you still have questions left for today.">
      <p className="mb-3 text-sm text-muted-foreground">{ready ? statusText : "Checking…"}</p>
      <ButtonComponent onClick={() => void handleToggle()} disabled={!ready} loading={toggling} loadingText={subscribed ? "Disabling…" : "Enabling…"}>
        <BellIcon /> {subscribed ? "Disable reminders" : "Enable reminders"}
      </ButtonComponent>
    </SectionCard>
  );
}
