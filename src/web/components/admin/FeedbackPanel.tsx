import { useEffect, useState } from "react";
import { getFeedback, resolveFeedback, type FeedbackEntry } from "../../api/feedback";
import { useToast } from "../../hooks/use-toast";
import { CheckIcon } from "../layout/icons";
import { Skeleton } from "../layout/Skeleton";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

const CATEGORY_LABEL: Record<string, string> = {
  bug: "Bug",
  feature: "Feature idea",
  general: "General",
  praise: "Praise",
};

export function FeedbackPanel({ onChanged }: { onChanged: () => void }) {
  const { error, success } = useToast();
  const [feedback, setFeedback] = useState<FeedbackEntry[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  function load() {
    getFeedback()
      .then((data) => setFeedback(data.feedback))
      .catch((err) => error(err instanceof Error ? err.message : "Couldn't load feedback."));
  }

  useEffect(load, [error]);

  async function resolve(id: string) {
    setBusyId(id);
    try {
      await resolveFeedback(id);
      setFeedback((prev) => prev?.map((f) => (f.id === id ? { ...f, status: "resolved" } : f)) ?? prev);
      onChanged();
      success("Marked resolved.");
    } catch (err) {
      error(err instanceof Error ? err.message : "Couldn't update that.");
    } finally {
      setBusyId(null);
    }
  }

  const open = feedback?.filter((f) => f.status === "open") ?? [];
  const resolved = feedback?.filter((f) => f.status !== "open") ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Open feedback{feedback ? ` (${open.length})` : ""}</h3>
        {!feedback ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </div>
        ) : open.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open feedback right now.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {open.map((f) => (
              <div key={f.id} className="rounded-md border border-border bg-muted/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2 text-xs">
                    <span className="rounded-full bg-secondary px-2 py-0.5 font-semibold text-secondary-foreground">{CATEGORY_LABEL[f.category] || f.category}</span>
                    <span className="font-medium text-foreground">{f.user_name}</span>
                    <span className="text-muted-foreground">({f.user_email})</span>
                  </div>
                  <div className="text-xs text-muted-foreground">{formatDate(f.created_at)}</div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{f.message}</p>
                <button
                  type="button"
                  disabled={busyId === f.id}
                  onClick={() => void resolve(f.id)}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                >
                  <CheckIcon width={14} height={14} /> Mark resolved
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {resolved.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Recently resolved</h3>
          <div className="flex flex-col gap-2">
            {resolved.slice(0, 20).map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5 text-sm">
                <div className="min-w-0 truncate text-muted-foreground">
                  <span className="font-medium text-foreground">{f.user_name}:</span> {f.message}
                </div>
                <span className="shrink-0 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">resolved</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
