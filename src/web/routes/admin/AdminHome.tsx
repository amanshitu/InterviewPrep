import { useCallback, useEffect, useState, type ComponentType, type SVGProps } from "react";
import { useSearchParams } from "react-router";
import { getApprovalHistory, getOverview, getPendingSets, type AdminOverview, type ApprovalHistoryEntry, type PendingQuestionSet } from "../../api/admin";
import { listCategories } from "../../api/categories";
import type { Category } from "../../api/types";
import { useShellUser } from "../../components/layout/AppShell";
import { AuditIcon, ClockIcon, FlagIcon, FolderIcon, MessageIcon, RefreshIcon, UploadIcon, UsersIcon } from "../../components/layout/icons";
import { KpiCard } from "../../components/admin/KpiCard";
import { Section } from "../../components/admin/Section";
import { CategoriesPanel } from "../../components/admin/CategoriesPanel";
import { PendingSetsPanel } from "../../components/admin/PendingSetsPanel";
import { HistoryPanel } from "../../components/admin/HistoryPanel";
import { UsersPanel } from "../../components/admin/UsersPanel";
import { ReportsPanel } from "../../components/admin/ReportsPanel";
import { FeedbackPanel } from "../../components/admin/FeedbackPanel";
import { AuditLogPanel } from "../../components/admin/AuditLogPanel";
import { QuestionSetsSection } from "../../components/settings/QuestionSetsSection";
import { CategoryAiPromptSection } from "../../components/settings/CategoryAiPromptSection";
import { ResumePromptSection } from "../../components/settings/ResumePromptSection";
import { SuggestedSetsSection } from "../../components/settings/SuggestedSetsSection";
import { useToast } from "../../hooks/use-toast";
import type { User } from "../../api/types";
import { Skeleton, SkeletonCard } from "../../components/layout/Skeleton";

type Tab = "categories" | "pending" | "reports" | "feedback" | "questionsets" | "history" | "users" | "audit";

const DEFAULT_TAB: Tab = "pending";

const TABS: { key: Tab; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> }[] = [
  { key: "pending", label: "Pending Approvals", icon: ClockIcon },
  { key: "reports", label: "Reports", icon: FlagIcon },
  { key: "feedback", label: "Feedback", icon: MessageIcon },
  { key: "questionsets", label: "Question Sets", icon: UploadIcon },
  { key: "categories", label: "Categories", icon: FolderIcon },
  { key: "history", label: "History", icon: RefreshIcon },
  { key: "users", label: "Users", icon: UsersIcon },
  { key: "audit", label: "Audit Log", icon: AuditIcon },
];

const TAB_KEYS = new Set<string>(TABS.map((t) => t.key));

export function AdminHome() {
  const user = useShellUser();
  return user.role === "admin" ? <AdminDashboard user={user} /> : <Forbidden user={user} />;
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

// Tab selection lives in the URL (?tab=users) rather than plain useState,
// so a link can deep-link straight to a specific admin panel (e.g. a
// support escalation linking the on-call admin to ?tab=users instead of
// "open Admin, then click Users") instead of always landing on Pending
// Approvals. Falls back to DEFAULT_TAB for a missing or unrecognized
// value.
function AdminDashboard({ user }: { user: User }) {
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const tab: Tab = requestedTab && TAB_KEYS.has(requestedTab) ? (requestedTab as Tab) : DEFAULT_TAB;
  const setTab = useCallback(
    (next: Tab) => {
      setSearchParams((prev) => {
        const params = new URLSearchParams(prev);
        params.set("tab", next);
        return params;
      }, { replace: true });
    },
    [setSearchParams],
  );
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [sets, setSets] = useState<PendingQuestionSet[]>([]);
  const [history, setHistory] = useState<ApprovalHistoryEntry[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const { error } = useToast();

  // `loading` only ever covers the first load: a refresh after an
  // approve/reject/create updates the lists in place rather than swapping
  // the whole tab for skeletons (which also remounted every card,
  // collapsing any open "Review questions" panel).
  const load = useCallback(async () => {
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
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <KpiCard label="Users" value={overview.totalUsers} />
          <KpiCard label="Categories" value={overview.totalCategories} />
          <KpiCard label="Question sets" value={overview.totalQuestionSets} />
          <KpiCard label="Pending approvals" value={overview.pendingApprovalCount} />
          <KpiCard label="Open reports" value={overview.openReportCount} />
          <KpiCard label="Open feedback" value={overview.openFeedbackCount} />
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i}>
              <Skeleton className="h-4 w-20" />
              <Skeleton className="mt-2 h-6 w-10" />
            </SkeletonCard>
          ))}
        </div>
      )}

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
            {t.key === "reports" && overview && overview.openReportCount > 0 ? ` (${overview.openReportCount})` : ""}
            {t.key === "feedback" && overview && overview.openFeedbackCount > 0 ? ` (${overview.openFeedbackCount})` : ""}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
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
          {tab === "reports" ? (
            <Section title="Reported questions" subtitle="Users can flag a question or answer as wrong or confusing — fix it directly from here, or search for any question even if nobody's reported it yet.">
              <ReportsPanel onChanged={() => void load()} />
            </Section>
          ) : null}
          {tab === "feedback" ? (
            <Section title="User feedback" subtitle="General app feedback — bugs, feature ideas, or anything else. Question-specific reports live under Reports instead.">
              <FeedbackPanel onChanged={() => void load()} />
            </Section>
          ) : null}
          {tab === "questionsets" ? (
            <div className="flex flex-col gap-4">
              <QuestionSetsSection user={user} />
              <CategoryAiPromptSection user={user} />
              <ResumePromptSection user={user} />
              <SuggestedSetsSection activeCategoryId={user.activeCategoryId} />
            </div>
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
          {tab === "audit" ? (
            <Section title="Admin audit log" subtitle="Who did what admin action, and when.">
              <AuditLogPanel />
            </Section>
          ) : null}
        </>
      )}
    </div>
  );
}
