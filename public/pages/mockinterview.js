// Mock Interview — a short back-to-back batch of Self Test questions,
// answered one after another, ending in a session summary. Deliberately
// reuses Self Test's existing single-question endpoints (question + analyze)
// in sequence rather than a new batch-fetch endpoint, so it draws from the
// same token quota and gets STAR coaching on HR questions for free.
import { $, el, escapeHtml, toastSuccess, toastError, api, state, renderNav, navigate, getSpeechRecognitionCtor, renderChatBubble, BACK_ICON, MIC_ICON, SPARKLE_ICON } from "../app.js";

let sessionTotal = 5;
let sessionIndex = 0; // 0-based position of the question currently shown
let current = null; // { id, q, a, topic_label }
let quota = null;
let feedback = null;
let modelAnswer = null;
let submittedAnswer = null; // the answer text shown in the user's chat bubble once analyzed
let analyzing = false;
let finished = false;
let results = []; // [{ q, topic_label, score }] — one per answered question
let recognizer = null;
let listening = false;

export async function render(count) {
  state.currentView = "mockinterview";
  sessionTotal = Number.isFinite(count) && count > 0 ? count : 5;
  sessionIndex = 0;
  feedback = null;
  modelAnswer = null;
  submittedAnswer = null;
  analyzing = false;
  finished = false;
  results = [];

  const main = $("#main");
  main.innerHTML = "";
  main.appendChild(el(`<div class="view"><div class="card empty-state"><p>Loading your first question…</p></div></div>`));
  renderNav();

  await loadQuestion();
}

async function loadQuestion() {
  const [questionResult, quotaResult] = await Promise.allSettled([
    api("/api/self-test/question"),
    api("/api/self-test/quota"),
  ]);
  current = questionResult.status === "fulfilled" ? questionResult.value.question : null;
  if (questionResult.status === "rejected") toastError(questionResult.reason.message);
  quota = quotaResult.status === "fulfilled" ? quotaResult.value : null;
  paint();
}

function quotaLine() {
  if (!quota) return "";
  if (quota.unlimited) return "Unlimited — using your own AI key.";
  return `${quota.used.toLocaleString()} / ${quota.quota.toLocaleString()} tokens used today (${quota.remaining.toLocaleString()} left, approximate).`;
}

function paint() {
  if (finished) { paintSummary(); return; }

  const main = $("#main");
  main.innerHTML = "";
  const view = el(`<div class="view"></div>`);

  view.appendChild(el(`
    <div class="card">
      <div class="section-title" style="font-size:20px;">Mock Interview</div>
      <p class="section-sub" style="margin-top:6px;">Question ${sessionIndex + 1} of ${sessionTotal} — write or speak your answer, then analyze to move to the next one.</p>
      <p class="section-sub" style="margin-top:4px;" id="mock-quota-line">${escapeHtml(quotaLine())}</p>
      <button class="btn btn-ghost btn-icon-label" id="mock-back-btn" style="margin-top:14px;">${BACK_ICON} End session &amp; back to Today</button>
    </div>
  `));

  if (!current) {
    view.appendChild(el(`<div class="card empty-state"><p>No questions available yet — subscribe to or upload a question set first.</p></div>`));
    main.appendChild(view);
    $("#mock-back-btn", view).addEventListener("click", () => { stopListening(); navigate("/"); });
    renderNav();
    return;
  }

  const sttSupported = !!getSpeechRecognitionCtor();

  const questionBubble = renderChatBubble("ai", `<div class="q-topic-tag">${escapeHtml(current.topic_label || "")}</div><div class="q-text" style="margin-top:6px;">${escapeHtml(current.q)}</div>`);
  const answerBubble = submittedAnswer ? renderChatBubble("user", escapeHtml(submittedAnswer).replace(/\n/g, "<br/>")) : "";
  let feedbackBubble = "";
  if (feedback) {
    const scoreLine = feedback.score !== null ? `<div class="stat-tile" style="display:inline-block;margin-bottom:10px;"><div class="stat-tile-value">${feedback.score}/10</div><div class="stat-tile-label">Score</div></div>` : "";
    feedbackBubble = renderChatBubble("ai", `
      ${scoreLine}
      <p style="margin-top:4px;"><strong>Strengths:</strong> ${escapeHtml(feedback.strengths || "—")}</p>
      <p style="margin-top:8px;"><strong>Gaps:</strong> ${escapeHtml(feedback.gaps || "—")}</p>
      <p style="margin-top:8px;"><strong>Try this next:</strong> ${escapeHtml(feedback.suggestion || "—")}</p>
      ${feedback.star ? `<p style="margin-top:8px;"><strong>STAR structure:</strong> ${escapeHtml(feedback.star)}</p>` : ""}
      <div class="q-answer" style="margin-top:14px;">
        <strong>Model answer:</strong><br/>${escapeHtml(modelAnswer || "")}
      </div>
    `);
  }

  view.appendChild(el(`
    <div class="card">
      ${questionBubble}
      ${answerBubble}
      ${feedbackBubble}
    </div>
  `));

  if (!feedback) {
    view.appendChild(el(`
      <div class="card">
        <label class="field">
          <span>Your answer</span>
          <textarea id="mock-answer" rows="8" placeholder="Type your answer here${sttSupported ? ", or use the mic" : ""}." ${analyzing ? "disabled" : ""}></textarea>
        </label>
        <div class="q-actions">
          ${sttSupported ? `<button type="button" class="btn btn-secondary btn-small btn-icon-label" id="mock-mic-btn">${MIC_ICON} ${listening ? "Stop" : "Speak answer"}</button>` : ""}
        </div>
        <button class="btn btn-primary btn-icon-label" id="mock-analyze-btn" style="margin-top:14px;" ${analyzing ? "disabled" : ""}>${SPARKLE_ICON} ${analyzing ? "Analyzing…" : "Analyze my answer"}</button>
      </div>
    `));
  } else {
    view.appendChild(el(`
      <div class="card">
        <button type="button" class="btn btn-primary btn-icon-label" id="mock-continue-btn">${SPARKLE_ICON} ${sessionIndex + 1 === sessionTotal ? "See session summary" : "Next question"}</button>
      </div>
    `));
  }

  main.appendChild(view);

  $("#mock-back-btn", view).addEventListener("click", () => { stopListening(); navigate("/"); });
  const analyzeBtn = $("#mock-analyze-btn", view);
  if (analyzeBtn) analyzeBtn.addEventListener("click", analyzeAnswer);
  const continueBtn = $("#mock-continue-btn", view);
  if (continueBtn) continueBtn.addEventListener("click", advanceToNext);
  const micBtn = $("#mock-mic-btn", view);
  if (micBtn) micBtn.addEventListener("click", toggleListening);

  renderNav();
}

