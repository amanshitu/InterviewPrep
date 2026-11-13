import { useCallback, useEffect, useState, type ReactNode } from "react";
import { getMe } from "../../api/account";
import { ApiError } from "../../api/client";
import type { User } from "../../api/types";
import { clearAuthedFlag, likelyAuthed, markAuthed } from "../../lib/auth-flag";
import { loadUserSnapshot, saveUserSnapshot } from "../../lib/offline-store";

export type RefreshUser = () => Promise<void>;

// Mounted once per app visit, not once per page — AppShell (the layout
// route wrapping every page under src/web/routes/app|admin/*) renders this
// around a client-routed <Outlet/>, so this check runs on the very first
// load and never again until a hard refresh. Login and About stay separate
// real documents on purpose and never go through this. AuthGate's job is
// purely: avoid a pointless network round trip for a visitor who almost
// certainly isn't signed in (redirect to /login immediately), and show a
// neutral spinner — never an incorrect screen — while actually-likely-
// signed-in visitors get confirmed via GET /api/me.
export function AuthGate({ children }: { children: (user: User, refreshUser: RefreshUser) => ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [redirecting, setRedirecting] = useState(false);

  useEffect(() => {
    if (!likelyAuthed()) {
      setRedirecting(true);
      window.location.href = "/login";
      return;
    }
    let cancelled = false;
    getMe()
      .then(({ user }) => {
        if (cancelled) return;
        markAuthed();
        saveUserSnapshot(user);
        setUser(user);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        // Only a server-confirmed 401/403 means "actually logged out."
        // Anything else — offline, a 5xx, or (the bug report this fixes)
        // a request a rapid Ctrl+F5 aborted mid-flight before the server
        // even got to answer — is a transient failure, not proof the
        // session is gone, so it must not clear it or bounce to /login.
        // Fall back to whichever user was last successfully loaded on
        // this device instead.
        const unauthorized = err instanceof ApiError && (err.status === 401 || err.status === 403);
        if (!unauthorized) {
          const cached = loadUserSnapshot<User>();
          if (cached) {
            setUser(cached.data);
            return;
          }
        }
        clearAuthedFlag();
        setRedirecting(true);
        window.location.href = "/login";
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-fetches the user in place (no document reload) after something
  // changes server-side state that's reflected on the user object —
  // active category, enrolled categories, profile fields. Callers that
  // mutate one of those (CategorySection, ProfileMenu) call this instead
  // of window.location.reload(), which used to force the whole app shell
  // — including the sidebar — to unmount and remount, producing the
  // visible flash/flicker this replaces.
  const refreshUser = useCallback<RefreshUser>(async () => {
    try {
      const { user } = await getMe();
      markAuthed();
      saveUserSnapshot(user);
      setUser(user);
    } catch {
      // Keep showing the last known user rather than tearing down the app
      // on a transient failure. A real session loss (the cookie expired,
      // revoked elsewhere) isn't actively detected here — it surfaces only
      // when some other API call 401s, which each caller handles on its
      // own (there's no shared "session expired, redirect to /login"
      // interceptor in api/client.ts). A hard refresh always re-checks.
    }
  }, []);

  if (redirecting) return null;
  if (!user) return <PageSpinner />;
  return <>{children(user, refreshUser)}</>;
}

function PageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-border border-t-primary" />
    </div>
  );
}
