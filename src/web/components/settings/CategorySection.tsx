import { useEffect, useState } from "react";
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
                      <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                        <LayersIcon width={15} height={15} /> {c.name}
                        {active ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-success/15 px-2 py-0.5 text-xs font-semibold text-success">
                            <CheckIcon width={11} height={11} /> Active
                          </span>
                        ) : null}
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
                  {notEnrolled.map((c) => (
                    <div key={c.id} className="flex flex-col gap-2.5 rounded-md border border-dashed border-border p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{c.name}</div>
                        {c.description ? <p className="mt-0.5 text-xs text-muted-foreground">{c.description}</p> : null}
                      </div>
                      <PrimaryButton onClick={() => void handleEnroll(c.id)} loading={busyId === c.id} loadingText="Enrolling…" className="mt-auto self-start">
                        <PlusIcon width={14} height={14} /> Enroll
                      </PrimaryButton>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {notEnrolled.map((c) => (
                    <div key={c.id} className="flex items-center justify-between gap-3 rounded-md border border-dashed border-border p-3">
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-foreground">{c.name}</div>
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
