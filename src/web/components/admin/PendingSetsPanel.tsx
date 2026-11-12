import { useState } from "react";
import { approveSet, rejectSet, type PendingQuestionSet } from "../../api/admin";
import type { Category } from "../../api/types";
import { useToast } from "../../hooks/use-toast";
import { QuestionReviewPanel } from "./QuestionReviewPanel";

export function PendingSetsPanel({
  sets,
  categories,
  onChanged,
}: {
  sets: PendingQuestionSet[];
  categories: Category[];
  onChanged: () => void;
}) {
  if (sets.length === 0) {
    return <p className="text-sm text-muted-foreground">Nothing pending review.</p>;
  }
  return (
    <div className="space-y-4">
      {sets.map((s) => (
        <PendingSetCard key={s.id} set={s} categories={categories} onChanged={onChanged} />
      ))}
    </div>
  );
}

function PendingSetCard({
  set,
  categories,
  onChanged,
}: {
  set: PendingQuestionSet;
  categories: Category[];
  onChanged: () => void;
}) {
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const { success, error } = useToast();

  function toggleCategory(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleApprove() {
    setBusy(true);
    try {
      await approveSet(set.id, Array.from(checked));
      success("Approved — now shows up as a suggestion for other users.");
      onChanged();
    } catch (err) {
      error(err instanceof Error ? err.message : "Failed to approve set.");
    } finally {
      setBusy(false);
    }
  }

  async function handleReject() {
    setBusy(true);
    try {
      await rejectSet(set.id, reason.trim() || "No reason given.");
      success("Rejected.");
      onChanged();
    } catch (err) {
      error(err instanceof Error ? err.message : "Failed to reject set.");
    } finally {
      setBusy(false);
      setRejecting(false);
    }
  }

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="text-sm font-bold text-foreground">{set.title}</div>
      <p className="mt-1 text-sm text-muted-foreground">
        {set.question_count} question{set.question_count === 1 ? "" : "s"}
        {set.track ? ` · ${set.track}` : ""} · by {set.owner_name || "unknown"} ({set.owner_email || ""})
      </p>

      {categories.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold text-muted-foreground">Tag into categories (optional):</p>
          <div className="mt-1.5 flex flex-wrap gap-3">
            {categories.map((c) => (
              <label key={c.id} className="flex items-center gap-1.5 text-sm text-foreground">
                <input type="checkbox" checked={checked.has(c.id)} onChange={() => toggleCategory(c.id)} />
                {c.name}
              </label>
            ))}
          </div>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => void handleApprove()}
          disabled={busy}
          className="rounded-md bg-success px-3 py-1.5 text-sm font-semibold text-background disabled:opacity-60"
        >
          Approve
        </button>
        <button
          type="button"
          onClick={() => setRejecting((v) => !v)}
          disabled={busy}
          className="rounded-md bg-destructive px-3 py-1.5 text-sm font-semibold text-background disabled:opacity-60"
        >
          Reject
        </button>
      </div>

      {rejecting ? (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Reason for rejecting (optional)"
            className="min-w-[220px] flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground"
          />
          <button
            type="button"
            onClick={() => void handleReject()}
            disabled={busy}
            className="rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground"
          >
            Confirm reject
          </button>
        </div>
      ) : null}

      <QuestionReviewPanel setId={set.id} />
    </div>
  );
}
