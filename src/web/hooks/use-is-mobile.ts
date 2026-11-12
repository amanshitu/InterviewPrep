import { useEffect, useState } from "react";

// Matches app.js's isMobileLayout() exactly: max-width: 640px is the
// breakpoint below which the mobile shell (bottom tab bar, FAB, pull-to-
// refresh) takes over from the desktop chrome.
const MOBILE_QUERY = "(max-width: 640px)";

export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState<boolean>(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(MOBILE_QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mql = window.matchMedia(MOBILE_QUERY);
    const update = () => setIsMobile(mql.matches);
    update();
    mql.addEventListener("change", update);
    return () => mql.removeEventListener("change", update);
  }, []);

  return isMobile;
}
