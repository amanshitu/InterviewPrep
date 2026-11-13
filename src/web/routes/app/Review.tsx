import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { useToast } from "../../hooks/use-toast";
import { getReview, submitReviewResult } from "../../api/queue";
import { ApiError } from "../../api/client";
import type { Question } from "../../api/types";
import { BackIcon, CheckIcon, EyeIcon, RefreshIcon, ShuffleIcon } from "../../components/layout/icons";
import { Skeleton, SkeletonCard } from "../../components/layout/Skeleton";

const DEFAULT_REVIEW_COUNT = 15;

interface ReviewItem extends Question {
  revealed: boolean;
  graded: "got_it" | "again" | null;
  times_shown?: number;
}

function parseCount(raw: string | null): number {
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_REVIEW_COUNT;
}

function ReviewContent() {
  const toast = useToast();
  // Reads the live ?count= from React Router's own search-params state
  // (not a one-time window.location.search read) so that navigating here
  // again with a different count — e.g. from Today's "Generate today's
  // review" link — actually reloads with the new value, now that this is
  // a persistent SPA route rather than a fresh document load every time.
  const [searchParams] = useSearchParams();
  const urlCount = parseCount(searchParams.get("count"));
  const [count, setCount] = useState(urlCount);
  const [batch, setBatch] = useState<ReviewItem[] | null>(null);

  const load = useCallback((n: number) => {
    setBatch(null);
    getReview(n)
      .then((data) => {
        setBatch((data.questions as ReviewItem[]).map((q) => ({ ...q, revealed: false, graded: null })));
      })
      .catch((err: unknown) => {
        setBatch([]);
        toast.error(err instanceof ApiError ? err.message : "Failed to load review batch.");
      });
  }, [toast]);

  useEffect(() => {
    setCount(urlCount);
    load(urlCount);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlCount]);

  function reveal(idx: number) {
    setBatch((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], revealed: true };
      return next;
    });
  }

  async function grade(idx: number, result: "got_it" | "again") {
    const item = batch?.[idx];
    if (!item) return;
    setBatch((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      next[idx] = { ...next[idx], graded: result };
      return next;
    });
    try {
      await submitReviewResult(item.id, result);
      toast.success(result === "got_it" ? "Nice — noted." : "Got it, we'll bring this back sooner.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to submit review result.");
    }
  }

  const reshuffle = () => {
    const n = batch?.length || count;
    setCount(n);
    load(n);
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="text-lg font-bold text-foreground">Daily review</div>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {batch ? batch.length : "…"} random questions pulled from your completed questions.
        </p>
        <div className="mt-3.5 flex flex-wrap gap-2">
          <button type="button" onClick={reshuffle} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-foreground">
            <ShuffleIcon width={16} height={16} /> New batch
          </button>
          <Link to="/" className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-semibold text-muted-foreground">
            <BackIcon width={14} height={14} /> Back to Today
          </Link>
        </div>
      </div>

      {batch === null ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <SkeletonCard key={i}>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="mt-2 h-5 w-3/4" />
            </SkeletonCard>
          ))}
        </div>
      ) : batch.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground">
          No completed questions yet — finish some of today's questions to unlock review.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {batch.map((item, idx) => (
            <div key={item.id} className="rounded-lg border border-border bg-card p-4">
              <div className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">{item.topic_label || ""}</div>
              <div className="mt-2 font-medium text-foreground">
                <span className="text-xs font-semibold text-muted-foreground">Q{idx + 1}</span> {item.q}
              </div>
              {item.revealed ? (
                <>
                  <div className="answer-text mt-3 rounded-md bg-muted p-3 text-sm text-foreground">{item.a}</div>
                  {item.graded ? (
                    <p className="mt-2 text-sm text-muted-foreground">Graded: {item.graded === "got_it" ? "Got it" : "Review again soon"}</p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => grade(idx, "got_it")} className="inline-flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-sm font-semibold text-success-foreground">
                        <CheckIcon width={16} height={16} /> Got it
                      </button>
                      <button type="button" onClick={() => grade(idx, "again")} className="inline-flex items-center gap-1.5 rounded-md bg-warning px-3 py-1.5 text-sm font-semibold text-foreground">
                        <RefreshIcon width={16} height={16} /> Review again soon
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <button type="button" onClick={() => reveal(idx)} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-foreground">
                  <EyeIcon width={16} height={16} /> Show model answer
                </button>
              )}
              {item.times_shown ? <div className="mt-2 text-sm text-muted-foreground">Reviewed {item.times_shown}× before</div> : null}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Review() {
  return <ReviewContent />;
}
