// Pull-to-refresh for Today, Review, and Stats. A light custom
// implementation (no library): touch only, only when the page is
// scrolled to the very top, only for a mostly-downward drag; never while
// a dialog is open. A rubber-band indicator follows the finger (transform
// + opacity only, written once per animation frame, no React render per
// touchmove). Releasing past the threshold runs `onRefresh` (that
// screen's own refetch); the indicator spins until it settles.
//
// Ported from MealSathi's src/web/components/common/PullToRefresh.tsx —
// same gesture math (pull-model.ts), same core mechanism, re-themed to
// this app's icons/Tailwind tokens and with no i18n (plain strings).
//
// The page itself is the scroller, so while one of these screens is
// mounted the root gets `overscroll-behavior-y: contain`: the browser's
// own native pull-to-refresh (a full document reload — the actual bug
// report this replaces) never fights ours.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ArrowDownIcon, RefreshIcon } from "./icons";
import { lockPull, PULL, pullDistance, pullProgress, shouldRefresh, type PullAxis } from "./pull-model";

// A confirm dialog or similar MODAL is open (use-confirm.tsx renders
// aria-modal="true" only while pending) — checking aria-modal rather than
// just role="dialog" matters here: PwaPrompts' install/update banners
// also use role="dialog" for labeling but are dismissible corner cards,
// not blocking modals, and must not suppress the pull gesture.
const dialogOpen = () => !!document.querySelector('[aria-modal="true"]');
const reducedMotion = () => typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;

let containCount = 0;

export function PullToRefresh({
  onRefresh,
  disabled = false,
  className,
  children,
}: {
  onRefresh: () => Promise<unknown>;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const root = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLDivElement>(null);
  const icon = useRef<HTMLSpanElement>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [armed, setArmed] = useState(false);
  const state = useRef({ x: 0, y: 0, axis: "none" as PullAxis, distance: 0, frame: 0, armed: false, busy: false });
  const refreshRef = useRef(onRefresh);
  const disabledRef = useRef(disabled);
  useEffect(() => {
    refreshRef.current = onRefresh;
    disabledRef.current = disabled;
  });

  // Keep the browser's native pull-to-refresh / glow out of the way while mounted.
  useEffect(() => {
    const html = document.documentElement;
    if (containCount++ === 0) html.style.overscrollBehaviorY = "contain";
    return () => {
      if (--containCount === 0) html.style.overscrollBehaviorY = "";
    };
  }, []);

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    const s = state.current;

    const paint = (distance: number, transition: string) => {
      const node = indicator.current;
      if (!node) return;
      node.style.transition = transition;
      node.style.transform = `translate3d(0, ${distance - PULL.rest}px, 0)`;
      node.style.opacity = distance > 0 ? String(Math.min(1, 0.25 + pullProgress(distance))) : "0";
      if (icon.current && !s.busy) icon.current.style.transform = `rotate(${Math.round(pullProgress(distance) * 180)}deg)`;
    };

    const onStart = (e: TouchEvent) => {
      s.axis = "none";
      if (disabledRef.current || s.busy || e.touches.length !== 1 || window.scrollY > 0 || dialogOpen()) return;
      if ((e.target as Element | null)?.closest?.("[data-no-pull], input, textarea, select, [contenteditable='true']")) return;
      s.x = e.touches[0]!.clientX;
      s.y = e.touches[0]!.clientY;
      s.axis = "pending";
      s.distance = 0;
    };
    const onMove = (e: TouchEvent) => {
      if (s.axis === "none") return;
      const dx = e.touches[0]!.clientX - s.x;
      const dy = e.touches[0]!.clientY - s.y;
      if (s.axis === "pending") {
        s.axis = window.scrollY > 0 ? "none" : lockPull(dx, dy);
        if (s.axis !== "pull") return;
        if (indicator.current) indicator.current.style.willChange = "transform, opacity";
      }
      s.distance = pullDistance(dy);
      const nowArmed = shouldRefresh(s.distance);
      if (nowArmed !== s.armed) {
        s.armed = nowArmed;
        setArmed(nowArmed);
      }
      if (!s.frame) {
        s.frame = requestAnimationFrame(() => {
          s.frame = 0;
          paint(s.distance, "none");
        });
      }
    };
    const settle = () => {
      paint(0, reducedMotion() ? "none" : "transform 220ms ease-out, opacity 220ms ease-out");
      if (indicator.current) indicator.current.style.willChange = "";
    };
    const onEnd = () => {
      if (s.axis !== "pull") {
        s.axis = "none";
        return;
      }
      s.axis = "none";
      cancelAnimationFrame(s.frame);
      s.frame = 0;
      const go = shouldRefresh(s.distance);
      s.distance = 0;
      s.armed = false;
      setArmed(false);
      if (!go) return settle();
      s.busy = true;
      setRefreshing(true);
      paint(PULL.rest, reducedMotion() ? "none" : "transform 180ms ease-out");
      void Promise.resolve()
        .then(() => refreshRef.current())
        .catch(() => undefined)
        .finally(() => {
          s.busy = false;
          setRefreshing(false);
          settle();
        });
    };

    el.addEventListener("touchstart", onStart, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onEnd, { passive: true });
    el.addEventListener("touchcancel", onEnd, { passive: true });
    return () => {
      cancelAnimationFrame(s.frame);
      el.removeEventListener("touchstart", onStart);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onEnd);
      el.removeEventListener("touchcancel", onEnd);
    };
  }, []);

  const Icon = refreshing ? RefreshIcon : ArrowDownIcon;
  const label = refreshing ? "Refreshing…" : armed ? "Release to refresh" : "Pull to refresh";
  return (
    <div ref={root} className={`relative ${className ?? ""}`} data-pull-root>
      <div
        ref={indicator}
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 z-20 flex justify-center opacity-0"
        style={{ transform: `translate3d(0, ${-PULL.rest}px, 0)` }}
      >
        <span className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-muted-foreground shadow-sm">
          <span ref={icon} className="inline-flex">
            <Icon width={15} height={15} className={`${refreshing ? "motion-safe:animate-spin" : ""} ${armed && !refreshing ? "text-primary" : ""}`} />
          </span>
          {label}
        </span>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{refreshing ? "Refreshing…" : ""}</p>
      {children}
    </div>
  );
}
