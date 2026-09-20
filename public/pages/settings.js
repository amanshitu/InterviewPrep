// Account, prep profile, AI provider (BYOK), password/sessions, question
// sets (upload + suggestions), and data export.
import { $, $all, el, escapeHtml, toast, formatDate, downloadBlob, api, state, renderShell, renderSidebar } from "../app.js";

export function render() {
  state.currentView = "settings";
  const currentUser = state.currentUser;
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

  view.appendChild(buildAiProviderCard());

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
  view.appendChild(buildSuggestionsCard());

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
      state.currentUser = data.user;
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
      state.currentUser = data.user;
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
  wireSuggestionsCard(view);
  wireAiProviderCard(view);
  renderSidebar();
}

// ---------- AI provider (BYOK) ----------
const AI_PROVIDER_LABELS = { "workers-ai": "Workers AI (free, default)", openai: "OpenAI", anthropic: "Anthropic" };

function buildAiProviderCard() {
  const currentUser = state.currentUser;
  const provider = currentUser.aiProvider || "workers-ai";
  return el(`
    <div class="card">
      <div class="section-title">AI provider</div>
      <p class="section-sub" style="margin-top:6px;">Used to generate the daily multiple-choice test. Defaults to Cloudflare's free Workers AI — set your own key to use a different provider instead.</p>
      <p class="section-sub" style="margin-top:10px;">Currently using: <strong>${escapeHtml(AI_PROVIDER_LABELS[provider] || provider)}</strong>${currentUser.hasAiKey ? " (your key)" : ""}</p>
      <label class="field" style="margin-top:14px;">
        <span>Provider</span>
        <select id="ai-provider-select">
          <option value="workers-ai" ${provider === "workers-ai" ? "selected" : ""}>Workers AI (free, default)</option>
          <option value="openai" ${provider === "openai" ? "selected" : ""}>OpenAI</option>
          <option value="anthropic" ${provider === "anthropic" ? "selected" : ""}>Anthropic</option>
        </select>
      </label>
      <label class="field" id="ai-key-field" ${provider === "workers-ai" ? "hidden" : ""}>
        <span>API key</span>
        <input type="password" id="ai-api-key" placeholder="${currentUser.hasAiKey ? "Already set — enter a new key to replace it" : "sk-..."}" autocomplete="off" />
      </label>
      <p class="form-error" id="ai-error" hidden></p>
      <p class="form-note" id="ai-success" hidden></p>
      <button class="btn btn-primary" id="save-ai-btn">Save AI provider</button>
    </div>
  `);
}

function wireAiProviderCard(view) {
  const select = $("#ai-provider-select", view);
  const keyField = $("#ai-key-field", view);
  select.addEventListener("change", () => {
    keyField.hidden = select.value === "workers-ai";
  });

  $("#save-ai-btn", view).addEventListener("click", async () => {
    const errBox = $("#ai-error", view);
    const okBox = $("#ai-success", view);
    errBox.hidden = true;
    okBox.hidden = true;
    const aiProvider = select.value;
    const keyInput = $("#ai-api-key", view);
    const body = { aiProvider };
    if (aiProvider === "workers-ai") {
      body.aiApiKey = "";
    } else if (keyInput.value.trim()) {
      body.aiApiKey = keyInput.value.trim();
    }
    try {
      const data = await api("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      state.currentUser = data.user;
      okBox.textContent = "Saved.";
      okBox.hidden = false;
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
    }
  });
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
  return el(`
    <div class="card">
      <div class="section-title">My question sets</div>
      <p class="section-sub" style="margin-top:6px;">Upload your own set of questions, grouped into sections. New sets start private to you; sharing them with other users needs admin approval.</p>
      <div id="my-sets-list" style="margin-top:14px;"></div>
      <button class="btn btn-secondary" id="new-set-btn" style="margin-top:14px;">Upload a question set</button>
      <div id="new-set-form-wrap" hidden style="margin-top:16px;"></div>
    </div>
  `);
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
          ${s.visibility === "private" || s.visibility === "rejected"
            ? `<button class="btn btn-ghost btn-small" data-submit-review="${s.id}">Submit for review</button>`
            : ""}
        </div>
      `);
      if (s.visibility === "rejected" && s.rejected_reason) {
        row.appendChild(el(`<p class="section-sub" style="margin-top:-4px;">Reason: ${escapeHtml(s.rejected_reason)}</p>`));
      }
      container.appendChild(row);
    });
    $all("[data-submit-review]", container).forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await api(`/api/question-sets/${btn.dataset.submitReview}/submit`, { method: "POST" });
          toast("Submitted for review.");
          loadMySets(container);
        } catch (err) {
          toast(err.message);
        }
      });
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

// ---------- Suggested sets (shared, community-approved) ----------
function buildSuggestionsCard() {
  return el(`
    <div class="card">
      <div class="section-title">Suggested sets</div>
      <p class="section-sub" style="margin-top:6px;">Question sets other users have shared, approved by an admin. Subscribing adds them to your daily rotation.</p>
      <div id="suggestions-list" style="margin-top:14px;"></div>
    </div>
  `);
}

async function loadSuggestions(container) {
  container.innerHTML = "Loading…";
  try {
    const data = await api("/api/question-sets/suggestions");
    container.innerHTML = "";
    if (!data.sets.length) {
      container.appendChild(el(`<p class="section-sub">No shared sets available to subscribe to right now.</p>`));
      return;
    }
    data.sets.forEach((s) => {
      const row = el(`
        <div class="weak-row" style="margin-bottom:8px;">
          <span class="weak-row-label">${escapeHtml(s.title)}${s.track ? ` <span class="section-sub">(${escapeHtml(s.track)})</span>` : ""}</span>
          <span class="section-sub">by ${escapeHtml(s.owner_name || "someone")}</span>
          <button class="btn btn-secondary btn-small" data-subscribe="${s.id}">Subscribe</button>
        </div>
      `);
      container.appendChild(row);
    });
    $all("[data-subscribe]", container).forEach((btn) => {
      btn.addEventListener("click", async () => {
        try {
          await api(`/api/question-sets/${btn.dataset.subscribe}/subscribe`, { method: "POST" });
          toast("Subscribed — it'll start showing up in your daily queue.");
          loadSuggestions(container);
        } catch (err) {
          toast(err.message);
        }
      });
    });
  } catch (err) {
    container.innerHTML = "";
    container.appendChild(el(`<p class="form-error">${escapeHtml(err.message)}</p>`));
  }
}

function wireSuggestionsCard(view) {
  loadSuggestions($("#suggestions-list", view));
}
