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
};

// ---------- utils ----------
export function $(sel, root = document) { return root.querySelector(sel); }
export function $all(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }
export function el(html) { const t = document.createElement("template"); t.innerHTML = html.trim(); return t.content.firstElementChild; }
export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function toast(msg) {
  const node = $("#toast");
  node.textContent = msg;
  node.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => (node.hidden = true), 2600);
}
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
export function renderShell() {
  $("#user-name-label").textContent = state.currentUser.name;
  renderTopStats();
  renderSidebar();
}

export function renderTopStats() {
  $("#streak-count").textContent = (state.currentUser.streak && state.currentUser.streak.count) || 0;
  if (state.todayQueue) {
    $("#progress-count").textContent = `${state.todayQueue.completed}/${state.todayQueue.target}`;
  }
}

export function renderSidebar() {
  $("#nav-home-btn").classList.toggle("is-active", state.currentView === "home");
  $("#nav-stats-btn").classList.toggle("is-active", state.currentView === "stats");
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

// ---------- boot ----------
async function boot(user) {
  state.currentUser = user;
  $("#auth-screen").hidden = true;
  $("#app").hidden = false;
  $("#logout-btn").addEventListener("click", async () => {
    await fetch("/api/logout", { method: "POST" });
    location.reload();
  });
  $("#nav-home-btn").addEventListener("click", () => navigate("/"));
  $("#nav-stats-btn").addEventListener("click", () => navigate("/stats"));
  $("#nav-admin-btn").addEventListener("click", () => navigate("/admin"));
  $("#settings-btn").addEventListener("click", () => navigate("/settings"));
  renderShell();
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
  } else {
    $("#auth-screen").hidden = false;
  }
})();
