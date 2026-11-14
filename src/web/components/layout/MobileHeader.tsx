import { useState } from "react";
import { Link, NavLink } from "react-router";
import type { User } from "../../api/types";
import { primaryNav, secondaryNav, type NavItem } from "../../lib/nav";
import { FeedbackModal } from "./FeedbackModal";
import { LogOutIcon, LogoMark, MessageIcon } from "./icons";

// Mobile-only sticky header (sidebar is desktop-only, hidden below the
// `sm:` breakpoint — see Sidebar.tsx) — brand on the left, a drawer menu
// trigger on the right, matching MealSathi's mobile chrome pattern. Stays
// put on scroll — the per-page collapsing title (see PageHeader.tsx) is
// what reacts to scroll position, pinned right under this bar.
export function MobileHeader({ user, onLogout }: { user: User; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  return (
    <>
      <header className="sm:hidden sticky top-(--banner-h,0px) z-30 flex min-h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur pt-[env(safe-area-inset-top,0px)]">
        <Link to="/" className="flex items-center gap-2">
          <LogoMark size={20} />
          <span className="leading-tight">
            <span className="block text-sm font-bold text-foreground">ExamStreak</span>
            <span className="block text-[10px] font-medium text-muted-foreground">Practice. Track. Ace it.</span>
          </span>
        </Link>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="flex h-9 w-9 items-center justify-center rounded-md text-muted-foreground"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      </header>

      {open ? (
        <div className="sm:hidden fixed inset-0 z-40 flex justify-end bg-black/40" onClick={() => setOpen(false)}>
          <div
            className="flex h-full w-72 flex-col bg-sidebar text-sidebar-foreground p-3 pt-[calc(0.75rem+env(safe-area-inset-top,0px))] pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between px-1">
              <div className="text-sm font-semibold">{user.name}</div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close menu" className="text-muted-foreground">
                ✕
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1 overflow-y-auto">
              {primaryNav.map((item) => (
                <MobileNavLink key={item.href} item={item} onNavigate={() => setOpen(false)} />
              ))}
              <div className="my-2 border-t border-sidebar-border" />
              {secondaryNav
                .filter((item) => !item.adminOnly || user.role === "admin")
                .map((item) => (
                  <MobileNavLink key={item.href} item={item} onNavigate={() => setOpen(false)} />
                ))}
              <button
                type="button"
                onClick={() => { setOpen(false); setFeedbackOpen(true); }}
                className={mobileLinkClass}
              >
                <MessageIcon /> Feedback
              </button>
            </nav>
            <button
              type="button"
              onClick={onLogout}
              className="flex items-center gap-3 rounded-md px-2.5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <LogOutIcon /> Log out
            </button>
          </div>
        </div>
      ) : null}

      {feedbackOpen ? <FeedbackModal onClose={() => setFeedbackOpen(false)} /> : null}
    </>
  );
}

const mobileLinkClass = "flex items-center gap-3 rounded-md px-2.5 py-2.5 text-sm font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground";

// `external` items (About) are a real navigation boundary, so they stay a
// plain <a> (no onNavigate needed — a full page load closes this drawer on
// its own). Everything else is a NavLink that also closes the drawer after
// navigating, since client-side routing no longer unmounts this component
// the way a full page load used to.
function MobileNavLink({ item, onNavigate }: { item: NavItem; onNavigate: () => void }) {
  if (item.external) {
    return (
      <a href={item.href} className={mobileLinkClass}>
        <item.icon /> {item.label}
      </a>
    );
  }
  return (
    <NavLink to={item.href} end={item.href === "/"} onClick={onNavigate} className={({ isActive }) => `${mobileLinkClass} ${isActive ? "bg-sidebar-accent text-sidebar-foreground" : ""}`}>
      <item.icon /> {item.label}
    </NavLink>
  );
}
