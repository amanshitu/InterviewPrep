// Marketing homepage — ExamStreak's answer to MealSathi's Landing.tsx:
// hero, how-it-works, feature sections, PWA/privacy callouts, a final CTA
// band, and a mobile sticky CTA bar. Deliberately its own document (like
// About and Login) rather than what "/" shows, since AuthGate's redirect
// of an unauthenticated "/" straight to "/login" is a carefully-tuned,
// no-flash path (see AuthGate.tsx) not worth touching for this — this page
// is for sharing a direct link, not the thing a returning user bounces
// through on every visit.
import { useEffect, useState } from "react";
import { listPublicCategories } from "../../api/categories";
import { PublicFooter, PublicHeader } from "../../components/layout/PublicPageChrome";
import { useRawPageTitle } from "../../hooks/use-page-title";
import {
  ArrowRightIcon,
  CheckIcon,
  ClockIcon,
  DownloadIcon,
  KeyIcon,
  LayersIcon,
  PlusIcon,
  ReviewIcon,
  SendIcon,
  ShieldIcon,
  SparkleIcon,
  TestIcon,
  UsersIcon,
} from "../../components/layout/icons";

function SectionHeading({ eyebrow, title, body, center }: { eyebrow?: string; title: string; body?: string; center?: boolean }) {
  return (
    <div className={`max-w-2xl ${center ? "mx-auto text-center" : ""}`}>
      {eyebrow && <p className="text-sm font-semibold uppercase tracking-wide text-primary">{eyebrow}</p>}
      <h2 className="mt-2 text-balance text-2xl font-bold tracking-tight sm:text-3xl">{title}</h2>
      {body && <p className="mt-3 text-pretty text-muted-foreground">{body}</p>}
    </div>
  );
}

