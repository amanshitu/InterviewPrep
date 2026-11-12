// Curated rather than the full ~400-zone IANA list — one representative
// city per major region/business hub, ordered west to east. Verbatim port
// of settings.js's TIMEZONE_OPTIONS/canonicalTz.
export const TIMEZONE_OPTIONS = [
  { tz: "UTC", label: "UTC — Coordinated Universal Time" },
  { tz: "Pacific/Honolulu", label: "HST — Hawaii" },
  { tz: "America/Anchorage", label: "AKT — Alaska" },
  { tz: "America/Los_Angeles", label: "PT — Pacific Time (US & Canada)" },
  { tz: "America/Denver", label: "MT — Mountain Time (US & Canada)" },
  { tz: "America/Chicago", label: "CT — Central Time (US & Canada)" },
  { tz: "America/New_York", label: "ET — Eastern Time (US & Canada)" },
  { tz: "America/Sao_Paulo", label: "BRT — Brasília Time" },
  { tz: "Europe/London", label: "GMT/BST — United Kingdom" },
  { tz: "Europe/Paris", label: "CET — Central Europe" },
  { tz: "Europe/Athens", label: "EET — Eastern Europe" },
  { tz: "Europe/Moscow", label: "MSK — Moscow" },
  { tz: "Africa/Cairo", label: "EET — Egypt" },
  { tz: "Africa/Johannesburg", label: "SAST — South Africa" },
  { tz: "Asia/Dubai", label: "GST — UAE / Gulf" },
  { tz: "Asia/Karachi", label: "PKT — Pakistan" },
  { tz: "Asia/Kolkata", label: "IST — India" },
  { tz: "Asia/Dhaka", label: "BST — Bangladesh" },
  { tz: "Asia/Bangkok", label: "ICT — Thailand / Indochina" },
  { tz: "Asia/Shanghai", label: "CST — China" },
  { tz: "Asia/Singapore", label: "SGT — Singapore" },
  { tz: "Asia/Tokyo", label: "JST — Japan" },
  { tz: "Asia/Seoul", label: "KST — Korea" },
  { tz: "Australia/Perth", label: "AWST — Western Australia" },
  { tz: "Australia/Sydney", label: "AEST/AEDT — Eastern Australia" },
  { tz: "Pacific/Auckland", label: "NZST/NZDT — New Zealand" },
];

// IANA has legacy aliases for the same zone (e.g. Asia/Calcutta ==
// Asia/Kolkata) — a browser's auto-detected name and our curated list's
// name can differ as strings while meaning the same thing. Canonicalize
// both sides via Intl before comparing.
export function canonicalTz(tz: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", { timeZone: tz }).resolvedOptions().timeZone;
  } catch {
    return tz;
  }
}

export function timezoneSelectOptions(currentTz: string): { tz: string; label: string }[] {
  const canonicalCurrent = canonicalTz(currentTz);
  const known = TIMEZONE_OPTIONS.some((o) => canonicalTz(o.tz) === canonicalCurrent);
  return known ? TIMEZONE_OPTIONS : [...TIMEZONE_OPTIONS, { tz: currentTz, label: `${currentTz} (current)` }];
}
