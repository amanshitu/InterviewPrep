import { useEffect, useState } from "react";
import { listCategories, enrollCategory, switchCategory, unenrollCategory } from "../../api/categories";
import type { Category, User } from "../../api/types";
import { useToast } from "../../hooks/use-toast";
import { GhostButton, PrimaryButton, SecondaryButton, SectionCard } from "./SectionCard";
import { CheckIcon, LayersIcon, PlusIcon, TrashIcon } from "./icons";

// Lets a user see every category they're enrolled in, switch which one is
// active (drives Today/Stats/Daily Test/etc. server-side), and enroll in a
// new one (e.g. the Mathematics category) — this existed in the old
// vanilla-JS app's profile dropdown/mobile sheet but was never ported
// during the React migration, even though the backend
// (GET /api/categories, POST /api/categories/enroll|switch) was untouched
// and fully working the whole time. A switch/enroll reloads the page
// (matching PasswordSection's "sign out of all devices" pattern) so every
// other part of the app — fetched server-side per request anyway — picks
// up the new active category immediately.
export function CategorySection({ user }: { user: User }) {
  const toast = useToast();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    listCategories()
      .then((data) => setCategories(data.categories))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load categories."));
  }, []);

  async function handleSwitch(categoryId: string) {
    setBusyId(categoryId);
    try {
      await switchCategory(categoryId);
      toast.success("Switched category — reloading…");
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't switch category.");
      setBusyId(null);
    }
  }

  async function handleEnroll(categoryId: string) {
    setBusyId(categoryId);
    try {
      await enrollCategory(categoryId);
      await switchCategory(categoryId);
      toast.success("Enrolled — reloading…");
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't enroll in that category.");
      setBusyId(null);
    }
  }

  async function handleUnenroll(categoryId: string, name: string) {
    if (!confirm(`Unenroll from ${name}? Your progress there is kept — re-enrolling picks up where you left off.`)) return;
    setBusyId(categoryId);
    try {
      await unenrollCategory(categoryId);
      toast.success("Unenrolled — reloading…");
      window.location.href = "/";
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't unenroll from that category.");
      setBusyId(null);
    }
  }

  const enrolled = categories?.filter((c) => c.enrolled) ?? [];
  const notEnrolled = categories?.filter((c) => !c.enrolled) ?? [];

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
              <div className="mb-1.5 text-sm font-semibold text-foreground">Enroll in another category</div>
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
            </div>
          ) : null}
        </div>
      )}
    </SectionCard>
  );
}
