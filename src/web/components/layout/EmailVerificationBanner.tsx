import { useState } from "react";
import { resendVerificationEmail } from "../../api/auth";
import type { User } from "../../api/types";
import { useToast } from "../../hooks/use-toast";

const SNOOZE_KEY = "examstreak.verifyEmailSnoozeUntil";
const SNOOZE_DAYS = 7;
// Never nag someone in their first day — they likely just haven't checked
// their inbox yet, not ignored it. Same restraint MealSathi/CosmoTracker's
// own "enable notifications" banners use for their first prompt.
const MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;

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

export function EmailVerificationBanner({ user }: { user: User }) {
  const toast = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  const accountAge = Date.now() - new Date(user.createdAt).getTime();
  if (user.emailVerified || dismissed || isSnoozed() || accountAge < MIN_ACCOUNT_AGE_MS) return null;

  async function handleResend() {
    setSending(true);
    try {
      await resendVerificationEmail();
      toast.success("Verification email sent — check your inbox.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send the email.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-secondary px-4 pb-2 text-center text-xs font-medium text-foreground"
      style={{ paddingTop: "calc(0.5rem + env(safe-area-inset-top, 0px))" }}
    >
      <span>Please verify your email address ({user.email}).</span>
      <button type="button" onClick={() => void handleResend()} disabled={sending} className="font-semibold underline underline-offset-2 disabled:opacity-60">
        {sending ? "Sending…" : "Resend email"}
      </button>
      <button
        type="button"
        onClick={() => {
          snooze();
          setDismissed(true);
        }}
        className="text-muted-foreground underline underline-offset-2"
      >
        Dismiss
      </button>
    </div>
  );
}
