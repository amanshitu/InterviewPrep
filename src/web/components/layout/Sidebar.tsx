import type { ComponentType, SVGProps } from "react";
import { Link, NavLink } from "react-router";
import type { User } from "../../api/types";
import { useSidebar } from "../../hooks/use-sidebar";
import { primaryNav, secondaryNav, type NavItem } from "../../lib/nav";
import type { RefreshUser } from "./AuthGate";
import { LogoMark, PanelLeftCloseIcon, PanelLeftOpenIcon } from "./icons";
import { ProfileMenu } from "./ProfileMenu";

// Desktop-only collapsible left sidebar, matching MealSathi's app-shell
// sidebar mechanics: width/label-collapse driven entirely by the
// `data-sidebar` attribute + CSS (see globals.css's `rail` variant and
// `--sidebar-w` var), not by conditional rendering — so the transition is
// a smooth CSS animation, not a re-mount. Hidden below the mobile
// breakpoint, where MobileHeader + MobileNav take over.
export function Sidebar({ user, refreshUser, onLogout }: { user: User; refreshUser: RefreshUser; onLogout: () => void }) {
  const { state, toggle } = useSidebar();
  const collapsed = state === "collapsed";

  return (
    <aside
      className="hidden sm:flex sticky top-0 h-full shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-(--rail-dur) ease-(--rail-ease)"
      style={{ width: "var(--sidebar-w)" }}
    >
      <div className="flex min-h-14 items-center justify-between gap-2 px-3 py-2 rail:h-auto rail:flex-col rail:justify-center rail:gap-2 rail:py-3">
        <Link to="/" className="flex min-w-0 items-center gap-2 overflow-hidden">
          <LogoMark size={22} className="shrink-0" />
          <span className="rail:max-w-0 rail:opacity-0 flex max-w-35 flex-col overflow-hidden opacity-100 transition-[max-width,opacity] duration-(--rail-dur) ease-(--rail-ease)">
            <span className="whitespace-nowrap text-sm font-bold leading-tight">ExamStreak</span>
            <span className="whitespace-nowrap text-[11px] font-medium leading-tight text-muted-foreground">Practice. Track. Ace it.</span>
          </span>
        </Link>
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
          <SidebarLink key={item.href} item={item} />
        ))}
        <div className="my-2 border-t border-sidebar-border" />
        {secondaryNav
          .filter((item) => !item.adminOnly || user.role === "admin")
          .map((item) => (
            <SidebarLink key={item.href} item={item} />
          ))}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <ProfileMenu user={user} refreshUser={refreshUser} onLogout={onLogout} />
      </div>
    </aside>
  );
}

const linkClass = (active: boolean) =>
  `relative flex items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors ${
    active ? "bg-sidebar-accent text-sidebar-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
  }`;

function LinkContent({ Icon, label, active }: { Icon: ComponentType<SVGProps<SVGSVGElement>>; label: string; active: boolean }) {
  return (
    <>
      {active ? <span className="absolute left-0 top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" /> : null}
      <Icon className="shrink-0" />
      <span className="rail:max-w-0 rail:opacity-0 max-w-40 overflow-hidden whitespace-nowrap opacity-100 transition-[max-width,opacity] duration-(--rail-dur) ease-(--rail-ease)">
        {label}
      </span>
    </>
  );
}

// `external` items (About) are a real navigation boundary — a separate
// document, not part of this app's router — so they stay a plain <a>;
// everything else is a NavLink, giving client-side routing + React
// Router's own active-state detection for free (no manual pathname check).
function SidebarLink({ item }: { item: NavItem }) {
  if (item.external) {
    return (
      <a href={item.href} className={linkClass(false)}>
        <LinkContent Icon={item.icon} label={item.label} active={false} />
      </a>
    );
  }
  return (
    <NavLink to={item.href} end={item.href === "/"} className={({ isActive }) => linkClass(isActive)}>
      {({ isActive }) => <LinkContent Icon={item.icon} label={item.label} active={isActive} />}
    </NavLink>
  );
}
