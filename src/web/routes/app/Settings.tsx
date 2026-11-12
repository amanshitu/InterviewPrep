import { useState } from "react";
import { AppShell } from "../../components/layout/AppShell";
import { AccountSection } from "../../components/settings/AccountSection";
import { AiUsageSection } from "../../components/settings/AiUsageSection";
import { AppearanceSection } from "../../components/settings/AppearanceSection";
import { DataExportSection } from "../../components/settings/DataExportSection";
import { NotificationsSection } from "../../components/settings/NotificationsSection";
import { PasswordSection, SessionsSection } from "../../components/settings/PasswordSection";
import { PrepProfileSection } from "../../components/settings/PrepProfileSection";
import { QuestionSetsSection } from "../../components/settings/QuestionSetsSection";
import { ResumePromptSection } from "../../components/settings/ResumePromptSection";
import { SuggestedSetsSection } from "../../components/settings/SuggestedSetsSection";
import { useIsMobile } from "../../hooks/use-is-mobile";
import type { User } from "../../api/types";

type TabId = "account" | "profile" | "appearance" | "ai" | "notifications" | "questionsets" | "data";

const TABS: { id: TabId; label: string }[] = [
  { id: "account", label: "Account" },
  { id: "profile", label: "Prep profile" },
  { id: "appearance", label: "Appearance & Accessibility" },
  { id: "ai", label: "AI & Usage" },
  { id: "notifications", label: "Notifications" },
  { id: "questionsets", label: "Question Sets" },
  { id: "data", label: "Data" },
];

function SettingsContent({ user }: { user: User }) {
  const isMobile = useIsMobile();
  const [tab, setTab] = useState<TabId>("account");
  const [currentUser, setCurrentUser] = useState(user);

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
        return <PrepProfileSection user={currentUser} onUserChange={setCurrentUser} />;
      case "appearance":
        return <AppearanceSection />;
      case "ai":
        return <AiUsageSection user={currentUser} onUserChange={setCurrentUser} />;
      case "notifications":
        return <NotificationsSection />;
      case "questionsets":
        return (
          <div className="flex flex-col gap-4">
            <QuestionSetsSection />
            <ResumePromptSection user={currentUser} />
            <SuggestedSetsSection />
          </div>
        );
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
              className={`shrink-0 border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${
                tab === t.id ? "border-primary text-foreground" : "border-transparent text-muted-foreground"
              }`}
            >
              {t.label}
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
                    className={`w-full rounded-md px-3 py-2 text-left text-sm font-medium ${
                      tab === t.id ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {t.label}
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
  return <AppShell>{(user) => <SettingsContent user={user} />}</AppShell>;
}
