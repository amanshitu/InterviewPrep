import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { ArrowRightIcon, BackIcon, MicIcon, SparkleIcon } from "../../components/layout/icons";
import { Skeleton, SkeletonCard } from "../../components/layout/Skeleton";
import { renderInline } from "../../components/layout/Markdown";
import { useToast } from "../../hooks/use-toast";
import {
  analyzeSelfTestAnswer,
  getSelfTestQuestion,
  getSelfTestQuota,
  type SelfTestFeedback,
  type SelfTestQuota,
} from "../../api/selftest";
import type { Question } from "../../api/types";
import { ChatBubble, FeedbackBubble, quotaLine, useDictation } from "./SelfTest";

// Mock Interview — a short back-to-back batch of Self Test questions,
// answered one after another, ending in a session summary. Deliberately
// reuses Self Test's existing single-question endpoints (question +
// analyze) in sequence rather than a new batch-fetch endpoint, so it draws
// from the same token quota and gets STAR coaching on HR questions for
// free — faithful port of public/pages/mockinterview.js, same behavior,
// same endpoints (no new backend/API wrapper needed).
const DEFAULT_SESSION_TOTAL = 5;

interface SessionResult {
  q: string;
  topic_label: string;
  score: number | null;
}

export function MockInterview() {
  return <MockInterviewBody />;
}

