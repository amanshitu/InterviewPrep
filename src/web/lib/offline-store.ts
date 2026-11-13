// Read-only cached snapshots of personal data (the signed-in user,
// today's queue, stats) — written by the app itself right after a
// successful fetch, read back only as a fallback when a live fetch fails
// while offline. Mirrors MealSathi's offline-store.ts design (ADR-007):
// offline here means "show the last thing we successfully fetched," never
// a background-sync/mutation queue (that needs conflict handling this app
// deliberately doesn't take on) and never something the service worker
// writes — sized down from MealSathi's IndexedDB store since this app's
// offline surface is a handful of small JSON payloads, well within
// localStorage's budget.
//
// Scoped per user id (except the "me" snapshot below, needed before any
// user id is known) so a shared device never shows one account's cached
// data to another; cleared on logout (see AppShell.tsx's handleLogout).

const PREFIX = "examstreak-snapshot";
const USER_KEY = `${PREFIX}:me`;

interface Snapshot<T> {
  data: T;
  savedAt: number;
}

function keyFor(name: string, userId: string): string {
  return `${PREFIX}:${name}:${userId}`;
}

export function saveSnapshot<T>(name: string, userId: string, data: T): void {
  try {
    localStorage.setItem(keyFor(name, userId), JSON.stringify({ data, savedAt: Date.now() } satisfies Snapshot<T>));
  } catch {
    /* storage unavailable or full — best-effort only */
  }
}

export function loadSnapshot<T>(name: string, userId: string): Snapshot<T> | null {
  try {
    const raw = localStorage.getItem(keyFor(name, userId));
    return raw ? (JSON.parse(raw) as Snapshot<T>) : null;
  } catch {
    return null;
  }
}

// The signed-in user themselves: AuthGate needs this to boot the app at
// all while offline, before it has any user id to scope a normal
// saveSnapshot() call by — so it gets its own fixed key instead.
export function saveUserSnapshot<T>(user: T): void {
  try {
    localStorage.setItem(USER_KEY, JSON.stringify({ data: user, savedAt: Date.now() } satisfies Snapshot<T>));
  } catch {
    /* storage unavailable */
  }
}

export function loadUserSnapshot<T>(): Snapshot<T> | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as Snapshot<T>) : null;
  } catch {
    return null;
  }
}

export function clearAllSnapshots(): void {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(`${PREFIX}:`)) localStorage.removeItem(k);
    }
  } catch {
    /* storage unavailable */
  }
}
