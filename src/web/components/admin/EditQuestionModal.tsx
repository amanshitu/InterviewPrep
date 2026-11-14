import { useState } from "react";
import { updateQuestion } from "../../api/admin";
import { useToast } from "../../hooks/use-toast";
import { CloseIcon } from "../layout/icons";

export interface EditableQuestion {
  id: string;
  q: string;
  a: string;
  topic_label: string;
}

// Shared by ReportsPanel's "Edit" action (pre-filled from a report) and its
// search-and-edit flow (pre-filled from a search hit) — same question-row
// shape either way, so one modal covers both entry points. Saving edits the
// row in place (see handleAdminUpdateQuestion's own reasoning for why) and
// hands the updated fields back to the caller rather than refetching, so a
// report's own card can show the new text immediately without a round trip.
export function EditQuestionModal({
  question,
  onClose,
  onSaved,
}: {
  question: EditableQuestion;
  onClose: () => void;
  onSaved: (updated: EditableQuestion) => void;
}) {
  const { success, error } = useToast();
  const [q, setQ] = useState(question.q);
  const [a, setA] = useState(question.a);
  const [topicLabel, setTopicLabel] = useState(question.topic_label);
  const [saving, setSaving] = useState(false);

  async function save() {
    const trimmedQ = q.trim();
    const trimmedA = a.trim();
    if (!trimmedQ || !trimmedA) {
      error("Question and answer can't be empty.");
      return;
    }
    setSaving(true);
    try {
      await updateQuestion(question.id, { q: trimmedQ, a: trimmedA, topic_label: topicLabel.trim() });
      success("Question updated.");
      onSaved({ id: question.id, q: trimmedQ, a: trimmedA, topic_label: topicLabel.trim() || question.topic_label });
      onClose();
    } catch (err) {
      error(err instanceof Error ? err.message : "Couldn't save the question.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-200 flex items-center justify-center bg-black/50 p-4" onClick={() => !saving && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-question-title"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="edit-question-title" className="text-base font-semibold">Edit question</h2>
          <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="shrink-0 text-muted-foreground hover:text-foreground disabled:opacity-50">
            <CloseIcon width={16} height={16} />
          </button>
        </div>
        <div className="mt-3 flex flex-col gap-3 overflow-y-auto">
          <label className="flex flex-col gap-1 text-sm font-medium text-muted-foreground">
            Topic label
            <input
              value={topicLabel}
              onChange={(e) => setTopicLabel(e.target.value)}
              className="rounded-md border border-border bg-background p-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-muted-foreground">
            Question
            <textarea
              value={q}
              onChange={(e) => setQ(e.target.value)}
              rows={3}
              className="rounded-md border border-border bg-background p-2 text-sm text-foreground"
            />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium text-muted-foreground">
            Answer (Markdown — **bold**, `code`, blank-line paragraphs)
            <textarea
              value={a}
              onChange={(e) => setA(e.target.value)}
              rows={10}
              className="rounded-md border border-border bg-background p-2 font-mono text-xs text-foreground"
            />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void save()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
