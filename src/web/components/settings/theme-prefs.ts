// Verbatim-ported theme preference from app.js's initTheme(): System /
// Light / Dark, persisted to the same "theme" localStorage key theme-init.js
// (the pre-paint script every page's <head> includes) already reads to
// avoid a flash on load — this just adds the interactive side: an actual
// control to change it, which didn't exist anywhere in the React rewrite.
// "futuristic", "midnight", and "noirgold" are deliberate single-look,
// always-dark options (not light/dark variants) — each layers on top of
// the normal dark-mode token set (same accent-color system still picks
// --primary/--ring; see globals.css's `.dark.futuristic`/`.dark.midnight`/
// `.dark.noirgold` blocks). "ivory" is the mirror case: a deliberate
// single-look, always-light option (`:root.ivory`).
import { withoutTransitions } from "./without-transitions";

export type ThemeValue = "system" | "light" | "dark" | "futuristic" | "midnight" | "noirgold" | "ivory";
const VALID_THEMES: ThemeValue[] = ["system", "light", "dark", "futuristic", "midnight", "noirgold", "ivory"];
const ALWAYS_DARK_THEMES: ThemeValue[] = ["dark", "futuristic", "midnight", "noirgold"];

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
    ALWAYS_DARK_THEMES.includes(value) ||
    (value === "system" && typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
  withoutTransitions(() => {
    document.documentElement.classList.toggle("dark", !!resolvedDark);
    document.documentElement.classList.toggle("futuristic", value === "futuristic");
    document.documentElement.classList.toggle("midnight", value === "midnight");
    document.documentElement.classList.toggle("noirgold", value === "noirgold");
    document.documentElement.classList.toggle("ivory", value === "ivory");
  });
}
