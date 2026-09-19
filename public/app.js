(() => {
  "use strict";

  const BANK = window.QUESTION_BANK; // { groups: [...], topics: [...] }
  const TOPIC_BY_ID = {};
  const TOPIC_OF_QUESTION = {};
  BANK.topics.forEach((t) => {
    TOPIC_BY_ID[t.id] = t;
    t.questions.forEach((q) => (TOPIC_OF_QUESTION[q.id] = t.id));
  });
  const NEW_BATCH_SIZE = 10;
  const DEFAULT_REVIEW_COUNT = 15;

  let currentUser = null;
  let state = null; // { version, topics: {id:{status, shownIds, startedAt, doneAt}}, streak, questionStats }
  let currentView = "home";
  let currentTopicId = null;
  let openBatchIds = []; // question ids currently visible in topic view (grows via "show more")
  let reviewBatch = []; // [{topicId, topicTitle, id, q, a}]
  let saveTimer = null;
  let pendingEvents = []; // activity events queued since the last successful save

  // ---------- utils ----------
  function $(sel, root = document) { return root.querySelector(sel); }
  function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
  function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function todayStr() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function yesterdayStr() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function toast(msg) {
    const node = $("#toast");
    node.textContent = msg;
    node.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (node.hidden = true), 2600);
  }
  function shuffled(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function formatDate(iso) {
    if (!iso) return "—";
    return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
  }
  function downloadBlob(filename, content, mime) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- state helpers ----------
  // Old saved state (version < 2) has no streak.longest — upgrade in place
  // on load rather than assuming every user's state is on the latest shape.
  function migrateState(s) {
    if (!s.streak) s.streak = { count: 0, longest: 0, lastActiveDate: null };
    if (typeof s.streak.longest !== "number") s.streak.longest = s.streak.count || 0;
    s.version = 2;
    return s;
  }

  function ensureTopicState(topicId) {
    if (!state.topics[topicId]) {
      state.topics[topicId] = { status: "not_started", shownIds: [], startedAt: null, doneAt: null };
    }
    return state.topics[topicId];
  }

  function bumpStreak() {
    const today = todayStr();
    if (state.streak.lastActiveDate === today) return;
    const y = yesterdayStr();
    state.streak.count = state.streak.lastActiveDate === y ? state.streak.count + 1 : 1;
    state.streak.lastActiveDate = today;
    state.streak.longest = Math.max(state.streak.longest || 0, state.streak.count);
  }

  function logEvent(eventType, topicId, questionId, result) {
    pendingEvents.push({
      event_type: eventType,
      topic_id: topicId || null,
      question_id: questionId || null,
      result: result || null,
      occurred_at: new Date().toISOString(),
    });
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(saveStateNow, 500);
  }

  async function saveStateNow() {
    const eventsToSend = pendingEvents.slice();
    try {
      await fetch("/api/state", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state, events: eventsToSend }),
      });
      pendingEvents.splice(0, eventsToSend.length);
    } catch (e) {
      // best-effort; state (and queued events) are retried on next save
    }
  }

  function overallCounts() {
    const total = BANK.topics.length;
    let done = 0;
    BANK.topics.forEach((t) => {
      if (state.topics[t.id] && state.topics[t.id].status === "done") done++;
    });
    return { done, total };
  }

  function groupCounts(groupId) {
    const topics = BANK.topics.filter((t) => t.group === groupId);
    let done = 0;
    topics.forEach((t) => {
      if (state.topics[t.id] && state.topics[t.id].status === "done") done++;
    });
    return { done, total: topics.length };
  }

  function firstUnfinishedTopic() {
    return BANK.topics.find((t) => !state.topics[t.id] || state.topics[t.id].status !== "done");
  }

  // ---------- auth ----------
  async function checkSession() {
    const res = await fetch("/api/me");
    if (!res.ok) return null;
    const data = await res.json();
    return data.user;
  }

  async function loadState() {
    const res = await fetch("/api/state");
    const data = await res.json();
    return data.state;
  }

  function showAuthForm(which) {
    $(".auth-tabs").hidden = which === "forgot" || which === "reset";
    $("#login-form").hidden = which !== "login";
    $("#signup-form").hidden = which !== "signup";
    $("#forgot-form").hidden = which !== "forgot";
    $("#reset-form").hidden = which !== "reset";
  }

  function setupAuthScreen() {
    $all(".auth-tab").forEach((tab) => {
      tab.addEventListener("click", () => {
        $all(".auth-tab").forEach((t) => { t.classList.remove("is-active"); t.setAttribute("aria-selected", "false"); });
        tab.classList.add("is-active");
        tab.setAttribute("aria-selected", "true");
        showAuthForm(tab.dataset.tab);
      });
    });

    $("#forgot-password-link").addEventListener("click", () => showAuthForm("forgot"));
    $("#forgot-cancel-link").addEventListener("click", () => showAuthForm("login"));

    $("#forgot-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("#forgot-email").value.trim();
      const errBox = $("#forgot-error");
      const okBox = $("#forgot-success");
      errBox.hidden = true;
      okBox.hidden = true;
      const res = await fetch("/api/password/forgot", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errBox.textContent = data.error || "Something went wrong.";
        errBox.hidden = false;
        return;
      }
      okBox.textContent = data.message || "If that email is registered, we've sent a reset link.";
      okBox.hidden = false;
    });

    $("#reset-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const params = new URLSearchParams(location.search);
      const token = params.get("reset");
      const password = $("#reset-password").value;
      const errBox = $("#reset-error");
      errBox.hidden = true;
      const res = await fetch("/api/password/reset", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        errBox.textContent = data.error || "Could not reset your password.";
        errBox.hidden = false;
        return;
      }
      history.replaceState(null, "", location.pathname);
      showAuthForm("login");
      const okBox = $("#login-success");
      okBox.textContent = "Password updated — please sign in.";
      okBox.hidden = false;
    });

    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("#login-email").value.trim();
      const password = $("#login-password").value;
      const errBox = $("#login-error");
      errBox.hidden = true;
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        errBox.textContent = data.error || "Could not sign in.";
        errBox.hidden = false;
        return;
      }
      await boot(data.user);
    });

    $("#signup-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("#signup-name").value.trim();
      const email = $("#signup-email").value.trim();
      const password = $("#signup-password").value;
      const errBox = $("#signup-error");
      errBox.hidden = true;
      const res = await fetch("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        errBox.textContent = data.error || "Could not create account.";
        errBox.hidden = false;
        return;
      }
      await boot(data.user);
    });
  }

  // ---------- rendering: shell ----------
  function renderShell() {
    $("#user-name-label").textContent = currentUser.name;
    renderTopStats();
    renderSidebar();
  }

  function renderTopStats() {
    $("#streak-count").textContent = state.streak.count || 0;
    const { done, total } = overallCounts();
    $("#progress-count").textContent = `${done}/${total}`;
  }

  function renderSidebar() {
    const container = $("#group-list");
    container.innerHTML = "";
    BANK.groups.forEach((g) => {
      const { done, total } = groupCounts(g.id);
      const topics = BANK.topics.filter((t) => t.group === g.id);
      const wrap = el(`
        <div class="nav-group">
          <button class="nav-group-head" data-group="${g.id}">
            <span>${escapeHtml(g.label)}</span>
            <span class="nav-group-frac">${done}/${total}</span>
          </button>
          <div class="nav-topic-list" data-group-list="${g.id}"></div>
        </div>
      `);
      const list = $(`[data-group-list="${g.id}"]`, wrap);
      topics.forEach((t) => {
        const st = state.topics[t.id] ? state.topics[t.id].status : "not_started";
        const btn = el(`
          <button class="nav-topic${currentTopicId === t.id ? " is-active" : ""}" data-topic="${t.id}">
            <span class="status-dot ${st}"></span>
            <span class="nav-topic-title">${escapeHtml(t.title)}</span>
          </button>
        `);
        list.appendChild(btn);
      });
      container.appendChild(wrap);
    });

    $("#nav-home-btn").classList.toggle("is-active", currentView === "home");
    $("#nav-stats-btn").classList.toggle("is-active", currentView === "stats");

    $all(".nav-topic", container).forEach((btn) => {
      btn.addEventListener("click", () => openTopic(btn.dataset.topic));
    });
  }

  // ---------- HOME view ----------
  function renderHome() {
    currentView = "home";
    currentTopicId = null;
    const { done, total } = overallCounts();
    const pct = total ? Math.round((done / total) * 100) : 0;
    const next = firstUnfinishedTopic();
    const nextState = next ? (state.topics[next.id] || { status: "not_started", shownIds: [] }) : null;

    const main = $("#main");
    main.innerHTML = "";
    const view = el(`<div class="view"></div>`);

    view.appendChild(el(`
      <div class="card card-hero">
        <div class="section-title">Welcome back, ${escapeHtml(currentUser.name.split(" ")[0])}</div>
        <p class="section-sub" style="margin-top:6px;">${done} of ${total} topics done · ${pct}% through the 60-day plan</p>
        <div class="progress-track" style="margin-top:14px;"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
    `));

    view.appendChild(el(`
      <div class="stat-grid">
        <div class="stat-tile"><div class="stat-tile-value">${state.streak.count || 0}</div><div class="stat-tile-label">Day streak</div></div>
        <div class="stat-tile"><div class="stat-tile-value">${done}</div><div class="stat-tile-label">Topics done</div></div>
        <div class="stat-tile"><div class="stat-tile-value">${countTotalShown()}</div><div class="stat-tile-label">Questions covered</div></div>
        <div class="stat-tile"><div class="stat-tile-value">${Object.keys(state.questionStats).length}</div><div class="stat-tile-label">Questions reviewed</div></div>
      </div>
    `));

    const row = el(`<div class="card-row"></div>`);

    if (next) {
      const shown = nextState.shownIds.length;
      const totalQ = next.questions.length;
      const label = nextState.status === "in_progress" ? "Continue" : "Start";
      row.appendChild(el(`
        <div class="card">
          <div class="group-days">${escapeHtml(groupLabel(next.group))} · ${escapeHtml(groupDays(next.group))}</div>
          <div class="section-title" style="font-size:17px;margin-top:2px;">${escapeHtml(next.title)}</div>
          <p class="section-sub" style="margin-top:6px;">${shown} of ${totalQ} questions covered in this topic</p>
          <div class="progress-track" style="margin-top:10px;"><div class="progress-fill" style="width:${Math.round((shown/totalQ)*100)}%"></div></div>
          <button class="btn btn-primary" style="margin-top:16px;" data-action="open-next">${label} today's 10</button>
        </div>
      `));
    } else {
      row.appendChild(el(`
        <div class="card">
          <div class="section-title" style="font-size:17px;">All 24 topics done 🎉</div>
          <p class="section-sub" style="margin-top:6px;">Every topic is marked complete — keep sharp with daily review.</p>
        </div>
      `));
    }

    const doneCount = done;
    row.appendChild(el(`
      <div class="card">
        <div class="group-days">Spaced repetition</div>
        <div class="section-title" style="font-size:17px;margin-top:2px;">Daily review</div>
        <p class="section-sub" style="margin-top:6px;">${doneCount === 0 ? "Finish your first topic to unlock review." : "Random questions pulled from everything you've marked done."}</p>
        <div class="review-controls" style="margin-top:14px;">
          <span class="range-label">Count: <strong id="review-count-label">${DEFAULT_REVIEW_COUNT}</strong></span>
          <input type="range" id="review-count" min="10" max="20" step="1" value="${DEFAULT_REVIEW_COUNT}" ${doneCount === 0 ? "disabled" : ""}/>
        </div>
        <button class="btn btn-primary" style="margin-top:14px;" id="start-review-btn" ${doneCount === 0 ? "disabled" : ""}>Generate today's review</button>
      </div>
    `));

    view.appendChild(row);

    view.appendChild(el(`
      <div>
        <div class="section-title" style="font-size:16px;margin-bottom:10px;">All topics</div>
        <div class="topic-grid" id="topic-grid"></div>
      </div>
    `));

    main.appendChild(view);

    const grid = $("#topic-grid");
    BANK.topics.forEach((t) => {
      const st = state.topics[t.id] ? state.topics[t.id].status : "not_started";
      const shown = state.topics[t.id] ? state.topics[t.id].shownIds.length : 0;
      const tile = el(`
        <button class="topic-tile" data-topic="${t.id}">
          <div class="topic-tile-title">${escapeHtml(t.title)}</div>
          <div class="topic-tile-meta">
            <span>${shown}/${t.questions.length} seen</span>
            <span class="pill pill-${st}">${st.replace("_", " ")}</span>
          </div>
        </button>
      `);
      grid.appendChild(tile);
    });
    $all(".topic-tile", grid).forEach((btn) => btn.addEventListener("click", () => openTopic(btn.dataset.topic)));

    const nextBtn = $('[data-action="open-next"]', view);
    if (nextBtn) nextBtn.addEventListener("click", () => openTopic(next.id));

    const rangeInput = $("#review-count");
    if (rangeInput) {
      rangeInput.addEventListener("input", () => { $("#review-count-label").textContent = rangeInput.value; });
    }
    const reviewBtn = $("#start-review-btn");
    if (reviewBtn) reviewBtn.addEventListener("click", () => startReview(parseInt(rangeInput.value, 10)));

    renderSidebar();
  }

  function countTotalShown() {
    let n = 0;
    Object.values(state.topics).forEach((t) => (n += t.shownIds.length));
    return n;
  }
  function groupLabel(id) { const g = BANK.groups.find((x) => x.id === id); return g ? g.label : id; }
  function groupDays(id) { const g = BANK.groups.find((x) => x.id === id); return g ? g.days : ""; }

  // ---------- TOPIC view ----------
  function openTopic(topicId) {
    currentView = "topic";
    currentTopicId = topicId;
    const ts = ensureTopicState(topicId);
    // Build the visible batch: previously shown questions stay visible, plus fill up to NEW_BATCH_SIZE with unseen ones.
    const topic = TOPIC_BY_ID[topicId];
    const allIds = topic.questions.map((q) => q.id);
    const unseen = allIds.filter((id) => !ts.shownIds.includes(id));
    openBatchIds = ts.shownIds.concat(unseen.slice(0, Math.max(0, NEW_BATCH_SIZE - ts.shownIds.length)));
    if (openBatchIds.length === 0) openBatchIds = allIds.slice(0, NEW_BATCH_SIZE);
    renderTopic();
  }

  function renderTopic() {
    const topic = TOPIC_BY_ID[currentTopicId];
    const ts = ensureTopicState(currentTopicId);
    const main = $("#main");
    main.innerHTML = "";
    const view = el(`<div class="view"></div>`);

    const remaining = topic.questions.length - ts.shownIds.length;

    view.appendChild(el(`
      <div class="card">
        <div class="group-days">${escapeHtml(groupLabel(topic.group))} · ${escapeHtml(groupDays(topic.group))}</div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-top:2px;">
          <div class="section-title" style="font-size:20px;">${escapeHtml(topic.title)}</div>
          <span class="pill pill-${ts.status}">${ts.status.replace("_", " ")}</span>
        </div>
        <p class="section-sub" style="margin-top:6px;">${ts.shownIds.length} of ${topic.questions.length} questions covered</p>
        <div class="progress-track" style="margin-top:10px;"><div class="progress-fill" style="width:${Math.round((ts.shownIds.length/topic.questions.length)*100)}%"></div></div>
        <div class="q-actions">
          ${remaining > 0 ? `<button class="btn btn-secondary" id="more-btn">Show ${Math.min(NEW_BATCH_SIZE, remaining)} more</button>` : ""}
          <button class="btn ${ts.status === "done" ? "btn-secondary" : "btn-success"}" id="done-btn">${ts.status === "done" ? "Marked done ✓" : "Mark topic as done"}</button>
        </div>
      </div>
    `));

    const list = el(`<div style="display:flex;flex-direction:column;gap:12px;"></div>`);
    openBatchIds.forEach((qid, idx) => {
      const q = topic.questions.find((x) => x.id === qid);
      const revealed = ts.shownIds.includes(qid);
      list.appendChild(el(`
        <div class="q-card" data-qid="${qid}">
          <div class="q-card-head">
            <div>
              <div class="q-index">Q${idx + 1}</div>
              <div class="q-text">${escapeHtml(q.q)}</div>
            </div>
          </div>
          ${revealed
            ? `<div class="q-answer">${escapeHtml(q.a)}</div>`
            : `<button class="btn btn-secondary btn-small" data-reveal="${qid}">Show model answer</button>`}
        </div>
      `));
    });
    view.appendChild(list);
    main.appendChild(view);

    $all("[data-reveal]", view).forEach((btn) => {
      btn.addEventListener("click", () => revealQuestion(btn.dataset.reveal));
    });
    const moreBtn = $("#more-btn", view);
    if (moreBtn) moreBtn.addEventListener("click", showMore);
    $("#done-btn", view).addEventListener("click", markTopicDone);

    renderSidebar();
  }

  function revealQuestion(qid) {
    const ts = ensureTopicState(currentTopicId);
    if (!ts.shownIds.includes(qid)) {
      ts.shownIds.push(qid);
      if (ts.status === "not_started") { ts.status = "in_progress"; ts.startedAt = new Date().toISOString(); }
      bumpStreak();
      logEvent("reveal", currentTopicId, qid, null);
      scheduleSave();
    }
    renderTopic();
    renderTopStats();
  }

  function showMore() {
    const topic = TOPIC_BY_ID[currentTopicId];
    const ts = ensureTopicState(currentTopicId);
    const allIds = topic.questions.map((q) => q.id);
    const unseen = allIds.filter((id) => !openBatchIds.includes(id));
    openBatchIds = openBatchIds.concat(unseen.slice(0, NEW_BATCH_SIZE));
    renderTopic();
  }

  function markTopicDone() {
    const ts = ensureTopicState(currentTopicId);
    ts.status = "done";
    ts.doneAt = new Date().toISOString();
    bumpStreak();
    scheduleSave();
    saveStateNow();
    toast("Topic marked done — nice work.");
    renderHome();
  }

  // ---------- REVIEW view ----------
  function pickReviewBatch(count) {
    const doneIds = Object.keys(state.topics).filter((id) => state.topics[id].status === "done");
    const pool = [];
    doneIds.forEach((tid) => {
      const topic = TOPIC_BY_ID[tid];
      if (!topic) return;
      topic.questions.forEach((q) => pool.push({ topicId: tid, topicTitle: topic.title, id: q.id, q: q.q, a: q.a }));
    });
    if (pool.length === 0) return [];
    const weighted = pool.map((item) => {
      const stat = state.questionStats[item.id];
      let w = 1;
      if (!stat) w = 1.6;
      else if (stat.lastResult === "again") w = 3;
      else w = Math.max(0.35, 1 - (stat.correctStreak || 0) * 0.15);
      return { item, w };
    });
    const chosen = [];
    const n = Math.min(count, weighted.length);
    for (let i = 0; i < n; i++) {
      const totalW = weighted.reduce((s, x) => s + x.w, 0);
      let r = Math.random() * totalW;
      let idx = 0;
      for (; idx < weighted.length; idx++) { r -= weighted[idx].w; if (r <= 0) break; }
      idx = Math.min(idx, weighted.length - 1);
      chosen.push(weighted[idx].item);
      weighted.splice(idx, 1);
    }
    return chosen;
  }

  function startReview(count) {
    currentView = "review";
    currentTopicId = null;
    reviewBatch = pickReviewBatch(count || DEFAULT_REVIEW_COUNT).map((q) => ({ ...q, revealed: false }));
    bumpStreak();
    scheduleSave();
    renderReview();
  }

  function renderReview() {
    const main = $("#main");
    main.innerHTML = "";
    const view = el(`<div class="view"></div>`);

    view.appendChild(el(`
      <div class="card">
        <div class="section-title" style="font-size:20px;">Daily review</div>
        <p class="section-sub" style="margin-top:6px;">${reviewBatch.length} random questions pulled from your completed topics.</p>
        <button class="btn btn-secondary" id="reshuffle-btn" style="margin-top:14px;">New batch</button>
      </div>
    `));

    if (reviewBatch.length === 0) {
      view.appendChild(el(`
        <div class="card empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M12 2 3 6.5v6C3 17.2 6.9 21.3 12 22.5 17.1 21.3 21 17.2 21 12.5v-6L12 2Z" stroke="currentColor" stroke-width="1.4"/></svg>
          <p>No completed topics yet — finish one to unlock daily review.</p>
        </div>
      `));
    } else {
      const list = el(`<div style="display:flex;flex-direction:column;gap:12px;"></div>`);
      reviewBatch.forEach((item, idx) => {
        const stat = state.questionStats[item.id];
        list.appendChild(el(`
          <div class="q-card" data-ridx="${idx}">
            <div class="q-topic-tag">${escapeHtml(item.topicTitle)}</div>
            <div class="q-card-head" style="margin-top:6px;">
              <div>
                <div class="q-index">Q${idx + 1}</div>
                <div class="q-text">${escapeHtml(item.q)}</div>
              </div>
            </div>
            ${item.revealed
              ? `<div class="q-answer">${escapeHtml(item.a)}</div>
                 <div class="q-actions">
                   <button class="btn btn-success btn-small" data-got="${idx}">Got it</button>
                   <button class="btn btn-warn btn-small" data-again="${idx}">Review again soon</button>
                 </div>`
              : `<button class="btn btn-secondary btn-small" data-reveal-review="${idx}">Show model answer</button>`}
            ${stat ? `<div class="section-sub" style="margin-top:8px;">Reviewed ${stat.timesShown || 0}× before</div>` : ""}
          </div>
        `));
      });
      view.appendChild(list);
    }

    main.appendChild(view);

    $("#reshuffle-btn", view).addEventListener("click", () => {
      const rangeVal = reviewBatch.length || DEFAULT_REVIEW_COUNT;
      startReview(rangeVal);
    });
    $all("[data-reveal-review]", view).forEach((btn) => {
      btn.addEventListener("click", () => {
        reviewBatch[parseInt(btn.dataset.revealReview, 10)].revealed = true;
        renderReview();
      });
    });
    $all("[data-got]", view).forEach((btn) => {
      btn.addEventListener("click", () => markReviewResult(parseInt(btn.dataset.got, 10), "got_it"));
    });
    $all("[data-again]", view).forEach((btn) => {
      btn.addEventListener("click", () => markReviewResult(parseInt(btn.dataset.again, 10), "again"));
    });

    renderSidebar();
  }

  function markReviewResult(idx, result) {
    const item = reviewBatch[idx];
    if (!item) return;
    const stat = state.questionStats[item.id] || { timesShown: 0, correctStreak: 0, lastResult: null, lastShown: null };
    stat.timesShown = (stat.timesShown || 0) + 1;
    stat.correctStreak = result === "got_it" ? (stat.correctStreak || 0) + 1 : 0;
    stat.lastResult = result;
    stat.lastShown = todayStr();
    state.questionStats[item.id] = stat;
    logEvent("review", item.topicId, item.id, result);
    scheduleSave();
    toast(result === "got_it" ? "Nice — noted." : "Got it, we'll bring this back sooner.");
    renderReview();
  }

  // ---------- SETTINGS view ----------
  function renderSettings() {
    currentView = "settings";
    currentTopicId = null;
    const main = $("#main");
    main.innerHTML = "";
    const view = el(`<div class="view"></div>`);

    view.appendChild(el(`
      <div class="card">
        <div class="section-title">Account</div>
        <p class="section-sub" style="margin-top:6px;">${escapeHtml(currentUser.email)} · member since ${formatDate(currentUser.createdAt)}</p>
        <label class="field" style="margin-top:16px;">
          <span>Display name</span>
          <input type="text" id="settings-name" value="${escapeHtml(currentUser.name)}" />
        </label>
        <p class="form-error" id="name-error" hidden></p>
        <p class="form-note" id="name-success" hidden></p>
        <button class="btn btn-primary" id="save-name-btn">Save name</button>
      </div>
    `));

    view.appendChild(el(`
      <div class="card">
        <div class="section-title">Change password</div>
        <form id="change-password-form" style="margin-top:12px;">
          <label class="field">
            <span>Current password</span>
            <input type="password" id="current-password" autocomplete="current-password" required />
          </label>
          <label class="field">
            <span>New password</span>
            <input type="password" id="new-password" autocomplete="new-password" minlength="8" required />
            <small>At least 8 characters.</small>
          </label>
          <p class="form-error" id="password-error" hidden></p>
          <p class="form-note" id="password-success" hidden></p>
          <button type="submit" class="btn btn-primary">Update password</button>
        </form>
      </div>
    `));

    view.appendChild(el(`
      <div class="card">
        <div class="section-title">Sessions</div>
        <p class="section-sub" style="margin-top:6px;">Sign out everywhere this account is logged in, including this device.</p>
        <button class="btn btn-warn" id="revoke-all-btn" style="margin-top:12px;">Sign out of all devices</button>
      </div>
    `));

    view.appendChild(el(`
      <div class="card">
        <div class="section-title">Export data</div>
        <p class="section-sub" style="margin-top:6px;">Download your progress, or the full question bank for offline studying.</p>
        <div class="q-actions" style="margin-top:12px;">
          <button class="btn btn-secondary" id="export-progress-btn">Export my progress (JSON)</button>
          <button class="btn btn-secondary" id="export-bank-btn">Download question bank (Markdown)</button>
        </div>
      </div>
    `));

    main.appendChild(view);

    $("#save-name-btn", view).addEventListener("click", async () => {
      const nameErr = $("#name-error", view);
      const nameOk = $("#name-success", view);
      nameErr.hidden = true;
      nameOk.hidden = true;
      const name = $("#settings-name", view).value.trim();
      if (!name) {
        nameErr.textContent = "Please enter your name.";
        nameErr.hidden = false;
        return;
      }
      const res = await fetch("/api/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await res.json();
      if (!res.ok) {
        nameErr.textContent = data.error || "Could not update name.";
        nameErr.hidden = false;
        return;
      }
      currentUser = data.user;
      nameOk.textContent = "Saved.";
      nameOk.hidden = false;
      renderShell();
    });

    $("#change-password-form", view).addEventListener("submit", async (e) => {
      e.preventDefault();
      const errBox = $("#password-error", view);
      const okBox = $("#password-success", view);
      errBox.hidden = true;
      okBox.hidden = true;
      const currentPassword = $("#current-password", view).value;
      const newPassword = $("#new-password", view).value;
      const res = await fetch("/api/password/change", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) {
        errBox.textContent = data.error || "Could not update password.";
        errBox.hidden = false;
        return;
      }
      okBox.textContent = "Password updated.";
      okBox.hidden = false;
      $("#change-password-form", view).reset();
    });

    $("#revoke-all-btn", view).addEventListener("click", async () => {
      if (!confirm("Sign out of all devices, including this one?")) return;
      await fetch("/api/sessions/revoke-all", { method: "POST" });
      location.reload();
    });

    $("#export-progress-btn", view).addEventListener("click", exportProgressJson);
    $("#export-bank-btn", view).addEventListener("click", exportQuestionBankMarkdown);

    renderSidebar();
  }

  function exportProgressJson() {
    downloadBlob(`interview-prep-progress-${todayStr()}.json`, JSON.stringify(state, null, 2), "application/json");
    toast("Progress exported.");
  }

  function exportQuestionBankMarkdown() {
    let md = "# Interview Prep — Question Bank\n\n";
    BANK.groups.forEach((g) => {
      const topics = BANK.topics.filter((t) => t.group === g.id);
      if (!topics.length) return;
      md += `## ${g.label}\n\n`;
      topics.forEach((t) => {
        md += `### ${t.title}\n\n`;
        t.questions.forEach((q, i) => {
          md += `**Q${i + 1}. ${q.q}**\n\n${q.a}\n\n`;
        });
      });
    });
    downloadBlob("interview-prep-question-bank.md", md, "text/markdown");
    toast("Question bank exported.");
  }

  // ---------- STATS view ----------
  function buildBarChartSvg(data) {
    const width = Math.max(320, data.length * 34);
    const height = 140;
    const step = width / data.length;
    const barWidth = Math.min(28, step - 8);
    const bars = data
      .map((d, i) => {
        const x = i * step + (step - barWidth) / 2;
        const barHeight = Math.max(2, (d.value / 100) * (height - 30));
        const y = height - 20 - barHeight;
        return `
          <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barWidth.toFixed(1)}" height="${barHeight.toFixed(1)}" rx="3" fill="var(--primary)"></rect>
          <text x="${(x + barWidth / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" font-size="10" text-anchor="middle" fill="var(--text)">${d.value}%</text>
          <text x="${(x + barWidth / 2).toFixed(1)}" y="${height - 6}" font-size="10" text-anchor="middle" fill="var(--text-muted)">${escapeHtml(d.label)}</text>
        `;
      })
      .join("");
    const wrap = document.createElement("div");
    wrap.style.overflowX = "auto";
    wrap.style.marginTop = "12px";
    wrap.innerHTML = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="Accuracy trend chart">${bars}</svg>`;
    return wrap;
  }

  async function openStats() {
    currentView = "stats";
    currentTopicId = null;
    const main = $("#main");
    main.innerHTML = "";
    main.appendChild(el(`<div class="view"><div class="card empty-state"><p>Loading stats…</p></div></div>`));
    renderSidebar();

    let events = [];
    try {
      const res = await fetch("/api/activity?limit=2000");
      if (res.ok) {
        const data = await res.json();
        events = data.events || [];
      }
    } catch (e) {
      // best-effort; render with whatever we have (none)
    }
    renderStats(events);
  }

  function renderStats(events) {
    const main = $("#main");
    main.innerHTML = "";
    const view = el(`<div class="view"></div>`);

    view.appendChild(el(`
      <div class="card">
        <div class="section-title">Stats</div>
        <p class="section-sub" style="margin-top:6px;">Your progress over time, and where to focus next.</p>
      </div>
    `));

    view.appendChild(el(`
      <div class="stat-grid">
        <div class="stat-tile"><div class="stat-tile-value">${state.streak.count || 0}</div><div class="stat-tile-label">Current streak</div></div>
        <div class="stat-tile"><div class="stat-tile-value">${state.streak.longest || 0}</div><div class="stat-tile-label">Longest streak</div></div>
        <div class="stat-tile"><div class="stat-tile-value">${events.length}</div><div class="stat-tile-label">Logged actions</div></div>
      </div>
    `));

    // chronological order, oldest first (the API returns newest-first)
    const reviewEvents = events.filter((e) => e.event_type === "review" && e.result).slice().reverse();

    const byDay = {};
    reviewEvents.forEach((e) => {
      const day = (e.occurred_at || "").slice(0, 10);
      if (!byDay[day]) byDay[day] = { got: 0, again: 0 };
      if (e.result === "got_it") byDay[day].got++;
      else byDay[day].again++;
    });
    const days = Object.keys(byDay).sort().slice(-14);
    const trendData = days.map((d) => {
      const { got, again } = byDay[d];
      const total = got + again;
      return { label: d.slice(5), value: total ? Math.round((got / total) * 100) : 0 };
    });

    const chartCard = el(`
      <div class="card">
        <div class="section-title" style="font-size:16px;">Accuracy trend</div>
        <p class="section-sub" style="margin-top:4px;">% marked "got it" on each day you reviewed, last ${trendData.length || 0} days.</p>
      </div>
    `);
    if (trendData.length === 0) {
      chartCard.appendChild(el(`<p class="section-sub" style="margin-top:14px;">No review history yet — run a daily review to start building this.</p>`));
    } else {
      chartCard.appendChild(buildBarChartSvg(trendData));
    }
    view.appendChild(chartCard);

    const topicAgg = {};
    const questionAgg = {};
    reviewEvents.forEach((e) => {
      const tid = e.topic_id || TOPIC_OF_QUESTION[e.question_id];
      if (tid) {
        topicAgg[tid] = topicAgg[tid] || { total: 0, again: 0 };
        topicAgg[tid].total++;
        if (e.result === "again") topicAgg[tid].again++;
      }
      if (e.question_id) {
        questionAgg[e.question_id] = questionAgg[e.question_id] || { total: 0, again: 0 };
        questionAgg[e.question_id].total++;
        if (e.result === "again") questionAgg[e.question_id].again++;
      }
    });

    const weakTopics = Object.keys(topicAgg)
      .map((tid) => ({ tid, ...topicAgg[tid], rate: topicAgg[tid].again / topicAgg[tid].total }))
      .filter((x) => x.total >= 2)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);

    const weakCard = el(`<div class="card"><div class="section-title" style="font-size:16px;">Weakest topics</div></div>`);
    if (weakTopics.length === 0) {
      weakCard.appendChild(el(`<p class="section-sub" style="margin-top:8px;">Not enough review history yet.</p>`));
    } else {
      const list = el(`<div class="weak-list"></div>`);
      weakTopics.forEach((t) => {
        const topic = TOPIC_BY_ID[t.tid];
        list.appendChild(el(`
          <div class="weak-row">
            <span class="weak-row-label">${escapeHtml(topic ? topic.title : t.tid)}</span>
            <div class="weak-row-bar"><div class="weak-row-fill" style="width:${Math.round(t.rate * 100)}%"></div></div>
            <span class="weak-row-pct">${Math.round(t.rate * 100)}% review-again</span>
          </div>
        `));
      });
      weakCard.appendChild(list);
    }
    view.appendChild(weakCard);

    const weakQuestions = Object.keys(questionAgg)
      .map((qid) => ({ qid, ...questionAgg[qid], rate: questionAgg[qid].again / questionAgg[qid].total }))
      .filter((x) => x.total >= 2 && x.rate > 0)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 8);

    const weakQCard = el(`<div class="card"><div class="section-title" style="font-size:16px;">Weakest questions</div></div>`);
    if (weakQuestions.length === 0) {
      weakQCard.appendChild(el(`<p class="section-sub" style="margin-top:8px;">Not enough review history yet.</p>`));
    } else {
      const list = el(`<div style="display:flex;flex-direction:column;gap:8px;margin-top:8px;"></div>`);
      weakQuestions.forEach((q) => {
        const tid = TOPIC_OF_QUESTION[q.qid];
        const topic = tid ? TOPIC_BY_ID[tid] : null;
        const question = topic ? topic.questions.find((x) => x.id === q.qid) : null;
        list.appendChild(el(`
          <div class="weak-row">
            <span class="weak-row-label">${escapeHtml(question ? question.q : q.qid)}</span>
            <span class="weak-row-pct">${Math.round(q.rate * 100)}% again (${q.total}×)</span>
          </div>
        `));
      });
      weakQCard.appendChild(list);
    }
    view.appendChild(weakQCard);

    main.appendChild(view);
    renderSidebar();
  }

  // ---------- boot ----------
  async function boot(user) {
    currentUser = user;
    state = migrateState(await loadState());
    $("#auth-screen").hidden = true;
    $("#app").hidden = false;
    $("#logout-btn").addEventListener("click", async () => {
      await fetch("/api/logout", { method: "POST" });
      location.reload();
    });
    $("#nav-home-btn").addEventListener("click", renderHome);
    $("#nav-stats-btn").addEventListener("click", openStats);
    $("#settings-btn").addEventListener("click", renderSettings);
    renderShell();
    renderHome();
  }

  (async function init() {
    setupAuthScreen();
    const params = new URLSearchParams(location.search);
    if (params.get("reset")) {
      $("#auth-screen").hidden = false;
      showAuthForm("reset");
      return;
    }
    const user = await checkSession();
    if (user) {
      await boot(user);
    } else {
      $("#auth-screen").hidden = false;
    }
  })();
})();
