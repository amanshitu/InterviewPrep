import { useState } from "react";
import { usePushSubscription } from "../../hooks/use-push-subscription";
import { useToast } from "../../hooks/use-toast";
import { BellIcon } from "./icons";
import { PrimaryButton, SecondaryButton, SectionCard } from "./SectionCard";

export function NotificationsSection() {
  const toast = useToast();
  const { supported, subscribed, denied, ready, subscribe, unsubscribe } = usePushSubscription();
  const [toggling, setToggling] = useState(false);

  async function handleToggle() {
    setToggling(true);
    try {
      if (subscribed) {
        await unsubscribe();
        toast.success("Reminders turned off.");
      } else {
        const result = await subscribe();
        if (!result.ok) {
          if (result.reason === "permission-denied") toast.warning("Notifications permission wasn't granted.");
          else if (result.reason === "not-configured") toast.error("Push isn't configured on the server yet.");
          else toast.error(result.message || "Couldn't update notification settings.");
          return;
        }
        toast.success("Reminders turned on.");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update notification settings.");
    } finally {
      setToggling(false);
    }
  }

  if (!supported) return null;

  const statusText = subscribed ? "Reminders are on." : denied ? "Blocked — enable notifications for this site in your browser settings first." : "Reminders are off.";
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
