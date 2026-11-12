import { useCallback, useEffect, useState, type ComponentType, type SVGProps } from "react";
import { getApprovalHistory, getOverview, getPendingSets, type AdminOverview, type ApprovalHistoryEntry, type PendingQuestionSet } from "../../api/admin";
import { listCategories } from "../../api/categories";
import type { Category } from "../../api/types";
import { AppShell } from "../../components/layout/AppShell";
import { ClockIcon, FolderIcon, RefreshIcon, UsersIcon } from "../../components/layout/icons";
import { KpiCard } from "../../components/admin/KpiCard";
import { Section } from "../../components/admin/Section";
import { CategoriesPanel } from "../../components/admin/CategoriesPanel";
import { PendingSetsPanel } from "../../components/admin/PendingSetsPanel";
import { HistoryPanel } from "../../components/admin/HistoryPanel";
import { UsersPanel } from "../../components/admin/UsersPanel";
import { useToast } from "../../hooks/use-toast";
import type { User } from "../../api/types";

type Tab = "categories" | "pending" | "history" | "users";

const TABS: { key: Tab; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { key: "pending", label: "Pending Approvals", icon: ClockIcon },
  { key: "categories", label: "Categories", icon: FolderIcon },
  { key: "history", label: "History", icon: RefreshIcon },
  { key: "users", label: "Users", icon: UsersIcon },
];

export function AdminHome() {
  return <AppShell>{(user) => (user.role === "admin" ? <AdminDashboard /> : <Forbidden user={user} />)}</AppShell>;
}

function Forbidden({ user }: { user: User }) {
  return (
    <div className="rounded-lg border border-border bg-card p-6 text-center">
      <p className="text-sm text-muted-foreground">
        {user.name}, this page is only available to admin accounts.
      </p>
    </div>
  );
}

function AdminDashboard() {
  const [tab, setTab] = useState<Tab>("pending");
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [sets, setSets] = useState<PendingQuestionSet[]>([]);
  const [history, setHistory] = useState<ApprovalHistoryEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const { error } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    const [overviewResult, pendingResult, historyResult, categoriesResult] = await Promise.allSettled([
      getOverview(),
      getPendingSets(),
      getApprovalHistory(),
      listCategories(),
    ]);
    if (overviewResult.status === "fulfilled") setOverview(overviewResult.value);
    if (pendingResult.status === "fulfilled") setSets(pendingResult.value.sets || []);
    else error(pendingResult.reason instanceof Error ? pendingResult.reason.message : "Failed to load pending sets.");
    if (historyResult.status === "fulfilled") setHistory(historyResult.value.history || []);
    else error(historyResult.reason instanceof Error ? historyResult.reason.message : "Failed to load history.");
    if (categoriesResult.status === "fulfilled") setCategories(categoriesResult.value.categories || []);
    setLoading(false);
  }, [error]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-foreground">Admin</h1>

      {overview ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <KpiCard label="Users" value={overview.totalUsers} />
          <KpiCard label="Categories" value={overview.totalCategories} />
          <KpiCard label="Question sets" value={overview.totalQuestionSets} />
          <KpiCard label="Pending approvals" value={overview.pendingApprovalCount} />
        </div>
      ) : null}

      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium ${
              tab === t.key ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon width={15} height={15} /> {t.label}
            {t.key === "pending" && sets.length > 0 ? ` (${sets.length})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          {tab === "categories" ? (
            <Section title="Categories" subtitle="Interview Prep, Railway Exam, Police Exam, etc.">
              <CategoriesPanel categories={categories} onCreated={() => void load()} />
            </Section>
          ) : null}
          {tab === "pending" ? (
            <Section title="Pending question sets" subtitle="Review sets submitted for sharing. Approved sets become suggestions for every user.">
              <PendingSetsPanel sets={sets} categories={categories} onChanged={() => void load()} />
            </Section>
          ) : null}
          {tab === "history" ? (
            <Section title="Review history" subtitle="Past decisions — who approved or rejected each set, and how many questions it had.">
              <HistoryPanel history={history} />
            </Section>
          ) : null}
          {tab === "users" ? (
            <Section title="User directory">
              <UsersPanel />
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}
