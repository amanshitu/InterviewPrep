// Applied before first paint to avoid a flash of the wrong theme/accent.
// The actual toggle UI lives in the topbar/Settings; this just replays
// whatever was saved last time, synchronously, before CSS renders.
//
// Extracted to its own file (rather than an inline <script> block) so it
// loads from 'self' under this app's CSP without needing a per-page
// sha256 hash allowlist entry — every page includes it the same way.
try {
  var t = localStorage.getItem("theme");
  if (t === "light" || t === "dark") document.documentElement.setAttribute("data-theme", t);
  // New (MealSathi-style) pages key dark mode off a .dark class rather
  // than the data-theme attribute above — both are set here so either
  // system works while the migration is in progress. "futuristic" is a
  // 4th, always-dark option (see theme-prefs.ts) — it forces dark
  // regardless of system preference, same as an explicit "dark" choice.
  var resolvedDark = t === "dark" || t === "futuristic" || (t !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", !!resolvedDark);
  document.documentElement.classList.toggle("futuristic", t === "futuristic");
  var a = localStorage.getItem("accent");
  if (a) document.documentElement.setAttribute("data-accent", a);
} catch (e) { /* localStorage unavailable — falls back to system preference */ }

// Answer text size (Settings -> Appearance). Previously only got applied
// while AppearanceSection's AnswerFontSizeCard happened to be mounted
// (its own useEffect calling setAnswerFontSize()), so a reveal on Today/
// Review/Self Test/Mock Interview on a fresh page load (before ever
// visiting Settings this session) silently fell back to the default size
// instead of the saved one. Applied here instead, same pre-paint pattern
// as theme/accent above. Keep in sync with ANSWER_FONT_SIZES in
// components/settings/appearance-prefs.ts.
try {
  var sizes = { small: 14, medium: 16, large: 18, xlarge: 21 };
  var fs = localStorage.getItem("answerFontSize");
  var px = sizes[fs] || sizes.small;
  document.documentElement.style.setProperty("--answer-font-size", px + "px");
} catch (e) { /* localStorage unavailable — falls back to the CSS default (inherit) */ }

// Collapsible-sidebar state, restored before first paint so the sidebar
// never flashes expanded-then-collapsed (or vice versa) on load. Default,
// when nothing's been chosen yet, follows viewport width: narrow screens
// start collapsed, wide screens start expanded.
try {
  var sidebarState = localStorage.getItem("sidebar-state");
  if (sidebarState !== "expanded" && sidebarState !== "collapsed") {
    sidebarState = window.innerWidth >= 1280 ? "expanded" : "collapsed";
  }
  document.documentElement.setAttribute("data-sidebar", sidebarState);
} catch (e) { /* localStorage unavailable — falls back to the CSS default (expanded) */ }
