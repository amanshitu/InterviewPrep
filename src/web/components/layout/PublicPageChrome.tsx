// Shared chrome for the standalone (pre-login) info pages — About, Guide,
// FAQ, Privacy, Terms, Press. Each is its own document (see about.html's
// comment in vite.config.ts for why), but they all want the same footer
// and the same "other pages" cross-links, so that's factored out here
// instead of copy-pasted five times.
import type { ComponentType, SVGProps } from "react";
import {
  AboutIcon,
  ArrowRightIcon,
  BookOpenIcon,
  FileTextIcon,
  FlagIcon,
  HelpCircleIcon,
  MegaphoneIcon,
  ShieldIcon,
  TodayIcon,
} from "./icons";

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
    <nav aria-label="Other pages" className="rounded-(--radius) border border-border bg-card p-6 text-card-foreground shadow-sm">
      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">More</div>
      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {pages.map((p) => (
          <li key={p.id}>
            <a
              href={p.href}
              className="group flex min-h-13 items-center gap-3 rounded-(--radius-md) border border-border px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-secondary"
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
