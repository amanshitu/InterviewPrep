import type { ComponentType, SVGProps } from "react";
import type { User } from "../../api/types";
import { useSidebar } from "../../hooks/use-sidebar";
import { primaryNav, secondaryNav } from "../../lib/nav";
import { LogOutIcon, PanelLeftCloseIcon, PanelLeftOpenIcon } from "./icons";

// Desktop-only collapsible left sidebar, matching MealSathi's app-shell
// sidebar mechanics: width/label-collapse driven entirely by the
// `data-sidebar` attribute + CSS (see globals.css's `rail` variant and
// `--sidebar-w` var), not by conditional rendering — so the transition is
// a smooth CSS animation, not a re-mount. Hidden below the mobile
// breakpoint, where MobileHeader + MobileNav take over.
export function Sidebar({ user, onLogout }: { user: User; onLogout: () => void }) {
  const { state, toggle } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <aside
      className="hidden sm:flex sticky top-0 h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-(--rail-dur) ease-(--rail-ease)"
      style={{ width: "var(--sidebar-w)" }}
    >
      <div className="flex h-14 items-center justify-between gap-2 px-3">
        <a href="/" className="flex min-w-0 items-center gap-2 overflow-hidden">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-primary">
            <path d="M12 2 3 6.5v6C3 17.2 6.9 21.3 12 22.5 17.1 21.3 21 17.2 21 12.5v-6L12 2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M8.5 12.2l2.3 2.3 4.7-4.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="rail:max-w-0 rail:opacity-0 max-w-[140px] overflow-hidden whitespace-nowrap text-sm font-bold opacity-100 transition-[max-width,opacity] duration-(--rail-dur) ease-(--rail-ease)">
            Interview Prep
          </span>
        </a>
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
        >
          {collapsed ? <PanelLeftOpenIcon /> : <PanelLeftCloseIcon />}
        </button>
      </div>

      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-2">
        {primaryNav.map((item) => (
          <SidebarLink key={item.href} href={item.href} label={item.label} Icon={item.icon} />
        ))}
        <div className="my-2 border-t border-sidebar-border" />
        {secondaryNav
          .filter((item) => !item.adminOnly || user.role === "admin")
          .map((item) => (
            <SidebarLink key={item.href} href={item.href} label={item.label} Icon={item.icon} />
          ))}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <div className="flex items-center gap-2 rounded-md px-2 py-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
            {user.name.slice(0, 1).toUpperCase()}
          </div>
          <span className="rail:max-w-0 rail:opacity-0 min-w-0 flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-sm font-medium opacity-100 transition-[max-width,opacity] duration-(--rail-dur) ease-(--rail-ease)">
            {user.name}
          </span>
          <button
            type="button"
            onClick={onLogout}
            aria-label="Log out"
            className="rail:hidden shrink-0 text-muted-foreground hover:text-foreground"
          >
            <LogOutIcon width={16} height={16} />
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink({ href, label, Icon }: { href: string; label: string; Icon: ComponentType<SVGProps<SVGSVGElement>> }) {
  const active = typeof window !== "undefined" && window.location.pathname === href;
  return (
    <a
      href={href}
      className={`relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
        active ? "bg-sidebar-accent text-sidebar-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
      }`}
    >
      {active ? <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" /> : null}
      <Icon className="shrink-0" />
      <span className="rail:max-w-0 rail:opacity-0 max-w-[160px] overflow-hidden whitespace-nowrap opacity-100 transition-[max-width,opacity] duration-(--rail-dur) ease-(--rail-ease)">
        {label}
      </span>
    </a>
  );
}
