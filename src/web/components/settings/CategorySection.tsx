import { useEffect, useState, type SVGProps } from "react";
import { listCategories, enrollCategory, switchCategory, unenrollCategory } from "../../api/categories";
import type { Category, User } from "../../api/types";
import { useRefreshUser } from "../layout/AppShell";
import { useConfirm } from "../../hooks/use-confirm";
import { useToast } from "../../hooks/use-toast";
import { usePersistedPreference } from "../../hooks/use-persisted-preference";
import { GhostButton, PrimaryButton, SecondaryButton, SectionCard } from "./SectionCard";
import { CheckIcon, GridIcon, LayersIcon, ListIcon, PlusIcon, TrashIcon } from "./icons";

type BrowseViewMode = "card" | "list";
const BROWSE_VIEW_KEY = "examstreak-category-browse-view";

// A subject-relevant glyph + hue per category, used as a large, low-opacity
// background decoration on each card in card view (never on list rows —
// keeping that view dense/plain is the whole point of offering it). Hue is
// mixed into the card's own `--card` background via `color-mix`, so it
// stays a light wash in light themes and a muted tint in dark ones without
// needing separate light/dark values. New categories not in this map fall
// back to the generic layered-content glyph rather than breaking.
function BankIcon(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 10 12 4l9 6M4 10v9M8 10v9M12 10v9M16 10v9M20 10v9M2 19h20" /></svg>;
}
function MonitorGlyph(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="4" width="18" height="13" rx="1.5" /><path d="M8 21h8M12 17v4" /></svg>;
}
function NewspaperIcon(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 4h12v15a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V4Z" /><path d="M18 8h2v11a2 2 0 0 1-2 2M7 8h6M7 12h6M7 16h4" /></svg>;
}
function ShieldIcon(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z" /></svg>;
}
function GearIcon(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="12" r="3.2" /><path d="M12 2.5v3M12 18.5v3M21.5 12h-3M5.5 12h-3M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1M18.4 18.4l-2.1-2.1M7.7 7.7 5.6 5.6" /></svg>;
}
function UmbrellaIcon(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 12a9 9 0 0 1 18 0Z" /><path d="M12 12v8a2 2 0 0 1-2 2M12 3v2" /></svg>;
}
function ScaleIcon(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M12 3v15M6 7h12M6 7 3 13a3 3 0 0 0 6 0L6 7ZM18 7l-3 6a3 3 0 0 0 6 0l-3-6ZM8 21h8" /></svg>;
}
function BriefcaseIcon(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="3" y="8" width="18" height="12" rx="1.5" /><path d="M9 8V6a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" /></svg>;
}
function SigmaIcon(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M18 4H6l6 8-6 8h12" /></svg>;
}
function BadgeIcon(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><circle cx="12" cy="9" r="6" /><path d="m9 14-2 7 5-3 5 3-2-7" /></svg>;
}
function TrainIcon(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="4" y="3" width="16" height="13" rx="3" /><path d="M4 11h16M8 16l-2 4M16 16l2 4" /><circle cx="8.5" cy="13" r="0.1" /><circle cx="15.5" cy="13" r="0.1" /></svg>;
}
function ClipboardGlyph(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><rect x="5" y="4" width="14" height="17" rx="1.5" /><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1M9 11h6M9 15h6" /></svg>;
}
function GraduationCapIcon(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M2 9 12 4l10 5-10 5-10-5Z" /><path d="M6 11.5V16c0 1.5 3 3 6 3s6-1.5 6-3v-4.5" /></svg>;
}
function ChatIcon(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M4 5h16v11H8l-4 4V5Z" /></svg>;
}
function LandmarkIcon(p: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" {...p}><path d="M3 21h18M4 21V10M20 21V10M2 10l10-6 10 6M7 10v8M12 10v8M17 10v8" /></svg>;
}

