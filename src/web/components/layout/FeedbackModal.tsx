import { useState } from "react";
import { createPortal } from "react-dom";
import { submitFeedback, type FeedbackCategory } from "../../api/feedback";
import { useToast } from "../../hooks/use-toast";
import { CloseIcon } from "./icons";

const CATEGORIES: { value: FeedbackCategory; label: string }[] = [
  { value: "general", label: "General" },
  { value: "bug", label: "Something's broken" },
  { value: "feature", label: "Feature idea" },
  { value: "praise", label: "Just saying thanks" },
];

// Presentational — the trigger button and its open/close state live in
// Sidebar.tsx and MobileHeader.tsx (desktop vs mobile chrome each render
// their own), both just mount this when open. Goes to the admin Feedback
// tab (feedback table), separate from question_reports — this is for the
// app in general, not one specific question/answer (see ReportQuestionButton
// for that).
export function FeedbackModal({ onClose }: { onClose: () => void }) {
  const { success, error } = useToast();
  const [category, setCategory] = useState<FeedbackCategory>("general");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    const trimmed = message.trim();
    if (!trimmed) {
      error("Write a message first.");
      return;
    }
    setSubmitting(true);
    try {
      await submitFeedback(trimmed, category);
      success("Thanks — your feedback was sent.");
      onClose();
    } catch (err) {
      error(err instanceof Error ? err.message : "Couldn't send that.");
    } finally {
      setSubmitting(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/50 p-4" onClick={() => !submitting && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="feedback-modal-title"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="feedback-modal-title" className="text-base font-semibold">Send feedback</h2>
          <button type="button" onClick={onClose} disabled={submitting} aria-label="Close" className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50">
            <CloseIcon width={16} height={16} />
          </button>
        </div>
        <p className="mt-1.5 text-sm text-muted-foreground">Bugs, ideas for what'd make this more useful, or anything else — an admin reads every one.</p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => setCategory(c.value)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                category === c.value ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground hover:bg-muted"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          autoFocus
          rows={5}
          maxLength={2000}
          placeholder="What's on your mind?"
          className="mt-3 w-full rounded-md border border-border bg-background p-2.5 text-sm text-foreground"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
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
            {submitting ? "Sending…" : "Send feedback"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
