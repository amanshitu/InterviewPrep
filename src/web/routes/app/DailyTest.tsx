import { useEffect, useState } from "react";
import { Link } from "react-router";
import { BackIcon, CheckIcon, CloseIcon } from "../../components/layout/icons";
import { Skeleton, SkeletonCard } from "../../components/layout/Skeleton";
import { renderInline } from "../../components/layout/Markdown";
import { useToast } from "../../hooks/use-toast";
import { answerTestQuestion, getTodaysTest, type DailyTestQuestion } from "../../api/dailytest";

// Daily AI-generated 10-question multiple-choice test, drawn from
// questions the user has already completed. Faithful port of
// public/pages/test.js — same endpoints, same behavior.
export function DailyTest() {
  return <DailyTestBody />;
}

function DailyTestBody() {
  const { error: toastError } = useToast();
  const [batch, setBatch] = useState<DailyTestQuestion[] | null>(null);
  const [answeringIdx, setAnsweringIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    getTodaysTest()
      .then((data) => {
        if (!cancelled) setBatch(data.questions);
      })
      .catch((err: Error) => {
        if (cancelled) return;
        setBatch([]);
        toastError(err.message);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function answer(idx: number, optIdx: number) {
    if (!batch) return;
    const item = batch[idx];
    if (!item || item.answered || answeringIdx === idx) return;
    setAnsweringIdx(idx);
    try {
      const data = await answerTestQuestion(item.id, optIdx);
      setBatch((prev) => {
        if (!prev) return prev;
        const next = [...prev];
        next[idx] = { ...item, answered: true, selectedIndex: optIdx, correct: data.correct, correctIndex: data.correctIndex };
        return next;
      });
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setAnsweringIdx(null);
    }
  }

  if (batch === null) {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonCard>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-2 h-4 w-56" />
        </SkeletonCard>
        <p className="text-center text-sm text-muted-foreground">Generating today's test can take a few seconds the first time.</p>
        {Array.from({ length: 3 }).map((_, i) => (
          <SkeletonCard key={i}>
            <Skeleton className="h-4 w-5/6" />
            <div className="mt-3 flex flex-col gap-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <Skeleton key={j} className="h-9 w-full" />
              ))}
            </div>
          </SkeletonCard>
        ))}
      </div>
    );
  }

  const answeredCount = batch.filter((q) => q.answered).length;
  const correctCount = batch.filter((q) => q.correct).length;

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-bold text-foreground">Daily test</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          {answeredCount}/{batch.length} answered{answeredCount ? ` · ${correctCount} correct` : ""}
        </p>
        <Link
          to="/"
          className="mt-3.5 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <BackIcon /> Back to Today
        </Link>
      </div>

      {batch.length === 0 ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
          No completed questions yet — finish some of today's questions to unlock the daily test.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {batch.map((item, idx) => (
            <div key={item.id} className="rounded-lg border border-border bg-card p-4">
              <div className="inline-block rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                {item.topic_label}
              </div>
              <div className="mt-2 font-medium text-foreground">
                <span className="text-xs font-semibold text-muted-foreground">Q{idx + 1}</span> {renderInline(item.q, `q-${item.id}`)}
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {item.options.map((opt, optIdx) => {
                  let cls = "rounded-md border border-border px-3 py-2 text-left text-sm transition-colors";
                  if (item.answered) {
                    if (optIdx === item.correctIndex) cls += " border-success bg-success/15 text-foreground";
                    else if (optIdx === item.selectedIndex) cls += " border-destructive bg-destructive/15 text-foreground";
                    else cls += " text-muted-foreground";
                  } else {
                    cls += " text-foreground hover:bg-secondary";
                    if (answeringIdx === idx) cls += " opacity-50 cursor-not-allowed";
                  }
                  return (
                    <button
                      key={optIdx}
                      type="button"
                      className={`${cls} flex items-center gap-2`}
                      disabled={item.answered || answeringIdx === idx}
                      onClick={() => void answer(idx, optIdx)}
                    >
                      {item.answered && optIdx === item.correctIndex ? (
                        <CheckIcon width={15} height={15} className="shrink-0 text-success" />
                      ) : item.answered && optIdx === item.selectedIndex ? (
                        <CloseIcon width={15} height={15} className="shrink-0 text-destructive" />
                      ) : null}
                      <span>{opt}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
