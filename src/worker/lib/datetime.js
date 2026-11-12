// Everything keyed by "today" (the daily quota ledger, the daily test set,
// AI usage caps) should reset at the user's own midnight, not an arbitrary
// UTC one — defaults to UTC only if the stored timezone is missing/invalid.
export function todayDateStr(timezone) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone || "UTC" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

const VALID_TIMEZONE_FALLBACK = "UTC";
export function normalizeTimezone(tz) {
  if (!tz || typeof tz !== "string") return VALID_TIMEZONE_FALLBACK;
  try {
    Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz.slice(0, 60);
  } catch {
    return VALID_TIMEZONE_FALLBACK;
  }
}

// Rough local-hour estimate from an IANA timezone name, reusing the same
// Intl-based approach as todayDateStr rather than a hardcoded offset table.
export function localHourFor(timezone) {
  try {
    const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone || "UTC", hour: "numeric", hour12: false }).formatToParts(new Date());
    const hourPart = parts.find((p) => p.type === "hour");
    return hourPart ? parseInt(hourPart.value, 10) % 24 : new Date().getUTCHours();
  } catch {
    return new Date().getUTCHours();
  }
}
