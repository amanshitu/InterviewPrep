import { useEffect, useState } from "react";
import { changePassword, getSessions, revokeAllSessions, revokeSession, type SessionInfo } from "../../api/auth";
import { useConfirm } from "../../hooks/use-confirm";
import { useToast } from "../../hooks/use-toast";
import { clearAuthedFlag } from "../../lib/auth-flag";
import { clearAllSnapshots } from "../../lib/offline-store";
import { PrimaryButton, SecondaryButton, SectionCard, inputClass } from "./SectionCard";
import { KeyIcon, LogoutIcon } from "./icons";
import { PasswordField } from "../layout/PasswordField";
import { Skeleton } from "../layout/Skeleton";

// A rough label, not a real user-agent parser — good enough to tell two
// sessions apart ("Chrome on Windows" vs "Safari on iPhone"), not meant to
// be exhaustive.
function describeDevice(userAgent: string | null): string {
  if (!userAgent) return "Unknown device";
  const os = /iphone|ipad/i.test(userAgent)
    ? "iOS"
    : /android/i.test(userAgent)
      ? "Android"
      : /windows/i.test(userAgent)
        ? "Windows"
        : /mac os/i.test(userAgent)
          ? "macOS"
          : /linux/i.test(userAgent)
            ? "Linux"
            : "Unknown OS";
  const browser = /edg\//i.test(userAgent)
    ? "Edge"
    : /chrome\//i.test(userAgent)
      ? "Chrome"
      : /firefox\//i.test(userAgent)
        ? "Firefox"
        : /safari\//i.test(userAgent)
          ? "Safari"
          : "Unknown browser";
  return `${browser} on ${os}`;
}

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.round(ms / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

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
  const toast = useToast();
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [revoking, setRevoking] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  useEffect(() => {
    getSessions()
      .then((res) => setSessions(res.sessions))
      .catch(() => setSessions([]));
  }, []);

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
      clearAllSnapshots();
      window.location.href = "/login";
    } catch {
      setRevoking(false);
    }
  }

  async function handleRevokeOne(id: string) {
    setRevokingId(id);
    try {
      await revokeSession(id);
      setSessions((prev) => (prev ? prev.filter((s) => s.id !== id) : prev));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't sign out that device.");
    } finally {
      setRevokingId(null);
    }
  }

  return (
    <SectionCard title="Sessions" subtitle="Every device currently signed in to this account.">
      <div className="flex flex-col gap-2">
        {sessions === null ? (
          <Skeleton className="h-14 w-full" />
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No other sessions found.</p>
        ) : (
          sessions.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                  {describeDevice(s.userAgent)}
                  {s.isCurrent ? <span className="rounded-full bg-primary/12 px-2 py-0.5 text-xs font-semibold text-primary">This device</span> : null}
                </div>
                <p className="text-xs text-muted-foreground">
                  {s.ipAddress ? `${s.ipAddress} · ` : ""}active {relativeTime(s.lastSeenAt)}
                </p>
              </div>
              {!s.isCurrent ? (
                <SecondaryButton onClick={() => void handleRevokeOne(s.id)} loading={revokingId === s.id} loadingText="Signing out…" className="shrink-0">
                  Sign out
                </SecondaryButton>
              ) : null}
            </div>
          ))
        )}
      </div>
      <SecondaryButton onClick={() => void handleRevokeAll()} loading={revoking} loadingText="Signing out…" className="mt-3">
        <LogoutIcon /> Sign out of all devices
      </SecondaryButton>
    </SectionCard>
  );
}
