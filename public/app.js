// Core module: shared utilities, auth screen, shell/nav, and routing.
// Loaded eagerly (it's small); each page under pages/ is a separate ES
// module loaded on demand via dynamic import() the first time its route
// is visited, so the initial payload doesn't include every view's code.
"use strict";

// ---------- shared mutable state ----------
// Plain exported object rather than bare `let` exports, since ES module
// bindings for primitives can't be reassigned from outside the module —
// pages read/write state.currentUser etc. directly.
export const state = {
  currentUser: null,
  currentView: "home",
  todayQueue: null, // { date, target, completed, remaining, questions } from /api/queue/today
  bankStats: null, // { yours, total } from /api/questions/bank-count
};

// ---------- utils ----------
export function $(sel, root = document) { return root.querySelector(sel); }
export function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
export function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
// type is one of "info" (default, neutral), "success", "error", "warning" —
// styled via .toast-{type} in styles.css. Plain toast(msg) still works
// exactly as before for anywhere that doesn't care about styling.
export function toast(msg, type = "info") {
  const node = $("#toast");
  node.textContent = msg;
  node.className = `toast toast-${type}`;
  node.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (node.hidden = true), 2600);
}
export function toastSuccess(msg) { toast(msg, "success"); }
export function toastError(msg) { toast(msg, "error"); }
export function toastWarning(msg) { toast(msg, "warning"); }
export function formatDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}
export function downloadBlob(filename, content, mime) {
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
export async function api(path, opts) {
  const res = await fetch(path, opts);
  let data = {};
  try { data = await res.json(); } catch { /* no body */ }
  if (!res.ok) throw Object.assign(new Error(data.error || "Request failed."), { status: res.status, data });
  return data;
}

// ---------- routing ----------
// Each route lazy-loads its page module (cached by the browser after the
// first visit) and calls its exported render(param). navigate() is for
// user-initiated navigation (pushes a history entry); dispatchRoute() is
// for popstate and the initial load, which must NOT push a new entry.
const PAGE_LOADERS = {
  "/": () => import("./pages/home.js"),
  "/review": () => import("./pages/review.js"),
  "/test": () => import("./pages/test.js"),
  "/settings": () => import("./pages/settings.js"),
  "/stats": () => import("./pages/stats.js"),
  "/admin": () => import("./pages/admin.js"),
  "/about": () => import("./pages/about.js"),
};

async function dispatchRoute(path, param) {
  const loader = PAGE_LOADERS[path] || PAGE_LOADERS["/"];
  const mod = await loader();
  return mod.render(param);
}

export function navigate(path, param) {
  if (location.pathname !== path) history.pushState(null, "", path);
  return dispatchRoute(path, param);
}

window.addEventListener("popstate", () => dispatchRoute(location.pathname));

// ---------- shell ----------
function getInitials(name) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0][0] || "";
  const last = parts.length > 1 ? parts[parts.length - 1][0] || "" : "";
  return (first + last).toUpperCase();
}

export function renderAvatar(node, user) {
  if (user.avatarData) {
    node.textContent = "";
    node.style.backgroundImage = `url("${user.avatarData}")`;
    node.style.backgroundSize = "cover";
    node.style.backgroundPosition = "center";
  } else {
    node.style.backgroundImage = "";
    node.textContent = getInitials(user.name);
  }
}

export function renderShell() {
  $("#user-name-label").textContent = state.currentUser.name;
  renderAvatar($("#profile-avatar"), state.currentUser);
  renderTopStats();
  renderNav();
  updateDocumentTitle();
}

function updateDocumentTitle() {
  const user = state.currentUser;
  const firstName = (user.name || "").trim().split(/\s+/)[0] || user.name;
  const track = (user.track || "").trim();
  document.title = `Interview Prep — ${firstName}${track ? ` — ${track}` : ""}`;
}

export function renderTopStats() {
  $("#streak-count").textContent = (state.currentUser.streak && state.currentUser.streak.count) || 0;
  if (state.todayQueue) {
    $("#progress-count").textContent = `${state.todayQueue.completed}/${state.todayQueue.target}`;
  }
  if (state.bankStats) {
    $("#bank-count").textContent = `${state.bankStats.yours}/${state.bankStats.total}`;
  }
}

// Called once at boot and again after anything that adds questions to the
// bank (a CSV import, a manual upload) so the header pill doesn't need a
// full page reload to reflect the new count.
export async function refreshBankStats() {
  try {
    state.bankStats = await api("/api/questions/bank-count");
    renderTopStats();
  } catch {
    /* best-effort — leave the pill showing its last known counts */
  }
}

