// Account, prep profile, AI provider (BYOK), password/sessions, question
// sets (upload + suggestions), and data export.
import { $, $all, el, escapeHtml, toastSuccess, toastError, toastWarning, formatDate, downloadBlob, api, state, renderShell, renderNav, renderAvatar, refreshBankStats } from "../app.js";

// Client-side resize keeps the uploaded picture small (well under the
// server's MAX_AVATAR_DATA_URL_LENGTH backstop) without needing any file
// storage — the data URL is stored directly in the users table.
function resizeImageToDataUrl(file, maxDim = 256, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that file."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("That doesn't look like a valid image."));
      img.onload = () => {
        const cropSize = Math.min(img.width, img.height);
        const sx = (img.width - cropSize) / 2;
        const sy = (img.height - cropSize) / 2;
        const outSize = Math.min(maxDim, cropSize);
        const canvas = document.createElement("canvas");
        canvas.width = outSize;
        canvas.height = outSize;
        canvas.getContext("2d").drawImage(img, sx, sy, cropSize, cropSize, 0, 0, outSize, outSize);
        resolve(canvas.toDataURL("image/jpeg", quality));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// Curated rather than the full ~400-zone IANA list — one representative
// city per major region/business hub, ordered west to east. Labels are
// hand-written (not derived from Intl's "short" timeZoneName) because
// that's not guaranteed to produce a recognizable abbreviation like "IST"
// consistently across engines — it often falls back to a raw GMT offset.
const TIMEZONE_OPTIONS = [
  { tz: "UTC", label: "UTC — Coordinated Universal Time" },
  { tz: "Pacific/Honolulu", label: "HST — Hawaii" },
  { tz: "America/Anchorage", label: "AKT — Alaska" },
  { tz: "America/Los_Angeles", label: "PT — Pacific Time (US & Canada)" },
  { tz: "America/Denver", label: "MT — Mountain Time (US & Canada)" },
  { tz: "America/Chicago", label: "CT — Central Time (US & Canada)" },
  { tz: "America/New_York", label: "ET — Eastern Time (US & Canada)" },
  { tz: "America/Sao_Paulo", label: "BRT — Brasília Time" },
  { tz: "Europe/London", label: "GMT/BST — United Kingdom" },
  { tz: "Europe/Paris", label: "CET — Central Europe" },
  { tz: "Europe/Athens", label: "EET — Eastern Europe" },
  { tz: "Europe/Moscow", label: "MSK — Moscow" },
  { tz: "Africa/Cairo", label: "EET — Egypt" },
  { tz: "Africa/Johannesburg", label: "SAST — South Africa" },
  { tz: "Asia/Dubai", label: "GST — UAE / Gulf" },
  { tz: "Asia/Karachi", label: "PKT — Pakistan" },
  { tz: "Asia/Kolkata", label: "IST — India" },
  { tz: "Asia/Dhaka", label: "BST — Bangladesh" },
  { tz: "Asia/Bangkok", label: "ICT — Thailand / Indochina" },
  { tz: "Asia/Shanghai", label: "CST — China" },
  { tz: "Asia/Singapore", label: "SGT — Singapore" },
  { tz: "Asia/Tokyo", label: "JST — Japan" },
  { tz: "Asia/Seoul", label: "KST — Korea" },
  { tz: "Australia/Perth", label: "AWST — Western Australia" },
  { tz: "Australia/Sydney", label: "AEST/AEDT — Eastern Australia" },
  { tz: "Pacific/Auckland", label: "NZST/NZDT — New Zealand" },
];

// IANA has legacy aliases for the same zone (e.g. Asia/Calcutta ==
// Asia/Kolkata) — a browser's auto-detected name and our curated list's
// name can differ as strings while meaning the same thing. Canonicalize
// both sides via Intl before comparing, so the friendly label still
// matches instead of falling back to a raw, redundant-looking option.
function canonicalTz(tz) {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return tz;
  }
}

function buildTimezoneOptionsHtml(currentTz) {
  const canonicalCurrent = canonicalTz(currentTz);
  const known = TIMEZONE_OPTIONS.some((o) => canonicalTz(o.tz) === canonicalCurrent);
  const options = known
    ? TIMEZONE_OPTIONS
    : [...TIMEZONE_OPTIONS, { tz: currentTz, label: `${currentTz} (current)` }];
  return options
    .map((o) => `<option value="${escapeHtml(o.tz)}" ${canonicalTz(o.tz) === canonicalCurrent ? "selected" : ""}>${escapeHtml(o.label)}</option>`)
    .join("");
}

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

      <div class="avatar-upload-row" style="margin-top:16px;">
        <span class="profile-avatar is-lg" id="avatar-preview"></span>
        <div class="avatar-upload-actions">
          <input type="file" id="avatar-file-input" accept="image/png,image/jpeg,image/webp" hidden />
          <button type="button" class="btn btn-ghost btn-small" id="avatar-upload-btn">Change picture</button>
          <button type="button" class="btn btn-ghost btn-small" id="avatar-remove-btn" ${currentUser.avatarData ? "" : "hidden"}>Remove</button>
        </div>
      </div>
      <p class="form-error" id="avatar-error" hidden></p>

      <label class="field">
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
      <p class="section-sub" style="margin-top:6px;">What you're preparing for, your background, and how many questions you want per day. The background fields are optional but help personalize your Stats coaching insight.</p>
      <label class="field" style="margin-top:16px;">
        <span>What are you preparing for?</span>
        <input type="text" id="settings-track" value="${escapeHtml(currentUser.track || "")}" placeholder="e.g. Engineering Management" />
      </label>
      <label class="field">
        <span>Current role (optional)</span>
        <input type="text" id="settings-headline" value="${escapeHtml(currentUser.headline || "")}" placeholder="e.g. Senior Backend Engineer" />
      </label>
      <label class="field">
        <span>Years of experience (optional)</span>
        <input type="number" id="settings-years" min="0" max="60" value="${currentUser.yearsExperience != null ? currentUser.yearsExperience : ""}" />
      </label>
      <label class="field">
        <span>Short bio (optional)</span>
        <textarea id="settings-bio" rows="3" placeholder="A sentence or two about your background and goals.">${escapeHtml(currentUser.bio || "")}</textarea>
      </label>
      <label class="field">
        <span>Timezone</span>
        <select id="settings-timezone">${buildTimezoneOptionsHtml(currentUser.timezone || "UTC")}</select>
        <small>Used so your daily quota, test, and AI usage reset at your own midnight, not UTC. Auto-detected at signup — change it if you're traveling.</small>
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
  view.appendChild(buildResumePromptCard());
  view.appendChild(buildSuggestionsCard());

  view.appendChild(el(`
    <div class="card">
      <div class="section-title">Export data</div>
      <p class="section-sub" style="margin-top:6px;">Download your progress as a JSON file.</p>
      <button class="btn btn-secondary" id="export-progress-btn" style="margin-top:12px;">Export my progress (JSON)</button>
    </div>
  `));

  main.appendChild(view);

  renderAvatar($("#avatar-preview", view), currentUser);

  $("#avatar-upload-btn", view).addEventListener("click", () => $("#avatar-file-input", view).click());

  $("#avatar-file-input", view).addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = "";
    if (!file) return;
    const errBox = $("#avatar-error", view);
    errBox.hidden = true;
    if (file.size > 8 * 1024 * 1024) {
      errBox.textContent = "That image is too large — please choose one under 8MB.";
      errBox.hidden = false;
      return;
    }
    try {
      const avatarData = await resizeImageToDataUrl(file);
      const data = await api("/api/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: state.currentUser.name, avatarData }),
      });
      state.currentUser = data.user;
      renderAvatar($("#avatar-preview", view), state.currentUser);
      renderShell();
      $("#avatar-remove-btn", view).hidden = false;
      toastSuccess("Profile picture updated.");
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
    }
  });

  $("#avatar-remove-btn", view).addEventListener("click", async () => {
    const errBox = $("#avatar-error", view);
    errBox.hidden = true;
    try {
      const data = await api("/api/account", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: state.currentUser.name, avatarData: null }),
      });
      state.currentUser = data.user;
      renderAvatar($("#avatar-preview", view), state.currentUser);
      renderShell();
      $("#avatar-remove-btn", view).hidden = true;
      toastSuccess("Profile picture removed.");
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
    }
  });

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
    const headline = $("#settings-headline", view).value.trim();
    const bio = $("#settings-bio", view).value.trim();
    const yearsInput = $("#settings-years", view).value.trim();
    const yearsExperience = yearsInput === "" ? null : parseInt(yearsInput, 10);
    const timezone = $("#settings-timezone", view).value.trim() || "UTC";
    try {
      const data = await api("/api/profile", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ track, dailyQuota, headline, bio, yearsExperience, timezone }),
      });
      state.currentUser = data.user;
      renderShell();
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
  wireResumePromptCard(view);
  wireSuggestionsCard(view);
  wireAiProviderCard(view);
  renderNav();
}

