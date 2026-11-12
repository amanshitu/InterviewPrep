// Shared constants for the collapsible left sidebar, mirroring MealSathi's
// app-shell sidebar mechanics (see the Phase 8.x MealSathi-theme research
// notes). These are referenced both by `hooks/use-sidebar.ts` (the React
// side, which owns the live toggle/keyboard-shortcut behavior) and need to
// stay in sync with `public/theme-init.js` (a plain script, not a TS
// module, which pre-paints the initial collapsed/expanded state before
// React mounts to avoid a layout flash) — theme-init.js can't literally
// `import` this file, so if these values change, update the matching
// literals there too.
export const SIDEBAR_STORAGE_KEY = "sidebar-state";

export const SIDEBAR_WIDTH_EXPANDED = "15rem";
export const SIDEBAR_WIDTH_COLLAPSED = "4.5rem";

export type SidebarState = "expanded" | "collapsed";

// Responsive default (used only when no saved preference exists yet):
// below COLLAPSE_BELOW the sidebar is always collapsed regardless of any
// saved preference (there's no room for it expanded); between that and
// EXPAND_AT it defaults to collapsed but honors a saved "expanded" choice;
// at EXPAND_AT and above it defaults to expanded.
export const SIDEBAR_COLLAPSE_BELOW_PX = 1024;
export const SIDEBAR_EXPAND_AT_PX = 1280;

export function initialSidebarState(viewportWidth: number, saved: SidebarState | null): SidebarState {
  if (viewportWidth < SIDEBAR_COLLAPSE_BELOW_PX) return "collapsed";
  if (viewportWidth < SIDEBAR_EXPAND_AT_PX) return saved ?? "collapsed";
  return saved ?? "expanded";
}
