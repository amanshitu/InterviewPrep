import { useEffect, useState, type ReactNode } from "react";
import { getMe } from "../../api/account";
import type { User } from "../../api/types";
import { clearAuthedFlag, likelyAuthed, markAuthed } from "../../lib/auth-flag";

// Every page under src/web/routes/app|admin/* is its own real document (true
// MPA, not client-side routing), so unlike the old single-index.html SPA
// there's no "wrong screen" markup embedded in this page's HTML to flash —
// each page's shell is just an empty #root. AuthGate's job is purely: avoid
// a pointless network round trip for a visitor who almost certainly isn't
// signed in (redirect to /login immediately), and show a neutral spinner —
// never an incorrect screen — while actually-likely-signed-in visitors get
// confirmed via GET /api/me.
export function AuthGate({ children }: { children: (user: User) => ReactNode }) {
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
        setUser(user);
      })
      .catch(() => {
        if (cancelled) return;
        clearAuthedFlag();
        setRedirecting(true);
        window.location.href = "/login";
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (redirecting) return null;
  if (!user) return <PageSpinner />;
  return <>{children(user)}</>;
}

function PageSpinner() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-border border-t-primary" />
    </div>
  );
}
