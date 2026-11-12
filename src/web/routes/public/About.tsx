import React from "react";

interface FlowStep {
  title: string;
  desc: string;
  icon: React.ReactNode;
}

const FLOW_STEPS: FlowStep[] = [
  {
    title: "Set your target",
    desc: "Tell it your role, track, and pace — or paste your resume for an AI-suggested target role.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="4.5" stroke="currentColor" strokeWidth="1.7" />
        <circle cx="12" cy="12" r="1" fill="currentColor" />
      </svg>
    ),
  },
  {
    title: "Daily queue",
    desc: "A fresh, right-sized batch of questions every day — unfinished ones roll forward first.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    title: "Spaced review",
    desc: 'Questions you marked "review again" resurface on a schedule, so recall actually sticks.',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 12a8 8 0 0 1 13.7-5.7M20 12a8 8 0 0 1-13.7 5.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
        <path d="M17.5 3v4h-4M6.5 21v-4h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
  },
  {
    title: "Test & coach",
    desc: "An AI-generated multiple-choice test plus a coaching insight tailored to your profile.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 11l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      </svg>
    ),
  },
  {
    title: "Track progress",
    desc: "Stats shows your streak, accuracy trend, and exactly which topics need more attention.",
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 20V10M11 20V4M18 20v-7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

function FlowArrow() {
  return (
    <div className="hidden shrink-0 text-muted-foreground sm:flex sm:items-center">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M9 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  );
}

function BackIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M19 12H5M11 18l-6-6 6-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-(--radius) border border-border bg-card p-6 text-card-foreground shadow-sm ${className}`}>
      {children}
    </div>
  );
}

function SectionTitle({ children, size = "base" }: { children: React.ReactNode; size?: "base" | "lg" }) {
  return (
    <div className={size === "lg" ? "text-xl font-bold" : "text-[17px] font-bold"}>{children}</div>
  );
}

function FlowSection() {
  return (
    <Card>
      <SectionTitle size="lg">How it works</SectionTitle>
      <p className="mt-1.5 text-sm text-muted-foreground">One loop, repeated daily — each pass sharpens your weak spots a little more.</p>
      <div className="mt-5 flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-start">
        {FLOW_STEPS.map((step, idx) => (
          <React.Fragment key={step.title}>
            <div className="flex min-w-35 flex-1 flex-col gap-1.5 rounded-(--radius-md) bg-secondary p-4">
              <div className="flex size-9 items-center justify-center rounded-full bg-background text-primary">{step.icon}</div>
              <div className="text-sm font-semibold">{step.title}</div>
              <div className="text-xs text-muted-foreground">{step.desc}</div>
            </div>
            {idx < FLOW_STEPS.length - 1 ? <FlowArrow /> : null}
          </React.Fragment>
        ))}
      </div>
    </Card>
  );
}

// Purely illustrative (no real user data — this page is shown pre-login too)
// — reinforces why the spaced-repetition loop above is worth doing.
function TrendGraphic() {
  const points: [number, number][] = [[0, 40], [1, 34], [2, 36], [3, 25], [4, 27], [5, 15], [6, 17], [7, 6]];
  const w = 220;
  const h = 60;
  const pad = 6;
  const xStep = (w - pad * 2) / (points.length - 1);
  const path = points
    .map(([, y], i) => `${i === 0 ? "M" : "L"}${(pad + i * xStep).toFixed(1)},${(pad + y * 0.55).toFixed(1)}`)
    .join(" ");

  return (
    <Card>
      <SectionTitle size="lg">Why spaced repetition works</SectionTitle>
      <div className="mt-4 flex flex-col items-center gap-4 sm:flex-row">
        <svg width={w} height={h + pad * 2} viewBox={`0 0 ${w} ${h + pad * 2}`} aria-hidden="true" className="shrink-0">
          <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {points.map(([x, y]) => (
            <circle key={x} cx={(pad + x * xStep).toFixed(1)} cy={(pad + y * 0.55).toFixed(1)} r="2.5" fill="var(--primary)" />
          ))}
        </svg>
        <p className="text-sm text-muted-foreground">
          Recall error rate typically drops fast once a question resurfaces two or three times on a schedule instead
          of being crammed once and forgotten. That's the whole idea behind the daily review batch above — miss it
          once and it comes right back tomorrow.
        </p>
      </div>
    </Card>
  );
}

// Standalone (pre-login) About page — first TSX page in the MPA migration
// (Phase 8.0), proving the Vite/React/TS build+serve+CSP pipeline before
// anything else depends on it. Restyled onto the MealSathi-matching theme
// in the phase that added src/web/styles/globals.css. The authenticated,
// shell-wrapped variant of this same content is added once AppShell exists.
export function About() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">
        <Card className="bg-linear-to-br from-primary/10 to-transparent">
          <SectionTitle size="lg">What is Interview Prep Tracker?</SectionTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            A daily interview-prep companion. Every day you get a personalized batch of questions sized to your own
            pace, spaced-repetition review of everything you've covered, and an AI-generated multiple-choice test —
            built on a shared curriculum (HR &amp; Behavioral, Delivery &amp; Program Management, People Management,
            Technical Architecture, AI Automation) plus anything you or other users contribute.
          </p>
        </Card>

        <FlowSection />
        <TrendGraphic />

        <Card>
          <SectionTitle>Key features</SectionTitle>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-foreground">
            <li><strong>Daily question queue</strong> — set how many questions a day you want; anything left unfinished from a prior day gets priority the next day (capped, so a few missed days never turns into an overwhelming pile), and you can request more once you finish.</li>
            <li><strong>Spaced-repetition review</strong> — a daily batch weighted toward questions you've marked "review again", drawn from everything you've completed.</li>
            <li><strong>AI-generated daily test</strong> — 10 multiple-choice questions from what you've completed, using our built-in AI by default (with a daily per-user cap) or your own OpenAI/Anthropic key for unlimited use.</li>
            <li><strong>Bring your own questions</strong> — a manual upload form, CSV import, or paste your resume for an AI-crafted prompt you run in ChatGPT/Claude and import the results from.</li>
            <li><strong>Shared content</strong> — submit a set for admin review; approved sets show up as suggestions other users can subscribe to.</li>
            <li><strong>Stats</strong> — streaks, an accuracy trend chart, your weakest topics/questions, and an AI coaching insight tailored to your profile.</li>
            <li><strong>Installable</strong> — works as a PWA on desktop or mobile, and everyone's progress stays completely separate.</li>
          </ul>
        </Card>

        <Card>
          <SectionTitle>Getting started</SectionTitle>
          <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-foreground">
            <li>Create an account — name, email, password, and optionally what you're preparing for and how many questions a day you want.</li>
            <li>Go to <strong>Today</strong> and work through your daily queue, revealing each model answer as you study.</li>
            <li>Once you've completed a few questions, try <strong>Daily Review</strong> or the <strong>Daily Test</strong> from the Today page.</li>
            <li>Visit <strong>Settings</strong> any time to: update your prep profile (role, experience, bio — used to personalize your AI coaching insight), choose your AI provider, upload or import your own questions, and see suggested sets from other users.</li>
            <li>Check <strong>Stats</strong> for your streak, accuracy trend, and weakest topics.</li>
          </ol>
        </Card>

        <Card>
          <SectionTitle>About the AI features</SectionTitle>
          <p className="mt-2 text-sm text-muted-foreground">
            By default, AI generation uses our built-in AI, shared across users with a daily per-user cap. You can
            set your own OpenAI or Anthropic key in Settings for unlimited use, and to pick a different model if one
            starts acting up. If you paste your resume to help build a question-generation prompt, that text is
            never stored — it only exists in your browser and the one request needed to suggest a target role.
          </p>
        </Card>

        <a
          className="inline-flex items-center justify-center gap-1.5 self-center rounded-(--radius-md) px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
          href="/login"
        >
          <BackIcon /> Back to sign in
        </a>

        <footer className="pt-4 text-center text-xs text-muted-foreground">
          <p>
            &copy; {new Date().getFullYear()} Xynora. All rights reserved. Designed and developed by{" "}
            <a className="underline underline-offset-2 hover:text-foreground" href="https://www.xynora.in" target="_blank" rel="noopener noreferrer">Xynora</a> &middot;{" "}
            <a className="underline underline-offset-2 hover:text-foreground" href="https://www.xynoramedia.com" target="_blank" rel="noopener noreferrer">Xynora Media</a>
          </p>
        </footer>
      </div>
    </div>
  );
}