// ---------- AI provider (BYOK) ----------
const AI_PROVIDER_LABELS = { "workers-ai": "Workers AI (free, default)", openai: "OpenAI", anthropic: "Anthropic" };

// Must match the server-side allowlist (WORKERS_AI_MODELS in src/worker.js)
// — a request naming a model outside this list falls back to the default
// there regardless, but keeping the two in sync avoids a confusing mismatch
// between what's shown here and what's actually used.
const WORKERS_AI_MODEL_OPTIONS = [
  { id: "@cf/meta/llama-3.1-8b-instruct-fp8", label: "Llama 3.1 8B (default)" },
  { id: "@cf/meta/llama-3.2-3b-instruct", label: "Llama 3.2 3B (smaller, faster)" },
  { id: "@cf/mistral/mistral-7b-instruct-v0.2-lora", label: "Mistral 7B" },
  { id: "@cf/google/gemma-2b-it-lora", label: "Gemma 2B (fastest)" },
  { id: "@cf/zai-org/glm-4.7-flash", label: "GLM 4.7 Flash" },
  { id: "@cf/meta/llama-3.3-70b-instruct-fp8-fast", label: "Llama 3.3 70B (higher quality, costs more of your daily cap)" },
];

function buildAiProviderCard() {
  const currentUser = state.currentUser;
  const provider = currentUser.aiProvider || "workers-ai";
  const modelOptionsHtml = WORKERS_AI_MODEL_OPTIONS.map(
    (m) => `<option value="${escapeHtml(m.id)}" ${m.id === currentUser.workersAiModel ? "selected" : ""}>${escapeHtml(m.label)}</option>`,
  ).join("");
  return el(`
    <div class="card">
      <div class="section-title">AI provider</div>
      <p class="section-sub" style="margin-top:6px;">Used to generate the daily multiple-choice test and your Stats coaching insight. Defaults to our built-in AI (shared, capped per day) — set your own key for unlimited use.</p>
      <p class="section-sub" style="margin-top:10px;">Currently using: <strong>${escapeHtml(AI_PROVIDER_LABELS[provider] || provider)}</strong>${currentUser.hasAiKey ? " (your key)" : ""}</p>
      <p class="section-sub" id="ai-usage-line" style="margin-top:4px;">Checking today's AI usage…</p>
      <label class="field" style="margin-top:14px;">
        <span>Provider</span>
        <select id="ai-provider-select">
          <option value="workers-ai" ${provider === "workers-ai" ? "selected" : ""}>Workers AI (free, default)</option>
          <option value="openai" ${provider === "openai" ? "selected" : ""}>OpenAI</option>
          <option value="anthropic" ${provider === "anthropic" ? "selected" : ""}>Anthropic</option>
        </select>
      </label>
      <label class="field" id="workers-ai-model-field" ${provider === "workers-ai" ? "" : "hidden"}>
        <span>Workers AI model</span>
        <select id="workers-ai-model-select">${modelOptionsHtml}</select>
        <small>If generation seems to be failing (falling back to generic distractors/insights), try a different model here.</small>
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

async function loadAiUsage(view) {
  const line = $("#ai-usage-line", view);
  if (!line) return;
  try {
    const data = await api("/api/ai-usage");
    line.textContent = data.unlimited
      ? "Today's usage: unlimited (using your own key)."
      : `Today's shared AI usage: ${data.used}/${data.cap} generations.`;
  } catch {
    line.textContent = "";
  }
}

