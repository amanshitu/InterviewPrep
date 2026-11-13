// Verbatim-ported theme preference from app.js's initTheme(): System /
// Light / Dark, persisted to the same "theme" localStorage key theme-init.js
// (the pre-paint script every page's <head> includes) already reads to
// avoid a flash on load — this just adds the interactive side: an actual
// control to change it, which didn't exist anywhere in the React rewrite.
// "futuristic" is a 4th, deliberately single-look option (not a light/dark
// variant) — the dark control-room palette from the ExamStreak logo-concepts
// artifact, always dark regardless of system preference. It layers on top
// of the normal dark-mode token set (same accent-color system still picks
// --primary/--ring; see globals.css's `.dark.futuristic` block).
export type ThemeValue = "system" | "light" | "dark" | "futuristic";
const VALID_THEMES: ThemeValue[] = ["system", "light", "dark", "futuristic"];

const THEME_KEY = "theme";

export function getTheme(): ThemeValue {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return (VALID_THEMES as string[]).includes(saved || "") ? (saved as ThemeValue) : "system";
  } catch {
    return "system";
  }
}

export function setTheme(value: ThemeValue): void {
  try {
    localStorage.setItem(THEME_KEY, value);
  } catch {
    /* best-effort — localStorage unavailable */
  }
  const resolvedDark =
    value === "dark" ||
    value === "futuristic" ||
    (value === "system" && typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", !!resolvedDark);
  document.documentElement.classList.toggle("futuristic", value === "futuristic");
}
