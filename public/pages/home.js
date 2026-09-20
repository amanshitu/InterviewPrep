// Today's queue — the default/home view.
import { $, $all, el, escapeHtml, toastSuccess, toastError, api, state, renderNav, renderTopStats, navigate } from "../app.js";

const TEST_SIZE = 10;
const DEFAULT_REVIEW_COUNT = 15;

let localRevealed = {}; // question_id -> revealed, for this page visit
let completedExpanded = false;

export async function render() {
  state.currentView = "home";
  const main = $("#main");
  main.innerHTML = "";
  main.appendChild(el(`<div class="view"><div class="card empty-state"><p>Loading today's questions…</p></div></div>`));
  renderNav();

  try {
    state.todayQueue = await api("/api/queue/today");
  } catch (err) {
    state.todayQueue = { date: "", target: 0, completed: 0, remaining: 0, questions: [], completedQuestions: [] };
    toastError(err.message);
  }
  localRevealed = {};
  completedExpanded = false;
  renderTopStats();
  paint();
}

function paint() {
  const todayQueue = state.todayQueue;
  const currentUser = state.currentUser;
  const main = $("#main");
  main.innerHTML = "";
  const view = el(`<div class="view"></div>`);
  const pct = todayQueue.target ? Math.round((todayQueue.completed / todayQueue.target) * 100) : 0;

  view.appendChild(el(`
    <div class="card card-hero">
      <div class="section-title">Welcome back, ${escapeHtml(currentUser.name.split(" ")[0])}</div>
      <p class="section-sub" style="margin-top:6px;">${todayQueue.completed} of ${todayQueue.target} questions done today${currentUser.track ? ` · preparing for ${escapeHtml(currentUser.track)}` : ""}</p>
      <div class="progress-track" style="margin-top:14px;"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>
  `));

  view.appendChild(el(`
    <div class="stat-grid">
      <div class="stat-tile"><div class="stat-tile-value">${(currentUser.streak && currentUser.streak.count) || 0}</div><div class="stat-tile-label">Day streak</div></div>
      <div class="stat-tile"><div class="stat-tile-value">${(currentUser.streak && currentUser.streak.longest) || 0}</div><div class="stat-tile-label">Longest streak</div></div>
      <div class="stat-tile"><div class="stat-tile-value">${todayQueue.questions.length}</div><div class="stat-tile-label">Pending today</div></div>
      <div class="stat-tile"><div class="stat-tile-value">${todayQueue.completed}</div><div class="stat-tile-label">Completed today</div></div>
      <div class="stat-tile"><div class="stat-tile-value">${todayQueue.target}</div><div class="stat-tile-label">Today's target</div></div>
    </div>
  `));

  const queueCard = el(`
    <div class="card">
      <div class="section-title" style="font-size:17px;">Today's questions</div>
      <p class="section-sub" style="margin-top:4px;">Unfinished questions from a prior day show up first, up to your daily quota's worth of backlog. Reveal an answer, then mark it "Got it" or "Review again soon" — reviewed ones stay right here until you're ready.</p>
    </div>
  `);
  const list = el(`<div style="display:flex;flex-direction:column;gap:12px;margin-top:14px;"></div>`);
  if (todayQueue.questions.length === 0 && todayQueue.remaining <= 0) {
    list.appendChild(el(`
      <div class="empty-state">
        <p>All done for today — nice work. Come back tomorrow, or request more below.</p>
      </div>
    `));
  }
  todayQueue.questions.forEach((q, idx) => {
    const revealed = localRevealed[q.id] || q.status === "shown";
    const needsReview = q.last_result === "again";
    list.appendChild(el(`
      <div class="q-card" data-qid="${q.id}">
        <div class="q-topic-tag">${escapeHtml(q.topic_label)}</div>
        <div class="q-card-head" style="margin-top:6px;">
          <div>
            <div class="q-index">Q${idx + 1}</div>
            <div class="q-text">${escapeHtml(q.q)}</div>
          </div>
        </div>
        ${revealed
          ? `${needsReview ? `<div style="margin-top:6px;"><span class="pill pill-in_progress">Needs review</span></div>` : ""}
             <div class="q-answer">${escapeHtml(q.a)}</div>
             <div class="q-actions">
               <button class="btn btn-success btn-small" data-complete="${q.id}">Got it</button>
               <button class="btn btn-warn btn-small" data-flag-review="${q.id}">Review again soon</button>
             </div>`
          : `<button class="btn btn-secondary btn-small" data-reveal="${q.id}">Show model answer</button>`}
      </div>
    `));
  });
  queueCard.appendChild(list);

  if (todayQueue.remaining <= 0) {
    queueCard.appendChild(el(`
      <button class="btn btn-secondary" id="request-more-btn" style="margin-top:14px;">Request 5 more questions</button>
    `));
  }
  view.appendChild(queueCard);

  const completedQuestions = todayQueue.completedQuestions || [];
  if (completedQuestions.length > 0) {
    const completedCard = el(`
      <div class="card">
        <button type="button" class="completed-toggle" id="completed-toggle">
          <span class="section-title" style="font-size:17px;">Completed today (${completedQuestions.length})</span>
          <svg class="completed-toggle-chevron${completedExpanded ? " is-open" : ""}" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <p class="section-sub" style="margin-top:4px;">Already marked "Got it" — browse back through them any time.</p>
      </div>
    `);
    const completedList = el(`<div style="display:flex;flex-direction:column;gap:12px;margin-top:14px;"${completedExpanded ? "" : " hidden"}></div>`);
    completedQuestions.forEach((q, idx) => {
      completedList.appendChild(el(`
        <div class="q-card">
          <div class="q-card-head">
            <div>
              <div class="q-topic-tag">${escapeHtml(q.topic_label)}</div>
              <div class="q-index" style="margin-top:4px;">Q${idx + 1}</div>
              <div class="q-text">${escapeHtml(q.q)}</div>
            </div>
            <span class="pill pill-done">Done</span>
          </div>
          <div class="q-answer">${escapeHtml(q.a)}</div>
          <div class="q-actions">
            <button class="btn btn-warn btn-small" data-need-review="${q.id}">Need Review</button>
          </div>
        </div>
      `));
    });
    completedCard.appendChild(completedList);
    view.appendChild(completedCard);
  }

  const row2 = el(`<div class="card-row"></div>`);
  row2.appendChild(el(`
    <div class="card">
      <div class="group-days">Spaced repetition</div>
      <div class="section-title" style="font-size:17px;margin-top:2px;">Daily review</div>
      <p class="section-sub" style="margin-top:6px;">Random questions pulled from everything you've completed so far.</p>
      <div class="review-controls" style="margin-top:14px;">
        <span class="range-label">Count: <strong id="review-count-label">${DEFAULT_REVIEW_COUNT}</strong></span>
        <input type="range" id="review-count" min="10" max="20" step="1" value="${DEFAULT_REVIEW_COUNT}" />
      </div>
      <button class="btn btn-primary" style="margin-top:14px;" id="start-review-btn">Generate today's review</button>
    </div>
  `));
  row2.appendChild(el(`
    <div class="card">
      <div class="group-days">AI-generated</div>
      <div class="section-title" style="font-size:17px;margin-top:2px;">Daily test</div>
      <p class="section-sub" style="margin-top:6px;">${TEST_SIZE} multiple-choice questions drawn from what you've completed — same set all day, so you can pick it back up.</p>
      <button class="btn btn-primary" style="margin-top:14px;" id="start-test-btn">Start today's test</button>
    </div>
  `));
  view.appendChild(row2);

  main.appendChild(view);

  $all("[data-reveal]", view).forEach((btn) => {
    btn.addEventListener("click", () => revealQuestion(btn.dataset.reveal));
  });
  $all("[data-complete]", view).forEach((btn) => {
    btn.addEventListener("click", () => completeQuestion(btn.dataset.complete));
  });
  $all("[data-flag-review]", view).forEach((btn) => {
    btn.addEventListener("click", () => flagForReview(btn.dataset.flagReview));
  });
  $all("[data-need-review]", view).forEach((btn) => {
    btn.addEventListener("click", () => moveBackToReview(btn.dataset.needReview));
  });
  const completedToggle = $("#completed-toggle", view);
  if (completedToggle) {
    completedToggle.addEventListener("click", () => {
      completedExpanded = !completedExpanded;
      paint();
    });
  }
  const moreBtn = $("#request-more-btn", view);
  if (moreBtn) moreBtn.addEventListener("click", requestMore);

  const rangeInput = $("#review-count", view);
  rangeInput.addEventListener("input", () => { $("#review-count-label", view).textContent = rangeInput.value; });
  $("#start-review-btn", view).addEventListener("click", () => navigate("/review", parseInt(rangeInput.value, 10)));
  $("#start-test-btn", view).addEventListener("click", () => navigate("/test"));

  renderNav();
}

