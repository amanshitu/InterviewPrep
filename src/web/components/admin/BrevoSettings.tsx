import { useEffect, useState } from "react";
import { getAdminSettings, setBrevoConfig as apiSetBrevoConfig } from "../../api/admin";
import { PasswordField } from "../layout/PasswordField";
import { FieldLabel, PrimaryButton, SectionCard, inputClass } from "../settings/SectionCard";
import { SaveIcon } from "../layout/icons";
import { useToast } from "../../hooks/use-toast";

// Platform-wide outgoing email config (verification/reset/deletion
// emails) — Brevo's transactional API. Unlike every other provider
// integration in this app, the key isn't a Worker secret: it's stored
// (AES-GCM encrypted) in app_settings and editable here, so standing it up
// doesn't need a redeploy or CLI access. The API key field is always
// blank on load (never sent back from the server) — leaving it blank on
// save keeps whatever key is already configured, same convention as the
// BYOK AI key field in Settings.
export function BrevoSettings() {
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [senderEmail, setSenderEmail] = useState("");
  const [senderName, setSenderName] = useState("ExamStreak");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAdminSettings()
      .then((s) => {
        setConfigured(s.brevoConfigured);
        setSenderEmail(s.brevoSenderEmail);
        setSenderName(s.brevoSenderName || "ExamStreak");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await apiSetBrevoConfig({
        senderEmail: senderEmail.trim(),
        senderName: senderName.trim() || "ExamStreak",
        apiKey: apiKey.trim() || undefined,
      });
      setConfigured(res.brevoConfigured);
      setSenderEmail(res.brevoSenderEmail);
      setSenderName(res.brevoSenderName);
      setApiKey("");
      toast.success("Email settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save email settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Email (Brevo)"
      subtitle={
        configured
          ? "Verification, password-reset, and account-deletion emails send through this Brevo account."
          : "Not configured yet — those emails currently just log to the console instead of sending."
      }
    >
      <FieldLabel label="Sender email">
        <input
          className={inputClass()}
          type="email"
          placeholder="noreply@yourdomain.com"
          value={senderEmail}
          onChange={(e) => setSenderEmail(e.target.value)}
          disabled={!loaded}
        />
      </FieldLabel>
      <FieldLabel label="Sender name">
        <input
          className={inputClass()}
          placeholder="ExamStreak"
          value={senderName}
          onChange={(e) => setSenderName(e.target.value)}
          disabled={!loaded}
        />
      </FieldLabel>
      <FieldLabel label="Brevo API key" hint="Found in Brevo → Settings → SMTP & API → API Keys.">
        <PasswordField
          className={inputClass()}
          autoComplete="off"
          placeholder={configured ? "Already set — enter a new key to replace it" : "xkeysib-..."}
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          disabled={!loaded}
        />
      </FieldLabel>
      <PrimaryButton onClick={() => void handleSave()} loading={saving} loadingText="Saving…" disabled={!loaded}>
        <SaveIcon /> Save email settings
      </PrimaryButton>
    </SectionCard>
  );
}
