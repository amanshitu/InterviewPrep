import { useState } from "react";
import type { User } from "../../api/types";
import { usePushSubscription } from "../../hooks/use-push-subscription";
import { useToast } from "../../hooks/use-toast";

const SNOOZE_KEY = "examstreak.enableNotificationsSnoozeUntil";
const SNOOZE_DAYS = 7;
// Never prompt on day 0/1 — someone who just signed up hasn't had a daily
// queue to miss yet, so the pitch ("don't miss today's questions") doesn't
// land. Matches the same deliberate delay MealSathi/CosmoTracker's own
// "enable notifications" banners use.
const MIN_ACCOUNT_AGE_MS = 2 * 24 * 60 * 60 * 1000;

function isSnoozed(): boolean {
  try {
    const until = localStorage.getItem(SNOOZE_KEY);
    return !!until && Date.now() < Number(until);
  } catch {
    return false;
  }
}

function snooze() {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now() + SNOOZE_DAYS * 24 * 60 * 60 * 1000));
  } catch {
    /* no localStorage (private window etc.) — banner just reappears next load, harmless */
  }
}

export function EnableNotificationsBanner({ user }: { user: User }) {
  const toast = useToast();
  const { supported, subscribed, denied, ready, subscribe } = usePushSubscription();
  const [dismissed, setDismissed] = useState(false);
  const [enabling, setEnabling] = useState(false);

  const accountAge = Date.now() - new Date(user.createdAt).getTime();
  // `denied` means the visitor already said no at the browser level — nagging
  // again from a banner (as opposed to the Settings toggle, which they'd have
  // to seek out) would just be annoying, not persuasive.
  if (!supported || !ready || subscribed || denied || dismissed || isSnoozed() || accountAge < MIN_ACCOUNT_AGE_MS) return null;

  async function handleEnable() {
    setEnabling(true);
    try {
      const result = await subscribe();
      if (result.ok) {
        toast.success("Reminders turned on.");
      } else if (result.reason === "not-configured") {
        toast.error("Push isn't configured on the server yet.");
      }
      // permission-denied: Notification.permission is now "denied" itself,
      // so the `denied` guard above hides this banner on the next render —
      // no separate toast needed for that case.
    } finally {
      setEnabling(false);
    }
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-secondary px-4 pb-2 text-center text-xs font-medium text-foreground"
      style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top, 0px))" }}
    >
      <span>Get a daily reminder if you still have questions left.</span>
      <button type="button" onClick={() => void handleEnable()} disabled={enabling} className="font-semibold underline underline-offset-2 disabled:opacity-60">
        {enabling ? "Enabling…" : "Enable reminders"}
      </button>
      <button
        type="button"
        onClick={() => {
          snooze();
          setDismissed(true);
        }}
        className="text-muted-foreground underline underline-offset-2"
      >
        Not now
      </button>
    </div>
  );
}