function wireAiProviderCard(view) {
  const select = $("#ai-provider-select", view);
  const keyField = $("#ai-key-field", view);
  const modelField = $("#workers-ai-model-field", view);
  select.addEventListener("change", () => {
    keyField.hidden = select.value === "workers-ai";
    modelField.hidden = select.value !== "workers-ai";
  });
  loadAiUsage(view);

  $("#save-ai-btn", view).addEventListener("click", async () => {
    const errBox = $("#ai-error", view);
    const okBox = $("#ai-success", view);
    errBox.hidden = true;
    okBox.hidden = true;
    const aiProvider = select.value;
    const keyInput = $("#ai-api-key", view);
    const body = { aiProvider, workersAiModel: $("#workers-ai-model-select", view).value };
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
    toastSuccess("Progress exported.");
  } catch (err) {
    toastError(err.message);
  }
}

// ---------- Question set upload (structured: title + ordered sections + ordered questions) ----------
function buildQuestionSetsCard() {
  return el(`
    <div class="card">
      <div class="section-title">My question sets</div>
      <p class="section-sub" style="margin-top:6px;">Upload your own set of questions, grouped into sections. New sets start private to you; sharing them with other users needs admin approval.</p>
      <div id="my-sets-list" style="margin-top:14px;"></div>
      <div class="q-actions" style="margin-top:14px;">
        <button class="btn btn-secondary" id="new-set-btn">Upload a question set</button>
        <button class="btn btn-secondary" id="import-csv-btn">Import from CSV</button>
        <button class="btn btn-ghost" id="csv-template-btn">Download CSV template</button>
      </div>
      <input type="file" id="csv-file-input" accept=".csv,text/csv" hidden />
      <div id="new-set-form-wrap" hidden style="margin-top:16px;"></div>
    </div>
  `);
}

// ---------- CSV import ----------
// Expects a header row with section,question,answer columns (any order,
// case-insensitive); everything downstream reuses the same
// {title, track, sections:[{label, questions:[{q,a}]}]} shape the manual
// upload form builds, so it goes through the same POST /api/question-sets.
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++; } else { inQuotes = false; }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(field); field = "";
    } else if (c === "\n") {
      row.push(field); rows.push(row); row = []; field = "";
    } else if (c !== "\r") {
      field += c;
    }
  }
  if (field.length || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

function csvRowsToSections(rows) {
  if (rows.length === 0) return { error: "The CSV file is empty." };
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const secIdx = header.indexOf("section");
  const qIdx = header.indexOf("question");
  const aIdx = header.indexOf("answer");
  if (secIdx === -1 || qIdx === -1 || aIdx === -1) {
    return { error: 'The first row must be a header with "section", "question", and "answer" columns.' };
  }
  const sectionsMap = new Map();
  let skipped = 0;
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    const label = (r[secIdx] || "").trim();
    const q = (r[qIdx] || "").trim();
    const a = (r[aIdx] || "").trim();
    if (!label || !q || !a) { skipped++; continue; }
    if (!sectionsMap.has(label)) sectionsMap.set(label, []);
    sectionsMap.get(label).push({ q, a });
  }
  const sections = Array.from(sectionsMap.entries()).map(([label, questions]) => ({ label, questions }));
  if (sections.length === 0) return { error: "No complete section/question/answer rows found." };
  return { sections, skipped };
}

