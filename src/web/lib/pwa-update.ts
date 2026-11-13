// Detects a new deploy while the app is open and lets the user choose when
// to pick it up, instead of silently swapping code under them mid-session.
// Mirrors MealSathi's src/web/pwa/register.ts pattern (a tiny external
// store a component subscribes to via useSyncExternalStore) but built on
// the raw Service Worker API — this project registers public/sw.js
// directly rather than going through vite-plugin-pwa's virtual module.
//
// sw.js's `install` handler deliberately does NOT call self.skipWaiting()
// itself (see that file) — a new worker parks in the "waiting" state until
// this module posts it a SKIP_WAITING message, which is what the "Reload"
// button below triggers.
export interface PwaUpdateState {
  /** A new service worker is installed and waiting; reload to apply it. */
  needRefresh: boolean;
}

const UPDATE_CHECK_MS = 60 * 60 * 1000;

let state: PwaUpdateState = { needRefresh: false };
let waitingWorker: ServiceWorker | null = null;
const listeners = new Set<() => void>();

function setState(patch: Partial<PwaUpdateState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
}

export function subscribePwaUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getPwaUpdateState(): PwaUpdateState {
  return state;
}

/** Tells the waiting worker to activate; reloads once it takes control. */
export function applyPwaUpdate() {
  if (waitingWorker) waitingWorker.postMessage({ type: "SKIP_WAITING" });
  else window.location.reload();
}

export function dismissPwaUpdate() {
  setState({ needRefresh: false });
}

let registered = false;

export function registerPwaUpdateWatcher() {
  if (registered || typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  registered = true;

  function trackInstalling(sw: ServiceWorker) {
    sw.addEventListener("statechange", () => {
      // "installed" with an existing controller means this is an UPDATE
      // (a previous worker is already running this page) — a brand-new
      // first-time install has no controller yet and should just activate
      // quietly, with no prompt to show.
      if (sw.state === "installed" && navigator.serviceWorker.controller) {
        waitingWorker = sw;
        setState({ needRefresh: true });
      }
    });
  }

  navigator.serviceWorker
    .register("/sw.js")
    .then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller) {
        waitingWorker = registration.waiting;
        setState({ needRefresh: true });
      }
      registration.addEventListener("updatefound", () => {
        if (registration.installing) trackInstalling(registration.installing);
      });
      // Long-lived tabs: look for a new deploy hourly.
      setInterval(() => {
        if (navigator.onLine) registration.update().catch(() => {});
      }, UPDATE_CHECK_MS);
    })
    .catch(() => {
      /* best-effort */
    });

  // A brand-new install fires controllerchange too (sw.js's activate calls
  // clients.claim()), but there's no new code to pick up then — reloading
  // would just flash a first-time visitor's whole page a moment after it
  // loaded. Only a change away from an existing controller is an update.
  let hadController = !!navigator.serviceWorker.controller;
  let reloaded = false;
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
}