function MockInterviewBody() {
  const { success: toastSuccess, error: toastError } = useToast();
  // Previously hardcoded to 5 regardless of Today's 3/5/8-question picker
  // (?count=N in the link it generates) — a pre-existing gap, not
  // something the SPA conversion introduced, fixed here since it's the
  // same "read the live search params" pattern as Review.tsx's fix.
  const [searchParams] = useSearchParams();
  const SESSION_TOTAL = (() => {
    const n = parseInt(searchParams.get("count") || "", 10);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_SESSION_TOTAL;
  })();
  const [sessionIndex, setSessionIndex] = useState(0);
  const [current, setCurrent] = useState<(Question & { track: string | null }) | null | undefined>(undefined);
  const [quota, setQuota] = useState<SelfTestQuota | null>(null);
  const [feedback, setFeedback] = useState<SelfTestFeedback | null>(null);
  const [modelAnswer, setModelAnswer] = useState("");
  const [submittedAnswer, setSubmittedAnswer] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const [finished, setFinished] = useState(false);
  const [results, setResults] = useState<SessionResult[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation(textareaRef);

  async function loadQuestion() {
    const [questionResult, quotaResult] = await Promise.allSettled([getSelfTestQuestion(), getSelfTestQuota()]);
    setCurrent(questionResult.status === "fulfilled" ? questionResult.value.question : null);
    // "No questions available…" is shown inline below once `current` is
    // null — toasting the exact same text on top of it was a redundant
    // duplicate. Any other failure (network error, server error) has no
    // inline explanation, so it still needs the toast.
    if (questionResult.status === "rejected") {
      const message = (questionResult.reason as Error).message;
      if (!message.startsWith("No questions available")) toastError(message);
    }
    setQuota(quotaResult.status === "fulfilled" ? quotaResult.value : null);
  }

  function restart() {
    setSessionIndex(0);
    setFeedback(null);
    setModelAnswer("");
    setSubmittedAnswer("");
    setAnalyzing(false);
    setFinished(false);
    setResults([]);
    setCurrent(undefined);
    void loadQuestion();
  }

  useEffect(() => {
    void loadQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function analyze() {
    const answer = textareaRef.current?.value.trim() || "";
    if (!answer) {
      toastError("Write or speak an answer first.");
      return;
    }
    if (!current) return;
    dictation.stop();
    setAnalyzing(true);
    try {
      const data = await analyzeSelfTestAnswer(current.id, answer);
      setFeedback(data.feedback);
      setModelAnswer(data.modelAnswer);
      setSubmittedAnswer(answer);
      setQuota(data.quota);
      setResults((prev) => [...prev, { q: current.q, topic_label: current.topic_label, score: data.feedback.score }]);
      toastSuccess("Analyzed.");
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function advance() {
    if (sessionIndex + 1 >= SESSION_TOTAL) {
      setFinished(true);
      return;
    }
    setSessionIndex((i) => i + 1);
    setFeedback(null);
    setModelAnswer("");
    setSubmittedAnswer("");
    setCurrent(undefined);
    await loadQuestion();
  }

  if (finished) {
    const total = results.reduce((sum, r) => sum + (r.score || 0), 0);
    const scored = results.filter((r) => r.score !== null && r.score !== undefined);
    const avg = scored.length ? (total / scored.length).toFixed(1) : "—";
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-lg border border-border bg-card p-6">
          <h1 className="text-xl font-bold text-foreground">Session summary</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {results.length} question{results.length === 1 ? "" : "s"} answered this session.
          </p>
          <div className="mt-2.5 inline-flex flex-col items-center rounded-md bg-secondary px-3 py-1.5">
            <span className="text-lg font-bold text-secondary-foreground">{avg}/10</span>
            <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Average score</span>
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-base font-semibold text-foreground">Per-question results</h2>
          <div className="mt-2.5 flex flex-col gap-3">
            {results.map((r, i) => (
              <div key={i} className="flex flex-col gap-2">
                <ChatBubble from="ai">
                  <div className="inline-block rounded-full bg-card px-2.5 py-0.5 text-xs font-medium">{r.topic_label}</div>
                  <div className="mt-1 text-sm">{r.q}</div>
                </ChatBubble>
                <ChatBubble from="user">Score: {r.score !== null && r.score !== undefined ? `${r.score}/10` : "—"}</ChatBubble>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-lg border border-border bg-card p-4 flex gap-2">
          <button type="button" onClick={restart} className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
            <SparkleIcon width={16} height={16} /> Start new mock interview
          </button>
          <Link to="/" className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground">
            <BackIcon /> Back to Today
          </Link>
        </div>
      </div>
    );
  }

  if (current === undefined) {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonCard>
          <Skeleton className="h-5 w-32" />
          <Skeleton className="mt-2 h-4 w-72" />
        </SkeletonCard>
        <SkeletonCard>
          <Skeleton className="h-4 w-full" />
          <Skeleton className="mt-2 h-4 w-3/4" />
        </SkeletonCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-bold text-foreground">Mock Interview</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Question {sessionIndex + 1} of {SESSION_TOTAL} — write or speak your answer, then analyze to move to the next one.
        </p>
        {quota ? <p className="mt-1 text-sm text-muted-foreground">{quotaLine(quota)}</p> : null}
        <Link
          to="/"
          onClick={() => dictation.stop()}
          className="mt-3.5 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <BackIcon /> End session &amp; back to Today
        </Link>
      </div>

      {!current ? (
        <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">
          No questions available yet — subscribe to or upload a question set first.
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4">
            <ChatBubble from="ai">
              <div className="inline-block rounded-full bg-card px-2.5 py-0.5 text-xs font-medium">{current.topic_label}</div>
              <div className="mt-1.5">{renderInline(current.q, "cur-q")}</div>
            </ChatBubble>
            {submittedAnswer ? <ChatBubble from="user">{submittedAnswer}</ChatBubble> : null}
            {feedback ? <FeedbackBubble feedback={feedback} modelAnswer={modelAnswer} /> : null}
          </div>

          {!feedback ? (
            <div className="rounded-lg border border-border bg-card p-4">
              <label className="flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
                <span>Your answer</span>
                <textarea
                  ref={textareaRef}
                  rows={8}
                  disabled={analyzing}
                  placeholder={`Type your answer here${dictation.supported ? ", or use the mic" : ""}.`}
                  className="rounded-md border border-border bg-background p-2.5 text-sm text-foreground"
                />
              </label>
              {dictation.supported ? (
                <button type="button" onClick={dictation.toggle} className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-secondary">
                  <MicIcon width={14} height={14} /> {dictation.listening ? "Stop" : "Speak answer"}
                </button>
              ) : null}
              <button
                type="button"
                disabled={analyzing}
                onClick={() => void analyze()}
                className="mt-3.5 flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                <SparkleIcon width={16} height={16} /> {analyzing ? "Analyzing…" : "Analyze my answer"}
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-4">
              <button
                type="button"
                onClick={() => void advance()}
                className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
              >
                <ArrowRightIcon width={16} height={16} /> {sessionIndex + 1 === SESSION_TOTAL ? "See session summary" : "Next question"}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
