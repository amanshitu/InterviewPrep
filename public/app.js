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
  speakingId: null, // question id currently being read aloud, if any
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
  stopSpeaking(); // leaving a page shouldn't leave read-aloud running in the background
  const loader = PAGE_LOADERS[path] || PAGE_LOADERS["/"];
  const mod = await loader();
  return mod.render(param);
}

export function navigate(path, param) {
  if (location.pathname !== path) history.pushState(null, "", path);
  return dispatchRoute(path, param);
}

window.addEventListener("popstate", () => dispatchRoute(location.pathname));

// ---------- read-aloud (Web Speech API) ----------
// state.speakingId names the question currently being read, so any
// "Read aloud" button anywhere can show the right icon without its own
// bookkeeping. Browser-only feature — no server involvement.
export function isSpeechSupported() {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function stopSpeaking() {
  if (isSpeechSupported()) window.speechSynthesis.cancel();
  state.speakingId = null;
  stopBackgroundKeepAlive();
  releaseWakeLock();
}

// Optional, opt-in Screen Wake Lock (Settings → Read aloud → "Keep screen
// on while reading") — the background-audio keep-alive below doesn't
// survive an actual screen lock (confirmed on real devices, PWA and
// browser both), so for anyone who'd rather the screen just stay on than
// have reading cut off, this holds it awake for as long as reading lasts.
// Off by default since it costs battery; only requested when the
// preference is enabled and the API is supported.
export function isWakeLockSupported() {
  return typeof navigator !== "undefined" && "wakeLock" in navigator;
}

let wakeLock = null;

async function acquireWakeLock() {
  if (!isWakeLockSupported() || wakeLock) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = null; });
  } catch {
    /* best-effort — denied, unsupported context, battery saver, etc. */
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => { /* already released */ });
    wakeLock = null;
  }
}

if (isWakeLockSupported()) {
  // The browser force-releases the lock whenever the page is hidden — if
  // the tab regains visibility while still reading and the preference is
  // still on, re-acquire it, since the lock itself doesn't survive that.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && state.speakingId && getReadAloudPrefs().keepScreenOn) {
      acquireWakeLock();
    }
  });
}

// Mobile browsers commonly suspend page JS — and speechSynthesis along with
// it — once the screen locks or the tab is backgrounded. An earlier version
// of this fixed that with a Screen Wake Lock, but that forces the screen to
// stay on, which isn't what was wanted — the goal is letting the screen
// actually turn off while reading keeps going, the way a music/podcast app
// does. Browsers are far more lenient about suspending a page that's
// actively playing real HTMLMediaElement audio, so a silent, looping
// <audio> track plus a Media Session registration is used to signal "this
// page is playing background media" for the duration of a read-aloud —
// in practice this keeps speechSynthesis alive too, without holding the
// screen on. Best-effort: still ultimately at the mercy of the browser/OS,
// and can't do anything about a deliberate power-button press.
let keepAliveAudio = null;

function getKeepAliveAudio() {
  if (keepAliveAudio) return keepAliveAudio;
  // Built at runtime (real PCM silence, not a hand-rolled base64 guess) —
  // 1 second of 8kHz 8-bit mono silence, looped for as long as needed.
  const sampleRate = 8000;
  const numSamples = sampleRate;
  const buffer = new ArrayBuffer(44 + numSamples);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  writeStr(36, "data");
  view.setUint32(40, numSamples, true);
  for (let i = 0; i < numSamples; i++) view.setUint8(44 + i, 128); // 128 = silence at 8-bit PCM's midpoint
  const url = URL.createObjectURL(new Blob([buffer], { type: "audio/wav" }));
  keepAliveAudio = new Audio(url);
  keepAliveAudio.loop = true;
  return keepAliveAudio;
}

function startBackgroundKeepAlive(title) {
  getKeepAliveAudio().play().catch(() => { /* best-effort — autoplay restrictions, etc. */ });
  if ("mediaSession" in navigator) {
    try {
      navigator.mediaSession.metadata = new MediaMetadata({ title: title || "Reading answer aloud", artist: "Interview Prep" });
      navigator.mediaSession.playbackState = "playing";
      navigator.mediaSession.setActionHandler("pause", stopSpeaking);
      navigator.mediaSession.setActionHandler("stop", stopSpeaking);
    } catch {
      /* best-effort — not every browser supports every part of this */
    }
  }
}

