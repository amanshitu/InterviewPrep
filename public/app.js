(() => {
  "use strict";

  const DEFAULT_REVIEW_COUNT = 15;

  let currentUser = null;
  let currentView = "home";
  let todayQueue = null; // { date, target, completed, remaining, questions } from /api/queue/today
  let localRevealed = {}; // question_id -> revealed answer text, for this page load
  let reviewBatch = []; // [{id, q, a, topic_label, revealed, graded}]

  // ---------- utils ----------
  function $(sel, root = document) { return root.querySelector(sel); }
  function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
  function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function toast(msg) {
    const node = $("#toast");
    node.textContent = msg;
    node.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(() => (node.hidden = true), 2600);
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
  async function api(path, opts) {
    const res = await fetch(path, opts);
    let data = {};
    try { data = await res.json(); } catch { /* no body */ }
    if (!res.ok) throw Object.assign(new Error(data.error || "Request failed."), { status: res.status, data });
    return data;
  }

  // ---------- auth ----------
  async function checkSession() {
    const res = await fetch("/api/me");
    if (!res.ok) return null;
    const data = await res.json();
    return data.user;
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
      try {
        const data = await api("/api/password/forgot", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email }),
        });
        okBox.textContent = data.message || "If that email is registered, we've sent a reset link.";
        okBox.hidden = false;
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      }
    });

    $("#reset-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const params = new URLSearchParams(location.search);
      const token = params.get("reset");
      const password = $("#reset-password").value;
      const errBox = $("#reset-error");
      errBox.hidden = true;
      try {
        await api("/api/password/reset", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ token, password }),
        });
        history.replaceState(null, "", location.pathname);
        showAuthForm("login");
        const okBox = $("#login-success");
        okBox.textContent = "Password updated — please sign in.";
        okBox.hidden = false;
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      }
    });

    $("#login-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = $("#login-email").value.trim();
      const password = $("#login-password").value;
      const errBox = $("#login-error");
      errBox.hidden = true;
      try {
        const data = await api("/api/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        await boot(data.user);
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      }
    });

    $("#signup-form").addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = $("#signup-name").value.trim();
      const email = $("#signup-email").value.trim();
      const password = $("#signup-password").value;
      const track = $("#signup-track").value.trim();
      const dailyQuota = parseInt($("#signup-quota").value, 10) || 10;
      const errBox = $("#signup-error");
      errBox.hidden = true;
      try {
        const data = await api("/api/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name, email, password, track, dailyQuota }),
        });
        await boot(data.user);
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      }
    });
  }

  // ---------- shell ----------
  function renderShell() {
    $("#user-name-label").textContent = currentUser.name;
    renderTopStats();
    renderSidebar();
  }

  function renderTopStats() {
    $("#streak-count").textContent = (currentUser.streak && currentUser.streak.count) || 0;
    if (todayQueue) {
      $("#progress-count").textContent = `${todayQueue.completed}/${todayQueue.target}`;
    }
  }

  function renderSidebar() {
    $("#nav-home-btn").classList.toggle("is-active", currentView === "home");
    $("#nav-stats-btn").classList.toggle("is-active", currentView === "stats");
  }

  // ---------- HOME view (today's queue) ----------
  async function renderHome() {
    currentView = "home";
    const main = $("#main");
    main.innerHTML = "";
    main.appendChild(el(`<div class="view"><div class="card empty-state"><p>Loading today's questions…</p></div></div>`));
    renderSidebar();

    try {
      todayQueue = await api("/api/queue/today");
    } catch (err) {
      todayQueue = { date: "", target: 0, completed: 0, remaining: 0, questions: [] };
      toast(err.message);
    }
    localRevealed = {};
    renderTopStats();
    paintHome();
  }

  function paintHome() {
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
        <div class="stat-tile"><div class="stat-tile-value">${todayQueue.target}</div><div class="stat-tile-label">Today's target</div></div>
        <div class="stat-tile"><div class="stat-tile-value">${currentUser.dailyQuota}</div><div class="stat-tile-label">Daily quota</div></div>
      </div>
    `));

    const queueCard = el(`
      <div class="card">
        <div class="section-title" style="font-size:17px;">Today's questions</div>
        <p class="section-sub" style="margin-top:4px;">Unfinished questions from a prior day show up first, up to your daily quota's worth of backlog.</p>
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
      const revealed = localRevealed[q.id];
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
            ? `<div class="q-answer">${escapeHtml(q.a)}</div>`
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

    view.appendChild(el(`
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

    main.appendChild(view);

    $all("[data-reveal]", view).forEach((btn) => {
      btn.addEventListener("click", () => revealQuestion(btn.dataset.reveal));
    });
    const moreBtn = $("#request-more-btn", view);
    if (moreBtn) moreBtn.addEventListener("click", requestMore);

    const rangeInput = $("#review-count", view);
    rangeInput.addEventListener("input", () => { $("#review-count-label", view).textContent = rangeInput.value; });
    $("#start-review-btn", view).addEventListener("click", () => startReview(parseInt(rangeInput.value, 10)));

    renderSidebar();
  }

  async function revealQuestion(qid) {
    const q = todayQueue.questions.find((x) => x.id === qid);
    if (!q || localRevealed[qid]) return;
    localRevealed[qid] = true;
    todayQueue.completed += 1;
    todayQueue.remaining = Math.max(0, todayQueue.target - todayQueue.completed);
    paintHome();
    renderTopStats();
    try {
      await api("/api/questions/complete", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question_id: qid }),
      });
      // Refresh streak from the server (it may have just bumped).
      const me = await api("/api/me");
      currentUser = me.user;
      renderTopStats();
    } catch (err) {
      toast(err.message);
    }
  }

  async function requestMore() {
    try {
      const data = await api("/api/questions/request-more", { method: "POST" });
      const existingIds = new Set(todayQueue.questions.map((q) => q.id));
      data.questions.forEach((q) => { if (!existingIds.has(q.id)) todayQueue.questions.push(q); });
      todayQueue.target += 5;
      todayQueue.remaining = Math.max(0, todayQueue.target - todayQueue.completed);
      paintHome();
      renderTopStats();
    } catch (err) {
      toast(err.message);
    }
  }

  // ---------- REVIEW view ----------
  async function startReview(count) {
    currentView = "review";
    const main = $("#main");
    main.innerHTML = "";
    main.appendChild(el(`<div class="view"><div class="card empty-state"><p>Loading review batch…</p></div></div>`));
    renderSidebar();
    try {
      const data = await api(`/api/review?count=${count || DEFAULT_REVIEW_COUNT}`);
      reviewBatch = data.questions.map((q) => ({ ...q, revealed: false, graded: false }));
    } catch (err) {
      reviewBatch = [];
      toast(err.message);
    }
    renderReview();
  }

  function renderReview() {
    const main = $("#main");
    main.innerHTML = "";
    const view = el(`<div class="view"></div>`);

    view.appendChild(el(`
      <div class="card">
        <div class="section-title" style="font-size:20px;">Daily review</div>
        <p class="section-sub" style="margin-top:6px;">${reviewBatch.length} random questions pulled from your completed questions.</p>
        <button class="btn btn-secondary" id="reshuffle-btn" style="margin-top:14px;">New batch</button>
        <button class="btn btn-ghost" id="back-home-btn" style="margin-top:14px;">Back to Today</button>
      </div>
    `));

    if (reviewBatch.length === 0) {
      view.appendChild(el(`
        <div class="card empty-state">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none"><path d="M12 2 3 6.5v6C3 17.2 6.9 21.3 12 22.5 17.1 21.3 21 17.2 21 12.5v-6L12 2Z" stroke="currentColor" stroke-width="1.4"/></svg>
          <p>No completed questions yet — finish some of today's questions to unlock review.</p>
        </div>
      `));
    } else {
      const list = el(`<div style="display:flex;flex-direction:column;gap:12px;"></div>`);
      reviewBatch.forEach((item, idx) => {
        list.appendChild(el(`
          <div class="q-card" data-ridx="${idx}">
            <div class="q-topic-tag">${escapeHtml(item.topic_label || "")}</div>
            <div class="q-card-head" style="margin-top:6px;">
              <div>
                <div class="q-index">Q${idx + 1}</div>
                <div class="q-text">${escapeHtml(item.q)}</div>
              </div>
            </div>
            ${item.revealed
              ? `<div class="q-answer">${escapeHtml(item.a)}</div>
                 ${item.graded
                   ? `<p class="section-sub" style="margin-top:8px;">Graded: ${item.graded === "got_it" ? "Got it" : "Review again soon"}</p>`
                   : `<div class="q-actions">
                        <button class="btn btn-success btn-small" data-got="${idx}">Got it</button>
                        <button class="btn btn-warn btn-small" data-again="${idx}">Review again soon</button>
                      </div>`}`
              : `<button class="btn btn-secondary btn-small" data-reveal-review="${idx}">Show model answer</button>`}
            ${item.times_shown ? `<div class="section-sub" style="margin-top:8px;">Reviewed ${item.times_shown}× before</div>` : ""}
          </div>
        `));
      });
      view.appendChild(list);
    }

    main.appendChild(view);

    $("#reshuffle-btn", view).addEventListener("click", () => startReview(reviewBatch.length || DEFAULT_REVIEW_COUNT));
    $("#back-home-btn", view).addEventListener("click", renderHome);
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

  async function markReviewResult(idx, result) {
    const item = reviewBatch[idx];
    if (!item) return;
    item.graded = result;
    renderReview();
    try {
      await api("/api/questions/review-result", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question_id: item.id, result }),
      });
      toast(result === "got_it" ? "Nice — noted." : "Got it, we'll bring this back sooner.");
    } catch (err) {
      toast(err.message);
    }
  }

  // ---------- SETTINGS view ----------
  function renderSettings() {
    currentView = "settings";
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
        <div class="section-title">Prep profile</div>
        <p class="section-sub" style="margin-top:6px;">What you're preparing for, and how many questions you want per day.</p>
        <label class="field" style="margin-top:16px;">
          <span>What are you preparing for?</span>
          <input type="text" id="settings-track" value="${escapeHtml(currentUser.track || "")}" placeholder="e.g. Engineering Management" />
        </label>
        <label class="field">
          <span>Questions per day</span>
          <input type="number" id="settings-quota" min="5" max="50" value="${currentUser.dailyQuota}" />
        </label>
        <p class="form-error" id="profile-error" hidden></p>
        <p class="form-note" id="profile-success" hidden></p>
        <button class="btn btn-primary" id="save-profile-btn">Save profile</button>
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

    view.appendChild(buildQuestionSetsCard());

    view.appendChild(el(`
      <div class="card">
        <div class="section-title">Export data</div>
        <p class="section-sub" style="margin-top:6px;">Download your progress as a JSON file.</p>
        <button class="btn btn-secondary" id="export-progress-btn" style="margin-top:12px;">Export my progress (JSON)</button>
      </div>
    `));

    main.appendChild(view);

    $("#save-name-btn", view).addEventListener("click", async () => {
      const nameErr = $("#name-error", view);
      const nameOk = $("#name-success", view);
      nameErr.hidden = true;
      nameOk.hidden = true;
      const name = $("#settings-name", view).value.trim();
      if (!name) { nameErr.textContent = "Please enter your name."; nameErr.hidden = false; return; }
      try {
        const data = await api("/api/account", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ name }),
        });
        currentUser = data.user;
        nameOk.textContent = "Saved.";
        nameOk.hidden = false;
        renderShell();
      } catch (err) {
        nameErr.textContent = err.message;
        nameErr.hidden = false;
      }
    });

    $("#save-profile-btn", view).addEventListener("click", async () => {
      const errBox = $("#profile-error", view);
      const okBox = $("#profile-success", view);
      errBox.hidden = true;
      okBox.hidden = true;
      const track = $("#settings-track", view).value.trim();
      const dailyQuota = parseInt($("#settings-quota", view).value, 10) || 10;
      try {
        const data = await api("/api/profile", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ track, dailyQuota }),
        });
        currentUser = data.user;
        okBox.textContent = "Saved.";
        okBox.hidden = false;
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      }
    });

    $("#change-password-form", view).addEventListener("submit", async (e) => {
      e.preventDefault();
      const errBox = $("#password-error", view);
      const okBox = $("#password-success", view);
      errBox.hidden = true;
      okBox.hidden = true;
      const currentPassword = $("#current-password", view).value;
      const newPassword = $("#new-password", view).value;
      try {
        await api("/api/password/change", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ currentPassword, newPassword }),
        });
        okBox.textContent = "Password updated.";
        okBox.hidden = false;
        $("#change-password-form", view).reset();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      }
    });

    $("#revoke-all-btn", view).addEventListener("click", async () => {
      if (!confirm("Sign out of all devices, including this one?")) return;
      await fetch("/api/sessions/revoke-all", { method: "POST" });
      location.reload();
    });

    $("#export-progress-btn", view).addEventListener("click", exportProgress);

    wireQuestionSetsCard(view);
    renderSidebar();
  }

  async function exportProgress() {
    try {
      const data = await api("/api/export/progress");
      downloadBlob(`interview-prep-progress-${data.exportedAt.slice(0, 10)}.json`, JSON.stringify(data, null, 2), "application/json");
      toast("Progress exported.");
    } catch (err) {
      toast(err.message);
    }
  }

  // ---------- Question set upload (structured: title + ordered sections + ordered questions) ----------
  function buildQuestionSetsCard() {
    const card = el(`
      <div class="card">
        <div class="section-title">My question sets</div>
        <p class="section-sub" style="margin-top:6px;">Upload your own set of questions, grouped into sections. New sets start private to you; sharing them with other users needs admin approval.</p>
        <div id="my-sets-list" style="margin-top:14px;"></div>
        <button class="btn btn-secondary" id="new-set-btn" style="margin-top:14px;">Upload a question set</button>
        <div id="new-set-form-wrap" hidden style="margin-top:16px;"></div>
      </div>
    `);
    return card;
  }

  function renderSetStatusPill(set) {
    const labels = { private: "Private", pending: "Pending review", shared: "Shared", rejected: "Rejected" };
    return `<span class="pill pill-${set.visibility === "shared" ? "done" : set.visibility === "rejected" ? "not_started" : "in_progress"}">${labels[set.visibility] || set.visibility}</span>`;
  }

  async function loadMySets(container) {
    container.innerHTML = "Loading…";
    try {
      const data = await api("/api/question-sets/mine");
      container.innerHTML = "";
      if (!data.sets.length) {
        container.appendChild(el(`<p class="section-sub">You haven't uploaded any question sets yet.</p>`));
        return;
      }
      data.sets.forEach((s) => {
        const row = el(`
          <div class="weak-row" style="margin-bottom:8px;">
            <span class="weak-row-label">${escapeHtml(s.title)}${s.track ? ` <span class="section-sub">(${escapeHtml(s.track)})</span>` : ""}</span>
            ${renderSetStatusPill(s)}
          </div>
        `);
        if (s.visibility === "rejected" && s.rejected_reason) {
          row.appendChild(el(`<p class="section-sub" style="margin-top:-4px;">Reason: ${escapeHtml(s.rejected_reason)}</p>`));
        }
        container.appendChild(row);
      });
    } catch (err) {
      container.innerHTML = "";
      container.appendChild(el(`<p class="form-error">${escapeHtml(err.message)}</p>`));
    }
  }

  function addQuestionRow(sectionQuestionsEl) {
    const row = el(`
      <div class="upload-question-row">
        <input type="text" class="upload-q" placeholder="Question" />
        <input type="text" class="upload-a" placeholder="Model answer" />
        <button type="button" class="btn btn-ghost btn-small" title="Remove question">✕</button>
      </div>
    `);
    $("button", row).addEventListener("click", () => row.remove());
    sectionQuestionsEl.appendChild(row);
  }

  function addSectionBlock(sectionsEl) {
    const section = el(`
      <div class="upload-section">
        <div class="upload-section-head">
          <input type="text" class="upload-section-label" placeholder="Section title (e.g. Networking)" />
          <button type="button" class="btn btn-ghost btn-small" title="Remove section">✕ section</button>
        </div>
        <div class="upload-section-questions"></div>
        <button type="button" class="btn btn-ghost btn-small">+ Add question</button>
      </div>
    `);
    const questionsEl = $(".upload-section-questions", section);
    const buttons = $all("button", section);
    buttons[0].addEventListener("click", () => section.remove());
    buttons[1].addEventListener("click", () => addQuestionRow(questionsEl));
    addQuestionRow(questionsEl);
    sectionsEl.appendChild(section);
  }

  function buildNewSetForm() {
    const wrap = el(`
      <div>
        <label class="field">
          <span>Set title</span>
          <input type="text" id="new-set-title" placeholder="e.g. Cloud Architecture Deep Dive" />
        </label>
        <label class="field">
          <span>Track (optional)</span>
          <input type="text" id="new-set-track" placeholder="e.g. tech" />
        </label>
        <div id="new-set-sections"></div>
        <button type="button" class="btn btn-secondary btn-small" id="add-section-btn" style="margin-top:8px;">+ Add section</button>
        <p class="form-error" id="new-set-error" hidden style="margin-top:12px;"></p>
        <div class="q-actions" style="margin-top:14px;">
          <button type="button" class="btn btn-primary" id="submit-set-btn">Submit</button>
          <button type="button" class="btn btn-ghost" id="cancel-set-btn">Cancel</button>
        </div>
      </div>
    `);
    const sectionsEl = $("#new-set-sections", wrap);
    addSectionBlock(sectionsEl);
    $("#add-section-btn", wrap).addEventListener("click", () => addSectionBlock(sectionsEl));
    return wrap;
  }

  function wireQuestionSetsCard(view) {
    const listEl = $("#my-sets-list", view);
    loadMySets(listEl);

    const newSetBtn = $("#new-set-btn", view);
    const formWrap = $("#new-set-form-wrap", view);

    newSetBtn.addEventListener("click", () => {
      formWrap.innerHTML = "";
      formWrap.appendChild(buildNewSetForm());
      formWrap.hidden = false;
      newSetBtn.hidden = true;

      $("#cancel-set-btn", formWrap).addEventListener("click", () => {
        formWrap.hidden = true;
        newSetBtn.hidden = false;
      });

      $("#submit-set-btn", formWrap).addEventListener("click", async () => {
        const errBox = $("#new-set-error", formWrap);
        errBox.hidden = true;
        const title = $("#new-set-title", formWrap).value.trim();
        const track = $("#new-set-track", formWrap).value.trim();
        const sections = $all(".upload-section", formWrap).map((sectionEl) => ({
          label: $(".upload-section-label", sectionEl).value.trim(),
          questions: $all(".upload-question-row", sectionEl).map((row) => ({
            q: $(".upload-q", row).value.trim(),
            a: $(".upload-a", row).value.trim(),
          })).filter((q) => q.q || q.a),
        }));

        try {
          await api("/api/question-sets", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ title, track, sections }),
          });
          toast("Question set uploaded.");
          formWrap.hidden = true;
          newSetBtn.hidden = false;
          loadMySets(listEl);
        } catch (err) {
          errBox.textContent = err.message;
          errBox.hidden = false;
        }
      });
    });
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
    const main = $("#main");
    main.innerHTML = "";
    main.appendChild(el(`<div class="view"><div class="card empty-state"><p>Loading stats…</p></div></div>`));
    renderSidebar();

    let events = [];
    try {
      const data = await api("/api/activity?limit=2000");
      events = data.events || [];
    } catch (err) {
      toast(err.message);
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
        <div class="stat-tile"><div class="stat-tile-value">${(currentUser.streak && currentUser.streak.count) || 0}</div><div class="stat-tile-label">Current streak</div></div>
        <div class="stat-tile"><div class="stat-tile-value">${(currentUser.streak && currentUser.streak.longest) || 0}</div><div class="stat-tile-label">Longest streak</div></div>
        <div class="stat-tile"><div class="stat-tile-value">${events.length}</div><div class="stat-tile-label">Logged actions</div></div>
      </div>
    `));

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
      if (e.topic_id) {
        topicAgg[e.topic_id] = topicAgg[e.topic_id] || { total: 0, again: 0 };
        topicAgg[e.topic_id].total++;
        if (e.result === "again") topicAgg[e.topic_id].again++;
      }
      if (e.question_id) {
        const key = e.question_id;
        questionAgg[key] = questionAgg[key] || { total: 0, again: 0, text: e.question_text };
        questionAgg[key].total++;
        if (e.result === "again") questionAgg[key].again++;
      }
    });

    const weakTopics = Object.keys(topicAgg)
      .map((label) => ({ label, ...topicAgg[label], rate: topicAgg[label].again / topicAgg[label].total }))
      .filter((x) => x.total >= 2)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 5);

    const weakCard = el(`<div class="card"><div class="section-title" style="font-size:16px;">Weakest topics</div></div>`);
    if (weakTopics.length === 0) {
      weakCard.appendChild(el(`<p class="section-sub" style="margin-top:8px;">Not enough review history yet.</p>`));
    } else {
      const list = el(`<div class="weak-list"></div>`);
      weakTopics.forEach((t) => {
        list.appendChild(el(`
          <div class="weak-row">
            <span class="weak-row-label">${escapeHtml(t.label)}</span>
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
        list.appendChild(el(`
          <div class="weak-row">
            <span class="weak-row-label">${escapeHtml(q.text || q.qid)}</span>
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
    await renderHome();
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
