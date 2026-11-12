// Verbatim-ported theme preference from app.js's initTheme(): System /
// Light / Dark, persisted to the same "theme" localStorage key theme-init.js
// (the pre-paint script every page's <head> includes) already reads to
// avoid a flash on load — this just adds the interactive side: an actual
// control to change it, which didn't exist anywhere in the React rewrite.
export type ThemeValue = "system" | "light" | "dark";

const THEME_KEY = "theme";

export function getTheme(): ThemeValue {
  try {
    const saved = localStorage.getItem(THEME_KEY);
    return saved === "light" || saved === "dark" ? saved : "system";
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
    value === "dark" || (value === "system" && typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", !!resolvedDark);
}
