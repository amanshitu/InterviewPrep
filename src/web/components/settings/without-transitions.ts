// Briefly suppresses every CSS transition while a theme/accent swap
// applies, so every recolored element lands on its new color in the same
// frame instead of each visibly staggering in on its own transition timer
// — ported from MealSathi's own `withoutTransitions()` helper.
export function withoutTransitions(apply: () => void): void {
  const root = document.documentElement;
  const style = document.createElement("style");
  style.textContent = "*,*::before,*::after{transition:none!important}";
  root.appendChild(style);
  apply();
  // Force a reflow so the no-transition style is actually applied before
  // it's removed, otherwise the browser can coalesce both into one frame
  // and the transition suppression never takes effect.
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  window.getComputedStyle(style).opacity;
  requestAnimationFrame(() => {
    root.removeChild(style);
  });
}
