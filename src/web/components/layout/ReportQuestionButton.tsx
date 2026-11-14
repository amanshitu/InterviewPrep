import { useState } from "react";
import { reportQuestion } from "../../api/reports";
import { useToast } from "../../hooks/use-toast";
import { CloseIcon, FlagIcon } from "./icons";

// A small "something's wrong with this" affordance next to a question's
// answer — reports go straight into the admin Reports queue (see
// ReportsPanel.tsx) rather than anywhere user-visible, so this never shows
// the reporter anything beyond "thanks, reported." Deliberately kept to a
// single free-text reason field rather than a category picker: the volume
// here is low enough that an admin reading the reason is cheaper than
// building and maintaining a taxonomy.
export function ReportQuestionButton({ questionId }: { questionId: string }) {
  const { success, error } = useToast();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmed = reason.trim();
    if (!trimmed) {
      error("Describe what's wrong first.");
      return;
    }
    setSubmitting(true);
    try {
      await reportQuestion(questionId, trimmed);
      success("Reported — thanks, an admin will take a look.");
      setOpen(false);
      setReason("");
    } catch (err) {
      error(err instanceof Error ? err.message : "Couldn't submit the report.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary"
      >
        <FlagIcon width={14} height={14} /> Report
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-200 flex items-center justify-center bg-black/50 p-4"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="report-question-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="report-question-title" className="text-base font-semibold">
                Report this question
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                disabled={submitting}
                className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50"
              >
                <CloseIcon width={16} height={16} />
              </button>
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              What's wrong with it — a wrong answer, a confusing question, a typo? An admin will review and can fix it directly.
            </p>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
              rows={4}
              maxLength={500}
              placeholder="e.g. The answer says 1275 but it should be 1225."
              className="mt-3 w-full rounded-md border border-border bg-background p-2.5 text-sm text-foreground"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submit()}
                disabled={submitting}
                className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit report"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
