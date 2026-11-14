// Invisible Cloudflare Turnstile captcha for the Login page's sign-in,
// sign-up, and forgot-password forms. One widget instance (action "auth")
// shared by whichever form submits — the server-side check (see
// src/worker/lib/turnstile.js) only requires Cloudflare's own
// `success: true`, so a single shared action is enough for this app's
// threat model (blocking scripted abuse, not per-flow analytics).
//
// The site key is admin-configurable (Admin -> the Turnstile card), not a
// build-time constant, so the caller fetches it from GET /api/config and
// passes it in here once known.
import { useCallback, useEffect, useRef } from "react";

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
// token" rather than a thrown error blocking the whole form. It awaits
// the widget's own render promise first — otherwise a visitor who submits
// within the first instant of the page loading (before the external
// Turnstile script has finished loading and rendering) would get a false
// "no token" and a confusing server-side rejection through no fault of
// their own, same failure mode as a real hostname/domain misconfiguration
// but much more common.
// `enabled` (default true) is the admin-toggled captcha switch; `siteKey`
// is admin-configured (fetched from GET /api/config) — when either is
// missing/false, the script is never even loaded, so a visitor isn't
// charged a third-party request for a check the server won't enforce (or
// can't correctly verify) anyway.
export function useTurnstileToken(siteKey: string | null | undefined, enabled = true) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<string | null>(null);
  const resolverRef = useRef<((token: string | null) => void) | null>(null);
  const readyRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!enabled || !siteKey) return;
    let cancelled = false;
    readyRef.current = loadTurnstileScript()
      .then(() => {
        if (cancelled || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
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
  }, [enabled, siteKey]);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!enabled || !siteKey) return null;
    await readyRef.current; // let a just-submitted form wait for the widget rather than failing fast
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
  }, [enabled, siteKey]);

  return { containerRef, getToken };
}