function downloadCsvTemplate() {
  const csv = [
    "section,question,answer",
    '"Behavioral","Tell me about a time you disagreed with a teammate.","Frame it as a structured disagreement with a resolution, not a conflict story."',
    '"Behavioral","Tell me about a project that failed.","Own the failure briefly, then focus on what changed afterward."',
    '"System Design","How would you design a URL shortener?","Cover the hashing scheme, storage, and read/write scaling trade-offs."',
  ].join("\n");
  downloadBlob("question-set-template.csv", csv, "text/csv");
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
          toastSuccess("Submitted for review.");
          loadMySets(container);
        } catch (err) {
          toastError(err.message);
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

function buildCsvPreviewForm(sections, skipped, defaultTitle) {
  const questionCount = sections.reduce((n, s) => n + s.questions.length, 0);
  const wrap = el(`
    <div>
      <p class="section-sub">Found ${sections.length} section${sections.length === 1 ? "" : "s"}, ${questionCount} question${questionCount === 1 ? "" : "s"}${skipped ? ` (${skipped} incomplete row${skipped === 1 ? "" : "s"} skipped)` : ""}.</p>
      <label class="field" style="margin-top:10px;">
        <span>Set title</span>
        <input type="text" id="csv-set-title" value="${escapeHtml(defaultTitle)}" />
      </label>
      <label class="field">
        <span>Track (optional)</span>
        <input type="text" id="csv-set-track" placeholder="e.g. tech" />
      </label>
      <p class="form-error" id="csv-set-error" hidden></p>
      <div class="q-actions" style="margin-top:10px;">
        <button type="button" class="btn btn-primary" id="csv-submit-btn">Import</button>
        <button type="button" class="btn btn-ghost" id="csv-cancel-btn">Cancel</button>
      </div>
    </div>
  `);
  return wrap;
}

function wireQuestionSetsCard(view) {
  const listEl = $("#my-sets-list", view);
  loadMySets(listEl);

  const newSetBtn = $("#new-set-btn", view);
  const importCsvBtn = $("#import-csv-btn", view);
  const csvFileInput = $("#csv-file-input", view);
  const csvTemplateBtn = $("#csv-template-btn", view);
  const formWrap = $("#new-set-form-wrap", view);

  csvTemplateBtn.addEventListener("click", downloadCsvTemplate);
  importCsvBtn.addEventListener("click", () => csvFileInput.click());

  csvFileInput.addEventListener("change", async () => {
    const file = csvFileInput.files[0];
    csvFileInput.value = "";
    if (!file) return;
    const text = await file.text();
    const { sections, error, skipped } = csvRowsToSections(parseCsv(text));
    if (error) { toastError(error); return; }

    const defaultTitle = file.name.replace(/\.csv$/i, "");
    formWrap.innerHTML = "";
    formWrap.appendChild(buildCsvPreviewForm(sections, skipped, defaultTitle));
    formWrap.hidden = false;
    newSetBtn.hidden = true;
    importCsvBtn.hidden = true;

    $("#csv-cancel-btn", formWrap).addEventListener("click", () => {
      formWrap.hidden = true;
      newSetBtn.hidden = false;
      importCsvBtn.hidden = false;
    });

    $("#csv-submit-btn", formWrap).addEventListener("click", async () => {
      const errBox = $("#csv-set-error", formWrap);
      errBox.hidden = true;
      const title = $("#csv-set-title", formWrap).value.trim();
      const track = $("#csv-set-track", formWrap).value.trim();
      try {
        await api("/api/question-sets", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ title, track, sections }),
        });
        toastSuccess("Question set imported.");
        formWrap.hidden = true;
        newSetBtn.hidden = false;
        importCsvBtn.hidden = false;
        loadMySets(listEl);
        refreshBankStats();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      }
    });
  });

  newSetBtn.addEventListener("click", () => {
    formWrap.innerHTML = "";
    formWrap.appendChild(buildNewSetForm());
    formWrap.hidden = false;
    newSetBtn.hidden = true;
    importCsvBtn.hidden = true;

    $("#cancel-set-btn", formWrap).addEventListener("click", () => {
      formWrap.hidden = true;
      newSetBtn.hidden = false;
      importCsvBtn.hidden = false;
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
        toastSuccess("Question set uploaded.");
        formWrap.hidden = true;
        newSetBtn.hidden = false;
        importCsvBtn.hidden = false;
        loadMySets(listEl);
        refreshBankStats();
      } catch (err) {
        errBox.textContent = err.message;
        errBox.hidden = false;
      }
    });
  });
}