function PrimaryCtas({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-3 sm:flex-row ${className}`}>
      <a
        href="/login?form=signup"
        className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary px-6 text-base font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
      >
        <PlusIcon width={16} height={16} /> Create free account <ArrowRightIcon width={16} height={16} />
      </a>
      <a
        href="/login"
        className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-border px-6 text-base font-semibold text-foreground transition hover:bg-secondary"
      >
        <SendIcon width={15} height={15} /> Sign in
      </a>
    </div>
  );
}

/** Illustrative, non-live mock of a Today queue row — purely decorative. */
function HeroPreview() {
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <figure className="relative rounded-lg border border-border bg-card p-5 shadow-xl shadow-primary/10">
        <figcaption className="flex items-center justify-between">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Today</p>
            <p className="font-semibold">4 of 10 questions done</p>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-xs font-medium text-foreground">
            🔥 6-day streak
          </span>
        </figcaption>
        <div className="mt-4 rounded-md border border-primary/30 bg-primary/5 p-3.5">
          <p className="text-xs font-medium text-primary">Technical Architecture · Q5</p>
          <p className="mt-1 text-sm font-medium">What's the difference between horizontal and vertical scaling?</p>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckIcon width={13} height={13} className="shrink-0 text-emerald-500" /> Model answer revealed
          </p>
          <div className="mt-3 flex gap-2">
            <span className="inline-flex flex-1 items-center justify-center rounded-md bg-primary px-2 py-1.5 text-xs font-semibold text-primary-foreground">Got it</span>
            <span className="inline-flex flex-1 items-center justify-center rounded-md border border-border px-2 py-1.5 text-xs font-medium text-muted-foreground">Review again soon</span>
          </div>
        </div>
        <div className="mt-3 rounded-md bg-secondary/70 p-3 text-sm text-muted-foreground">
          <ReviewIcon width={13} height={13} className="mr-1.5 inline-block text-primary" />
          3 questions due for review today, prioritized first.
        </div>
      </figure>
    </div>
  );
}

const STEPS = [
  { icon: ClockIcon, title: "Set your pace", body: "Pick a track and a daily quota at signup — or paste your resume for an AI-suggested target role." },
  { icon: TestIcon, title: "Work through today's queue", body: "A fresh, right-sized batch every day. Unfinished questions from a prior day roll forward first." },
  { icon: ReviewIcon, title: "Review until it sticks", body: "Questions you mark \"review again\" resurface on a schedule — the ones you've nailed stop coming back as often." },
];

const REVIEW_TIMELINE = [
  { day: "Day 0", label: "First seen", note: "Mark \"Got it\" or \"Review again soon\"" },
  { day: "Day 2", label: "Resurfaces", note: "Nail it again and the gap doubles" },
  { day: "Day 16", label: "Resurfaces", note: "Still getting it right? Gap keeps growing" },
  { day: "Day 180", label: "Mastered", note: "Capped here — it won't disappear, just rarely competes for a slot" },
];

const PRACTICE_MODES = [
  { icon: TestIcon, name: "Daily Test", note: "10 AI-generated multiple-choice questions, same set all day" },
  { icon: SparkleIcon, name: "Self Test", note: "Write or speak your own answer, get AI feedback against the model answer" },
  { icon: UsersIcon, name: "Mock Interview", note: "A back-to-back run of 3, 5, or 8 questions with a session summary" },
];

const EXTRAS = [
  { icon: KeyIcon, title: "Bring your own AI key", body: "Built-in AI is free with a daily cap — add your own OpenAI or Anthropic key for unlimited use." },
  { icon: UsersIcon, title: "Admin-curated content", body: "Shared curriculum is reviewed by admins; flag or suggest content through Feedback and Report." },
  { icon: DownloadIcon, title: "Installable, works offline", body: "Add it to your home screen on desktop or mobile — the app shell loads even without a connection." },
  { icon: LayersIcon, title: "Multiple tracks at once", body: "Enroll in several categories and switch your active one any time — each tracks its own quota." },
];

const PRIVACY_POINTS = [
  "Passwords are salted and hashed — never stored in plain text.",
  "Your own AI key, if you add one, is encrypted at rest.",
  "No ads, no third-party trackers, data never sold.",
  "Export everything, any time, from Settings → Data.",
];

interface CategoryStats {
  names: string[];
  questionTotal: number;
}

export function Home() {
  // The marketing homepage's title leads with the brand name itself
  // ("ExamStreak — ...") rather than the usual "<Page> — ExamStreak"
  // pattern every other page uses, so it bypasses usePageTitle's template.
  useRawPageTitle("ExamStreak — Daily interview & exam prep");
  const [stats, setStats] = useState<CategoryStats | null>(null);

  useEffect(() => {
    listPublicCategories()
      .then((res) => {
        setStats({
          names: res.categories.map((c) => c.name),
          questionTotal: res.categories.reduce((sum, c) => sum + c.questionCount, 0),
        });
      })
      .catch(() => setStats(null));
  }, []);

  return (
    <div className="flex min-h-dvh flex-col overflow-x-clip bg-background pb-24 md:pb-10">
      <PublicHeader />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden bg-linear-to-b from-primary/10 via-secondary/40 to-background">
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-6 sm:px-6 md:grid-cols-[1.1fr_1fr] md:pb-24 md:pt-10">
            <div>
              <p className="inline-flex items-center gap-2 rounded-full border border-border bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                Daily interview &amp; exam prep
              </p>
              <h1 className="mt-5 text-balance text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl">
                Fifteen minutes a day beats a weekend of cramming.
              </h1>
              <p className="mt-4 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
                ExamStreak gives you a right-sized batch of questions every day, remembers what you're shaky on and
                brings it back on a schedule, then tests you on it — across interview curriculum and competitive-exam
                tracks like Railway, SSC, Banking, Teaching, and Mathematics.
              </p>
              <PrimaryCtas className="mt-8" />
              <ul className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-sm text-muted-foreground">
                {[
                  "Free to start",
                  stats ? `${stats.names.length} categories, ${stats.questionTotal.toLocaleString()}+ questions` : "Dozens of categories",
                  "Installable, works offline",
                ].map((x) => (
                  <li key={x} className="flex items-center gap-1.5">
                    <CheckIcon width={14} height={14} className="text-emerald-500" /> {x}
                  </li>
                ))}
              </ul>
            </div>
            <HeroPreview />
          </div>
        </section>

        {/* Categories band */}
        {stats && stats.names.length > 0 && (
          <section className="border-y border-border bg-card/60">
            <div className="mx-auto flex max-w-6xl flex-col items-center gap-4 px-4 py-7 text-center sm:px-6 md:flex-row md:justify-between md:text-left">
              <h2 className="shrink-0 text-base font-semibold">Covers every track you're prepping for</h2>
              <ul className="flex flex-wrap justify-center gap-2 md:justify-end">
                {stats.names.slice(0, 10).map((name) => (
                  <li key={name} className="rounded-full bg-background px-2.5 py-1 text-sm">
                    {name}
                  </li>
                ))}
                {stats.names.length > 10 && (
                  <li className="rounded-full bg-background px-2.5 py-1 text-sm text-muted-foreground">+{stats.names.length - 10} more</li>
                )}
              </ul>
            </div>
          </section>
        )}

        {/* How it works */}
        <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
          <SectionHeading eyebrow="How it works" title="One loop, repeated daily" center />
          <ol className="mt-10 grid gap-4 md:grid-cols-3 md:gap-6">
            {STEPS.map((s, i) => (
              <li key={s.title} className="relative rounded-lg border border-border bg-card p-6 shadow-sm">
                <span className="absolute right-5 top-5 inline-flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
                  {i + 1}
                </span>
                <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <s.icon width={18} height={18} />
                </span>
                <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
                <p className="mt-1.5 text-sm text-muted-foreground">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section className="bg-secondary/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 md:py-24">
            <SectionHeading
              eyebrow="Why it sticks"
              title="Built around how memory actually works"
              body="Not just a question bank — a schedule that brings the right question back at the right time, plus three ways to practice."
            />
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              <article className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <ReviewIcon width={20} height={20} />
                </span>
                <h3 className="mt-3 text-xl font-semibold">Spaced repetition that actually works</h3>
                <p className="mt-2 text-muted-foreground">
                  Every question has a Leitner-box-style schedule — nail it and the gap before it resurfaces grows;
                  miss it and it's back the very next day.
                </p>
                <ol className="mt-5 space-y-2 border-l-2 border-dashed border-primary/30 pl-4">
                  {REVIEW_TIMELINE.map((t) => (
                    <li key={t.day} className="relative flex items-center gap-3 rounded-xl bg-secondary/60 p-3">
                      <span className="absolute left-[-1.4rem] top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-primary" />
                      <span className="w-14 shrink-0 text-xs font-semibold uppercase text-muted-foreground">{t.day}</span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{t.label}</p>
                        <p className="text-xs text-muted-foreground">{t.note}</p>
                      </div>
                    </li>
                  ))}
                </ol>
              </article>

              <article className="rounded-lg border border-border bg-card p-6 shadow-sm sm:p-8">
                <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/12 text-primary">
                  <SparkleIcon width={20} height={20} />
                </span>
                <h3 className="mt-3 text-xl font-semibold">Practice, three different ways</h3>
                <p className="mt-2 text-muted-foreground">AI-generated, drawn from exactly what you've already completed.</p>
                <ul className="mt-5 space-y-2">
                  {PRACTICE_MODES.map((m) => (
                    <li key={m.name} className="flex items-center gap-3 rounded-xl bg-secondary/60 p-3">
                      <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-primary">
                        <m.icon width={16} height={16} />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium">{m.name}</p>
                        <p className="text-xs text-muted-foreground">{m.note}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </article>
            </div>

            <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {EXTRAS.map((e) => (
                <li key={e.title} className="rounded-lg border border-border bg-card p-5">
                  <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                    <e.icon width={17} height={17} />
                  </span>
                  <h3 className="mt-3 font-semibold">{e.title}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{e.body}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* PWA + privacy */}
        <section className="mx-auto grid max-w-6xl gap-6 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-2">
          <article className="flex flex-col rounded-lg border border-border bg-linear-to-br from-secondary to-card p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
                <DownloadIcon width={22} height={22} />
              </span>
              <h2 className="text-xl font-semibold">Install it, use it anywhere</h2>
            </div>
            <p className="mt-3 text-muted-foreground">
              ExamStreak installs like a native app on desktop or mobile, straight from the browser — no app store
              needed.
            </p>
            <p className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
              <DownloadIcon width={15} height={15} /> The app shell loads from cache even when you're offline.
            </p>
          </article>

          <article className="flex flex-col rounded-lg border border-border bg-card p-6 sm:p-8">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-12 items-center justify-center rounded-2xl bg-secondary text-foreground">
                <ShieldIcon width={22} height={22} />
              </span>
              <h2 className="text-xl font-semibold">Your data, under your control</h2>
            </div>
            <p className="mt-3 text-muted-foreground">No ads, no trackers — just the daily loop.</p>
            <ul className="mt-5 space-y-2.5 text-sm">
              {PRIVACY_POINTS.map((p) => (
                <li key={p} className="flex items-start gap-2">
                  <CheckIcon width={15} height={15} className="mt-0.5 shrink-0 text-emerald-500" /> {p}
                </li>
              ))}
            </ul>
            <a href="/privacy" className="mt-auto inline-flex min-h-11 items-center gap-1 pt-4 text-sm font-medium text-primary hover:underline">
              Read the Privacy Policy <ArrowRightIcon width={15} height={15} />
            </a>
          </article>
        </section>

        {/* Final CTA */}
        <section className="px-4 pb-16 sm:px-6 md:pb-24">
          <div className="mx-auto max-w-4xl rounded-lg bg-primary px-6 py-12 text-center text-primary-foreground shadow-lg sm:px-12">
            <h2 className="text-balance text-2xl font-semibold tracking-tight sm:text-3xl">Start your streak today</h2>
            <p className="mx-auto mt-2 max-w-xl opacity-90">
              Free to use, with your own AI key for unlimited practice whenever you want it.
            </p>
            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href="/login?form=signup"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md bg-primary-foreground px-6 text-base font-semibold text-primary transition hover:opacity-90"
              >
                Create free account <ArrowRightIcon width={16} height={16} />
              </a>
              <a
                href="/login"
                className="inline-flex h-12 items-center justify-center gap-2 rounded-md border border-primary-foreground/40 px-6 text-base font-semibold text-primary-foreground transition hover:bg-primary-foreground/10"
              >
                <SendIcon width={15} height={15} /> Sign in
              </a>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />

      {/* Mobile sticky CTA */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 py-[calc(0.75rem+env(safe-area-inset-bottom,0px))] backdrop-blur md:hidden">
        <div className="flex gap-2 px-4">
          <a
            href="/login?form=signup"
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-primary text-sm font-semibold text-primary-foreground"
          >
            Create free account
          </a>
          <a
            href="/login"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-md border border-border px-4 text-sm font-semibold text-foreground"
          >
            Sign in
          </a>
        </div>
      </div>
    </div>
  );
}
