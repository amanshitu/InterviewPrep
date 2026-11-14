import { useEffect, useRef, useState, type ReactNode } from "react";

// Page header with a collapsing-title effect, ported from CosmoBlog's own
// PageHeader.tsx: a normal in-flow <h1> at the top of the page, plus a
// compact frosted bar — permanently mounted but invisible — that cross-
// fades into view once the big title scrolls up past the fixed header
// (mobile's 56px top bar, or the very top on desktop), and fades back out
// once the title is back in view. Driven by the title's own position, not
// scroll direction or distance, so there's never a gap with neither title
// showing, and it reacts correctly to window resizes, not just scrolling.
// The big header itself also fades and drifts up slightly as it leaves, so
// the hand-over to the compact bar reads as one continuous motion.
export function PageHeader({
  title,
  eyebrow,
  caption,
  actions,
  sticky = true,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  caption?: ReactNode;
  actions?: ReactNode;
  sticky?: boolean;
}) {
  const headerRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const header = headerRef.current;
    const titleEl = titleRef.current;
    if (!sticky || !header || !titleEl) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = desktop.matches ? 0 : 56; // phones: under the sticky mobile top bar
      setCompact(titleEl.getBoundingClientRect().top < top + 4);
      const rect = header.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (top - rect.top) / Math.max(1, rect.height * 0.6)));
      header.style.opacity = String(1 - p);
      header.style.transform = reduceMotion() ? "" : `translate3d(0, ${p * 10}px, 0)`;
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      if (frame) cancelAnimationFrame(frame);
      header.style.opacity = "";
      header.style.transform = "";
    };
  }, [sticky]);

  // The bar is fixed and spans the page's own content column (measured),
  // so it lines up correctly under the desktop sidebar's max-width column
  // instead of stretching under it edge-to-edge. Full viewport width on
  // mobile, where there's no sidebar to account for.
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!sticky || !header) return;
    const desktop = window.matchMedia("(min-width: 768px)");
    const column = header.closest("#main")?.firstElementChild as HTMLElement | null;
    const measure = () => {
      if (!desktop.matches || !column) return setBox(null);
      const r = column.getBoundingClientRect();
      setBox((prev) => (prev && prev.left === r.left && prev.width === r.width ? prev : { left: r.left, width: r.width }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (column) ro.observe(column);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [sticky]);

  const compactBar = sticky && (
    <div
      className="fixed inset-x-0 top-[calc(3.5rem+env(safe-area-inset-top,0px))] md:top-0 z-30 h-0"
      style={box ? { left: box.left, width: box.width, right: "auto" } : undefined}
      aria-hidden={!compact}
      inert={!compact}
    >
      <div
        className={`absolute inset-x-0 border-b border-border bg-background/90 px-4 shadow-sm backdrop-blur transition-[transform,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] sm:px-6 ${
          compact ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex h-14 items-center gap-2">
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold leading-tight tracking-tight md:text-lg">{title}</p>
            {caption && <p className="truncate text-xs text-muted-foreground">{caption}</p>}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {compactBar}
      <header ref={headerRef} className="flex items-start gap-2 pb-4 will-change-[opacity,transform]">
        <div className="min-w-0 flex-1">
          {eyebrow && <p className="text-sm text-muted-foreground">{eyebrow}</p>}
          <h1 ref={titleRef} className="text-balance text-2xl font-bold leading-tight tracking-tight text-foreground">
            {title}
          </h1>
          {caption && <p className="mt-1 max-w-prose text-sm text-muted-foreground">{caption}</p>}
        </div>
        {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
      </header>
    </>
  );
}
