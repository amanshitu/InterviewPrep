import { useCallback, useEffect, useState } from "react";
import { initialSidebarState, SIDEBAR_STORAGE_KEY, type SidebarState } from "../lib/sidebar";

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

// Collapsible-sidebar state, matching MealSathi's app-shell sidebar
// mechanics: "expanded" | "collapsed", persisted in localStorage, read on
// mount from `<html data-sidebar="...">` (set synchronously by
// public/theme-init.js before first paint, so this hook starts in sync
// with what's already on screen instead of causing a flash/jump), and
// kept in sync with that attribute on every change so CSS relying on
// `[data-sidebar="collapsed"]` (width/rail-label transitions) stays
// correct without the component tree re-rendering those bits itself.
// Also wires Ctrl/Cmd+B and `[` as toggle shortcuts, same as MealSathi.
export function useSidebar(): { state: SidebarState; toggle: () => void; set: (next: SidebarState) => void } {
  const [state, setState] = useState<SidebarState>(() => {
    if (typeof document === "undefined") return "expanded";
    const attr = document.documentElement.getAttribute("data-sidebar");
    if (attr === "expanded" || attr === "collapsed") return attr;
    let saved: SidebarState | null = null;
    try {
      const raw = localStorage.getItem(SIDEBAR_STORAGE_KEY);
      if (raw === "expanded" || raw === "collapsed") saved = raw;
    } catch {
      // localStorage unavailable — fall through to the responsive default
    }
    return initialSidebarState(window.innerWidth, saved);
  });

  const apply = useCallback((next: SidebarState) => {
    setState(next);
    document.documentElement.setAttribute("data-sidebar", next);
    try {
      localStorage.setItem(SIDEBAR_STORAGE_KEY, next);
    } catch {
      // best-effort — localStorage unavailable
    }
  }, []);

  const toggle = useCallback(() => {
    apply(state === "collapsed" ? "expanded" : "collapsed");
  }, [apply, state]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      const isToggleCombo = (e.key === "b" || e.key === "B") && (e.metaKey || e.ctrlKey);
      const isBracketCombo = e.key === "[" && !e.metaKey && !e.ctrlKey && !e.altKey;
      if (isToggleCombo || isBracketCombo) {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggle]);

  return { state, toggle, set: apply };
}
