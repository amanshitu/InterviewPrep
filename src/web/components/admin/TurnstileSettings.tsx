import { useEffect, useState } from "react";
import { getAdminSettings, setTurnstileConfig as apiSetTurnstileConfig } from "../../api/admin";
import { PasswordField } from "../layout/PasswordField";
import { FieldLabel, PrimaryButton, SectionCard, inputClass } from "../settings/SectionCard";
import { SaveIcon } from "../layout/icons";
import { useToast } from "../../hooks/use-toast";

// Login/signup/forgot-password's invisible-captcha widget. Admin-editable
// so a bad or domain-mismatched key can be fixed without CLI access or a
// redeploy — the site key is public-safe (meant to be embedded in
// client-side JS); the secret is AES-GCM encrypted at rest, same as
// Brevo's API key, and never echoed back once saved.
export function TurnstileSettings() {
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [siteKey, setSiteKey] = useState("");
  const [secret, setSecret] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getAdminSettings()
      .then((s) => {
        setConfigured(s.turnstileConfigured);
        setSiteKey(s.turnstileSiteKey);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, []);

  async function handleSave() {
    setSaving(true);
    try {
      const res = await apiSetTurnstileConfig({ siteKey: siteKey.trim(), secret: secret.trim() || undefined });
      setConfigured(res.turnstileConfigured);
      setSiteKey(res.turnstileSiteKey);
      setSecret("");
      toast.success("Turnstile settings saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save Turnstile settings.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <SectionCard
      title="Turnstile (login captcha)"
      subtitle={
        configured
          ? "Gates login, signup, and forgot-password — remember to also add this domain under the widget's allowed domains in the Cloudflare dashboard."
          : "Not configured yet — the captcha switch above has nothing to actually check."
      }
    >
      <FieldLabel label="Site key" hint="From the Cloudflare dashboard → Turnstile → your widget. Safe to expose client-side.">
        <input className={inputClass()} placeholder="0x..." value={siteKey} onChange={(e) => setSiteKey(e.target.value)} disabled={!loaded} />
      </FieldLabel>
      <FieldLabel label="Secret key" hint="From the same widget's dashboard page — never shown back here once saved.">
        <PasswordField
          className={inputClass()}
          autoComplete="off"
          placeholder={configured ? "Already set — enter a new secret to replace it" : "0x..."}
          value={secret}
          onChange={(e) => setSecret(e.target.value)}
          disabled={!loaded}
        />
      </FieldLabel>
      <PrimaryButton onClick={() => void handleSave()} loading={saving} loadingText="Saving…" disabled={!loaded}>
        <SaveIcon /> Save Turnstile settings
      </PrimaryButton>
    </SectionCard>
  );
}
