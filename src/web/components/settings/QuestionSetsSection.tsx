import { useEffect, useRef, useState } from "react";
import { createQuestionSet, getMyQuestionSets, submitQuestionSet, type MyQuestionSet, type QuestionSetSection } from "../../api/queue";
import { csvRowsToSections, parseCsv } from "../../lib/csv";
import { useToast } from "../../hooks/use-toast";
import { CloseIcon, DownloadIcon, PlusIcon, SendIcon, TrashIcon, UploadIcon } from "./icons";
import { ErrorText, PrimaryButton, SecondaryButton, SectionCard } from "./SectionCard";

function downloadCsvTemplate() {
  const csv = [
    "section,question,answer",
    '"Behavioral","Tell me about a time you disagreed with a teammate.","Frame it as a structured disagreement with a resolution, not a conflict story."',
    '"Behavioral","Tell me about a project that failed.","Own the failure briefly, then focus on what changed afterward."',
    '"System Design","How would you design a URL shortener?","Cover the hashing scheme, storage, and read/write scaling trade-offs."',
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "question-set-template.csv";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function statusLabel(visibility: string): { text: string; className: string } {
  if (visibility === "shared") return { text: "Shared", className: "bg-success/15 text-success" };
  if (visibility === "rejected") return { text: "Rejected", className: "bg-destructive/15 text-destructive" };
  if (visibility === "pending") return { text: "Pending review", className: "bg-warning/15 text-warning" };
  return { text: "Private", className: "bg-muted text-muted-foreground" };
}

function MySetsList({ refreshKey, onChanged }: { refreshKey: number; onChanged: () => void }) {
  const toast = useToast();
  const [sets, setSets] = useState<MyQuestionSet[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getMyQuestionSets()
      .then((data) => setSets(data.sets))
      .catch((err) => setError(err instanceof Error ? err.message : "Couldn't load your question sets."));
  }, [refreshKey]);

  async function handleSubmitForReview(id: string) {
    try {
      await submitQuestionSet(id);
      toast.success("Submitted for review.");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't submit for review.");
    }
  }

  if (error) return <ErrorText>{error}</ErrorText>;
  if (!sets) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (sets.length === 0) return <p className="text-sm text-muted-foreground">You haven't uploaded any question sets yet.</p>;

  return (
    <div className="flex flex-col gap-2">
      {sets.map((s) => {
        const status = statusLabel(s.visibility);
        return (
          <div key={s.id} className="flex flex-col gap-1 rounded-md border border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-foreground">
                {s.title}
                {s.track ? <span className="text-muted-foreground"> ({s.track})</span> : null}
              </span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                {s.question_count || 0} question{s.question_count === 1 ? "" : "s"}
              </span>
              <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${status.className}`}>{status.text}</span>
              {s.visibility === "private" || s.visibility === "rejected" ? (
                <button
                  type="button"
                  onClick={() => void handleSubmitForReview(s.id)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                >
                  <SendIcon width={13} height={13} /> Submit for review
                </button>
              ) : null}
            </div>
            {s.visibility === "rejected" && s.rejected_reason ? <p className="text-xs text-muted-foreground">Reason: {s.rejected_reason}</p> : null}
          </div>
        );
      })}
    </div>
  );
}

interface DraftQuestion {
  q: string;
  a: string;
}
interface DraftSection {
  label: string;
  questions: DraftQuestion[];
}

function ManualUploadForm({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState("");
  const [track, setTrack] = useState("");
  const [sections, setSections] = useState<DraftSection[]>([{ label: "", questions: [{ q: "", a: "" }] }]);
  const [error, setError] = useState<string | null>(null);

  function updateSection(i: number, patch: Partial<DraftSection>) {
    setSections((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }
  function updateQuestion(sIdx: number, qIdx: number, patch: Partial<DraftQuestion>) {
    setSections((prev) =>
      prev.map((s, idx) => (idx !== sIdx ? s : { ...s, questions: s.questions.map((q, qi) => (qi === qIdx ? { ...q, ...patch } : q)) })),
    );
  }

  async function handleSubmit() {
    setError(null);
    const payloadSections: QuestionSetSection[] = sections.map((s) => ({
      label: s.label.trim(),
      questions: s.questions.map((q) => ({ q: q.q.trim(), a: q.a.trim() })).filter((q) => q.q || q.a),
    }));
    try {
      await createQuestionSet({ title: title.trim(), track: track.trim() || null, sections: payloadSections });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't upload that question set.");
    }
  }

  return (
    <div className="mt-4 rounded-md border border-border p-4">
      <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Set title</span>
        <input className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Cloud Architecture Deep Dive" />
      </label>
      <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Track (optional)</span>
        <input className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" value={track} onChange={(e) => setTrack(e.target.value)} placeholder="e.g. tech" />
      </label>

      {sections.map((section, sIdx) => (
        <div key={sIdx} className="mb-4 rounded-md border border-border p-3">
          <div className="mb-2 flex items-center gap-2">
            <input
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              value={section.label}
              onChange={(e) => updateSection(sIdx, { label: e.target.value })}
              placeholder="Section title (e.g. Networking)"
            />
            <button type="button" onClick={() => setSections((prev) => prev.filter((_, i) => i !== sIdx))} className="text-muted-foreground hover:text-destructive">
              <TrashIcon />
            </button>
          </div>
          {section.questions.map((question, qIdx) => (
            <div key={qIdx} className="mb-2 flex flex-wrap items-center gap-2">
              <input className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={question.q} onChange={(e) => updateQuestion(sIdx, qIdx, { q: e.target.value })} placeholder="Question" />
              <input className="flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm" value={question.a} onChange={(e) => updateQuestion(sIdx, qIdx, { a: e.target.value })} placeholder="Model answer" />
              <button
                type="button"
                onClick={() => updateSection(sIdx, { questions: section.questions.filter((_, i) => i !== qIdx) })}
                className="text-muted-foreground hover:text-destructive"
              >
                <TrashIcon width={14} height={14} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => updateSection(sIdx, { questions: [...section.questions, { q: "", a: "" }] })}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
          >
            <PlusIcon width={13} height={13} /> Add question
          </button>
        </div>
      ))}

      <SecondaryButton type="button" onClick={() => setSections((prev) => [...prev, { label: "", questions: [{ q: "", a: "" }] }])}>
        <PlusIcon /> Add section
      </SecondaryButton>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <div className="mt-3 flex gap-2">
        <PrimaryButton type="button" onClick={() => void handleSubmit()}>
          <SendIcon /> Submit
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onCancel}>
          <CloseIcon /> Cancel
        </SecondaryButton>
      </div>
    </div>
  );
}

function CsvImportForm({ fileName, sections, skipped, onDone, onCancel }: { fileName: string; sections: QuestionSetSection[]; skipped: number; onDone: () => void; onCancel: () => void }) {
  const [title, setTitle] = useState(fileName.replace(/\.csv$/i, ""));
  const [track, setTrack] = useState("");
  const [error, setError] = useState<string | null>(null);
  const questionCount = sections.reduce((n, s) => n + s.questions.length, 0);

  async function handleImport() {
    setError(null);
    try {
      await createQuestionSet({ title: title.trim(), track: track.trim() || null, sections });
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't import that CSV.");
    }
  }

  return (
    <div className="mt-4 rounded-md border border-border p-4">
      <p className="mb-3 text-sm text-muted-foreground">
        Found {sections.length} section{sections.length === 1 ? "" : "s"}, {questionCount} question{questionCount === 1 ? "" : "s"}
        {skipped ? ` (${skipped} incomplete row${skipped === 1 ? "" : "s"} skipped)` : ""}.
      </p>
      <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Set title</span>
        <input className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Track (optional)</span>
        <input className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" value={track} onChange={(e) => setTrack(e.target.value)} placeholder="e.g. tech" />
      </label>
      {error ? <ErrorText>{error}</ErrorText> : null}
      <div className="flex gap-2">
        <PrimaryButton type="button" onClick={() => void handleImport()}>
          <UploadIcon /> Import
        </PrimaryButton>
        <SecondaryButton type="button" onClick={onCancel}>
          <CloseIcon /> Cancel
        </SecondaryButton>
      </div>
    </div>
  );
}

export function QuestionSetsSection() {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [mode, setMode] = useState<"none" | "manual" | "csv">("none");
  const [csvData, setCsvData] = useState<{ fileName: string; sections: QuestionSetSection[]; skipped: number } | null>(null);

  function handleDone(message: string) {
    toast.success(message);
    setMode("none");
    setCsvData(null);
    setRefreshKey((k) => k + 1);
  }

  async function handleCsvFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    const result = csvRowsToSections(parseCsv(text));
    if (result.error || !result.sections) {
      toast.error(result.error || "Couldn't parse that CSV.");
      return;
    }
    setCsvData({ fileName: file.name, sections: result.sections, skipped: result.skipped ?? 0 });
    setMode("csv");
  }

  return (
    <SectionCard title="My question sets" subtitle="Upload your own set of questions, grouped into sections. New sets start private to you; sharing them with other users needs admin approval.">
      <MySetsList refreshKey={refreshKey} onChanged={() => setRefreshKey((k) => k + 1)} />

      {mode === "none" ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <SecondaryButton type="button" onClick={() => setMode("manual")}>
            <UploadIcon /> Upload a question set
          </SecondaryButton>
          <SecondaryButton type="button" onClick={() => fileInputRef.current?.click()}>
            <UploadIcon /> Import from CSV
          </SecondaryButton>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              void handleCsvFile(file);
            }}
          />
          <button type="button" onClick={downloadCsvTemplate} className="inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground">
            <DownloadIcon /> Download CSV template
          </button>
        </div>
      ) : null}

      {mode === "manual" ? <ManualUploadForm onDone={() => handleDone("Question set uploaded.")} onCancel={() => setMode("none")} /> : null}
      {mode === "csv" && csvData ? (
        <CsvImportForm fileName={csvData.fileName} sections={csvData.sections} skipped={csvData.skipped} onDone={() => handleDone("Question set imported.")} onCancel={() => { setMode("none"); setCsvData(null); }} />
      ) : null}
    </SectionCard>
  );
}
