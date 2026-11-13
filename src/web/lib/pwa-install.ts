// "Install this app" prompt state — mirrors MealSathi's src/web/pwa/install.ts
// (capture Chromium's beforeinstallprompt as early as possible, track
// dismissal/snooze, detect iOS Safari which has no install event and needs
// its own "Share -> Add to Home Screen" instructions instead).
import { useSyncExternalStore } from "react";

/** Chromium's non-standard install event. */
export interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const KEY_DISMISSED_AT = "pwa-install-dismissed-at";
const SNOOZE_MS = 14 * 24 * 60 * 60 * 1000;

export type InstallPlatform = "chromium" | "ios" | "other";

export interface InstallState {
  /** Deferred Chromium prompt — the browser considers the app installable right now. */
  canPrompt: boolean;
  /** Already running as an installed app. */
  installed: boolean;
  platform: InstallPlatform;
  /** User dismissed the floating prompt recently. */
  snoozed: boolean;
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable (private mode) */
  }
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)").matches || (window.navigator as { standalone?: boolean }).standalone === true;
}

export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

let deferred: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();
let snapshot: InstallState = compute();

function compute(): InstallState {
  const dismissedAt = Number(read(KEY_DISMISSED_AT) ?? "0");
  return {
    canPrompt: deferred !== null,
    installed: isStandalone(),
    platform: deferred ? "chromium" : isIos() ? "ios" : "other",
    snoozed: dismissedAt > 0 && Date.now() - dismissedAt < SNOOZE_MS,
  };
}

function emit() {
  snapshot = compute();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

/** Hides the floating prompt for 14 days. */
export function snoozeInstallPrompt() {
  write(KEY_DISMISSED_AT, String(Date.now()));
  emit();
}

/** Shows the native Chromium install dialog. Returns the outcome, or "unavailable". */
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const e = deferred;
  if (!e) return "unavailable";
  deferred = null; // a deferred prompt can only be used once
  await e.prompt();
  const { outcome } = await e.userChoice;
  if (outcome === "dismissed") write(KEY_DISMISSED_AT, String(Date.now()));
  emit();
  return outcome;
}

/** Wires window events. Safe to call more than once; call before React renders so an early event is still caught. */
let listening = false;
export function listenForInstallEvents() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // suppress the browser's own mini-infobar; we show our own prompt instead
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
  window.matchMedia?.("(display-mode: standalone)").addEventListener?.("change", emit);
}
