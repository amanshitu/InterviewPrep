import { useEffect, useRef, useState } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { BackIcon, MicIcon, ShuffleIcon, SparkleIcon } from "../../components/layout/icons";
import { useToast } from "../../hooks/use-toast";
import {
  analyzeSelfTestAnswer,
  getSelfTestQuestion,
  getSelfTestQuota,
  type SelfTestFeedback,
  type SelfTestQuota,
} from "../../api/selftest";
import type { Question } from "../../api/types";

// Minimal ambient typing for the Web Speech API's SpeechRecognition — not
// in standard DOM lib.d.ts, and only Chrome/Edge expose it (as
// webkitSpeechRecognition in some builds), so this is deliberately loose.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [index: number]: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionLike {
  continuous: boolean;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

export function getSpeechRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as { SpeechRecognition?: SpeechRecognitionCtor; webkitSpeechRecognition?: SpeechRecognitionCtor };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

// Shared "AI"/"user" chat-bubble styling, also used by Mock Interview (a
// batched run of this same question/analyze flow).
export function ChatBubble({ from, children }: { from: "ai" | "user"; children: React.ReactNode }) {
  return (
    <div
      className={`max-w-[85%] rounded-lg px-4 py-3 text-sm ${
        from === "ai"
          ? "bg-secondary text-secondary-foreground"
          : "ml-auto bg-primary text-primary-foreground"
      }`}
    >
      {children}
    </div>
  );
}

export function FeedbackBubble({ feedback, modelAnswer }: { feedback: SelfTestFeedback; modelAnswer: string }) {
  return (
    <ChatBubble from="ai">
      {feedback.score !== null ? (
        <div className="mb-2 inline-flex flex-col items-center rounded-md bg-card px-3 py-1.5 text-card-foreground">
          <span className="text-lg font-bold">{feedback.score}/10</span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">Score</span>
        </div>
      ) : null}
      <p className="mt-1">
        <strong>Strengths:</strong> {feedback.strengths || "—"}
      </p>
      <p className="mt-2">
        <strong>Gaps:</strong> {feedback.gaps || "—"}
      </p>
      <p className="mt-2">
        <strong>Try this next:</strong> {feedback.suggestion || "—"}
      </p>
      {feedback.star ? (
        <p className="mt-2">
          <strong>STAR structure:</strong> {feedback.star}
        </p>
      ) : null}
      <div className="mt-3.5 rounded-md bg-card p-3 text-card-foreground">
        <strong>Model answer:</strong>
        <br />
        {modelAnswer}
      </div>
    </ChatBubble>
  );
}

// Hook encapsulating the mic-dictation logic — scoped here rather than as a
// shared hook since it's specific to Self Test / Mock Interview's "dictate
// into a textarea, review, then submit" pattern (deliberately never
// auto-submits on speech result).
export function useDictation(textareaRef: React.RefObject<HTMLTextAreaElement | null>) {
  const [listening, setListening] = useState(false);
  const recognizerRef = useRef<SpeechRecognitionLike | null>(null);

  function stop() {
    try {
      recognizerRef.current?.stop();
    } catch {
      /* already stopped */
    }
    recognizerRef.current = null;
    setListening(false);
  }

  function toggle() {
    if (listening) {
      stop();
      return;
    }
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;
    const recognizer = new Ctor();
    recognizer.continuous = true;
    recognizer.interimResults = false;
    recognizer.onresult = (event) => {
      const textarea = textareaRef.current;
      if (!textarea) return;
      let transcript = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
      }
      if (transcript) {
        textarea.value = (textarea.value ? textarea.value.trim() + " " : "") + transcript.trim();
      }
    };
    recognizer.onerror = () => stop();
    recognizer.onend = () => setListening(false);
    try {
      recognizer.start();
      recognizerRef.current = recognizer;
      setListening(true);
    } catch {
      /* mic unavailable — button stays in its initial state */
    }
  }

  return { listening, toggle, stop, supported: !!getSpeechRecognitionCtor() };
}

export function quotaLine(quota: SelfTestQuota | null): string {
  if (!quota) return "";
  if (quota.unlimited) return "Unlimited — using your own AI key.";
  return `${quota.used.toLocaleString()} / ${(quota.quota ?? 0).toLocaleString()} tokens used today (${quota.remaining.toLocaleString()} left, approximate).`;
}

export function SelfTest() {
  return <AppShell>{() => <SelfTestBody />}</AppShell>;
}

function SelfTestBody() {
  const { success: toastSuccess, error: toastError } = useToast();
  const [current, setCurrent] = useState<(Question & { track: string | null }) | null | undefined>(undefined);
  const [quota, setQuota] = useState<SelfTestQuota | null>(null);
  const [feedback, setFeedback] = useState<SelfTestFeedback | null>(null);
  const [modelAnswer, setModelAnswer] = useState("");
  const [submittedAnswer, setSubmittedAnswer] = useState("");
  const [analyzing, setAnalyzing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const dictation = useDictation(textareaRef);

  async function loadQuestion() {
    const [questionResult, quotaResult] = await Promise.allSettled([getSelfTestQuestion(), getSelfTestQuota()]);
    setCurrent(questionResult.status === "fulfilled" ? questionResult.value.question : null);
    if (questionResult.status === "rejected") toastError((questionResult.reason as Error).message);
    setQuota(quotaResult.status === "fulfilled" ? quotaResult.value : null);
  }

  useEffect(() => {
    void loadQuestion();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function skipQuestion() {
    dictation.stop();
    try {
      const data = await getSelfTestQuestion();
      setCurrent(data.question);
      setFeedback(null);
      setModelAnswer("");
      setSubmittedAnswer("");
    } catch (err) {
      toastError((err as Error).message);
    }
  }

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
      toastSuccess("Analyzed — see the feedback below.");
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setAnalyzing(false);
    }
  }

  if (current === undefined) {
    return (
      <div className="rounded-lg border border-border bg-card p-6 text-center text-muted-foreground">Loading a question…</div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-card p-6">
        <h1 className="text-xl font-bold text-foreground">Self Test</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          A random question — write or speak your own answer, then get AI feedback on how it compares to the model answer.
        </p>
        {quota ? <p className="mt-1 text-sm text-muted-foreground">{quotaLine(quota)}</p> : null}
        <a
          href="/"
          onClick={() => dictation.stop()}
          className="mt-3.5 inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
        >
          <BackIcon /> Back to Today
        </a>
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
              <div className="mt-1.5">{current.q}</div>
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
              <div className="mt-2 flex gap-2">
                {dictation.supported ? (
                  <button type="button" onClick={dictation.toggle} className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-foreground hover:bg-secondary">
                    <MicIcon width={14} height={14} /> {dictation.listening ? "Stop" : "Speak answer"}
                  </button>
                ) : null}
                <button type="button" onClick={() => void skipQuestion()} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary">
                  <ShuffleIcon width={14} height={14} /> New question
                </button>
              </div>
              <button
                type="button"
                disabled={analyzing}
                onClick={() => void analyze()}
                className="mt-3.5 inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
              >
                <SparkleIcon width={16} height={16} /> {analyzing ? "Analyzing…" : "Analyze my answer"}
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-border bg-card p-4">
              <button type="button" onClick={() => void skipQuestion()} className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-secondary">
                <ShuffleIcon width={14} height={14} /> Try another question
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
