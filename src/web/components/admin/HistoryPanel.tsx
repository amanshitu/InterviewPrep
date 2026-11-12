import type { ApprovalHistoryEntry } from "../../api/admin";
import { QuestionReviewPanel } from "./QuestionReviewPanel";
import { StatusBadge } from "./StatusBadge";

export function HistoryPanel({ history }: { history: ApprovalHistoryEntry[] }) {
  if (history.length === 0) {
    return <p className="text-sm text-muted-foreground">No decisions made yet.</p>;
  }
  return (
    <div className="space-y-4">
      {history.map((h) => {
        const isApproved = h.visibility === "shared";
        const actedAt = isApproved ? h.approved_at : h.rejected_at;
        const actorLabel = h.actor_name ? `${h.actor_name} (${h.actor_email || ""})` : "unknown";
        return (
          <div key={h.id} className="rounded-lg border border-border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-bold text-foreground">{h.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">
                  {h.question_count} question{h.question_count === 1 ? "" : "s"}
                  {h.track ? ` · ${h.track}` : ""} · submitted by {h.owner_name || "unknown"} ({h.owner_email || ""})
                </p>
              </div>
              <StatusBadge status={isApproved ? "approved" : "rejected"} />
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {isApproved ? "Approved" : "Rejected"} by {actorLabel}
              {actedAt ? ` · ${new Date(actedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}` : ""}
            </p>
            {!isApproved && h.rejected_reason ? (
              <p className="mt-1 text-sm text-muted-foreground">Reason: {h.rejected_reason}</p>
            ) : null}
            <QuestionReviewPanel setId={h.id} />
          </div>
        );
      })}
    </div>
  );
}
