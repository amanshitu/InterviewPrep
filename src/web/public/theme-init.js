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
  // system works while the migration is in progress.
  var resolvedDark = t === "dark" || (t !== "light" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", !!resolvedDark);
  var a = localStorage.getItem("accent");
  if (a) document.documentElement.setAttribute("data-accent", a);
} catch (e) { /* localStorage unavailable — falls back to system preference */ }

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
