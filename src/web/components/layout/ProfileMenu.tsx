import { useEffect, useState, type MouseEvent } from "react";
import { Link } from "react-router";
import { listCategories, switchCategory, unenrollCategory } from "../../api/categories";
import type { Category, User } from "../../api/types";
import { useToast } from "../../hooks/use-toast";
import { CheckIcon, LayersIcon, LogOutIcon, SettingsIcon, SpinnerIcon, TrashIcon } from "./icons";

// Hover-opened popover on the sidebar's profile summary — lets a user
// switch their active category (which drives Today/Stats/Daily Test
// server-side) without going into Settings first. The old vanilla-JS app
// had exactly this in its profile dropdown/mobile sheet; it was dropped
// during the React migration even though the backend
// (GET /api/categories, POST /api/categories/switch) never changed. The
// fuller "enroll in a brand-new category" flow still lives in Settings ->
// Prep profile (CategorySection.tsx) — this popover only offers a quick
// switch among categories the user is already enrolled in, plus a link
// there for anything more.
export function ProfileMenu({ user, onLogout }: { user: User; onLogout: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  useEffect(() => {
    if (open && !categories) {
      listCategories()
        .then((data) => setCategories(data.categories))
        .catch(() => setCategories([]));
    }
  }, [open, categories]);

  async function handleSwitch(categoryId: string) {
    if (categoryId === user.activeCategoryId) return;
    setSwitchingId(categoryId);
    try {
      await switchCategory(categoryId);
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't switch category.");
      setSwitchingId(null);
    }
  }

  async function handleUnenroll(categoryId: string, name: string, e: MouseEvent) {
    e.stopPropagation();
    if (!confirm(`Unenroll from ${name}? Your progress there is kept — re-enrolling picks up where you left off.`)) return;
    setSwitchingId(categoryId);
    try {
      await unenrollCategory(categoryId);
      window.location.reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't unenroll from that category.");
      setSwitchingId(null);
    }
  }

  const enrolled = (categories ?? []).filter((c) => c.enrolled);

  return (
    <div className="relative" onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <div className="flex items-center gap-2 rounded-md px-2 py-2 hover:bg-sidebar-accent">
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

      {open ? (
        <div className="absolute bottom-full left-0 z-50 mb-1 w-64 rounded-lg border border-sidebar-border bg-sidebar p-2 text-sidebar-foreground shadow-lg">
          <div className="truncate px-2 py-1.5 text-xs text-muted-foreground">{user.email}</div>
          <div className="my-1 border-t border-sidebar-border" />
          <div className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Category</div>
          {categories === null ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">Loading…</p>
          ) : enrolled.length === 0 ? (
            <p className="px-2 py-1.5 text-sm text-muted-foreground">No categories yet.</p>
          ) : (
            <div className="flex flex-col">
              {enrolled.map((c) => {
                const active = c.id === user.activeCategoryId;
                const switching = switchingId === c.id;
                return (
                  <div key={c.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      disabled={switching}
                      onClick={() => void handleSwitch(c.id)}
                      className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                        active ? "font-semibold text-sidebar-foreground" : "text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground"
                      }`}
                    >
                      <LayersIcon width={14} height={14} className="shrink-0" />
                      <span className="min-w-0 flex-1 truncate">{c.name}</span>
                      {switching ? <SpinnerIcon width={14} height={14} /> : active ? <CheckIcon width={14} height={14} /> : null}
                    </button>
                    {enrolled.length > 1 ? (
                      <button
                        type="button"
                        disabled={switching}
                        onClick={(e) => void handleUnenroll(c.id, c.name, e)}
                        aria-label={`Unenroll from ${c.name}`}
                        className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-sidebar-accent hover:text-destructive"
                      >
                        <TrashIcon width={13} height={13} />
                      </button>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
          <div className="my-1 border-t border-sidebar-border" />
          <Link to="/settings" className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-foreground">
            <SettingsIcon width={14} height={14} /> Manage categories in Settings
          </Link>
        </div>
      ) : null}
    </div>
  );
}
