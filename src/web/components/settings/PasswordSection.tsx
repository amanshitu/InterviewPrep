import { useState } from "react";
import { changePassword, revokeAllSessions } from "../../api/auth";
import { useConfirm } from "../../hooks/use-confirm";
import { useToast } from "../../hooks/use-toast";
import { clearAuthedFlag } from "../../lib/auth-flag";
import { PrimaryButton, SecondaryButton, SectionCard, inputClass } from "./SectionCard";
import { KeyIcon, LogoutIcon } from "./icons";
import { PasswordField } from "../layout/PasswordField";

export function PasswordSection() {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      await changePassword(currentPassword, newPassword);
      toast.success("Password updated.");
      setCurrentPassword("");
      setNewPassword("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't update your password.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SectionCard title="Change password">
      <form onSubmit={(e) => void handleSubmit(e)}>
        <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
          <span>Current password</span>
          <PasswordField className={inputClass()} autoComplete="current-password" required value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
        </label>
        <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
          <span>New password</span>
          <PasswordField className={inputClass()} autoComplete="new-password" minLength={8} required value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
          <small className="font-normal">At least 8 characters.</small>
        </label>
        <PrimaryButton type="submit" loading={submitting} loadingText="Updating…">
          <KeyIcon /> Update password
        </PrimaryButton>
      </form>
    </SectionCard>
  );
}

export function SessionsSection() {
  const confirm = useConfirm();
  const [revoking, setRevoking] = useState(false);

  async function handleRevokeAll() {
    const ok = await confirm({
      title: "Sign out everywhere?",
      message: "This signs out of all devices, including this one.",
      confirmLabel: "Sign out",
      destructive: true,
    });
    if (!ok) return;
    setRevoking(true);
    try {
      await revokeAllSessions();
      // This session is revoked too, so leaving the SPA is required — but go
      // straight to /login (as AppShell's handleLogout does) rather than
      // reload(), which re-rendered the shell's spinner and waited on a
      // doomed /api/me before AuthGate redirected there anyway.
      clearAuthedFlag();
      window.location.href = "/login";
    } catch {
      setRevoking(false);
    }
  }

  return (
    <SectionCard title="Sessions" subtitle="Sign out everywhere this account is logged in, including this device.">
      <SecondaryButton onClick={() => void handleRevokeAll()} loading={revoking} loadingText="Signing out…">
        <LogoutIcon /> Sign out of all devices
      </SecondaryButton>
    </SectionCard>
  );
}