function stopBackgroundKeepAlive() {
  if (keepAliveAudio) {
    keepAliveAudio.pause();
    keepAliveAudio.currentTime = 0;
  }
  if ("mediaSession" in navigator) {
    try { navigator.mediaSession.playbackState = "none"; } catch { /* best-effort */ }
  }
}

// Voice/speed/pitch are a per-browser preference, not account data — stored
// in localStorage like the theme choice, not synced to the server.
const READ_ALOUD_PREFS_KEY = "readAloudPrefs";
const DEFAULT_READ_ALOUD_PREFS = { voiceURI: "", rate: 0.95, pitch: 1, keepScreenOn: false };

export function getReadAloudPrefs() {
  try {
    const raw = localStorage.getItem(READ_ALOUD_PREFS_KEY);
    return raw ? { ...DEFAULT_READ_ALOUD_PREFS, ...JSON.parse(raw) } : { ...DEFAULT_READ_ALOUD_PREFS };
  } catch {
    return { ...DEFAULT_READ_ALOUD_PREFS };
  }
}

export function setReadAloudPrefs(partial) {
  const merged = { ...getReadAloudPrefs(), ...partial };
  try {
    localStorage.setItem(READ_ALOUD_PREFS_KEY, JSON.stringify(merged));
  } catch {
    /* best-effort — localStorage unavailable (private window, blocked, etc.) */
  }
}

// getVoices() can return [] until the browser's voice list has loaded async
// (notably Chrome) — callers that populate a <select> should also listen
// for speechSynthesis.onvoiceschanged and re-call this.
export function getVoiceOptions() {
  return isSpeechSupported() ? window.speechSynthesis.getVoices() : [];
}

// Starts reading `text` aloud for `id`, or stops if `id` is already being
// read. `onChange` fires once synchronously (so the caller can repaint the
// button right away) and again when speech ends naturally — callers should
// guard that second call with their own "am I still on this page" check,
// since it can land after the user has navigated elsewhere.
export function toggleReadAloud(id, text, onChange) {
  if (!isSpeechSupported()) return false;
  if (state.speakingId === id) {
    stopSpeaking();
    if (onChange) onChange();
    return true;
  }
  state.speakingId = id;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  const prefs = getReadAloudPrefs();
  utterance.rate = prefs.rate;
  utterance.pitch = prefs.pitch;
  if (prefs.voiceURI) {
    const voice = getVoiceOptions().find((v) => v.voiceURI === prefs.voiceURI);
    if (voice) utterance.voice = voice;
  }
  const finish = () => {
    if (state.speakingId === id) state.speakingId = null;
    stopBackgroundKeepAlive();
    releaseWakeLock();
    if (onChange) onChange();
  };
  utterance.onend = finish;
  utterance.onerror = finish;
  window.speechSynthesis.speak(utterance);
  startBackgroundKeepAlive(text);
  if (prefs.keepScreenOn) acquireWakeLock();
  if (onChange) onChange();
  return true;
}

