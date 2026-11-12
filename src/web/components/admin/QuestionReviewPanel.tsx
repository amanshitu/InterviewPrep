import { useState } from "react";
import { getSetQuestions } from "../../api/admin";
import { useToast } from "../../hooks/use-toast";
import { CloseIcon, EyeIcon } from "../layout/icons";

// Shared by the Pending Approvals and History panels — lets an admin expand
// a set's actual question list before deciding (or to re-check an
// already-decided set). Questions are fetched once per set id per page
// load and cached in module scope (faithful to the old page's
// per-page-load `questionsCache` Map, which only needed to survive one
// render's worth of toggles).
const questionsCache = new Map<string, { q: string; a: string; topic_label: string }[]>();

export function QuestionReviewPanel({ setId }: { setId: string }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<{ q: string; a: string; topic_label: string }[] | null>(
    questionsCache.get(setId) ?? null,
  );
  const { error } = useToast();

  async function toggle() {
    const opening = !open;
    setOpen(opening);
    if (opening && !questionsCache.has(setId)) {
      setLoading(true);
      try {
        const data = await getSetQuestions(setId);
        questionsCache.set(setId, data.questions);
        setQuestions(data.questions);
      } catch (err) {
        error(err instanceof Error ? err.message : "Failed to load questions.");
      } finally {
        setLoading(false);
      }
    }
  }

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={() => void toggle()}
        className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted"
      >
        {open ? <CloseIcon width={15} height={15} /> : <EyeIcon width={15} height={15} />}
        {open ? "Hide questions" : "Review questions"}
      </button>
      {open ? (
        <div className="mt-3 space-y-3">
          {loading ? <p className="text-sm text-muted-foreground">Loading questions…</p> : null}
          {!loading && questions && questions.length === 0 ? (
            <p className="text-sm text-muted-foreground">No questions in this set.</p>
          ) : null}
          {!loading &&
            questions?.map((q, idx) => (
              <div key={idx} className="rounded-md border border-border bg-muted/40 p-3">
                <div className="text-xs font-semibold uppercase tracking-wide text-primary">{q.topic_label}</div>
                <div className="mt-1 text-sm font-medium text-foreground">
                  Q{idx + 1}. {q.q}
                </div>
                <p className="mt-1.5 text-sm text-muted-foreground">{q.a}</p>
              </div>
            ))}
        </div>
      ) : null}
    </div>
  );
}