// ---------- Resume-tailored question prompt (prompt-assist, no AI call from this app) ----------
// Everything here is client-side only — no resume text is ever sent to
// our server. It builds a prompt the user pastes into their own ChatGPT/
// Claude, then imports the CSV reply via the existing "Import from CSV"
// flow above (parseCsv/csvRowsToSections), so the prompt's requested
// output format must match that parser exactly.
const DEFAULT_RESUME_CATEGORIES = [
  "HR & Behavioral",
  "Delivery & Program Management",
  "People Management",
  "Technical Architecture",
  "AI Automation & Product",
];

function buildResumePromptCard() {
  const currentUser = state.currentUser;
  const defaultRole = currentUser.track || currentUser.headline || "";
  return el(`
    <div class="card">
      <div class="section-title">Generate questions from your resume</div>
      <p class="section-sub" style="margin-top:6px;">Paste your resume and target role to get a ready-to-use prompt for ChatGPT or Claude — it'll reply with categorized interview questions and detailed model answers you can import right below.</p>
      <label class="field" style="margin-top:14px;">
        <span>Resume text</span>
        <textarea id="resume-text" rows="16" maxlength="24000" placeholder="Paste your resume text here (copy it out of your PDF or Word document)."></textarea>
        <small>Sent to generate a target-role suggestion and the tailored prompt below (never stored) — pasting that prompt into ChatGPT/Claude then sends it there under your own account, not through this app.</small>
      </label>
      <label class="field">
        <span>Target role</span>
        <div class="q-actions" style="margin-top:0;">
          <input type="text" id="resume-target-role" value="${escapeHtml(defaultRole)}" placeholder="e.g. Engineering Manager" style="flex:1;min-width:160px;" />
          <button type="button" class="btn btn-secondary btn-small" id="resume-suggest-role-btn">Suggest from resume</button>
        </div>
        <small>AI-suggested from your resume if you use the button — always editable, so you can type a different target role instead.</small>
        <p class="form-error" id="resume-role-error" hidden></p>
      </label>
      <div class="field">
        <span>Categories</span>
        <div id="resume-categories-list" class="resume-categories"></div>
        <div class="q-actions" style="margin-top:8px;">
          <input type="text" id="resume-new-category" class="resume-category-input" placeholder="Add a custom category" />
          <button type="button" class="btn btn-ghost btn-small" id="resume-add-category-btn">+ Add category</button>
        </div>
      </div>
      <label class="field">
        <span>Questions per category</span>
        <input type="number" id="resume-per-category" min="3" max="20" value="10" />
      </label>
      <button class="btn btn-primary" id="resume-generate-btn">Generate prompt</button>
      <div id="resume-prompt-output" hidden style="margin-top:16px;">
        <label class="field">
          <span>Copy this into ChatGPT or Claude</span>
          <textarea id="resume-prompt-text" rows="10" readonly></textarea>
        </label>
        <div class="q-actions">
          <button type="button" class="btn btn-secondary" id="resume-copy-btn">Copy prompt</button>
        </div>
        <ol class="section-sub" style="margin-top:12px;padding-left:18px;line-height:1.7;">
          <li>Copy the prompt above.</li>
          <li>Paste it into ChatGPT or Claude (your own account).</li>
          <li>Save its reply as a .csv file (paste into a plain text editor and save with a .csv extension, or paste into a spreadsheet and export as CSV).</li>
          <li>Use "Import from CSV" above to bring the questions in.</li>
        </ol>
      </div>
    </div>
  `);
}

