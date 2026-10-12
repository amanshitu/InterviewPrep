// Self Test — a random question, you write or speak your own answer, AI
// compares it to the model answer and gives structured feedback. Separate
// from the Daily Test (MCQ) and Daily Review (spaced repetition): this is
// the one place in the app that practices actually *producing* an answer,
// not just recognizing one.
import { $, el, escapeHtml, toastSuccess, toastError, api, state, renderNav, navigate, getSpeechRecognitionCtor, BACK_ICON, MIC_ICON, SPARKLE_ICON, SHUFFLE_ICON } from "../app.js";

let current = null; // { id, q, a, topic_label }
let quota = null; // { unlimited, used, quota, remaining }
let feedback = null; // { score, strengths, gaps, suggestion } once analyzed
let modelAnswer = null; // revealed only after analysis
let analyzing = false;
let recognizer = null;
let listening = false;

export async function render() {
  state.currentView = "selftest";
  const main = $("#main");
  main.innerHTML = "";
  main.appendChild(el(`<div class="view"><div class="card empty-state"><p>Loading a question…</p></div></div>`));
  renderNav();

  feedback = null;
  modelAnswer = null;
  analyzing = false;

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
  const main = $("#main");
  main.innerHTML = "";
  const view = el(`<div class="view"></div>`);

  view.appendChild(el(`
    <div class="card">
      <div class="section-title" style="font-size:20px;">Self Test</div>
      <p class="section-sub" style="margin-top:6px;">A random question — write or speak your own answer, then get AI feedback on how it compares to the model answer.</p>
      <p class="section-sub" style="margin-top:4px;" id="self-test-quota-line">${escapeHtml(quotaLine())}</p>
      <button class="btn btn-ghost btn-icon-label" id="self-test-back-btn" style="margin-top:14px;">${BACK_ICON} Back to Today</button>
    </div>
  `));

  if (!current) {
    view.appendChild(el(`
      <div class="card empty-state">
        <p>No questions available yet — subscribe to or upload a question set first.</p>
      </div>
    `));
    main.appendChild(view);
    $("#self-test-back-btn", view).addEventListener("click", () => navigate("/"));
    renderNav();
    return;
  }

  const sttSupported = !!getSpeechRecognitionCtor();
  const card = el(`
    <div class="card">
      <div class="q-topic-tag">${escapeHtml(current.topic_label || "")}</div>
      <div class="q-text" style="margin-top:6px;">${escapeHtml(current.q)}</div>
      <label class="field" style="margin-top:14px;">
        <span>Your answer</span>
        <textarea id="self-test-answer" rows="8" placeholder="Type your answer here${sttSupported ? ", or use the mic" : ""}." ${analyzing ? "disabled" : ""}></textarea>
      </label>
      <div class="q-actions">
        ${sttSupported ? `<button type="button" class="btn btn-secondary btn-small btn-icon-label" id="self-test-mic-btn">${MIC_ICON} ${listening ? "Stop" : "Speak answer"}</button>` : ""}
        <button type="button" class="btn btn-ghost btn-small btn-icon-label" id="self-test-skip-btn">${SHUFFLE_ICON} New question</button>
      </div>
      <button class="btn btn-primary btn-icon-label" id="self-test-analyze-btn" style="margin-top:14px;" ${analyzing ? "disabled" : ""}>${SPARKLE_ICON} ${analyzing ? "Analyzing…" : "Analyze my answer"}</button>
    </div>
  `);
  view.appendChild(card);

  if (feedback) {
    const scoreLine = feedback.score !== null ? `<div class="stat-tile" style="display:inline-block;margin-bottom:10px;"><div class="stat-tile-value">${feedback.score}/10</div><div class="stat-tile-label">Score</div></div>` : "";
    view.appendChild(el(`
      <div class="card">
        <div class="section-title" style="font-size:16px;">Feedback</div>
        ${scoreLine}
        <p style="margin-top:4px;"><strong>Strengths:</strong> ${escapeHtml(feedback.strengths || "—")}</p>
        <p style="margin-top:8px;"><strong>Gaps:</strong> ${escapeHtml(feedback.gaps || "—")}</p>
        <p style="margin-top:8px;"><strong>Try this next:</strong> ${escapeHtml(feedback.suggestion || "—")}</p>
        <div class="q-answer" style="margin-top:14px;">
          <strong>Model answer:</strong><br/>${escapeHtml(modelAnswer || "")}
        </div>
      </div>
    `));
  }

  main.appendChild(view);

  $("#self-test-back-btn", view).addEventListener("click", () => { stopListening(); navigate("/"); });
  $("#self-test-skip-btn", view).addEventListener("click", skipQuestion);
  $("#self-test-analyze-btn", view).addEventListener("click", analyzeAnswer);
  const micBtn = $("#self-test-mic-btn", view);
  if (micBtn) micBtn.addEventListener("click", toggleListening);

  renderNav();
}

async function skipQuestion() {
  stopListening();
  try {
    const data = await api("/api/self-test/question");
    current = data.question;
    feedback = null;
    modelAnswer = null;
    paint();
  } catch (err) {
    toastError(err.message);
  }
}

async function analyzeAnswer() {
  const textarea = $("#self-test-answer");
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
    quota = data.quota;
    toastSuccess("Analyzed — see the feedback below.");
  } catch (err) {
    toastError(err.message);
  } finally {
    analyzing = false;
    paint();
  }
}

// Dictates into the textarea rather than auto-submitting — the user still
// reviews/edits before clicking Analyze, same "never send without a look"
// principle as the resume-prompt PDF extraction.
function toggleListening() {
  if (listening) { stopListening(); return; }
  const Ctor = getSpeechRecognitionCtor();
  if (!Ctor) return;
  recognizer = new Ctor();
  recognizer.continuous = true;
  recognizer.interimResults = false;
  recognizer.onresult = (event) => {
    const textarea = $("#self-test-answer");
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
  recognizer.onend = () => { listening = false; const btn = $("#self-test-mic-btn"); if (btn) btn.innerHTML = `${MIC_ICON} Speak answer`; };
  try {
    recognizer.start();
    listening = true;
    const btn = $("#self-test-mic-btn");
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