function paintSummary() {
  const main = $("#main");
  main.innerHTML = "";
  const view = el(`<div class="view"></div>`);

  const total = results.reduce((sum, r) => sum + (r.score || 0), 0);
  const scored = results.filter((r) => r.score !== null && r.score !== undefined);
  const avg = scored.length ? (total / scored.length).toFixed(1) : "—";

  view.appendChild(el(`
    <div class="card">
      <div class="section-title" style="font-size:20px;">Session summary</div>
      <p class="section-sub" style="margin-top:6px;">${results.length} question${results.length === 1 ? "" : "s"} answered this session.</p>
      <div class="stat-tile" style="display:inline-block;margin-top:10px;">
        <div class="stat-tile-value">${avg}/10</div>
        <div class="stat-tile-label">Average score</div>
      </div>
    </div>
  `));

  const listCard = el(`<div class="card"><div class="section-title" style="font-size:16px;">Per-question results</div></div>`);
  const list = el(`<div style="margin-top:10px;"></div>`);
  results.forEach((r, i) => {
    const questionBubble = renderChatBubble("ai", `<div class="q-topic-tag">${escapeHtml(r.topic_label || "")}</div><div class="q-text" style="margin-top:4px;font-size:14px;">${escapeHtml(r.q)}</div>`);
    const scoreBubble = renderChatBubble("user", `Score: ${r.score !== null && r.score !== undefined ? r.score + "/10" : "—"}`);
    list.appendChild(el(`<div style="margin-top:${i === 0 ? 0 : 16}px;">${questionBubble}${scoreBubble}</div>`));
  });
  listCard.appendChild(list);
  view.appendChild(listCard);

  view.appendChild(el(`
    <div class="card">
      <div class="q-actions">
        <button class="btn btn-primary btn-icon-label" id="mock-restart-btn">${SPARKLE_ICON} Start new mock interview</button>
        <button class="btn btn-ghost btn-icon-label" id="mock-home-btn">${BACK_ICON} Back to Today</button>
      </div>
    </div>
  `));

  main.appendChild(view);
  $("#mock-restart-btn", view).addEventListener("click", () => render(sessionTotal));
  $("#mock-home-btn", view).addEventListener("click", () => navigate("/"));
  renderNav();
}

async function analyzeAnswer() {
  const textarea = $("#mock-answer");
  const answer = textarea ? textarea.value.trim() : "";
  if (!answer) { toastError("Write or speak an answer first."); return; }
  stopListening();
  analyzing = true;
  paint();
  try {
    const data = await api("/api/self-test/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question_id: current.id, answer }),
    });
    feedback = data.feedback;
    modelAnswer = data.modelAnswer;
    submittedAnswer = answer;
    quota = data.quota;
    results.push({ q: current.q, topic_label: current.topic_label, score: feedback.score });
    toastSuccess("Analyzed.");
  } catch (err) {
    toastError(err.message);
  } finally {
    analyzing = false;
    paint();
  }
}

async function advanceToNext() {
  if (sessionIndex + 1 >= sessionTotal) {
    finished = true;
    paint();
    return;
  }
  sessionIndex += 1;
  feedback = null;
  modelAnswer = null;
  submittedAnswer = null;
  await loadQuestion();
}

// Dictates into the textarea rather than auto-submitting — same "review
// before sending" principle as Self Test and the resume-prompt PDF extraction.
function toggleListening() {
  if (listening) { stopListening(); return; }
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return;
  recognizer = new Ctor();
  recognizer.continuous = true;
  recognizer.interimResults = false;
  recognizer.onresult = (event) => {
    const textarea = $("#mock-answer");
    if (!textarea) return;
    let transcript = "";
    for (let i = event.resultIndex; i < event.results.length; i++) {
      if (event.results[i].isFinal) transcript += event.results[i][0].transcript;
    }
    if (transcript) {
      textarea.value = (textarea.value ? textarea.value.trim() + " " : "") + transcript.trim();
    }
  };
  recognizer.onerror = () => { stopListening(); };
  recognizer.onend = () => { listening = false; const btn = $("#mock-mic-btn"); if (btn) btn.innerHTML = `${MIC_ICON} Speak answer`; };
  try {
    recognizer.start();
    listening = true;
    const btn = $("#mock-mic-btn");
    if (btn) btn.innerHTML = `${MIC_ICON} Stop`;
  } catch {
    toastError("Couldn't start the microphone.");
  }
}

function stopListening() {
  if (recognizer) {
    try { recognizer.stop(); } catch { /* already stopped */ }
  }
  recognizer = null;
  listening = false;
}
