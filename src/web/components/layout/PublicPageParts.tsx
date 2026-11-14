// Shared layout primitives for the standalone public info pages (About,
// Guide, FAQ, Privacy, Terms, Press) — split out of About.tsx (the first
// of these pages) once a second page needed the same card/heading look.
import type { ReactNode } from "react";
import { PublicHeader } from "./PublicPageChrome";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function SectionTitle({ children, size = "base" }: { children: ReactNode; size?: "base" | "lg" }) {
  return <div className={size === "lg" ? "text-xl font-bold" : "text-[17px] font-bold"}>{children}</div>;
}

/** Shared outer shell every public page uses: same top header as Home, centered content column, back link + footer are added by each page. */
export function PublicPage({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <PublicHeader />
      <div className="mx-auto flex max-w-2xl flex-col gap-5 px-4 py-10">{children}</div>
    </div>
  );
}
