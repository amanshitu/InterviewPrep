// Invisible Cloudflare Turnstile captcha for the Login page's sign-in,
// sign-up, and forgot-password forms. One widget instance (action "auth")
// shared by whichever form submits — the server-side check (see
// src/worker/lib/turnstile.js) only requires Cloudflare's own
// `success: true`, so a single shared action is enough for this app's
// threat model (blocking scripted abuse, not per-flow analytics).
import { useCallback, useEffect, useRef } from "react";

export const TURNSTILE_SITE_KEY = "0x4AAAAAAGAj3gS_ioNKxux4";

declare global {
  interface Window {
    turnstile?: {
      render: (container: HTMLElement, options: Record<string, unknown>) => string;
      execute: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

let scriptPromise: Promise<void> | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Turnstile"));
    document.head.appendChild(script);
  });
  return scriptPromise;
}

// `containerRef` is rendered once by the caller (a plain empty <div>, kept
// off-screen by Turnstile's own "invisible" size — no CSS hiding needed).
// `getToken()` resolves null (never throws) on any failure, so a signup
// attempt before the widget script has loaded degrades to "no captcha
// token" rather than a thrown error blocking the whole form.
export function useTurnstileToken() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const resolverRef = useRef<((token: string | null) => void) | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: TURNSTILE_SITE_KEY,
          size: "invisible",
          action: "auth",
          callback: (token: string) => resolverRef.current?.(token),
          "error-callback": () => resolverRef.current?.(null),
        });
      })
      .catch(() => {
        /* getToken() below resolves null if the widget never rendered */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const getToken = useCallback((): Promise<string | null> => {
    return new Promise((resolve) => {
      const turnstile = window.turnstile;
      const widgetId = widgetIdRef.current;
      if (!turnstile || !widgetId) {
        resolve(null);
        return;
      }
      resolverRef.current = resolve;
      turnstile.reset(widgetId); // tokens are single-use; reset before every attempt
      turnstile.execute(widgetId);
    });
  }, []);

  return { containerRef, getToken };
}
