import { useState } from "react";
import { cancelAccountDeletion, requestAccountDeletion } from "../../api/account";
import type { User } from "../../api/types";
import { useToast } from "../../hooks/use-toast";
import { PasswordField } from "../layout/PasswordField";
import { ErrorText, SecondaryButton, SectionCard, inputClass } from "./SectionCard";
import { TrashIcon } from "./icons";

const CONFIRM_WORD = "DELETE";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

export function DeleteAccountSection({ user, onUserChange }: { user: User; onUserChange: (user: User) => void }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [purgeDate, setPurgeDate] = useState<string | null>(null);

  async function handleRequestDeletion() {
    setError(null);
    if (confirmText !== CONFIRM_WORD) {
      setError(`Type ${CONFIRM_WORD} to confirm.`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await requestAccountDeletion(password);
      setPurgeDate(res.purgeDate);
      setExpanded(false);
      setPassword("");
      setConfirmText("");
      onUserChange({ ...user, deletionRequestedAt: res.deletionRequestedAt });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't schedule deletion.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancelDeletion() {
    setSubmitting(true);
    try {
      const res = await cancelAccountDeletion();
      onUserChange(res.user);
      toast.success("Account deletion canceled.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't cancel deletion.");
    } finally {
      setSubmitting(false);
    }
  }

  if (user.deletionRequestedAt) {
    return (
      <SectionCard title="Delete account">
        <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3.5 text-sm">
          <p className="font-medium text-destructive">
            Your account is scheduled for deletion on {formatDate(purgeDate ?? user.deletionRequestedAt)}.
          </p>
          <p className="mt-1 text-muted-foreground">
            Nothing is restricted in the meantime — you can keep using ExamStreak right up until then.
          </p>
          <SecondaryButton className="mt-3" onClick={() => void handleCancelDeletion()} loading={submitting} loadingText="Canceling…">
            Cancel deletion
          </SecondaryButton>
        </div>
      </SectionCard>
    );
  }

  return (
    <SectionCard
      title="Delete account"
      subtitle="Permanently deletes your account and progress after a 30-day grace period, during which you can cancel any time from this page."
    >
      {!expanded ? (
        <SecondaryButton onClick={() => setExpanded(true)} className="border-destructive/40 text-destructive hover:bg-destructive/10">
          <TrashIcon /> Delete my account
        </SecondaryButton>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
            <span>Confirm your password</span>
            <PasswordField className={inputClass()} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
            <span>
              Type <strong className="text-foreground">{CONFIRM_WORD}</strong> to confirm
            </span>
            <input className={inputClass()} value={confirmText} onChange={(e) => setConfirmText(e.target.value)} />
          </label>
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <SecondaryButton
              onClick={() => void handleRequestDeletion()}
              loading={submitting}
              loadingText="Scheduling…"
              disabled={!password || confirmText !== CONFIRM_WORD}
              className="border-destructive/40 text-destructive hover:bg-destructive/10"
            >
              <TrashIcon /> Confirm deletion
            </SecondaryButton>
            <SecondaryButton
              onClick={() => {
                setExpanded(false);
                setError(null);
                setPassword("");
                setConfirmText("");
              }}
            >
              Cancel
            </SecondaryButton>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
