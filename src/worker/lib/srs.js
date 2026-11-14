// Leitner-box-style spaced-repetition scheduling. Reuses the existing
// `correct_streak` column (already tracked per question: +1 on "got it",
// reset to 0 on "again") as the box level — no need for a separate column,
// since consecutive-successes IS the box level. Only `due_date` is new: the
// day a question should next be eligible to resurface in Daily Review.
// A NULL due_date (every row that existed before this migration) is
// treated as "due now" everywhere this is read, so nothing already in a
// user's review pool silently disappears when this ships.
//
// Box 0 (just failed, or never reviewed) gets the shortest interval; each
// further consecutive success roughly doubles it, capped at 180 days —
// long enough that a well-known question stops competing for review slots
// without the interval growing unboundedly for an exam-prep timeframe.
const INTERVAL_DAYS_BY_STREAK = [1, 2, 4, 8, 16, 32, 60, 90, 120, 180];

export function intervalDaysForStreak(streak) {
  const idx = Math.max(0, Math.min(streak, INTERVAL_DAYS_BY_STREAK.length - 1));
  return INTERVAL_DAYS_BY_STREAK[idx];
}

export function addDaysToDateStr(dateStr, days) {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// `streak` is the box level AFTER this grading (i.e. pass the already-
// incremented-or-reset value), not before.
export function nextDueDate(todayStr, streak) {
  return addDaysToDateStr(todayStr, intervalDaysForStreak(streak));
}
