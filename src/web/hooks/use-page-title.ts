import { useEffect } from "react";

const DEFAULT_TITLE = "ExamStreak";

// Every route now shares one index.html (see entries/app.tsx), so there's
// only one static <title> tag — without this, every page's tab/bookmark
// title would just read "ExamStreak". Restores the default on unmount so
// navigating from e.g. Privacy back into the authenticated app doesn't
// leave a stale title behind (same pattern MealSathi's own LegalPage uses).
export function usePageTitle(title: string) {
  useRawPageTitle(`${title} — ${DEFAULT_TITLE}`);
}

// For the rare page (the Home marketing page) that wants full control over
// its title instead of the "<Page> — ExamStreak" template.
export function useRawPageTitle(fullTitle: string) {
  useEffect(() => {
    document.title = fullTitle;
    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [fullTitle]);
}
