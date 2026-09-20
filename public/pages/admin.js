// Question-set approval queue + review history — only reachable/visible
// for role='admin'.
import { $, $all, el, escapeHtml, toast, api, state, renderNav } from "../app.js";

// Cache fetched question lists per set within this page load so toggling
// a review panel open/closed repeatedly doesn't re-fetch every time.
const questionsCache = new Map();

export async function render() {
  state.currentView = "admin";
  const main = $("#main");
  main.innerHTML = "";
  main.appendChild(el(`<div class="view"><div class="card empty-state"><p>Loading…</p></div></div>`));
  renderNav();

  let sets = [];
  let history = [];
  const [pendingResult, historyResult] = await Promise.allSettled([
    api("/api/admin/pending-sets"),
    api("/api/admin/approval-history"),
  ]);
  if (pendingResult.status === "fulfilled") sets = pendingResult.value.sets || [];
  else toast(pendingResult.reason.message);
  if (historyResult.status === "fulfilled") history = historyResult.value.history || [];
  else toast(historyResult.reason.message);

  paint(sets, history);
}

function buildQuestionReviewPanel(setId) {
  const panel = el(`<div class="admin-review-panel" hidden></div>`);
  panel.appendChild(el(`<p class="section-sub">Loading questions…</p>`));
  return panel;
}

async function loadQuestionsInto(panel, setId) {
  panel.innerHTML = "";
  try {
    let questions = questionsCache.get(setId);
    if (!questions) {
      const data = await api(`/api/admin/question-sets/${setId}/questions`);
      questions = data.questions || [];
      questionsCache.set(setId, questions);
    }
    if (questions.length === 0) {
      panel.appendChild(el(`<p class="section-sub">No questions in this set.</p>`));
      return;
    }
    questions.forEach((q, idx) => {
      panel.appendChild(el(`
        <div class="q-card" style="margin-top:10px;">
          <div class="q-topic-tag">${escapeHtml(q.topic_label || "")}</div>
          <div class="q-index" style="margin-top:4px;">Q${idx + 1}</div>
          <div class="q-text">${escapeHtml(q.q)}</div>
          <p class="section-sub" style="margin-top:8px;">${escapeHtml(q.a)}</p>
        </div>
      `));
    });
  } catch (err) {
    panel.appendChild(el(`<p class="form-error">${escapeHtml(err.message)}</p>`));
  }
}

function paint(sets, history) {
  const main = $("#main");
  main.innerHTML = "";
  const view = el(`<div class="view"></div>`);

  view.appendChild(el(`
    <div class="card">
      <div class="section-title">Pending question sets</div>
      <p class="section-sub" style="margin-top:6px;">Review sets submitted for sharing. Approved sets become suggestions for every user.</p>
    </div>
  `));

  if (sets.length === 0) {
    view.appendChild(el(`<div class="card empty-state"><p>Nothing pending review.</p></div>`));
  } else {
    sets.forEach((s) => {
      const card = el(`
        <div class="card">
          <div class="section-title" style="font-size:16px;">${escapeHtml(s.title)}</div>
          <p class="section-sub" style="margin-top:4px;">${s.question_count} question${s.question_count === 1 ? "" : "s"}${s.track ? ` · ${escapeHtml(s.track)}` : ""} · by ${escapeHtml(s.owner_name || "unknown")} (${escapeHtml(s.owner_email || "")})</p>
          <div class="q-actions" style="margin-top:12px;">
            <button class="btn btn-ghost btn-small" data-review="${s.id}">Review questions</button>
            <button class="btn btn-success btn-small" data-approve="${s.id}">Approve</button>
            <button class="btn btn-warn btn-small" data-reject="${s.id}">Reject</button>
          </div>
        </div>
      `);
      const panel = buildQuestionReviewPanel(s.id);
      card.appendChild(panel);
      view.appendChild(card);
    });
  }

  view.appendChild(el(`
    <div class="card">
      <div class="section-title" style="font-size:16px;">Review history</div>
      <p class="section-sub" style="margin-top:4px;">Past decisions — who approved or rejected each set, and how many questions it had.</p>
    </div>
  `));

  if (history.length === 0) {
    view.appendChild(el(`<div class="card empty-state"><p>No decisions made yet.</p></div>`));
  } else {
    history.forEach((h) => {
      const isApproved = h.visibility === "shared";
      const statusPill = isApproved
        ? `<span class="pill pill-done">Approved</span>`
        : `<span class="pill pill-rejected">Rejected</span>`;
      const actedAt = isApproved ? h.approved_at : h.rejected_at;
      const actorLabel = h.actor_name
        ? `${escapeHtml(h.actor_name)} (${escapeHtml(h.actor_email || "")})`
        : "unknown";
      const card = el(`
        <div class="card">
          <div class="q-card-head">
            <div>
              <div class="q-text" style="margin-bottom:2px;">${escapeHtml(h.title)}</div>
              <p class="section-sub">${h.question_count} question${h.question_count === 1 ? "" : "s"}${h.track ? ` · ${escapeHtml(h.track)}` : ""} · submitted by ${escapeHtml(h.owner_name || "unknown")} (${escapeHtml(h.owner_email || "")})</p>
            </div>
            ${statusPill}
          </div>
          <p class="section-sub">${isApproved ? "Approved" : "Rejected"} by ${actorLabel}${actedAt ? ` · ${new Date(actedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}` : ""}</p>
          ${!isApproved && h.rejected_reason ? `<p class="section-sub" style="margin-top:4px;">Reason: ${escapeHtml(h.rejected_reason)}</p>` : ""}
          <div class="q-actions" style="margin-top:10px;">
            <button class="btn btn-ghost btn-small" data-review="${h.id}">Review questions</button>
          </div>
        </div>
      `);
      const panel = buildQuestionReviewPanel(h.id);
      card.appendChild(panel);
      view.appendChild(card);
    });
  }

  main.appendChild(view);

  $all("[data-review]", view).forEach((btn) => {
    btn.addEventListener("click", async () => {
      const panel = btn.closest(".card").querySelector(".admin-review-panel");
      const opening = panel.hidden;
      panel.hidden = !opening;
      btn.textContent = opening ? "Hide questions" : "Review questions";
      if (opening) await loadQuestionsInto(panel, btn.dataset.review);
    });
  });
  $all("[data-approve]", view).forEach((btn) => btn.addEventListener("click", () => approveSet(btn.dataset.approve)));
  $all("[data-reject]", view).forEach((btn) => btn.addEventListener("click", () => rejectSet(btn.dataset.reject)));
  renderNav();
}

async function approveSet(id) {
  try {
    await api(`/api/admin/question-sets/${id}/approve`, { method: "POST" });
    toast("Approved — now shows up as a suggestion for other users.");
    render();
  } catch (err) {
    toast(err.message);
  }
}

async function rejectSet(id) {
  const reason = prompt("Reason for rejecting this set (shown to the owner):") || "";
  try {
    await api(`/api/admin/question-sets/${id}/reject`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    toast("Rejected.");
    render();
  } catch (err) {
    toast(err.message);
  }
}
