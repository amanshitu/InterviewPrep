// About page — explains what the app does and how to use it. Reachable
// both logged in (sidebar nav, rendered into #main like any other page)
// and logged out (a standalone screen, so prospective users can read it
// before creating an account). buildAboutView() is the single source of
// content for both contexts.
import { $, el, state, renderSidebar } from "../app.js";

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
  renderSidebar();
}

function renderStandalone() {
  $("#auth-screen").hidden = true;
  $("#app").hidden = true;
  const screen = $("#about-screen");
  const wrap = $("#about-standalone-wrap");
  wrap.innerHTML = "";
  wrap.appendChild(buildAboutView());
  wrap.appendChild(el(`<button class="btn btn-ghost" id="about-back-btn" style="align-self:center;">Back to sign in</button>`));
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

  view.appendChild(el(`
    <div class="card">
      <div class="section-title" style="font-size:17px;">Key features</div>
      <ul class="about-list">
        <li><strong>Daily question queue</strong> — set how many questions a day you want; anything left unfinished from a prior day gets priority the next day (capped, so a few missed days never turns into an overwhelming pile), and you can request more once you finish.</li>
        <li><strong>Spaced-repetition review</strong> — a daily batch weighted toward questions you've marked "review again", drawn from everything you've completed.</li>
        <li><strong>AI-generated daily test</strong> — 10 multiple-choice questions from what you've completed, using Cloudflare's free Workers AI by default (with a daily per-user cap) or your own OpenAI/Anthropic key for unlimited use.</li>
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
      <p class="section-sub" style="margin-top:8px;">By default, AI generation uses Cloudflare's free Workers AI, shared across users with a daily per-user cap. You can set your own OpenAI or Anthropic key in Settings for unlimited use, and to pick a different model if one starts acting up. If you paste your resume to help build a question-generation prompt, that text is never stored — it only exists in your browser and the one request needed to suggest a target role.</p>
    </div>
  `));

  return view;
}