export function renderNav() {
  $("#nav-home-btn").classList.toggle("is-active", state.currentView === "home");
  $("#nav-stats-btn").classList.toggle("is-active", state.currentView === "stats");
  $("#nav-about-btn").classList.toggle("is-active", state.currentView === "about");
  const adminBtn = $("#nav-admin-btn");
  adminBtn.hidden = state.currentUser.role !== "admin";
  adminBtn.classList.toggle("is-active", state.currentView === "admin");
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
    const headline = $("#signup-headline").value.trim();
    const dailyQuota = parseInt($("#signup-quota").value, 10) || 10;
    let timezone = "UTC";
    try { timezone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC"; } catch { /* keep UTC */ }
    const errBox = $("#signup-error");
    errBox.hidden = true;
    try {
      const data = await api("/api/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name, email, password, track, headline, dailyQuota, timezone }),
      });
      await boot(data.user);
    } catch (err) {
      errBox.textContent = err.message;
      errBox.hidden = false;
    }
  });
}

// ---------- theme (System / Light / Dark) ----------
// The CSS already defines light tokens on :root, dark tokens both under
// a prefers-color-scheme media query (for "System") and under
// :root[data-theme="dark"] (for an explicit choice) — see styles.css.
// This just toggles which one wins. Applied twice: synchronously in
// index.html's inline <head> script (before first paint, to avoid a
// flash) and here (to keep the <select> in sync and handle changes).
const THEME_KEY = "theme";

function applyTheme(value) {
  if (value === "light" || value === "dark") {
    document.documentElement.setAttribute("data-theme", value);
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

function syncThemeToggle(value) {
  $all(".theme-option").forEach((btn) => {
    const active = btn.dataset.themeValue === value;
    btn.classList.toggle("is-active", active);
    btn.setAttribute("aria-checked", String(active));
  });
}

function initTheme() {
  let saved = "system";
  try {
    saved = localStorage.getItem(THEME_KEY) || "system";
  } catch {
    /* localStorage unavailable — default to system, don't persist */
  }
  applyTheme(saved);
  syncThemeToggle(saved);
  $all(".theme-option").forEach((btn) => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.themeValue;
      try {
        localStorage.setItem(THEME_KEY, value);
      } catch {
        /* best-effort */
      }
      applyTheme(value);
      syncThemeToggle(value);
    });
  });
}

// ---------- profile dropdown ----------
function wireProfileMenu() {
  const menu = $("#profile-menu");
  const trigger = $("#profile-trigger");
  const dropdown = $("#profile-dropdown");

  function close() {
    dropdown.classList.remove("is-open");
    trigger.setAttribute("aria-expanded", "false");
    // :focus-within keeps the dropdown visible after a click on one of its
    // buttons (browsers keep focus there post-click) — without this, the
    // menu stays open-looking even though .is-open is already gone.
    if (menu.contains(document.activeElement)) document.activeElement.blur();
  }

  trigger.addEventListener("click", (e) => {
    e.stopPropagation();
    const opening = !dropdown.classList.contains("is-open");
    dropdown.classList.toggle("is-open", opening);
    trigger.setAttribute("aria-expanded", String(opening));
  });
  document.addEventListener("click", (e) => {
    if (!menu.contains(e.target)) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") close();
  });
  $("#settings-btn").addEventListener("click", close);
  $("#logout-btn").addEventListener("click", close);
}

// ---------- boot ----------
async function boot(user) {
  state.currentUser = user;
  $("#auth-screen").hidden = true;
  $("#app").hidden = false;
  $("#logout-btn").addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    location.reload();
  });
  $("#brand-home-btn").addEventListener("click", () => navigate("/"));
  $("#nav-home-btn").addEventListener("click", () => navigate("/"));
  $("#nav-stats-btn").addEventListener("click", () => navigate("/stats"));
  $("#nav-admin-btn").addEventListener("click", () => navigate("/admin"));
  $("#nav-about-btn").addEventListener("click", () => navigate("/about"));
  $("#settings-btn").addEventListener("click", () => navigate("/settings"));
  initTheme();
  wireProfileMenu();
  renderShell();
  refreshBankStats(); // fire-and-forget — pill pops in once loaded, doesn't block first render
  await dispatchRoute(location.pathname);
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("/sw.js").catch(() => { /* best-effort */ });
}

$all(".footer-year").forEach((node) => { node.textContent = new Date().getFullYear(); });

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
  } else if (location.pathname === "/about") {
    // Reachable by prospective users too, before they've signed up.
    await dispatchRoute("/about");
  } else {
    $("#auth-screen").hidden = false;
  }
})();