function revealQuestion(qid) {
  if (localRevealed[qid]) return;
  localRevealed[qid] = true;
  paint();
}

async function completeQuestion(qid) {
  const todayQueue = state.todayQueue;
  const idx = todayQueue.questions.findIndex((x) => x.id === qid);
  if (idx === -1) return;
  const [q] = todayQueue.questions.splice(idx, 1);
  todayQueue.completed += 1;
  todayQueue.remaining = Math.max(0, todayQueue.target - todayQueue.completed);
  todayQueue.completedQuestions = todayQueue.completedQuestions || [];
  todayQueue.completedQuestions.unshift(q);
  paint();
  renderTopStats();
  try {
    await api("/api/questions/complete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question_id: qid }),
    });
    // Refresh streak from the server (it may have just bumped).
    const me = await api("/api/me");
    state.currentUser = me.user;
    renderTopStats();
    toastSuccess("Marked complete.");
  } catch (err) {
    toastError(err.message);
  }
}

async function flagForReview(qid) {
  const todayQueue = state.todayQueue;
  const q = todayQueue.questions.find((x) => x.id === qid);
  if (!q) return;
  q.status = "shown";
  q.last_result = "again";
  localRevealed[qid] = true;
  paint();
  try {
    await api("/api/questions/flag-review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question_id: qid }),
    });
    toastSuccess("Kept for review — it'll stay in today's list.");
  } catch (err) {
    toastError(err.message);
  }
}

