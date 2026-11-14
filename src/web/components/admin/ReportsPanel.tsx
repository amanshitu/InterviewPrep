import { useEffect, useState, type FormEvent } from "react";
import {
  getQuestionReports,
  resolveQuestionReport,
  searchQuestions,
  type AdminQuestionSearchResult,
  type QuestionReport,
} from "../../api/admin";
import { useToast } from "../../hooks/use-toast";
import { Markdown, renderInline } from "../layout/Markdown";
import { CheckIcon, CloseIcon, EditIcon, SearchIcon } from "../layout/icons";
import { Skeleton } from "../layout/Skeleton";
import { EditQuestionModal, type EditableQuestion } from "./EditQuestionModal";

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
  } catch {
    return iso;
  }
}

// Two entry points into the same edit flow: a report pointing at a known
// question, or a free-text search when nobody's reported the question an
// admin wants to fix (a typo they noticed while browsing, a follow-up check
// after fixing a reported one elsewhere). Both end up opening the same
// EditQuestionModal, so there's exactly one place that calls
// updateQuestion().
export function ReportsPanel({ onChanged }: { onChanged: () => void }) {
  const { error, success } = useToast();
  const [reports, setReports] = useState<QuestionReport[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditableQuestion | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AdminQuestionSearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);

  function load() {
    getQuestionReports()
      .then((data) => setReports(data.reports))
      .catch((err) => error(err instanceof Error ? err.message : "Couldn't load reports."));
  }

  useEffect(load, [error]);

  async function resolve(reportId: string, action: "resolved" | "dismissed") {
    setBusyId(reportId);
    try {
      await resolveQuestionReport(reportId, action);
      setReports((prev) => prev?.map((r) => (r.id === reportId ? { ...r, status: action } : r)) ?? prev);
      onChanged();
      success(action === "resolved" ? "Marked resolved." : "Dismissed.");
    } catch (err) {
      error(err instanceof Error ? err.message : "Couldn't update the report.");
    } finally {
      setBusyId(null);
    }
  }

  async function runSearch(e: FormEvent) {
    e.preventDefault();
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const data = await searchQuestions(trimmed);
      setSearchResults(data.questions);
    } catch (err) {
      error(err instanceof Error ? err.message : "Search failed.");
    } finally {
      setSearching(false);
    }
  }

  function handleSaved(updated: EditableQuestion) {
    setReports((prev) => prev?.map((r) => (r.question_id === updated.id ? { ...r, q: updated.q, a: updated.a, topic_label: updated.topic_label } : r)) ?? prev);
    setSearchResults((prev) => prev?.map((r) => (r.id === updated.id ? { ...r, q: updated.q, a: updated.a, topic_label: updated.topic_label } : r)) ?? prev);
  }

  const openReports = reports?.filter((r) => r.status === "open") ?? [];
  const decidedReports = reports?.filter((r) => r.status !== "open") ?? [];

  return (
    <div className="flex flex-col gap-6">
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">Open reports{reports ? ` (${openReports.length})` : ""}</h3>
        </div>
        {!reports ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-24 w-full" />
            ))}
          </div>
        ) : openReports.length === 0 ? (
          <p className="text-sm text-muted-foreground">No open reports — nothing flagged right now.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {openReports.map((r) => (
              <div key={r.id} className="rounded-md border border-border bg-muted/40 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs font-semibold uppercase tracking-wide text-primary">{r.topic_label || "—"}{r.set_title ? ` · ${r.set_title}` : ""}</div>
                  <div className="text-xs text-muted-foreground">{formatDate(r.created_at)}</div>
                </div>
                <div className="mt-1.5 rounded-md bg-warning/15 p-2 text-sm text-foreground">
                  <span className="font-semibold">Reported by {r.reporter_name} ({r.reporter_email}):</span> {r.reason}
                </div>
                {r.q ? (
                  <>
                    <div className="mt-2 text-sm font-medium text-foreground">{renderInline(r.q, `rq-${r.id}`)}</div>
                    <Markdown text={r.a || ""} className="mt-1.5 text-sm text-muted-foreground" />
                  </>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground italic">This question no longer exists.</p>
                )}
                <div className="mt-3 flex flex-wrap gap-2">
                  {r.q ? (
                    <button
                      type="button"
                      onClick={() => setEditing({ id: r.question_id, q: r.q!, a: r.a!, topic_label: r.topic_label || "" })}
                      className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                    >
                      <EditIcon width={14} height={14} /> Edit question
                    </button>
                  ) : null}
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void resolve(r.id, "resolved")}
                    className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                  >
                    <CheckIcon width={14} height={14} /> Mark resolved
                  </button>
                  <button
                    type="button"
                    disabled={busyId === r.id}
                    onClick={() => void resolve(r.id, "dismissed")}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted disabled:opacity-50"
                  >
                    <CloseIcon width={14} height={14} /> Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-semibold text-foreground">Find and edit any question</h3>
        <form onSubmit={(e) => void runSearch(e)} className="flex gap-2">
          <input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search question or answer text…"
            className="flex-1 rounded-md border border-border bg-background p-2 text-sm text-foreground"
          />
          <button
            type="submit"
            disabled={searching}
            className="inline-flex items-center gap-1.5 rounded-md border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50"
          >
            <SearchIcon width={14} height={14} /> {searching ? "Searching…" : "Search"}
          </button>
        </form>
        {searchResults ? (
          searchResults.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No matches.</p>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              {searchResults.map((r) => (
                <div key={r.id} className="rounded-md border border-border bg-muted/40 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-primary">{r.topic_label}{r.set_title ? ` · ${r.set_title}` : ""}</div>
                  <div className="mt-1 text-sm font-medium text-foreground">{renderInline(r.q, `sq-${r.id}`)}</div>
                  <Markdown text={r.a} className="mt-1.5 text-sm text-muted-foreground" />
                  <button
                    type="button"
                    onClick={() => setEditing({ id: r.id, q: r.q, a: r.a, topic_label: r.topic_label })}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
                  >
                    <EditIcon width={14} height={14} /> Edit question
                  </button>
                </div>
              ))}
            </div>
          )
        ) : null}
      </div>

      {decidedReports.length > 0 ? (
        <div>
          <h3 className="mb-2 text-sm font-semibold text-foreground">Recently handled</h3>
          <div className="flex flex-col gap-2">
            {decidedReports.slice(0, 20).map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-3 rounded-md border border-border p-2.5 text-sm">
                <div className="min-w-0 truncate text-muted-foreground">{r.q ? renderInline(r.q, `dr-${r.id}`) : "(question removed)"}</div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === "resolved" ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                  {r.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {editing ? <EditQuestionModal question={editing} onClose={() => setEditing(null)} onSaved={handleSaved} /> : null}
    </div>
  );
}
