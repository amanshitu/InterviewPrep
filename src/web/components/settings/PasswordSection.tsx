import { useState } from "react";
import { changePassword, revokeAllSessions } from "../../api/auth";
import { useToast } from "../../hooks/use-toast";
import { PrimaryButton, SecondaryButton, SectionCard, inputClass } from "./SectionCard";
import { KeyIcon, LogoutIcon } from "./icons";

export function PasswordSection() {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await changePassword(currentPassword, newPassword);
      toast.success("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update your password.");
    }
  }

  return (
    <SectionCard title="Change password">
      <form onSubmit={(e) => void handleSubmit(e)}>
        <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
          <span>Current password</span>
          <input className={inputClass()} type="password" autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </label>
        <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
          <span>New password</span>
          <input className={inputClass()} type="password" autoComplete="new-password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <small className="font-normal">At least 8 characters.</small>
        </label>
        <PrimaryButton type="submit">
          <KeyIcon /> Update password
        </PrimaryButton>
      </form>
    </SectionCard>
  );
}

export function SessionsSection() {
  async function handleRevokeAll() {
    if (!confirm("Sign out of all devices, including this one?")) return;
    await revokeAllSessions();
    window.location.reload();
  }

  return (
    <SectionCard title="Sessions" subtitle="Sign out everywhere this account is logged in, including this device.">
      <SecondaryButton onClick={() => void handleRevokeAll()}>
        <LogoutIcon /> Sign out of all devices
      </SecondaryButton>
    </SectionCard>
  );
}
