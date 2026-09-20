// About page — explains what the app does and how to use it. Reachable
// both logged in (sidebar nav, rendered into #main like any other page)
// and logged out (a standalone screen, so prospective users can read it
// before creating an account). buildAboutView() is the single source of
// content for both contexts.
import { $, el, escapeHtml, state, renderNav } from "../app.js";

export function render() {
  if (state.currentUser) {
    renderAuthenticated();
  } else {
    renderStandalone();
  }
}

function renderAuthenticated() {
  state.currentView = "about";
  const main = $("#main");
  main.innerHTML = "";
  main.appendChild(buildAboutView());
  renderNav();
}

function renderStandalone() {
  $("#auth-screen").hidden = true;
  $("#app").hidden = true;
  const screen = $("#about-screen");
  const wrap = $("#about-standalone-wrap");
  // wrap.innerHTML is fully rebuilt on every render, so unlike the auth
  // screen and app shell (which have a static <footer> in index.html),
  // this one has to be re-added here each time rather than living in the
  // markup — that's the bug that was reported: this screen simply never
  // had a footer at all.
  wrap.innerHTML = "";
  wrap.appendChild(buildAboutView());
  wrap.appendChild(el(`<button class="btn btn-ghost" id="about-back-btn" style="align-self:center;">Back to sign in</button>`));
  wrap.appendChild(el(`
    <footer class="site-footer">
      <p>&copy; ${new Date().getFullYear()} Xynora. All rights reserved. Designed and developed by <a href="https://www.xynora.in" target="_blank" rel="noopener noreferrer">Xynora</a> &middot; <a href="https://www.xynoramedia.com" target="_blank" rel="noopener noreferrer">Xynora Media</a></p>
    </footer>
  `));
  screen.hidden = false;

  $("#about-back-btn", wrap).addEventListener("click", () => {
    history.pushState(null, "", "/");
    screen.hidden = true;
    $("#auth-screen").hidden = false;
  });
}

function buildAboutView() {
  const view = el(`<div class="view"></div>`);

  view.appendChild(el(`
    <div class="card card-hero">
      <div class="section-title">What is Interview Prep Tracker?</div>
      <p class="section-sub" style="margin-top:8px;">A daily interview-prep companion. Every day you get a personalized batch of questions sized to your own pace, spaced-repetition review of everything you've covered, and an AI-generated multiple-choice test — built on a shared curriculum (HR &amp; Behavioral, Delivery &amp; Program Management, People Management, Technical Architecture, AI Automation) plus anything you or other users contribute.</p>
    </div>
  `));

  view.appendChild(buildFlowSection());
  view.appendChild(buildTrendGraphic());

  view.appendChild(el(`
    <div class="card">
      <div class="section-title" style="font-size:17px;">Key features</div>
      <ul class="about-list">
        <li><strong>Daily question queue</strong> — set how many questions a day you want; anything left unfinished from a prior day gets priority the next day (capped, so a few missed days never turns into an overwhelming pile), and you can request more once you finish.</li>
        <li><strong>Spaced-repetition review</strong> — a daily batch weighted toward questions you've marked "review again", drawn from everything you've completed.</li>
        <li><strong>AI-generated daily test</strong> — 10 multiple-choice questions from what you've completed, using our built-in AI by default (with a daily per-user cap) or your own OpenAI/Anthropic key for unlimited use.</li>
        <li><strong>Bring your own questions</strong> — a manual upload form, CSV import, or paste your resume for an AI-crafted prompt you run in ChatGPT/Claude and import the results from.</li>
        <li><strong>Shared content</strong> — submit a set for admin review; approved sets show up as suggestions other users can subscribe to.</li>
        <li><strong>Stats</strong> — streaks, an accuracy trend chart, your weakest topics/questions, and an AI coaching insight tailored to your profile.</li>
        <li><strong>Installable</strong> — works as a PWA on desktop or mobile, and everyone's progress stays completely separate.</li>
      </ul>
    </div>
  `));

  view.appendChild(el(`
    <div class="card">
      <div class="section-title" style="font-size:17px;">Getting started</div>
      <ol class="about-list">
        <li>Create an account — name, email, password, and optionally what you're preparing for and how many questions a day you want.</li>
        <li>Go to <strong>Today</strong> and work through your daily queue, revealing each model answer as you study.</li>
        <li>Once you've completed a few questions, try <strong>Daily Review</strong> or the <strong>Daily Test</strong> from the Today page.</li>
        <li>Visit <strong>Settings</strong> any time to: update your prep profile (role, experience, bio — used to personalize your AI coaching insight), choose your AI provider, upload or import your own questions, and see suggested sets from other users.</li>
        <li>Check <strong>Stats</strong> for your streak, accuracy trend, and weakest topics.</li>
      </ol>
    </div>
  `));

  view.appendChild(el(`
    <div class="card">
      <div class="section-title" style="font-size:17px;">About the AI features</div>
      <p class="section-sub" style="margin-top:8px;">By default, AI generation uses our built-in AI, shared across users with a daily per-user cap. You can set your own OpenAI or Anthropic key in Settings for unlimited use, and to pick a different model if one starts acting up. If you paste your resume to help build a question-generation prompt, that text is never stored — it only exists in your browser and the one request needed to suggest a target role.</p>
    </div>
  `));

  return view;
}

