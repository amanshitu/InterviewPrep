import { useEffect, useState } from "react";
import { Link } from "react-router";
import { useShellUser } from "../../components/layout/AppShell";
import { useToast } from "../../hooks/use-toast";
import { useReadAloud } from "../../hooks/use-read-aloud";
import { getMe } from "../../api/account";
import {
  completeQuestion,
  flagForReview,
  getTodayQueue,
  requestMoreQuestions,
  type TodayQueueResponse,
} from "../../api/queue";
import { ApiError } from "../../api/client";
import type { Question, User } from "../../api/types";
import { CheckIcon, EyeIcon, PlusIcon, RefreshIcon, ShuffleIcon, SparkleIcon, SpeakerIcon, StopIcon } from "../../components/layout/icons";
import { Skeleton, SkeletonCard } from "../../components/layout/Skeleton";
import { Markdown, renderInline } from "../../components/layout/Markdown";

const DEFAULT_REVIEW_COUNT = 15;

function ProgressRing({ pct, size = 76 }: { pct: number; size?: number }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.min(100, Math.max(0, pct)) / 100);
  const center = size / 2;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`${pct}% of today's target completed`} className="shrink-0">
      <circle cx={center} cy={center} r={r} fill="none" stroke="var(--secondary)" strokeWidth={stroke} />
      <circle
        cx={center}
        cy={center}
        r={r}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={c.toFixed(1)}
        strokeDashoffset={offset.toFixed(1)}
        transform={`rotate(-90 ${center} ${center})`}
      />
      <text x={center} y={center + 5} textAnchor="middle" fontSize="16" fontWeight="800" fill="var(--foreground)">{pct}%</text>
    </svg>
  );
}

function StatTile({ icon, value, label }: { icon: React.ReactNode; value: number; label: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex items-center justify-between text-primary">{icon}<span className="text-xl font-extrabold text-foreground">{value}</span></div>
      <div className="mt-1 text-xs font-medium text-muted-foreground">{label}</div>
    </div>
  );
}

function QuestionCard({
  q,
  idx,
  revealed,
  onReveal,
  onComplete,
  onFlagReview,
  readAloud,
}: {
  q: Question;
  idx: number;
  revealed: boolean;
  onReveal: () => void;
  onComplete: () => void;
  onFlagReview: () => void;
  readAloud: ReturnType<typeof useReadAloud>;
}) {
  const needsReview = q.last_result === "again";
  const speaking = readAloud.speakingId === q.id;
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">{q.topic_label}</div>
      <div className="mt-2 font-medium text-foreground">
        <span className="text-xs font-semibold text-muted-foreground">Q{idx + 1}</span> {renderInline(q.q, `q-${q.id}`)}
      </div>
      {revealed ? (
        <>
          {needsReview ? (
            <div className="mt-2">
              <span className="rounded-full bg-warning/20 px-2 py-0.5 text-xs font-semibold text-foreground">Needs review</span>
            </div>
          ) : null}
          <Markdown text={q.a} className="answer-text mt-3 rounded-md bg-muted p-3 text-sm text-foreground" />
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={onComplete} className="inline-flex items-center gap-1.5 rounded-md bg-success px-3 py-1.5 text-sm font-semibold text-success-foreground"><CheckIcon width={16} height={16} /> Got it</button>
            <button type="button" onClick={onFlagReview} className="inline-flex items-center gap-1.5 rounded-md bg-warning px-3 py-1.5 text-sm font-semibold text-foreground"><RefreshIcon width={16} height={16} /> Review again soon</button>
            {readAloud.isSpeechSupported() ? (
              <button
                type="button"
                onClick={() => readAloud.toggle(q.id, q.a)}
                className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-foreground"
              >
                {speaking ? <StopIcon width={16} height={16} /> : <SpeakerIcon width={16} height={16} />} {speaking ? "Stop reading" : "Read aloud"}
              </button>
            ) : null}
          </div>
        </>
      ) : (
        <button type="button" onClick={onReveal} className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-foreground">
          <EyeIcon width={16} height={16} /> Show model answer
        </button>
      )}
    </div>
  );
}