function addResumeCategoryCheckbox(container, label, checked) {
  const row = el(`
    <label class="resume-category-item">
      <input type="checkbox" value="${escapeHtml(label)}" ${checked ? "checked" : ""} />
      <span>${escapeHtml(label)}</span>
    </label>
  `);
  container.appendChild(row);
}

function buildResumePrompt({ resumeText, targetRole, categories, perCategory }) {
  const categoryList = categories.join(", ");
  return `You are an expert interview coach. Based on the resume and target role below, generate senior-level interview questions with detailed, specific model answers tailored to this person's background and the role they're targeting.

Target role: ${targetRole}

Resume:
"""
${resumeText}
"""

Generate exactly ${perCategory} questions for EACH of these categories: ${categoryList}.

Output ONLY a CSV — no commentary, no markdown code fences, nothing before or after it. Use exactly this header row:
section,question,answer

Rules:
- "section" must be exactly one of: ${categoryList}.
- Each answer must be a detailed, senior-level model answer (3-6 sentences) that references relevant, specific aspects of the resume and target role — not generic advice.
- If a field contains a comma, wrap the whole field in double quotes. If a field contains a double quote, escape it by doubling it ("").
- Do not add row numbers, extra columns, or blank lines.`;
}

function wireResumePromptCard(view) {
  const categoriesList = $("#resume-categories-list", view);
  DEFAULT_RESUME_CATEGORIES.forEach((c) => addResumeCategoryCheckbox(categoriesList, c, true));

  $("#resume-add-category-btn", view).addEventListener("click", () => {
    const input = $("#resume-new-category", view);
    const value = input.value.trim();
    if (!value) return;
    addResumeCategoryCheckbox(categoriesList, value, true);
    input.value = "";
  });

  $("#resume-suggest-role-btn", view).addEventListener("click", async () => {
    const btn = $("#resume-suggest-role-btn", view);
    const errBox = $("#resume-role-error", view);
    errBox.hidden = true;
    const resumeText = $("#resume-text", view).value.trim();
    if (!resumeText) { toastWarning("Paste your resume text first."); return; }

    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = "Thinking…";
    try {
      const data = await api("/api/resume/suggest-role", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resumeText }),
      });
      $("#resume-target-role", view).value = data.role;
      toastSuccess("Suggested a target role from your resume — edit it if you'd like something else.");
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });

  $("#resume-generate-btn", view).addEventListener("click", async () => {
    const btn = $("#resume-generate-btn", view);
    const resumeText = $("#resume-text", view).value.trim();
    const targetRole = $("#resume-target-role", view).value.trim();
    const perCategory = parseInt($("#resume-per-category", view).value, 10) || 10;
    const categories = $all("#resume-categories-list input[type=checkbox]:checked", view).map((cb) => cb.value);

    if (!resumeText) { toastWarning("Paste your resume text first."); return; }
    if (!targetRole) { toastWarning("Enter a target role."); return; }
    if (categories.length === 0) { toastWarning("Pick at least one category."); return; }

    btn.disabled = true;
    const originalLabel = btn.textContent;
    btn.textContent = "Generating…";
    try {
      const data = await api("/api/resume/generate-prompt", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resumeText, targetRole, categories, perCategory }),
      });
      $("#resume-prompt-text", view).value = data.prompt;
      $("#resume-prompt-output", view).hidden = false;
    } catch (err) {
      // Whatever went wrong (quota exhausted, the AI call itself failing),
      // fall back to the local, deterministic template rather than leaving
      // the user stuck — this was the entire previous behavior anyway, so
      // it's strictly an upgrade, never a regression.
      const prompt = buildResumePrompt({ resumeText, targetRole, categories, perCategory });
      $("#resume-prompt-text", view).value = prompt;
      $("#resume-prompt-output", view).hidden = false;
      const reason = err.data && err.data.limited ? "Today's free AI allowance is used up" : "Couldn't reach the AI right now";
      toastWarning(`${reason} — used the standard prompt template instead.`);
    } finally {
      btn.disabled = false;
      btn.textContent = originalLabel;
    }
  });

  $("#resume-copy-btn", view).addEventListener("click", async () => {
    const textarea = $("#resume-prompt-text", view);
    try {
      await navigator.clipboard.writeText(textarea.value);
      toastSuccess("Prompt copied to clipboard.");
    } catch {
      textarea.select();
      toastWarning("Couldn't access the clipboard — the text is selected, press Ctrl/Cmd+C to copy.");
    }
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
          toastSuccess("Subscribed — it'll start showing up in your daily queue.");
          loadSuggestions(container);
          refreshBankStats();
        } catch (err) {
          toastError(err.message);
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
