import { useOnlineStatus } from "../../hooks/use-online-status";

// Sits in normal document flow above Sidebar/MobileHeader (see
// AppShell.tsx), so it pushes the rest of the shell down when shown
// instead of overlaying it — no z-index coordination with the PWA
// prompts or the mobile drawer needed. Mounted app-wide (not per page):
// whichever page you're on, a dropped connection shows the same notice,
// and pages with their own offline-snapshot fallback (Today, Stats) rely
// on this rather than duplicating the message themselves.
export function OfflineBanner() {
  const online = useOnlineStatus();
  if (online) return null;
  return (
    <div
      role="status"
      className="flex items-center justify-center gap-2 bg-warning px-4 pb-1.5 text-center text-xs font-semibold text-foreground"
      style={{ paddingTop: "calc(0.375rem + env(safe-area-inset-top, 0px))" }}
    >
      You're offline — showing your last saved data where available.
    </div>
  );
}
