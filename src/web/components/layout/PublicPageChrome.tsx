// Shared chrome for the standalone (pre-login) info pages — About, Guide,
// FAQ, Privacy, Terms, Press. Each is its own document (see about.html's
// comment in vite.config.ts for why), but they all want the same footer
// and the same "other pages" cross-links, so that's factored out here
// instead of copy-pasted five times.
import { useEffect, useRef, useState, type ComponentType, type SVGProps } from "react";
import { useLocation } from "react-router";
import {
  AboutIcon,
  ArrowRightIcon,
  BookOpenIcon,
  FileTextIcon,
  FlagIcon,
  HelpCircleIcon,
  LogoMark,
  MegaphoneIcon,
  ShieldIcon,
  TodayIcon,
} from "./icons";

/** Shared top bar: logo + name + tagline, and Create account / Sign in buttons —
 * used on every public page, Home included. Shrinks (drops the tagline, tightens
 * padding) once scrolled, same idea as the authenticated app's own collapsing
 * PageHeader, so it stays out of the way on a long page without ever disappearing.
 * Home's own hero sits on a tinted background right below it, which already reads
 * as a visual break; every other public page's content starts on the same flat
 * background as the header, so this gets a border to separate the two instead. */
const HEADER_NAV_LINKS = [
  { href: "/about", label: "About" },
  { href: "/guide", label: "Guide" },
  { href: "/faq", label: "FAQ" },
];

export function PublicHeader() {
  const [compact, setCompact] = useState(false);
  const { pathname } = useLocation();
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const onScroll = () => setCompact(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // Exposed as a CSS var (read by Guide's own sticky section-chip nav,
  // which sits right below this) rather than a hardcoded pixel offset —
  // this header's height changes (shrinks once scrolled), so a fixed
  // number drifts out of sync and leaves a gap the page's own content
  // shows through.
  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const update = () => document.documentElement.style.setProperty("--public-header-h", `${el.offsetHeight}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [compact]);
  return (
    <div ref={rootRef} className="sticky top-0 z-30 border-b border-border bg-background/90 backdrop-blur">
      <header
        className={`mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 transition-[padding] duration-200 sm:px-6 ${compact ? "py-2.5" : "py-5"}`}
      >
        <div className="flex min-w-0 items-center gap-1 sm:gap-4">
          <a href="/home" className="flex min-w-0 shrink-0 items-center gap-2">
            <LogoMark size={26} className="shrink-0" />
            <span className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-lg font-bold leading-tight">ExamStreak</span>
              <span
                className={`block overflow-hidden text-xs font-medium text-muted-foreground transition-all duration-200 ${compact ? "max-h-0 opacity-0" : "max-h-4 opacity-100"}`}
              >
                Practice. Track. Ace it.
              </span>
            </span>
          </a>
          <nav aria-label="Primary" className="hidden shrink-0 items-center gap-1 sm:flex">
            {HEADER_NAV_LINKS.map((link) => (
              <a
                key={link.href}
                href={link.href}
                className={`rounded-md px-3 py-2 text-sm font-medium transition ${
                  pathname === link.href ? "text-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {link.label}
              </a>
            ))}
          </nav>
        </div>
        <a
          href="/login"
          className="inline-flex h-9 shrink-0 items-center justify-center whitespace-nowrap rounded-md border border-border px-4 text-sm font-semibold text-foreground transition hover:bg-secondary"
        >
          Sign in
        </a>
      </header>
    </div>
  );
}

export interface PublicPage {
  id: string;
  href: string;
  label: string;
  tagline: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export const PUBLIC_PAGES: PublicPage[] = [
  { id: "home", href: "/home", label: "Home", tagline: "The full tour — hero, features, and how it works.", icon: TodayIcon },
  { id: "about", href: "/about", label: "About", tagline: "What ExamStreak does and how the daily loop works.", icon: AboutIcon },
  { id: "guide", href: "/guide", label: "Guide", tagline: "A walkthrough of every page, feature by feature.", icon: BookOpenIcon },
  { id: "faq", href: "/faq", label: "FAQ", tagline: "Quick answers to common questions.", icon: HelpCircleIcon },
  { id: "privacy", href: "/privacy", label: "Privacy Policy", tagline: "What we collect, why, and how to get it deleted.", icon: ShieldIcon },
  { id: "terms", href: "/terms", label: "Terms of Service", tagline: "The ground rules for using ExamStreak.", icon: FileTextIcon },
  { id: "grievance", href: "/grievance", label: "Grievance", tagline: "How to raise a concern, and who handles it.", icon: FlagIcon },
  { id: "press", href: "/press", label: "Press", tagline: "Fact sheet, boilerplate, and media contact.", icon: MegaphoneIcon },
];

/** Cross-link grid at the bottom of each public page, excluding the current one. */
export function RelatedPages({ exclude }: { exclude: string }) {
  const pages = PUBLIC_PAGES.filter((p) => p.id !== exclude);
  return (
    <nav aria-label="Other pages" className="rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">More</div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {pages.map((p) => (
          <li key={p.id}>
            <a
              href={p.href}
              className="group flex min-h-13 items-center gap-3 rounded-md border border-border px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-secondary"
            >
              <span aria-hidden className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/12 text-primary">
                <p.icon width={16} height={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold">{p.label}</span>
                <span className="block truncate text-xs text-muted-foreground">{p.tagline}</span>
              </span>
              <ArrowRightIcon width={15} height={15} className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}

/** Shared footer: nav links to every public page, plus the existing copyright/attribution line. */
export function PublicFooter() {
  return (
    <footer className="flex flex-col items-center gap-3 pt-2 text-center text-xs text-muted-foreground">
      <nav aria-label="Legal and info" className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5">
        {PUBLIC_PAGES.map((p) => (
          <a key={p.id} href={p.href} className="underline-offset-2 hover:text-foreground hover:underline">
            {p.label}
          </a>
        ))}
      </nav>
      <p>
        &copy; {new Date().getFullYear()} Xynora. All rights reserved. Designed and developed by{" "}
        <a className="underline underline-offset-2 hover:text-foreground" href="https://www.xynora.in" target="_blank" rel="noopener noreferrer">Xynora</a> &middot;{" "}
        <a className="underline underline-offset-2 hover:text-foreground" href="https://www.xynoramedia.com" target="_blank" rel="noopener noreferrer">Xynora Media</a>
      </p>
    </footer>
  );
}
