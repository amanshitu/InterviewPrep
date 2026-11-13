import { Fragment, useEffect, useState } from "react";
import { getUsers, getUserStats, type AdminUserRow, type AdminUserStatsResponse } from "../../api/admin";
import { useToast } from "../../hooks/use-toast";
import { ChevronLeftIcon, ChevronRightIcon, EyeIcon } from "../layout/icons";
import { StatusBadge } from "./StatusBadge";
import { WeeklyActivityChart } from "../stats/charts";

const PAGE_SIZE = 20;

export function UsersPanel() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const { error } = useToast();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getUsers(page, PAGE_SIZE)
      .then((data) => {
        if (cancelled) return;
        setUsers(data.users);
        setTotal(data.total);
      })
      .catch((err) => {
        if (cancelled) return;
        error(err instanceof Error ? err.message : "Failed to load users.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div>
      {/* Only the first load swaps in "Loading…" — paging keeps the current
          rows (dimmed) until the next page arrives, so the table doesn't
          collapse and yank the Prev/Next buttons out from under the cursor. */}
      {loading && users.length === 0 ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <div className={`overflow-x-auto ${loading ? "opacity-60" : ""}`}>
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-2 pr-3">Name</th>
                <th className="py-2 pr-3">Email</th>
                <th className="py-2 pr-3">Role</th>
                <th className="py-2 pr-3">Joined</th>
                <th className="py-2 pr-3">Categories</th>
                <th className="py-2 pr-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <Fragment key={u.id}>
                  <tr className="border-b border-border/60">
                    <td className="py-2 pr-3 font-medium text-foreground">{u.name}</td>
                    <td className="py-2 pr-3 text-muted-foreground">{u.email}</td>
                    <td className="py-2 pr-3">
                      <StatusBadge status={u.role} />
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {new Date(u.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}
                    </td>
                    <td className="py-2 pr-3 text-muted-foreground">
                      {u.enrolledCategories.map((c) => c.name).join(", ") || "—"}
                    </td>
                    <td className="py-2 pr-3">
                      <button
                        type="button"
                        onClick={() => setExpandedId((id) => (id === u.id ? null : u.id))}
                        className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                      >
                        <EyeIcon width={13} height={13} /> {expandedId === u.id ? "Hide stats" : "View stats"}
                      </button>
                    </td>
                  </tr>
                  {expandedId === u.id ? (
                    <tr>
                      <td colSpan={6} className="pb-4">
                        <UserStatsPanel userId={u.id} />
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between text-sm text-muted-foreground">
        <span>
          {total} user{total === 1 ? "" : "s"} total
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 disabled:opacity-40"
          >
            <ChevronLeftIcon width={14} height={14} /> Prev
          </button>
          <span>
            Page {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            className="inline-flex items-center gap-1 rounded-md border border-border px-2.5 py-1 disabled:opacity-40"
          >
            Next <ChevronRightIcon width={14} height={14} />
          </button>
        </div>
      </div>
    </div>
  );
}

// Read-only support view of a single user's own Stats-page data — lets an
// admin see e.g. why a user reports "no questions on Today" (empty focus
// areas / zero completion) without needing that user's own session.
function UserStatsPanel({ userId }: { userId: string }) {
  const [data, setData] = useState<AdminUserStatsResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // null = "whichever category is currently active for this user" (the
  // server's own default); set once the user picks a specific tab below.
  const [categoryId, setCategoryId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setErr(null);
    getUserStats(userId, categoryId ?? undefined)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch((e) => {
        if (!cancelled) setErr(e instanceof Error ? e.message : "Failed to load this user's stats.");
      });
    return () => {
      cancelled = true;
    };
  }, [userId, categoryId]);

  if (err) return <p className="text-sm text-destructive">{err}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Loading stats…</p>;

  const completedEvents = data.activity.filter((e) => e.event_type === "reveal");
  const today = new Date();
  const weekDays: string[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    weekDays.push(d.toISOString().slice(0, 10));
  }
  const weekCounts = weekDays.map((day) => completedEvents.filter((e) => (e.occurred_at || "").slice(0, 10) === day).length);
  const avgSelfTestScore = data.selfTestHistory.length
    ? (data.selfTestHistory.reduce((sum, r) => sum + r.score, 0) / data.selfTestHistory.length).toFixed(1)
    : "—";

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-4">
      {data.enrolledCategories.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {data.enrolledCategories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
              className={`rounded-full px-3 py-1 text-xs font-semibold ${
                c.id === data.categoryId ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {c.name}
            </button>
          ))}
        </div>
      ) : null}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <MiniStat label="Overall completion" value={`${data.progress.overall.completionPct}%`} />
        <MiniStat label="Questions done" value={data.progress.overall.totalCompleted} />
        <MiniStat label="Logged actions" value={data.activity.length} />
        <MiniStat label="Avg Self Test score" value={`${avgSelfTestScore}/10`} />
      </div>

      <div className="mt-3">
        <WeeklyActivityChart days={weekDays} counts={weekCounts} />
      </div>

      <div className="mt-3">
        <div className="text-sm font-semibold text-foreground">Focus areas</div>
        {data.progress.focusAreas.length === 0 ? (
          <p className="mt-1 text-sm text-muted-foreground">No focus-area signal yet.</p>
        ) : (
          <div className="mt-1.5 flex flex-col gap-1.5">
            {data.progress.focusAreas.map((t, i) => (
              <div key={t.topic} className="flex items-center gap-2 text-sm">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{i + 1}</span>
                <span className="text-foreground">{t.topic}</span>
                <span className="text-muted-foreground">
                  {t.completed}/{t.total} done ({t.completionPct}%)
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <div className="text-lg font-bold text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
