import { withoutTransitions } from "./without-transitions";

// Verbatim-ported localStorage-backed appearance preferences from app.js.
// The accent swatches here set `data-accent` + persist the choice; the
// actual CSS recoloring rules per `[data-accent="X"]` live in globals.css,
// which also derives --background/--sidebar/--secondary/--accent/--border/
// scrollbar/selection from whichever --primary is active, so an accent
// choice recolors the whole surface, not just buttons. Swatch previews
// here match globals.css's light-mode value for each accent exactly
// (cyan/violet/amber are darkened from their original hex — see that
// file's comment — so the picker preview doesn't show a brighter color
// than what actually gets applied).
export const ACCENT_OPTIONS = [
  { id: "terracotta", label: "Terracotta", swatch: "#c2501f" },
  { id: "ocean", label: "Ocean", swatch: "#1f6f9c" },
  { id: "forest", label: "Forest", swatch: "#1f7a4d" },
  { id: "plum", label: "Plum", swatch: "#7a3a9c" },
  { id: "rose", label: "Rose", swatch: "#b8305a" },
  { id: "slate", label: "Slate", swatch: "#3f5468" },
  { id: "cyan", label: "Cyan", swatch: "#007e94" },
  { id: "violet", label: "Violet", swatch: "#7752ff" },
  { id: "amber", label: "Amber", swatch: "#a3630f" },
];

const ACCENT_KEY = "accent";

export function getAccent(): string {
  try {
    const saved = localStorage.getItem(ACCENT_KEY);
    return ACCENT_OPTIONS.some((a) => a.id === saved) ? (saved as string) : "terracotta";
  } catch {
    return "terracotta";
  }
}

export function setAccent(accentId: string): void {
  withoutTransitions(() => {
    if (accentId === "terracotta") {
      document.documentElement.removeAttribute("data-accent");
    } else {
      document.documentElement.setAttribute("data-accent", accentId);
    }
  });
  try {
    localStorage.setItem(ACCENT_KEY, accentId);
  } catch {
    /* best-effort — localStorage unavailable */
  }
}

export const ANSWER_FONT_SIZES: Record<string, number> = { small: 14, medium: 16, large: 18, xlarge: 21 };
const ANSWER_FONT_SIZE_KEY = "answerFontSize";

export function getAnswerFontSize(): string {
  try {
    const saved = localStorage.getItem(ANSWER_FONT_SIZE_KEY) || "";
    return ANSWER_FONT_SIZES[saved] ? saved : "small";
  } catch {
    return "small";
  }
}

export function setAnswerFontSize(size: string): void {
  const px = ANSWER_FONT_SIZES[size] || ANSWER_FONT_SIZES.small;
  document.documentElement.style.setProperty("--answer-font-size", `${px}px`);
  try {
    localStorage.setItem(ANSWER_FONT_SIZE_KEY, size);
  } catch {
    /* best-effort — localStorage unavailable */
  }
}
