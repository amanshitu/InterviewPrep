import { useCallback, useState, type ComponentType, type SVGProps } from "react";
import { useSearchParams } from "react-router";
import { useRefreshUser, useShellUser } from "../../components/layout/AppShell";
import { AccountSection } from "../../components/settings/AccountSection";
import { AiUsageSection } from "../../components/settings/AiUsageSection";
import { AppearanceSection } from "../../components/settings/AppearanceSection";
import { CategorySection } from "../../components/settings/CategorySection";
import { DataExportSection } from "../../components/settings/DataExportSection";
import { AccountIcon, BellIcon, ClipboardIcon, DownloadIcon, PaletteIcon, SparkleIcon } from "../../components/settings/icons";
import { NotificationsSection } from "../../components/settings/NotificationsSection";
import { PasswordSection, SessionsSection } from "../../components/settings/PasswordSection";
import { PrepProfileSection } from "../../components/settings/PrepProfileSection";
import { useIsMobile } from "../../hooks/use-is-mobile";
import type { User } from "../../api/types";

type TabId = "account" | "profile" | "appearance" | "ai" | "notifications" | "data";

const DEFAULT_TAB: TabId = "account";

const TABS: { id: TabId; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { id: "account", label: "Account", icon: AccountIcon },
  { id: "profile", label: "Prep profile", icon: ClipboardIcon },
  { id: "appearance", label: "Appearance & Accessibility", icon: PaletteIcon },
  { id: "ai", label: "AI & Usage", icon: SparkleIcon },
  { id: "notifications", label: "Notifications", icon: BellIcon },
  { id: "data", label: "Data", icon: DownloadIcon },
];

const TAB_IDS = new Set<string>(TABS.map((t) => t.id));

// Tab selection lives in the URL (?tab=appearance) rather than plain
// useState, so a link — from ProfileMenu's "Manage categories", a toast
// action, a bookmark, or a support message — can land directly on the
// right section instead of always opening to Account and making the
// visitor click again. Falls back to DEFAULT_TAB for a missing or
// unrecognized value rather than rendering nothing.
function SettingsContent({ user }: { user: User }) {
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: TabId = requestedTab && TAB_IDS.has(requestedTab) ? (requestedTab as TabId) : DEFAULT_TAB;
  const setTab = useCallback(
    (next: TabId) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        params.set("tab", next);
        return params;
      }, { replace: true });
    },
    [setSearchParams],
  );
  // The shell's `user` is the source of truth (sidebar, Today's greeting,
  // etc. all read it), so a save here also calls refreshUser() — keeping
  // only a local copy left the rest of the app showing the old name/track
  // until a hard reload. `saved` just bridges the gap until that refetch
  // lands: it's honored only while the shell user it was based on is still
  // the current one.
  const refreshUser = useRefreshUser();
  const [saved, setSaved] = useState<{ base: User; user: User } | null>(null);
  const currentUser = saved && saved.base === user ? saved.user : user;
  const setCurrentUser = (updated: User) => {
    setSaved({ base: user, user: updated });
    void refreshUser();
  };
  const activeContent = (() => {
    switch (tab) {
      case "account":
        return (
          <div className="flex flex-col gap-4">
            <AccountSection user={currentUser} onUserChange={setCurrentUser} />
            <PasswordSection />
            <SessionsSection />
          </div>
        );
      case "profile":
        return (
          <div className="flex flex-col gap-4">
            <CategorySection user={currentUser} />
            <PrepProfileSection user={currentUser} onUserChange={setCurrentUser} />
          </div>
        );
      case "appearance":
        return <AppearanceSection />;
      case "ai":
        return <AiUsageSection user={currentUser} onUserChange={setCurrentUser} />;
      case "notifications":
        return <NotificationsSection />;
      case "data":
        return <DataExportSection />;
      default:
        return null;
    }
  })();

  return (
    <div>
      <h1 className="mb-5 text-xl font-bold text-foreground">Settings</h1>
      {isMobile ? (
        <div className="mb-4 flex gap-1 overflow-x-auto border-b border-border pb-px">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${
                tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
              }`}
            >
              <t.icon width={15} height={15} /> {t.label}
            </button>
          ))}
        </div>
      ) : null}
      <div className={isMobile ? "" : "flex gap-6"}>
        {!isMobile ? (
          <nav className="w-52 shrink-0">
            <ul className="flex flex-col gap-0.5">
              {TABS.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-medium ${
                      tab === t.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <t.icon width={15} height={15} /> {t.label}
                  </button>
                </li>
              ))}
            </ul>
          </nav>
        ) : null}
        <div className="min-w-0 flex-1">{activeContent}</div>
      </div>
    </div>
  );
}

export function Settings() {
  const user = useShellUser();
  return <SettingsContent user={user} />;
}