function TodayContent({ user }: { user: User }) {
  const toast = useToast();
  const readAloud = useReadAloud();
  const [queue, setQueue] = useState<TodayQueueResponse | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [completedExpanded, setCompletedExpanded] = useState(false);
  const [reviewCount, setReviewCount] = useState(DEFAULT_REVIEW_COUNT);
  const [mockCount, setMockCount] = useState(5);
  const [streak, setStreak] = useState(user.streak);

  useEffect(() => {
    getTodayQueue()
      .then(setQueue)
      .catch((err: unknown) => {
        setQueue({ date: "", target: 0, completed: 0, remaining: 0, questions: [], completedQuestions: [] });
        toast.error(err instanceof ApiError ? err.message : "Failed to load today's queue.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!queue) {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonCard>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="mt-2 h-4 w-64" />
        </SkeletonCard>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i}>
              <Skeleton className="h-4 w-16" />
              <Skeleton className="mt-2 h-6 w-10" />
            </SkeletonCard>
          ))}
        </div>
        <SkeletonCard>
          <Skeleton className="h-5 w-40" />
          <div className="mt-4 flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        </SkeletonCard>
      </div>
    );
  }

  const pct = queue.target ? Math.round((queue.completed / queue.target) * 100) : 0;

  async function handleComplete(qid: string) {
    const q = queue!;
    const idx = q.questions.findIndex((x) => x.id === qid);
    if (idx === -1) return;
    const [item] = q.questions.splice(idx, 1);
    const next = { ...q, completed: q.completed + 1, completedQuestions: [item, ...(q.completedQuestions || [])] };
    next.remaining = Math.max(0, next.target - next.completed);
    setQueue(next);
    try {
      await completeQuestion(qid);
      const me = await getMe();
      setStreak(me.user.streak);
      toast.success("Marked complete.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to mark complete.");
    }
  }

  async function handleFlagReview(qid: string) {
    const q = queue!;
    const item = q.questions.find((x) => x.id === qid);
    if (!item) return;
    item.status = "shown";
    item.last_result = "again";
    setRevealed((prev) => new Set(prev).add(qid));
    setQueue({ ...q });
    try {
      await flagForReview(qid);
      toast.success("Kept for review — it'll stay in today's list.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to flag for review.");
    }
  }

  async function handleMoveBackToReview(qid: string) {
    const q = queue!;
    const idx = (q.completedQuestions || []).findIndex((x) => x.id === qid);
    if (idx === -1) return;
    const [item] = q.completedQuestions.splice(idx, 1);
    item.status = "shown";
    item.last_result = "again";
    q.questions.push(item);
    const next = { ...q, completed: Math.max(0, q.completed - 1) };
    next.remaining = Math.max(0, next.target - next.completed);
    setRevealed((prev) => new Set(prev).add(qid));
    setQueue(next);
    try {
      await flagForReview(qid);
      toast.success("Moved back to today's questions.");
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to move back to review.");
    }
  }

  async function handleRequestMore() {
    try {
      const data = await requestMoreQuestions();
      const q = queue!;
      const existingIds = new Set(q.questions.map((x) => x.id));
      const added = data.questions.filter((x) => !existingIds.has(x.id));
      setQueue({ ...q, questions: [...q.questions, ...added], target: q.target + 5, remaining: Math.max(0, q.target + 5 - q.completed) });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "Failed to request more questions.");
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-lg border border-border bg-card p-5">
        <div className="flex flex-wrap items-center gap-5">
          <div className="min-w-50 flex-1">
            <div className="text-lg font-bold text-foreground">Welcome back, {user.name.split(" ")[0]}</div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {queue.completed} of {queue.target} questions done today{user.track ? ` · preparing for ${user.track}` : ""}
            </p>
            <div className="mt-3.5 h-2 overflow-hidden rounded-full bg-secondary">
              <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <ProgressRing pct={pct} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <StatTile icon={<span>🔥</span>} value={streak?.count || 0} label="Day streak" />
        <StatTile icon={<span>🏆</span>} value={streak?.longest || 0} label="Longest streak" />
        <StatTile icon={<span>⏳</span>} value={queue.questions.length} label="Pending today" />
        <StatTile icon={<span>✅</span>} value={queue.completed} label="Completed today" />
        <StatTile icon={<span>🎯</span>} value={queue.target} label="Today's target" />
      </div>

      <div className="rounded-lg border border-border bg-card p-5">
        <div className="text-base font-bold text-foreground">Today's questions</div>
        <p className="mt-1 text-sm text-muted-foreground">
          Unfinished questions from a prior day show up first, up to your daily quota's worth of backlog. Reveal an
          answer, then mark it "Got it" or "Review again soon" — reviewed ones stay right here until you're ready.
        </p>
        <div className="mt-3.5 flex flex-col gap-3">
          {queue.questions.length === 0 && queue.remaining <= 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground">
              All done for today — nice work. Come back tomorrow, or request more below.
            </div>
          ) : null}
          {queue.questions.length === 0 && queue.remaining > 0 ? (
            <div className="rounded-lg border border-dashed border-border p-6 text-center text-muted-foreground">
              No questions available in your current category yet.{" "}
              <Link to="/settings" className="font-semibold text-primary hover:underline">
                Switch categories or upload a question set in Settings
              </Link>{" "}
              to get started.
            </div>
          ) : null}
          {queue.questions.map((q, idx) => (
            <QuestionCard
              key={q.id}
              q={q}
              idx={idx}
              revealed={revealed.has(q.id) || q.status === "shown"}
              onReveal={() => setRevealed((prev) => new Set(prev).add(q.id))}
              onComplete={() => handleComplete(q.id)}
              onFlagReview={() => handleFlagReview(q.id)}
              readAloud={readAloud}
            />
          ))}
        </div>
        {queue.remaining <= 0 ? (
          <button type="button" onClick={handleRequestMore} className="mt-3.5 inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-foreground">
            <PlusIcon width={16} height={16} /> Request 5 more questions
          </button>
        ) : null}
      </div>

      {(queue.completedQuestions || []).length > 0 ? (
        <div className="rounded-lg border border-border bg-card p-5">
          <button type="button" onClick={() => setCompletedExpanded((v) => !v)} className="flex w-full items-center justify-between text-left">
            <span className="text-base font-bold text-foreground">Completed today ({queue.completedQuestions.length})</span>
            <span className={`text-muted-foreground transition-transform ${completedExpanded ? "rotate-180" : ""}`}>▾</span>
          </button>
          <p className="mt-1 text-sm text-muted-foreground">Already marked "Got it" — browse back through them any time.</p>
          {completedExpanded ? (
            <div className="mt-3.5 flex flex-col gap-3">
              {queue.completedQuestions.map((q, idx) => (
                <div key={q.id} className="rounded-lg border border-border bg-muted p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="inline-block rounded-full bg-secondary px-2 py-0.5 text-xs font-semibold text-secondary-foreground">{q.topic_label}</div>
                      <div className="mt-1 font-medium text-foreground">
                        <span className="text-xs font-semibold text-muted-foreground">Q{idx + 1}</span> {renderInline(q.q, `q-${q.id}`)}
                      </div>
                    </div>
                    <span className="shrink-0 rounded-full bg-success/20 px-2 py-0.5 text-xs font-semibold text-foreground">Done</span>
                  </div>
                  <Markdown text={q.a} className="answer-text mt-3 rounded-md bg-card p-3 text-sm text-foreground" />
                  <button type="button" onClick={() => handleMoveBackToReview(q.id)} className="mt-3 inline-flex items-center gap-1.5 rounded-md bg-warning px-3 py-1.5 text-sm font-semibold text-foreground">
                    <RefreshIcon width={16} height={16} /> Need Review
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spaced repetition</div>
          <div className="mt-1 text-base font-bold text-foreground">Daily review</div>
          <p className="mt-1.5 text-sm text-muted-foreground">Random questions pulled from everything you've completed so far.</p>
          <div className="mt-3.5 flex items-center gap-3 text-sm text-muted-foreground">
            <span>Count: <strong className="text-foreground">{reviewCount}</strong></span>
            <input type="range" min={10} max={20} step={1} value={reviewCount} onChange={(e) => setReviewCount(Number(e.target.value))} className="flex-1" />
          </div>
          <Link to={`/review?count=${reviewCount}`} className="mt-3.5 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
            <ShuffleIcon width={16} height={16} /> Generate today's review
          </Link>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI-generated</div>
          <div className="mt-1 text-base font-bold text-foreground">Daily test</div>
          <p className="mt-1.5 text-sm text-muted-foreground">10 multiple-choice questions drawn from what you've completed — same set all day, so you can pick it back up.</p>
          <Link to="/test" className="mt-3.5 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"><SparkleIcon width={16} height={16} /> Start today's test</Link>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI-generated</div>
          <div className="mt-1 text-base font-bold text-foreground">Self Test</div>
          <p className="mt-1.5 text-sm text-muted-foreground">Write or speak your own answer to a random question, and get AI feedback on how it compares to the model answer.</p>
          <Link to="/self-test" className="mt-3.5 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground"><SparkleIcon width={16} height={16} /> Start self test</Link>
        </div>
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI-generated</div>
          <div className="mt-1 text-base font-bold text-foreground">Mock Interview</div>
          <p className="mt-1.5 text-sm text-muted-foreground">A short back-to-back batch of questions, answered one after another, with a session summary at the end.</p>
          <div className="mt-3.5 flex gap-2">
            {[3, 5, 8].map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setMockCount(n)}
                className={`rounded-md px-2.5 py-1 text-sm font-semibold ${mockCount === n ? "bg-primary text-primary-foreground" : "border border-border text-foreground"}`}
              >
                {n} Qs
              </button>
            ))}
          </div>
          <Link to={`/mock-interview?count=${mockCount}`} className="mt-3.5 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">
            <SparkleIcon width={16} height={16} /> Start mock interview
          </Link>
        </div>
      </div>
    </div>
  );
}

export function Today() {
  const user = useShellUser();
  return <TodayContent user={user} />;
}
