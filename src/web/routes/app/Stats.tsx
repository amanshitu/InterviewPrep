import { useEffect, useRef, useState } from "react";
import type { ActivityEvent } from "../../api/account";
import { getActivity, getStatsInsight, getStatsProgress, type StatsProgressResponse } from "../../api/stats";
import { getSelfTestHistory } from "../../api/selftest";
import { useShellUser } from "../../components/layout/AppShell";
import { TrendBarChart, WeeklyActivityChart, type TrendPoint } from "../../components/stats/charts";
import type { User } from "../../api/types";
import { Skeleton, SkeletonCard } from "../../components/layout/Skeleton";
import { Markdown } from "../../components/layout/Markdown";
import { PullToRefresh } from "../../components/layout/PullToRefresh";
import { saveSnapshot, loadSnapshot } from "../../lib/offline-store";

type Activity = ActivityEvent & { question_text?: string | null };

export function Stats() {
  const user = useShellUser();
  return <StatsBody user={user} />;
}

function StatsBody({ user }: { user: User }) {
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState<Activity[]>([]);
  const [progress, setProgress] = useState<StatsProgressResponse | null>(null);
  const [selfTestHistory, setSelfTestHistory] = useState<{ date: string; score: number }[]>([]);
  const [insight, setInsight] = useState<{ status: "loading" | "ready" | "limited" | "error"; text: string; meta?: string }>({
    status: "loading",
    text: "Generating your insight…",
  });

  const cancelledRef = useRef(false);

  function load(): Promise<void> {
    return Promise.allSettled([getActivity(2000), getStatsProgress(), getSelfTestHistory()]).then((results) => {
      if (cancelledRef.current) return;
      const [activityResult, progressResult, selfTestResult] = results;
      if (activityResult.status === "fulfilled") setEvents(activityResult.value.events);
      if (progressResult.status === "fulfilled") {
        setProgress(progressResult.value);
        saveSnapshot("stats-progress", user.id, progressResult.value);
      } else if (!navigator.onLine) {
        const cached = loadSnapshot<StatsProgressResponse>("stats-progress", user.id);
        if (cached) setProgress(cached.data);
      }
      if (selfTestResult.status === "fulfilled") setSelfTestHistory(selfTestResult.value.history);
      setLoading(false);
    });
  }

  useEffect(() => {
    cancelledRef.current = false;
    load();
    getStatsInsight()
      .then((data) => {
        if (cancelledRef.current) return;
        const d = data as { insight: string | null; generatedBy: string | null; cached: boolean; limited?: boolean; message?: string };
        if (d.limited) {
          setInsight({ status: "limited", text: d.message || "Today's free AI insight allowance is used up." });
        } else {
          setInsight({
            status: "ready",
            text: d.insight || "",
            meta: d.generatedBy ? `via ${d.generatedBy}${d.cached ? " · today's insight, cached" : ""}` : undefined,
          });
        }
      })
      .catch((err: Error) => {
        if (!cancelledRef.current) setInsight({ status: "error", text: err.message });
      });
    return () => {
      cancelledRef.current = true;
    };
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col gap-4">
        <SkeletonCard>
          <Skeleton className="h-5 w-24" />
          <Skeleton className="mt-2 h-4 w-72" />
        </SkeletonCard>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <SkeletonCard key={i}>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-2 h-6 w-10" />
            </SkeletonCard>
          ))}
        </div>
        <SkeletonCard>
          <Skeleton className="h-5 w-28" />
          <Skeleton className="mt-4 h-36 w-full" />
        </SkeletonCard>
        <SkeletonCard>
          <Skeleton className="h-5 w-32" />
          <div className="mt-3 flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        </SkeletonCard>
      </div>
    );
  }

  const completedEvents = events.filter((e) => e.event_type === "reveal");
  const today = new Date();
  const weekDays: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    weekDays.push(d.toISOString().slice(0, 10));
  }
  const weekCounts = weekDays.map((day) => completedEvents.filter((e) => (e.occurred_at || "").slice(0, 10) === day).length);

  const reviewEvents = events.filter((e) => e.event_type === "review" && e.result).slice().reverse();
  const byDay: Record<string, { got: number; again: number }> = {};
  for (const e of reviewEvents) {
    const day = (e.occurred_at || "").slice(0, 10);
    byDay[day] ||= { got: 0, again: 0 };
    if (e.result === "got_it") byDay[day].got++;
    else byDay[day].again++;
  }
  const accuracyDays = Object.keys(byDay).sort().slice(-14);
  const accuracyTrend: TrendPoint[] = accuracyDays.map((d) => {
    const { got, again } = byDay[d];
    const total = got + again;
    const pct = total ? Math.round((got / total) * 100) : 0;
    return { label: d.slice(5), value: pct, displayValue: `${pct}%` };
  });

  // Daily Test results (locked once answered — see DailyTest.tsx) already
  // flow into activity_log as event_type "test_answer" via handleAnswerTest,
  // but were never surfaced on this page — this is that missing visibility.
  const testAnswerEvents = events.filter((e) => e.event_type === "test_answer" && e.result);
  const byDayTest: Record<string, { got: number; again: number }> = {};
  for (const e of testAnswerEvents) {
    const day = (e.occurred_at || "").slice(0, 10);
    byDayTest[day] ||= { got: 0, again: 0 };
    if (e.result === "got_it") byDayTest[day].got++;
    else byDayTest[day].again++;
  }
  const testDays = Object.keys(byDayTest).sort().slice(-14);
  const testAccuracyTrend: TrendPoint[] = testDays.map((d) => {
    const { got, again } = byDayTest[d];
    const total = got + again;
    const pct = total ? Math.round((got / total) * 100) : 0;
    return { label: d.slice(5), value: pct, displayValue: `${pct}%` };
  });

  const byDayScore: Record<string, number[]> = {};
  for (const r of selfTestHistory) {
    byDayScore[r.date] ||= [];
    byDayScore[r.date].push(r.score);
  }
  const scoreDays = Object.keys(byDayScore).sort().slice(-14);
  const scoreTrend: TrendPoint[] = scoreDays.map((d) => {
    const scores = byDayScore[d];
    const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
    return { label: d.slice(5), value: avg * 10, displayValue: avg.toFixed(1) };
  });

  const questionAgg: Record<string, { total: number; again: number; text?: string | null }> = {};
  for (const e of reviewEvents) {
    if (!e.question_id) continue;
    questionAgg[e.question_id] ||= { total: 0, again: 0, text: e.question_text };
    questionAgg[e.question_id].total++;
    if (e.result === "again") questionAgg[e.question_id].again++;
  }
  const weakQuestions = Object.entries(questionAgg)
    .map(([qid, v]) => ({ qid, ...v, rate: v.again / v.total }))
    .filter((x) => x.total >= 2 && x.rate > 0)
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 8);

  return (
    <PullToRefresh onRefresh={load}>
      <div className="flex flex-col gap-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <h1 className="text-lg font-bold text-card-foreground">Stats</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">Your progress over time, and where to focus next.</p>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Current streak" value={user.streak.count} icon={<StreakIcon />} />
          <StatTile label="Longest streak" value={user.streak.longest} icon={<TrophyIcon />} />
          <StatTile label="Logged actions" value={events.length} icon={<ChecklistIcon />} />
          <StatTile label="Overall completion" value={progress ? `${progress.overall.completionPct}%` : "—"} icon={<DonutIcon />} />
        </div>

        <WeeklyActivityChart days={weekDays} counts={weekCounts} />

        <FocusCard focusAreas={progress?.focusAreas ?? null} />

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">AI-generated</div>
          <div className="mt-0.5 flex items-center gap-2 text-base font-semibold text-card-foreground">
            <SparkleIcon /> Your coaching insight
          </div>
          <div className="mt-2.5">
            {insight.status === "error" ? (
              <p className="text-sm text-destructive">{insight.text}</p>
            ) : (
              <>
                <Markdown text={insight.text} className="text-sm leading-relaxed text-card-foreground" />
                {insight.meta ? <p className="mt-2 text-sm text-muted-foreground">{insight.meta}</p> : null}
              </>
            )}
          </div>
        </div>

        <ChartCard title="Accuracy trend" icon={<BarsIcon />} subtitle={`% marked "got it" on each day you reviewed, last ${accuracyTrend.length} days.`}>
          {accuracyTrend.length === 0 ? (
            <EmptyNote text="No review history yet — run a daily review to start building this." />
          ) : (
            <TrendBarChart data={accuracyTrend} ariaLabel="Accuracy trend chart" />
          )}
        </ChartCard>

        <ChartCard title="Self Test score trend" icon={<SparkleIcon />} subtitle={`Average AI-graded score (1-10) per day, last ${scoreTrend.length} days.`}>
          {scoreTrend.length === 0 ? (
            <EmptyNote text="No Self Test attempts yet — try it from Today's Self Test card." />
          ) : (
            <TrendBarChart data={scoreTrend} ariaLabel="Self Test score trend chart" />
          )}
        </ChartCard>

        <ChartCard title="Daily Test accuracy" icon={<BarsIcon />} subtitle={`% answered correctly on each day you took the daily test, last ${testAccuracyTrend.length} days. Each answer locks in once selected.`}>
          {testAccuracyTrend.length === 0 ? (
            <EmptyNote text="No Daily Test attempts yet — try it from Today's Daily Test card." />
          ) : (
            <TrendBarChart data={testAccuracyTrend} ariaLabel="Daily Test accuracy trend chart" />
          )}
        </ChartCard>

        <ProgressByTopicCard topics={progress?.topics ?? null} />

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center gap-2 text-base font-semibold text-card-foreground">
            <AimIcon /> Weakest questions
          </div>
          {weakQuestions.length === 0 ? (
            <EmptyNote text="Not enough review history yet." />
          ) : (
            <div className="mt-2 flex flex-col gap-2">
              {weakQuestions.map((q) => (
                <div key={q.qid} className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-card-foreground">{q.text || q.qid}</span>
                  <span className="shrink-0 text-muted-foreground">{Math.round(q.rate * 100)}% again ({q.total}×)</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </PullToRefresh>
  );
}

function StatTile({ label, value, icon }: { label: string; value: number | string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        {icon}
        <div className="text-2xl font-bold text-card-foreground">{value}</div>
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function ChartCard({ title, icon, subtitle, children }: { title: string; icon: React.ReactNode; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-base font-semibold text-card-foreground">
        {icon} {title}
      </div>
      <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
      {children}
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="mt-3 text-sm text-muted-foreground">{text}</p>;
}

function FocusCard({ focusAreas }: { focusAreas: StatsProgressResponse["focusAreas"] | null }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-base font-semibold text-card-foreground">
        <AimIcon /> Focus areas
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Where to spend your next study session, ranked worst-first.</p>
      {!focusAreas || focusAreas.length === 0 ? (
        <EmptyNote text="Not enough data yet — complete a few more questions and this will fill in." />
      ) : (
        <div className="mt-2.5 flex flex-col gap-2">
          {focusAreas.map((t, idx) => {
            const bits = [`${t.completed}/${t.total} done (${t.completionPct}%)`];
            if (t.accuracyPct !== null) bits.push(`${t.accuracyPct}% accuracy`);
            return (
              <div key={t.topic} className="flex items-center gap-3 rounded-md bg-muted px-3 py-2">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                  {idx + 1}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-card-foreground">{t.topic}</div>
                  <div className="truncate text-xs text-muted-foreground">{bits.join(" · ")}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ProgressByTopicCard({ topics }: { topics: StatsProgressResponse["topics"] | null }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-base font-semibold text-card-foreground">
        <ListIcon /> Progress by topic
      </div>
      <p className="mt-1 text-sm text-muted-foreground">Completion and accuracy across everything in your curriculum.</p>
      {!topics || topics.length === 0 ? (
        <EmptyNote text="No topics yet." />
      ) : (
        <div className="mt-2.5 flex flex-col gap-3">
          {topics.map((t) => {
            const barColor = t.completionPct >= 80 ? "bg-success" : t.completionPct >= 40 ? "bg-primary" : "bg-destructive";
            return (
              <div key={t.topic} className="flex flex-col gap-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="truncate font-medium text-card-foreground">{t.topic}</span>
                  <span className="shrink-0 text-muted-foreground">{t.completed}/{t.total} · {t.completionPct}%</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className={`h-full rounded-full ${barColor}`} style={{ width: `${t.completionPct}%` }} />
                </div>
                {t.accuracyPct !== null ? (
                  <div className="text-xs text-muted-foreground">{t.accuracyPct}% accuracy over {t.attempts} attempt{t.attempts === 1 ? "" : "s"}</div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StreakIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2c1.2 3 .5 4.6-.6 6.2C10 10 9 11.4 9 13.2A3 3 0 0 0 15 14c0-1-.4-1.7-.9-2.3.9.6 2.4 2 2.4 4.3a5.5 5.5 0 1 1-11 0C5.5 11.8 8.8 8.4 12 2Z" fill="var(--color-accent)" />
    </svg>
  );
}
function TrophyIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" />
      <path d="M7 5H4a3 3 0 0 0 3 5M17 5h3a3 3 0 0 1-3 5" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      <path d="M12 13v4M8 21h8M9 21v-2a3 3 0 0 1 6 0v2" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function ChecklistIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
      <path d="M4 6l1 1 1.5-1.5M4 12l1 1 1.5-1.5M4 18l1 1 1.5-1.5" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function DonutIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={1.6} />
      <path d="M12 3a9 9 0 0 1 9 9" stroke="currentColor" strokeWidth={2.6} strokeLinecap="round" />
    </svg>
  );
}
function AimIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx={12} cy={12} r={9} stroke="currentColor" strokeWidth={1.6} />
      <circle cx={12} cy={12} r={5} stroke="currentColor" strokeWidth={1.6} />
      <circle cx={12} cy={12} r={1.3} fill="currentColor" />
    </svg>
  );
}
function BarsIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 20V10M12 20V4M19 20v-7" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}
function ListIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x={4} y={5} width={16} height={16} rx={2} stroke="currentColor" strokeWidth={1.6} />
      <path d="M8 3v4M16 3v4M4 10h16" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
    </svg>
  );
}
function SparkleIcon() {
  return (
    <svg width={16} height={16} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z" stroke="currentColor" strokeWidth={1.4} strokeLinejoin="round" />
    </svg>
  );
}