export const SPEAKER_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5Z" fill="currentColor"/><path d="M16 8.5c1.4 1 1.4 5.7 0 6.7M19 6.2c2.3 1.9 2.3 9.4 0 11.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>`;
export const STOP_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/></svg>`;
// Shared with home.js/review.js for the "Got it" / "Review again soon"
// buttons, so their icon+label styling matches the Read aloud button.
export const CHECK_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12.5 9 17.5 20 6.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const REPEAT_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 11A8 8 0 1 0 18.4 15.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M20 5.5v5.5h-5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Shared icon+text button library — every plain-text button in the app was
// given one of these (app-wide icon pass), matching a reference "icon +
// label" pill-button style. Kept simple/geometric by design (circles,
// straight strokes) rather than intricate glyphs, since these are
// hand-written SVG paths with no visual design tool in the loop.
export const SIGNIN_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 3h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M14 12H3" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const SIGNUP_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="9" cy="7" r="3.2" stroke="currentColor" stroke-width="1.8"/><path d="M3 20c0-3.5 2.7-6 6-6s6 2.5 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M18 8v5M15.5 10.5h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
export const KEY_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="7.5" cy="15.5" r="3.5" stroke="currentColor" stroke-width="1.8"/><path d="M10 13l8-8M15 5l2 2M18 2l2 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const SEND_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M21 3 3 10l7 3 3 7 8-17Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/></svg>`;
export const BACK_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M19 12H5M11 18l-6-6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const SETTINGS_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 6h8M18 6h2M4 12h4M12 12h8M4 18h8M18 18h2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><circle cx="14" cy="6" r="2" fill="currentColor"/><circle cx="8" cy="12" r="2" fill="currentColor"/><circle cx="14" cy="18" r="2" fill="currentColor"/></svg>`;
export const LOGOUT_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M16 17l5-5-5-5M21 12H9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const EYE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="12" r="3" stroke="currentColor" stroke-width="1.6"/></svg>`;
export const PLUS_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.6"/><path d="M12 8v8M8 12h8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>`;
export const SHUFFLE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h3.5L15 18H21M3 18h3.5L11 12" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/><path d="M18 4l3 2-3 2M18 16l3 2-3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const SPARKLE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2l1.8 5.2L19 9l-5.2 1.8L12 16l-1.8-5.2L5 9l5.2-1.8L12 2Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>`;
export const CLOSE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`;
export const CAMERA_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><circle cx="12" cy="13" r="3.2" stroke="currentColor" stroke-width="1.6"/></svg>`;
export const TRASH_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const SAVE_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 3h11l3 3v14a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/><path d="M8 3v5h7V3M8 21v-6h8v6" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
export const DOWNLOAD_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 3v12M7 10l5 5 5-5M4 20h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const UPLOAD_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20V8M7 13l5-5 5 5M4 4h16" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
export const COPY_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="8" y="8" width="12" height="12" rx="2" stroke="currentColor" stroke-width="1.6"/><path d="M5 16H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"/></svg>`;
export const CHECKLIST_ICON = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6h11M9 12h11M9 18h11" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4 6l1 1 1.5-1.5M4 12l1 1 1.5-1.5M4 18l1 1 1.5-1.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

// Renders a "Read aloud" / "Stop" toggle button for the given question id,
// or "" if this browser has no speech synthesis support at all. Markup
// only — the caller wires up the click handler (needs the answer text,
// which this function deliberately doesn't take, to avoid stuffing long
// text into an HTML attribute).
export function renderReadAloudButton(id) {
  if (!isSpeechSupported()) return "";
  const active = state.speakingId === id;
  return `<button type="button" class="btn btn-ghost btn-small btn-icon-label" data-read-aloud="${id}">${
    active ? `${STOP_ICON} Stop` : `${SPEAKER_ICON} Read aloud`
  }</button>`;
}

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
  // Mobile profile sheet mirrors the same identity (desktop's profile
  // dropdown has no equivalent of these two rows, so only present there).
  const sheetName = $("#sheet-user-name");
  if (sheetName) {
    sheetName.textContent = state.currentUser.name;
    $("#sheet-user-email").textContent = state.currentUser.email;
    renderAvatar($("#sheet-profile-avatar"), state.currentUser);
  }
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

  // Mobile bottom tab bar mirrors the same active state — About has no
  // bottom tab of its own, it lives in the profile sheet instead.
  const mHome = $("#mtab-home");
  if (mHome) {
    mHome.classList.toggle("is-active", state.currentView === "home");
    $("#mtab-stats").classList.toggle("is-active", state.currentView === "stats");
    const mAdmin = $("#mtab-admin");
    mAdmin.hidden = state.currentUser.role !== "admin";
    mAdmin.classList.toggle("is-active", state.currentView === "admin");
  }
}

// ---------- mobile shell (bottom tab bar, FAB, bottom sheets) ----------
// Everything in this section only ever runs because a mobile-only element
// (the tab bar, the FAB) was clicked — none of it is reachable from the
// desktop UI, so desktop behavior can't be affected by it.
export function isMobileLayout() {
  return window.matchMedia("(max-width: 640px)").matches;
}

export function openMobileSheet(selector) {
  const backdrop = $("#sheet-backdrop");
  const sheet = $(selector);
  if (!backdrop || !sheet) return;
  backdrop.hidden = false;
  sheet.hidden = false;
  requestAnimationFrame(() => {
    backdrop.classList.add("is-open");
    sheet.classList.add("is-open");
  });
}

export function closeMobileSheets() {
  const backdrop = $("#sheet-backdrop");
  if (!backdrop) return;
  backdrop.classList.remove("is-open");
  $all(".app-sheet").forEach((s) => s.classList.remove("is-open"));
  // Matches the CSS transition duration — keeps the sheet in the DOM
  // (and visible) until it's actually finished sliding away.
  setTimeout(() => {
    backdrop.hidden = true;
    $all(".app-sheet").forEach((s) => { s.hidden = true; });
  }, 300);
}

// Mobile replacement for the admin reject flow's prompt() — a real text
// field in a sheet instead of the browser's plain dialog. Desktop is
// completely untouched: same prompt() call, same fallback, same timing.
export function promptRejectReason(onConfirm) {
  if (!isMobileLayout()) {
    const reason = prompt("Reason for rejecting this set (shown to the owner):") || "";
    onConfirm(reason);
    return;
  }
  const textarea = $("#reject-sheet-textarea");
  const confirmBtn = $("#reject-sheet-confirm");
  const cancelBtn = $("#reject-sheet-cancel");
  textarea.value = "";
  openMobileSheet("#reject-sheet");
  function cleanup() {
    confirmBtn.removeEventListener("click", handleConfirm);
    cancelBtn.removeEventListener("click", handleCancel);
    closeMobileSheets();
  }
  function handleConfirm() {
    const reason = textarea.value.trim();
    cleanup();
    onConfirm(reason);
  }
  function handleCancel() { cleanup(); }
  confirmBtn.addEventListener("click", handleConfirm);
  cancelBtn.addEventListener("click", handleCancel);
}

function wireMobileShell() {
  const fabBtn = $("#mobile-fab-btn");
  if (!fabBtn) return; // defensive — markup always present, but keep this section self-contained

  $("#mtab-home").addEventListener("click", () => $("#nav-home-btn").click());
  $("#mtab-stats").addEventListener("click", () => $("#nav-stats-btn").click());
  $("#mtab-admin").addEventListener("click", () => $("#nav-admin-btn").click());
  $("#mtab-profile").addEventListener("click", () => openMobileSheet("#profile-sheet"));
  fabBtn.addEventListener("click", () => openMobileSheet("#fab-sheet"));

  $("#sheet-backdrop").addEventListener("click", closeMobileSheets);
  $("#sheet-about-btn").addEventListener("click", () => { closeMobileSheets(); $("#nav-about-btn").click(); });
  $("#sheet-settings-btn").addEventListener("click", () => { closeMobileSheets(); $("#settings-btn").click(); });
  $("#sheet-logout-btn").addEventListener("click", () => { closeMobileSheets(); $("#logout-btn").click(); });

  $("#fab-upload-btn").addEventListener("click", () => { closeMobileSheets(); navigate("/settings"); });
  $("#fab-review-btn").addEventListener("click", () => { closeMobileSheets(); navigate("/review"); });
  $("#fab-test-btn").addEventListener("click", () => { closeMobileSheets(); navigate("/test"); });

  wireCompactThemeToggle();
}

// The topbar's theme toggle (mobile only — the profile sheet's own copy
// always shows all three, it has the room) starts collapsed to just the
// current choice (System by default) and expands to reveal the other two
// only once tapped, instead of showing all three all the time. initTheme()
// already handles applying/syncing whichever option gets clicked — this
// only adds the show/hide choreography around it, scoped to the topbar's
// unique #theme-toggle id so the sheet's un-id'd duplicate is untouched.
function wireCompactThemeToggle() {
  const container = $("#theme-toggle");
  if (!container || !isMobileLayout()) return;
  container.classList.add("is-collapsible");
  container.addEventListener("click", () => {
    container.classList.toggle("is-expanded");
  });
  document.addEventListener("click", (e) => {
    if (!container.contains(e.target)) container.classList.remove("is-expanded");
  });
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
  wireMobileShell();
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