const CATEGORY_VISUALS: Record<string, { hue: number; Icon: (p: SVGProps<SVGSVGElement>) => React.JSX.Element }> = {
  "banking-exam": { hue: 150, Icon: BankIcon },
  "computer-awareness": { hue: 255, Icon: MonitorGlyph },
  "current-affairs-gk": { hue: 25, Icon: NewspaperIcon },
  "defence-exam": { hue: 95, Icon: ShieldIcon },
  "gate-engineering": { hue: 205, Icon: GearIcon },
  "insurance-exam": { hue: 280, Icon: UmbrellaIcon },
  "interview-prep": { hue: 190, Icon: ChatIcon },
  "judiciary-law": { hue: 340, Icon: ScaleIcon },
  "mba-entrance": { hue: 35, Icon: BriefcaseIcon },
  "math-aptitude": { hue: 215, Icon: SigmaIcon },
  "police-exam": { hue: 225, Icon: BadgeIcon },
  "railway-exam": { hue: 15, Icon: TrainIcon },
  "ssc-exam": { hue: 165, Icon: ClipboardGlyph },
  "teaching-exam": { hue: 50, Icon: GraduationCapIcon },
  "tech-leadership-interview": { hue: 265, Icon: LayersIcon },
  "upsc-gs": { hue: 310, Icon: LandmarkIcon },
};
const DEFAULT_VISUAL = { hue: 230, Icon: LayersIcon };

function CategoryQuestionCount({ count }: { count: number }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-secondary-foreground">
      {count.toLocaleString()} question{count === 1 ? "" : "s"}
    </span>
  );
}

