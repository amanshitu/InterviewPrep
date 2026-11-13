import { useEffect, useState, useSyncExternalStore } from "react";
import { isIos, promptInstall, snoozeInstallPrompt, useInstallState } from "../../lib/pwa-install";
import { applyPwaUpdate, dismissPwaUpdate, subscribePwaUpdate, getPwaUpdateState } from "../../lib/pwa-update";
import { CloseIcon, DownloadIcon, RefreshIcon } from "./icons";

const INSTALL_PROMPT_DELAY_MS = 3000;

// z-30: below the mobile drawer's z-40 overlay (MobileHeader.tsx) so an
// open drawer always wins — this used to sit on top of the drawer's own
// "Log out" button, a floating prompt blocking a real control. Still well
// above ordinary page content, which has no z-index of its own.
const cardClass =
  "fixed inset-x-3 bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))] z-30 mx-auto flex max-w-sm items-start gap-3 rounded-xl border border-border bg-card p-4 text-card-foreground shadow-xl sm:inset-x-auto sm:right-6 sm:bottom-6";

function UpdatePrompt() {
  const pwa = useSyncExternalStore(subscribePwaUpdate, getPwaUpdateState, getPwaUpdateState);
  const [reloading, setReloading] = useState(false);

  if (!pwa.needRefresh) return null;

  return (
    <div role="status" aria-live="polite" className={cardClass}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">A new version is available</p>
        <p className="mt-0.5 text-sm text-muted-foreground">Reload to pick up the latest update.</p>
        <button
          type="button"
          disabled={reloading}
          onClick={() => {
            setReloading(true);
            applyPwaUpdate();
          }}
          className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
        >
          <RefreshIcon width={14} height={14} className={reloading ? "animate-spin" : undefined} /> {reloading ? "Reloading…" : "Reload"}
        </button>
      </div>
      <button type="button" onClick={dismissPwaUpdate} aria-label="Dismiss" className="shrink-0 text-muted-foreground hover:text-foreground">
        <CloseIcon width={16} height={16} />
      </button>
    </div>
  );
}

function InstallPrompt({ suppressed }: { suppressed: boolean }) {
  const install = useInstallState();
  const [ready, setReady] = useState(false);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const id = window.setTimeout(() => setReady(true), INSTALL_PROMPT_DELAY_MS);
    return () => window.clearTimeout(id);
  }, []);

  const eligible = ready && !hidden && !suppressed && !install.installed && !install.snoozed && (install.canPrompt || install.platform === "ios");
  if (!eligible) return null;

  function dismiss() {
    setHidden(true);
    snoozeInstallPrompt();
  }

  return (
    <div role="dialog" aria-label="Install ExamStreak" className={cardClass}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Install ExamStreak</p>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {isIos() ? 'Tap Share, then "Add to Home Screen" for quick, full-screen access.' : "Add it to your home screen for quick, full-screen access — works offline too."}
        </p>
        {install.canPrompt ? (
          <button
            type="button"
            onClick={async () => {
              const outcome = await promptInstall();
              if (outcome !== "unavailable") setHidden(true);
            }}
            className="mt-3 inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            <DownloadIcon width={14} height={14} /> Install
          </button>
        ) : null}
      </div>
      <button type="button" onClick={dismiss} aria-label="Dismiss" className="shrink-0 text-muted-foreground hover:text-foreground">
        <CloseIcon width={16} height={16} />
      </button>
    </div>
  );
}

// Mounted once in AppShell: the update-reload prompt and the install
// banner never show at the same time (the update is the more important of
// the two, and stacking both looked noisy) — matches MealSathi's "one
// popup at a time" guard in its own PwaPrompts.tsx, simplified since this
// app has only these two floating prompts to arbitrate between.
export function PwaPrompts() {
  const pwa = useSyncExternalStore(subscribePwaUpdate, getPwaUpdateState, getPwaUpdateState);
  return (
    <>
      <UpdatePrompt />
      <InstallPrompt suppressed={pwa.needRefresh} />
    </>
  );
}
