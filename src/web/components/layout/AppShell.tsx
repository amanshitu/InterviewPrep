import { useEffect, type ReactNode } from "react";
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

// The authenticated app shell every page under routes/app/* and
// routes/admin/* renders into: desktop gets a collapsible left sidebar,
// mobile gets a sticky header + slide-out drawer (Sidebar.tsx / MobileHeader.tsx
// self-select via Tailwind breakpoints — both are always mounted, CSS decides
// which is visible). AuthGate wraps everything so no page has to repeat its
// own session-check boilerplate; ToastProvider is per-page since each page is
// its own document in this true-MPA architecture.
export function AppShell({ children }: { children: (user: User) => ReactNode }) {
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
                {children(user)}
              </main>
            </div>
          </div>
        )}
      </AuthGate>
    </ToastProvider>
  );
}

async function handleLogout() {
  clearAuthedFlag();
  try {
    await logout();
  } finally {
    window.location.href = "/login";
  }
}
