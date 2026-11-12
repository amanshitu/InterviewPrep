import { useEffect, useState } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { BackIcon } from "../../components/layout/icons";
import { useToast } from "../../hooks/use-toast";
import { answerTestQuestion, getTodaysTest, type DailyTestQuestion } from "../../api/dailytest";

// Daily AI-generated 10-question multiple-choice test, drawn from
// questions the user has already completed. Faithful port of
// public/pages/test.js — same endpoints, same behavior.
export function DailyTest() {
  return <AppShell>{() => <DailyTestBody />}</AppShell>;
}

function DailyTestBody() {
  const { error: toastError } = useToast();
  const [batch, setBatch] = useState<DailyTestQuestion[] | null>(null);

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
    if (!item || item.answered) return;
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
    }
  }

  if (batch === null) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
        Loading today's test — generating questions can take a few seconds the first time.
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
        <a
          href="/"
          className="mt-3.5 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <BackIcon /> Back to Today
        </a>
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
              <div className="mt-2 text-xs font-semibold text-muted-foreground">Q{idx + 1}</div>
              <div className="mt-0.5 font-medium text-foreground">{item.q}</div>
              <div className="mt-3 flex flex-col gap-2">
                {item.options.map((opt, optIdx) => {
                  let cls = "rounded-md border border-border px-3 py-2 text-left text-sm transition-colors";
                  if (item.answered) {
                    if (optIdx === item.correctIndex) cls += " border-success bg-success/15 text-foreground";
                    else if (optIdx === item.selectedIndex) cls += " border-destructive bg-destructive/15 text-foreground";
                    else cls += " text-muted-foreground";
                  } else {
                    cls += " text-foreground hover:bg-secondary";
                  }
                  return (
                    <button
                      key={optIdx}
                      type="button"
                      className={cls}
                      disabled={item.answered}
                      onClick={() => void answer(idx, optIdx)}
                    >
                      {opt}
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
