import { useEffect } from "react";
import { Outlet, useLocation, useOutletContext } from "react-router";
import type { User } from "../../api/types";
import { logout } from "../../api/auth";
import { ConfirmProvider } from "../../hooks/use-confirm";
import { ToastProvider } from "../../hooks/use-toast";
import { clearAuthedFlag } from "../../lib/auth-flag";
import { clearAllSnapshots } from "../../lib/offline-store";
import type { RefreshUser } from "./AuthGate";
import { AuthGate } from "./AuthGate";
import { EmailVerificationBanner } from "./EmailVerificationBanner";
import { MobileHeader } from "./MobileHeader";
import { OfflineBanner } from "./OfflineBanner";
import { PwaPrompts } from "./PwaPrompts";
import { Sidebar } from "./Sidebar";

interface ShellContext {
  user: User;
  refreshUser: RefreshUser;
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
//
// Service worker registration and the beforeinstallprompt/update listeners
// are wired at module scope in entries/app.tsx, before this ever mounts —
// not here — so an early event is never missed.
export function AppShell() {
  const { pathname } = useLocation();

  // Suppress the browser's native pull-to-refresh (a full document reload)
  // for the whole authenticated app, not just the few pages that implement
  // the custom <PullToRefresh> gesture — every page under this shell is a
  // client-routed Outlet swap, so a native reload here is always the "full
  // page fluctuation" regression, never the intended behavior. Centralizing
  // it here (this layout route mounts once per session, never remounting on
  // navigation) means a page needs zero wiring to be protected; <PullToRefresh>
  // itself no longer toggles this — see its own comment.
  useEffect(() => {
    const html = document.documentElement;
    const previous = html.style.overscrollBehaviorY;
    html.style.overscrollBehaviorY = "contain";
    return () => {
      html.style.overscrollBehaviorY = previous;
    };
  }, []);

  return (
    <ToastProvider>
      <ConfirmProvider>
        <AuthGate>
          {(user, refreshUser) => (
            <div className="flex min-h-dvh flex-col bg-background text-foreground">
              <OfflineBanner />
              <EmailVerificationBanner user={user} />
              <div className="flex min-h-0 flex-1">
                <Sidebar user={user} refreshUser={refreshUser} onLogout={() => void handleLogout()} />
                <div className="flex min-w-0 flex-1 flex-col">
                  <MobileHeader user={user} onLogout={() => void handleLogout()} />
                  <main className="mx-auto w-full max-w-(--main-max) flex-1 px-4 py-6 pb-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:px-6">
                    {/* Keyed on activeCategoryId: switching/enrolling/unenrolling a
                        category (CategorySection, ProfileMenu) calls refreshUser()
                        rather than reloading the document — that fixed the sidebar's
                        visible flash, but the current page's own data (fetched once
                        on mount) is now category-scoped and stale. Changing this key
                        remounts just the routed page fresh for the new category,
                        while Sidebar/MobileHeader above stay mounted throughout.
                        Settings and Admin are exempt: neither page's own data is
                        category-scoped (Settings re-keys only its own category-scoped
                        sections instead, see Settings.tsx; Admin's overview/pending-
                        sets/history/users are platform-wide), so remounting either —
                        a skeleton flash, and for Settings also CategorySection
                        dropping back to "Loading…" mid-click — was a pure regression
                        with nothing to show for it. */}
                    <Outlet
                      context={{ user, refreshUser } satisfies ShellContext}
                      key={pathname === "/settings" || pathname === "/admin" ? "shell" : (user.activeCategoryId ?? "none")}
                    />
                  </main>
                </div>
              </div>
            </div>
          )}
        </AuthGate>
        <PwaPrompts />
      </ConfirmProvider>
    </ToastProvider>
  );
}

// Every page component under routes/app|admin/* calls this instead of
// receiving `user` as a prop, now that AppShell is a layout route rendering
// <Outlet context={...}/> rather than a per-page render-prop wrapper.
export function useShellUser(): User {
  return useOutletContext<ShellContext>().user;
}

// Lets a page re-fetch /api/me in place (no document reload) after it
// changes something reflected on the user object — active category,
// enrolled categories, profile fields — so the sidebar and every other
// consumer of `user` pick it up immediately.
export function useRefreshUser(): RefreshUser {
  return useOutletContext<ShellContext>().refreshUser;
}

async function handleLogout() {
  clearAuthedFlag();
  clearAllSnapshots();
  try {
    await logout();
  } finally {
    window.location.href = "/login";
  }
}