// Lets a user see every category they're enrolled in, switch which one is
// active (drives Today/Stats/Daily Test/etc. server-side), and enroll in a
// new one (e.g. the Mathematics category) — this existed in the old
// vanilla-JS app's profile dropdown/mobile sheet but was never ported
// during the React migration, even though the backend
// (GET /api/categories, POST /api/categories/enroll|switch) was untouched
// and fully working the whole time. A switch/enroll/unenroll calls
// refreshUser() (AppShell/AuthGate) instead of reloading the document —
// that fixes the full-page flash a reload caused (the sidebar/header never
// unmount); Settings re-keys its own category-scoped sections on the
// user's activeCategoryId, and AppShell does the same for every other
// routed page, so they still refetch fresh data for the new category.
export function CategorySection({ user }: { user: User }) {
  const toast = useToast();
  const confirm = useConfirm();
  const refreshUser = useRefreshUser();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [browseView, setBrowseView] = usePersistedPreference<BrowseViewMode>(BROWSE_VIEW_KEY, "card");

  // Fetched once, for the catalogue (names/descriptions) only — which ones
  // are enrolled comes from user.enrolledCategories below, so the single
  // refreshUser() after a mutation moves a row between the two lists and
  // flips the Active badge in the same render (no second refetch, and no
  // frame where the button has stopped spinning but the row hasn't moved).
  useEffect(() => {
    listCategories()
      .then((data) => setCategories(data.categories))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load categories."));
  }, []);

  async function handleSwitch(categoryId: string) {
    setBusyId(categoryId);
    try {
      await switchCategory(categoryId);
      await refreshUser();
      toast.success("Switched category.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't switch category.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleEnroll(categoryId: string) {
    setBusyId(categoryId);
    try {
      await enrollCategory(categoryId);
      await switchCategory(categoryId);
      await refreshUser();
      toast.success("Enrolled.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't enroll in that category.");
    } finally {
      setBusyId(null);
    }
  }

  async function handleUnenroll(categoryId: string, name: string) {
    const ok = await confirm({
      title: `Unenroll from ${name}?`,
      message: "Your progress there is kept — re-enrolling picks up where you left off.",
      confirmLabel: "Unenroll",
      destructive: true,
    });
    if (!ok) return;
    setBusyId(categoryId);
    try {
      await unenrollCategory(categoryId);
      await refreshUser();
      toast.success(`Unenrolled from ${name}.`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't unenroll from that category.");
    } finally {
      setBusyId(null);
    }
  }

  const enrolledIds = new Set(user.enrolledCategories.map((c) => c.id));
  const enrolled = categories?.filter((c) => enrolledIds.has(c.id)) ?? [];
  const notEnrolled = categories?.filter((c) => !enrolledIds.has(c.id)) ?? [];

  return (
    <SectionCard
      title="Categories"
      subtitle="Each category has its own daily quota, streak, and question pool — switch to change what Today/Stats/Daily Test pull from, enroll in a new one, or unenroll from one you're done with (you'll always need at least one)."
    >
      {error ? (
        <p className="text-sm text-destructive">{error}</p>
      ) : !categories ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-1.5 text-sm font-semibold text-foreground">Your categories</div>
            <div className="flex flex-col gap-2">
              {enrolled.map((c) => {
                const active = c.id === user.activeCategoryId;
                return (
                  <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium text-foreground">
                        <LayersIcon width={15} height={15} /> {c.name}
                        {active ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                            <CheckIcon width={11} height={11} /> Active
                          </span>
                        ) : null}
                        <CategoryQuestionCount count={c.questionCount} />
                      </div>
                      {c.description ? <p className="mt-0.5 text-xs text-muted-foreground">{c.description}</p> : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1.5">
                      {!active ? (
                        <SecondaryButton onClick={() => void handleSwitch(c.id)} loading={busyId === c.id} loadingText="Switching…">
                          Switch
                        </SecondaryButton>
                      ) : null}
                      {enrolled.length > 1 ? (
                        <GhostButton
                          onClick={() => void handleUnenroll(c.id, c.name)}
                          disabled={busyId !== null && busyId !== c.id}
                          aria-label={`Unenroll from ${c.name}`}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <TrashIcon width={14} height={14} />
                        </GhostButton>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {notEnrolled.length > 0 ? (
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <div className="text-sm font-semibold text-foreground">Enroll in another category</div>
                <div className="flex shrink-0 overflow-hidden rounded-md border border-border">
                  <button
                    type="button"
                    onClick={() => setBrowseView("card")}
                    aria-pressed={browseView === "card"}
                    aria-label="Show as cards"
                    title="Card view"
                    className={`flex h-7 w-7 items-center justify-center ${browseView === "card" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    <GridIcon width={14} height={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setBrowseView("list")}
                    aria-pressed={browseView === "list"}
                    aria-label="Show as list"
                    title="List view"
                    className={`flex h-7 w-7 items-center justify-center border-l border-border ${browseView === "list" ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    <ListIcon width={14} height={14} />
                  </button>
                </div>
              </div>
              {browseView === "card" ? (
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
                  {notEnrolled.map((c) => {
                    const { hue, Icon } = CATEGORY_VISUALS[c.id] ?? DEFAULT_VISUAL;
                    return (
                      <div
                        key={c.id}
                        className="relative flex flex-col gap-2.5 overflow-hidden rounded-md border border-dashed border-border p-3"
                        style={{ background: `linear-gradient(135deg, color-mix(in oklch, hsl(${hue} 75% 55%) 16%, var(--card)) 0%, var(--card) 60%)` }}
                      >
                        <Icon
                          aria-hidden
                          width={108}
                          height={108}
                          className="pointer-events-none absolute -right-4 -top-4 opacity-[0.12]"
                          style={{ color: `hsl(${hue} 70% 45%)` }}
                        />
                        <div className="relative min-w-0">
                          <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">{c.name}</div>
                          {c.description ? <p className="mt-0.5 text-xs text-muted-foreground">{c.description}</p> : null}
                          <div className="mt-1.5">
                            <CategoryQuestionCount count={c.questionCount} />
                          </div>
                        </div>
                        <PrimaryButton onClick={() => void handleEnroll(c.id)} loading={busyId === c.id} loadingText="Enrolling…" className="relative mt-auto self-start">
                          <PlusIcon width={14} height={14} /> Enroll
                        </PrimaryButton>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {notEnrolled.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border p-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5 text-sm font-medium text-foreground">
                          {c.name}
                          <CategoryQuestionCount count={c.questionCount} />
                        </div>
                        {c.description ? <p className="mt-0.5 text-xs text-muted-foreground">{c.description}</p> : null}
                      </div>
                      <PrimaryButton onClick={() => void handleEnroll(c.id)} loading={busyId === c.id} loadingText="Enrolling…" className="shrink-0">
                        <PlusIcon width={14} height={14} /> Enroll
                      </PrimaryButton>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
