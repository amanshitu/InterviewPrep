import { useEffect, useState } from "react";
import { getAdminSettings, setCaptchaEnabled as apiSetCaptchaEnabled } from "../../api/admin";
import { useToast } from "../../hooks/use-toast";

// Visible regardless of which admin tab is active (not its own tab) — a
// single platform-wide switch, not worth a whole section. Disabling this
// doesn't remove the Turnstile widget from a page that's already loaded
// in someone's browser; it just makes the server stop requiring a token,
// so existing open tabs keep working either way.
export function CaptchaToggle() {
  const toast = useToast();
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAdminSettings()
      .then((s) => setEnabled(s.captchaEnabled))
      .catch(() => setEnabled(null));
  }, []);

  async function handleToggle() {
    if (enabled === null) return;
    const next = !enabled;
    setSaving(true);
    try {
      const res = await apiSetCaptchaEnabled(next);
      setEnabled(res.captchaEnabled);
      toast.success(res.captchaEnabled ? "Captcha enabled on login/signup/forgot-password." : "Captcha disabled — those forms no longer require it.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update the setting.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground">Invisible captcha</p>
        <p className="text-xs text-muted-foreground">Required on login, signup, and forgot-password when on.</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled === true}
        disabled={enabled === null || saving}
        onClick={() => void handleToggle()}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors disabled:opacity-50 ${
          enabled ? "bg-primary" : "bg-muted"
        }`}
      >
        <span className={`inline-block size-4.5 transform rounded-full bg-background transition-transform ${enabled ? "translate-x-5.5" : "translate-x-1"}`} />
      </button>
    </div>
  );
}
