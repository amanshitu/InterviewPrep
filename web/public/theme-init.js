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
  var a = localStorage.getItem("accent");
  if (a) document.documentElement.setAttribute("data-accent", a);
} catch (e) { /* localStorage unavailable — falls back to system preference */ }
