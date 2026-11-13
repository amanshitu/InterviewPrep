// Pull-to-refresh gesture math, kept separate from the DOM-handling
// component (PullToRefresh.tsx) so it's trivial to reason about — ported
// from MealSathi's own src/web/components/common/pull-model.ts, same
// tuning:
// - Only a mostly-downward drag that starts at the very top of the page
//   counts (anything sideways or upward is left to the browser: page
//   scroll, horizontal swipes).
// - The indicator follows the finger with resistance (half speed), then a
//   stronger rubber band past the threshold, up to a hard maximum.
//   Releasing past the threshold refreshes; anything shorter springs back.

export const PULL = {
  /** px of finger travel before the axis is decided. */
  slop: 8,
  /** Indicator travel (after resistance) needed to refresh. */
  threshold: 64,
  /** Hard cap of the indicator travel. */
  max: 110,
  /** Finger → indicator ratio below the threshold. */
  resistance: 0.5,
  /** Extra damping past the threshold. */
  band: 0.3,
  /** Where the indicator rests while refreshing. */
  rest: 52,
} as const;

export type PullAxis = "pending" | "pull" | "none";

/** Decide once the finger moved past the slop: a downward move ≥ 1.2× more vertical than horizontal is a pull. */
export function lockPull(dx: number, dy: number): PullAxis {
  if (Math.abs(dx) < PULL.slop && Math.abs(dy) < PULL.slop) return "pending";
  return dy > 0 && dy > Math.abs(dx) * 1.2 ? "pull" : "none";
}

/** Indicator travel for a finger travel of `dy` px (0 for upward moves). */
export function pullDistance(dy: number): number {
  if (dy <= 0) return 0;
  const d = dy * PULL.resistance;
  if (d <= PULL.threshold) return d;
  return Math.min(PULL.max, PULL.threshold + (d - PULL.threshold) * PULL.band);
}

export const shouldRefresh = (distance: number) => distance >= PULL.threshold;

/** 0..1 progress towards the threshold (spinner rotation / opacity). */
export const pullProgress = (distance: number) => Math.max(0, Math.min(1, distance / PULL.threshold));
