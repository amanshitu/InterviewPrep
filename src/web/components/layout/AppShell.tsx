import { useEffect } from "react";
import { Outlet, useOutletContext } from "react-router";
import type { User } from "../../api/types";
import { logout } from "../../api/auth";
import { ToastProvider } from "../../hooks/use-toast";
import { clearAuthedFlag } from "../../lib/auth-flag";
import { AuthGate } from "./AuthGate";
import { MobileHeader } from "./MobileHeader";
import { Sidebar } from "./Sidebar";

// The old app registered the service worker unconditionally on every load
// (public/app.js, module scope, not gated behind any feature) so the PWA
// shell-cache and push-notification plumbing were always live, not just
// when a visitor happened to open Notifications in Settings. Preserve that
// here for every page that uses AppShell (NotificationsSection.tsx also
// calls register(), harmlessly — registering the same URL twice is a no-op).
function useServiceWorkerRegistration() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {
        /* best-effort */
      });
    }
  }, []);
}

// The authenticated app shell, mounted ONCE as a React Router layout route
// wrapping every page under routes/app/* and routes/admin/*: desktop gets a
// collapsible left sidebar, mobile gets a sticky header + slide-out drawer
// (Sidebar.tsx / MobileHeader.tsx self-select via Tailwind breakpoints —
// both are always mounted, CSS decides which is visible). Because this is
// now a layout route (not re-mounted per page), the sidebar/header never
// re-render on navigation between pages, AuthGate's session check runs only
// once per app visit instead of once per click, and only the <Outlet/> —
// the actual page content — swaps. This is the fix for the earlier
// true-MPA architecture's "every click reloads the whole page" complaint:
// matches MealSathi's own persistent-shell-plus-client-routing pattern.
export function AppShell() {
  useServiceWorkerRegistration();
  return (
    <ToastProvider>
      <AuthGate>
        {(user) => (
          <div className="flex min-h-dvh bg-background text-foreground">
            <Sidebar user={user} onLogout={() => void handleLogout()} />
            <div className="flex min-w-0 flex-1 flex-col">
              <MobileHeader user={user} onLogout={() => void handleLogout()} />
              <main className="mx-auto w-full max-w-(--main-max) flex-1 px-4 py-6 sm:px-6">
                <Outlet context={user} />
              </main>
            </div>
          </div>
        )}
      </AuthGate>
    </ToastProvider>
  );
}

// Every page component under routes/app|admin/* calls this instead of
// receiving `user` as a prop, now that AppShell is a layout route rendering
// <Outlet context={user}/> rather than a per-page render-prop wrapper.
export function useShellUser(): User {
  return useOutletContext<User>();
}

async function handleLogout() {
  clearAuthedFlag();
  try {
    await logout();
  } finally {
    window.location.href = "/login";
  }
}
