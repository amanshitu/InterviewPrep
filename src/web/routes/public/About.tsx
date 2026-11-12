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
    <div className="flow-arrow">
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

function FlowSection() {
  return (
    <div className="card">
      <div className="section-title" style={{ fontSize: 17 }}>How it works</div>
      <p className="section-sub" style={{ marginTop: 6 }}>One loop, repeated daily — each pass sharpens your weak spots a little more.</p>
      <div className="flow-row">
        {FLOW_STEPS.map((step, idx) => (
          <React.Fragment key={step.title}>
            <div className="flow-step">
              <div className="flow-step-icon">{step.icon}</div>
              <div className="flow-step-title">{step.title}</div>
              <div className="flow-step-desc">{step.desc}</div>
            </div>
            {idx < FLOW_STEPS.length - 1 ? <FlowArrow /> : null}
          </React.Fragment>
        ))}
      </div>
    </div>
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
    <div className="card">
      <div className="section-title" style={{ fontSize: 17 }}>Why spaced repetition works</div>
      <div className="about-graphic">
        <svg width={w} height={h + pad * 2} viewBox={`0 0 ${w} ${h + pad * 2}`} aria-hidden="true">
          <path d={path} fill="none" stroke="var(--primary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          {points.map(([x, y]) => (
            <circle key={x} cx={(pad + x * xStep).toFixed(1)} cy={(pad + y * 0.55).toFixed(1)} r="2.5" fill="var(--primary)" />
          ))}
        </svg>
        <p className="about-graphic-caption">
          Recall error rate typically drops fast once a question resurfaces two or three times on a schedule instead
          of being crammed once and forgotten. That's the whole idea behind the daily review batch above — miss it
          once and it comes right back tomorrow.
        </p>
      </div>
    </div>
  );
}

// Standalone (pre-login) About page — first TSX page in the MPA migration
// (Phase 8.0), proving the Vite/React/TS build+serve+CSP pipeline before
// anything else depends on it. The authenticated, shell-wrapped variant of
// this same content is added once AppShell exists (Phase 8.1+).
export function About() {
  return (
    <div className="about-screen">
      <div className="about-standalone-wrap">
        <div className="view">
          <div className="card card-hero">
            <div className="section-title">What is Interview Prep Tracker?</div>
            <p className="section-sub" style={{ marginTop: 8 }}>
              A daily interview-prep companion. Every day you get a personalized batch of questions sized to your own
              pace, spaced-repetition review of everything you've covered, and an AI-generated multiple-choice test —
              built on a shared curriculum (HR &amp; Behavioral, Delivery &amp; Program Management, People Management,
              Technical Architecture, AI Automation) plus anything you or other users contribute.
            </p>
          </div>

          <FlowSection />
          <TrendGraphic />

          <div className="card">
            <div className="section-title" style={{ fontSize: 17 }}>Key features</div>
            <ul className="about-list">
              <li><strong>Daily question queue</strong> — set how many questions a day you want; anything left unfinished from a prior day gets priority the next day (capped, so a few missed days never turns into an overwhelming pile), and you can request more once you finish.</li>
              <li><strong>Spaced-repetition review</strong> — a daily batch weighted toward questions you've marked "review again", drawn from everything you've completed.</li>
              <li><strong>AI-generated daily test</strong> — 10 multiple-choice questions from what you've completed, using our built-in AI by default (with a daily per-user cap) or your own OpenAI/Anthropic key for unlimited use.</li>
              <li><strong>Bring your own questions</strong> — a manual upload form, CSV import, or paste your resume for an AI-crafted prompt you run in ChatGPT/Claude and import the results from.</li>
              <li><strong>Shared content</strong> — submit a set for admin review; approved sets show up as suggestions other users can subscribe to.</li>
              <li><strong>Stats</strong> — streaks, an accuracy trend chart, your weakest topics/questions, and an AI coaching insight tailored to your profile.</li>
              <li><strong>Installable</strong> — works as a PWA on desktop or mobile, and everyone's progress stays completely separate.</li>
            </ul>
          </div>

          <div className="card">
            <div className="section-title" style={{ fontSize: 17 }}>Getting started</div>
            <ol className="about-list">
              <li>Create an account — name, email, password, and optionally what you're preparing for and how many questions a day you want.</li>
              <li>Go to <strong>Today</strong> and work through your daily queue, revealing each model answer as you study.</li>
              <li>Once you've completed a few questions, try <strong>Daily Review</strong> or the <strong>Daily Test</strong> from the Today page.</li>
              <li>Visit <strong>Settings</strong> any time to: update your prep profile (role, experience, bio — used to personalize your AI coaching insight), choose your AI provider, upload or import your own questions, and see suggested sets from other users.</li>
              <li>Check <strong>Stats</strong> for your streak, accuracy trend, and weakest topics.</li>
            </ol>
          </div>

          <div className="card">
            <div className="section-title" style={{ fontSize: 17 }}>About the AI features</div>
            <p className="section-sub" style={{ marginTop: 8 }}>
              By default, AI generation uses our built-in AI, shared across users with a daily per-user cap. You can
              set your own OpenAI or Anthropic key in Settings for unlimited use, and to pick a different model if one
              starts acting up. If you paste your resume to help build a question-generation prompt, that text is
              never stored — it only exists in your browser and the one request needed to suggest a target role.
            </p>
          </div>
        </div>

        <a className="btn btn-ghost btn-icon-label" href="/" style={{ alignSelf: "center" }}>
          <BackIcon /> Back to sign in
        </a>

        <footer className="site-footer">
          <p>
            &copy; {new Date().getFullYear()} Xynora. All rights reserved. Designed and developed by{" "}
            <a href="https://www.xynora.in" target="_blank" rel="noopener noreferrer">Xynora</a> &middot;{" "}
            <a href="https://www.xynoramedia.com" target="_blank" rel="noopener noreferrer">Xynora Media</a>
          </p>
        </footer>
      </div>
    </div>
  );
}