async function moveBackToReview(qid) {
  const todayQueue = state.todayQueue;
  const idx = (todayQueue.completedQuestions || []).findIndex((x) => x.id === qid);
  if (idx === -1) return;
  const [q] = todayQueue.completedQuestions.splice(idx, 1);
  q.status = "shown";
  q.last_result = "again";
  todayQueue.questions.push(q);
  todayQueue.completed = Math.max(0, todayQueue.completed - 1);
  todayQueue.remaining = Math.max(0, todayQueue.target - todayQueue.completed);
  localRevealed[qid] = true;
  paint();
  renderTopStats();
  try {
    await api("/api/questions/flag-review", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question_id: qid }),
    });
    toastSuccess("Moved back to today's questions.");
  } catch (err) {
    toastError(err.message);
  }
}

async function requestMore() {
  const todayQueue = state.todayQueue;
  try {
    const data = await api("/api/questions/request-more", { method: "POST" });
    const existingIds = new Set(todayQueue.questions.map((q) => q.id));
    data.questions.forEach((q) => { if (!existingIds.has(q.id)) todayQueue.questions.push(q); });
    todayQueue.target += 5;
    todayQueue.remaining = Math.max(0, todayQueue.target - todayQueue.completed);
    paint();
    renderTopStats();
  } catch (err) {
    toastError(err.message);
  }
}
