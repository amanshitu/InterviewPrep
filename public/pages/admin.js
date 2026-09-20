// Question-set approval queue — only reachable/visible for role='admin'.
import { $, $all, el, escapeHtml, toast, api, state, renderSidebar } from "../app.js";

export async function render() {
  state.currentView = "admin";
  const main = $("#main");
  main.innerHTML = "";
  main.appendChild(el(`<div class="view"><div class="card empty-state"><p>Loading pending sets…</p></div></div>`));
  renderSidebar();

  let sets = [];
  try {
    const data = await api("/api/admin/pending-sets");
    sets = data.sets || [];
  } catch (err) {
    toast(err.message);
  }
  paint(sets);
}

function paint(sets) {
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
      view.appendChild(el(`
        <div class="card">
          <div class="section-title" style="font-size:16px;">${escapeHtml(s.title)}</div>
          <p class="section-sub" style="margin-top:4px;">${s.question_count} question${s.question_count === 1 ? "" : "s"}${s.track ? ` · ${escapeHtml(s.track)}` : ""} · by ${escapeHtml(s.owner_name || "unknown")} (${escapeHtml(s.owner_email || "")})</p>
          <div class="q-actions" style="margin-top:12px;">
            <button class="btn btn-success btn-small" data-approve="${s.id}">Approve</button>
            <button class="btn btn-warn btn-small" data-reject="${s.id}">Reject</button>
          </div>
        </div>
      `));
    });
  }

  main.appendChild(view);
  $all("[data-approve]", view).forEach((btn) => btn.addEventListener("click", () => approveSet(btn.dataset.approve)));
  $all("[data-reject]", view).forEach((btn) => btn.addEventListener("click", () => rejectSet(btn.dataset.reject)));
  renderSidebar();
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