const FLOW_STEPS = [
  {
    title: "Set your target",
    desc: "Tell it your role, track, and pace — or paste your resume for an AI-suggested target role.",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="4.5" stroke="currentColor" stroke-width="1.7"/><circle cx="12" cy="12" r="1" fill="currentColor"/></svg>`,
  },
  {
    title: "Daily queue",
    desc: "A fresh, right-sized batch of questions every day — unfinished ones roll forward first.",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h10" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>`,
  },
  {
    title: "Spaced review",
    desc: "Questions you marked \"review again\" resurface on a schedule, so recall actually sticks.",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.7M20 12a8 8 0 0 1-13.7 5.7" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/><path d="M17.5 3v4h-4M6.5 21v-4h4" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
  },
  {
    title: "Test & coach",
    desc: "An AI-generated multiple-choice test plus a coaching insight tailored to your profile.",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 11l2 2 4-4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.7"/></svg>`,
  },
  {
    title: "Track progress",
    desc: "Stats shows your streak, accuracy trend, and exactly which topics need more attention.",
    icon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20V10M11 20V4M18 20v-7" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`,
  },
];

const FLOW_ARROW = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5l7 7-7 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

function buildFlowSection() {
  const card = el(`
    <div class="card">
      <div class="section-title" style="font-size:17px;">How it works</div>
      <p class="section-sub" style="margin-top:6px;">One loop, repeated daily — each pass sharpens your weak spots a little more.</p>
    </div>
  `);
  const row = el(`<div class="flow-row"></div>`);
  FLOW_STEPS.forEach((step, idx) => {
    row.appendChild(el(`
      <div class="flow-step">
        <div class="flow-step-icon">${step.icon}</div>
        <div class="flow-step-title">${escapeHtml(step.title)}</div>
        <div class="flow-step-desc">${escapeHtml(step.desc)}</div>
      </div>
    `));
    if (idx < FLOW_STEPS.length - 1) row.appendChild(el(`<div class="flow-arrow">${FLOW_ARROW}</div>`));
  });
  card.appendChild(row);
  return card;
}

// Purely illustrative (no real user data — this page is shown pre-login
// too) — reinforces why the spaced-repetition loop above is worth doing.
function buildTrendGraphic() {
  const points = [[0, 40], [1, 34], [2, 36], [3, 25], [4, 27], [5, 15], [6, 17], [7, 6]];
  const w = 220, h = 60, pad = 6;
  const xStep = (w - pad * 2) / (points.length - 1);
  const path = points.map(([, y], i) => `${i === 0 ? "M" : "L"}${(pad + i * xStep).toFixed(1)},${(pad + y * 0.55).toFixed(1)}`).join(" ");
  const svg = `
    <svg width="${w}" height="${h + pad * 2}" viewBox="0 0 ${w} ${h + pad * 2}" aria-hidden="true">
      <path d="${path}" fill="none" stroke="var(--primary)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
      ${points.map(([x, y]) => `<circle cx="${(pad + x * xStep).toFixed(1)}" cy="${(pad + y * 0.55).toFixed(1)}" r="2.5" fill="var(--primary)"/>`).join("")}
    </svg>
  `;
  return el(`
    <div class="card">
      <div class="section-title" style="font-size:17px;">Why spaced repetition works</div>
      <div class="about-graphic">
        ${svg}
        <p class="about-graphic-caption">Recall error rate typically drops fast once a question resurfaces two or three times on a schedule instead of being crammed once and forgotten. That's the whole idea behind the daily review batch above — miss it once and it comes right back tomorrow.</p>
      </div>
    </div>
  `);
}
