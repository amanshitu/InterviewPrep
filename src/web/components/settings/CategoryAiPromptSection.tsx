import { useEffect, useState } from "react";
import type { Category, User } from "../../api/types";
import { listCategories } from "../../api/categories";
import { createQuestionSet, generateCategoryPrompt, type QuestionSetSection } from "../../api/queue";
import { csvRowsToSections, parseCsv } from "../../lib/csv";
import { ApiError } from "../../api/client";
import { useToast } from "../../hooks/use-toast";
import { CopyIcon, SparkleIcon, UploadIcon } from "./icons";
import { ErrorText, PrimaryButton, SecondaryButton, SectionCard } from "./SectionCard";

// Local, deterministic fallback used when the AI call fails (quota used up,
// transient error) — matches the exact prompt shape the server's
// generate-prompt endpoint produces, so the paste-back import below accepts
// the reply either way.
function buildLocalCategoryPrompt(opts: { categoryName: string; categoryDescription: string | null; topics: string; count: number }): string {
  return `You are an expert exam/interview-prep content writer. Generate questions and model answers for the "${opts.categoryName}" category on a study app.

Category description: ${opts.categoryDescription || "(no description given)"}
${opts.topics ? `Focus specifically on these topics/areas within the category: ${opts.topics}` : "Cover a broad, representative spread of sub-topics within this category."}

Generate exactly ${opts.count} questions total, organized into logical sub-topic sections appropriate for this category (group related questions under a shared section label; use as many or as few distinct sections as make sense for ${opts.count} questions).

Output ONLY a CSV — no commentary, no markdown code fences, nothing before or after it. Use exactly this header row:
section,question,answer

Rules:
- Each answer must be accurate, specific, and exam/interview-appropriate for this category — not generic filler.
- If a field contains a comma, wrap the whole field in double quotes. If a field contains a double quote, escape it by doubling it ("").
- Do not add row numbers, extra columns, or blank lines.`;
}

export function CategoryAiPromptSection({ user }: { user: User }) {
  const toast = useToast();
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoryId, setCategoryId] = useState(user.activeCategoryId || "");
  const [topics, setTopics] = useState("");
  const [count, setCount] = useState(20);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<{ sections: QuestionSetSection[]; skipped: number } | null>(null);
  const [title, setTitle] = useState("");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    listCategories()
      .then((data) => {
        setCategories(data.categories);
        if (!categoryId && data.categories.length > 0) setCategoryId(data.categories[0].id);
      })
      .catch(() => setCategories([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedCategory = (categories ?? []).find((c) => c.id === categoryId) || null;

  async function handleGenerate() {
    if (!categoryId) {
      toast.warning("Pick a category first.");
      return;
    }
    setGenerating(true);
    try {
      const { prompt: generated } = await generateCategoryPrompt({ categoryId, topics: topics.trim(), count });
      setPrompt(generated);
    } catch (err) {
      const local = buildLocalCategoryPrompt({
        categoryName: selectedCategory?.name ?? "this category",
        categoryDescription: selectedCategory?.description ?? null,
        topics: topics.trim(),
        count,
      });
      setPrompt(local);
      const limited = err instanceof ApiError && err.data?.limited;
      toast.warning(`${limited ? "Today's free AI allowance is used up" : "Couldn't reach the AI right now"} — used the standard prompt template instead.`);
    } finally {
      setGenerating(false);
      setPasted("");
      setParsed(null);
      setParseError(null);
    }
  }

  async function handleCopy() {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt);
      toast.success("Prompt copied to clipboard.");
    } catch {
      toast.warning("Couldn't access the clipboard — select the text and press Ctrl/Cmd+C to copy.");
    }
  }

  function handleParsePasted() {
    const result = csvRowsToSections(parseCsv(pasted));
    if (result.error || !result.sections) {
      setParseError(result.error || "Couldn't parse that reply.");
      setParsed(null);
      return;
    }
    setParseError(null);
    setParsed({ sections: result.sections, skipped: result.skipped ?? 0 });
    setTitle(`${selectedCategory?.name ?? "Category"} — AI generated`);
  }

  async function handleImport() {
    if (!parsed || !categoryId) return;
    setImporting(true);
    try {
      await createQuestionSet({ title: title.trim() || "AI generated questions", sections: parsed.sections, categoryId });
      toast.success("Questions added.");
      setPrompt(null);
      setPasted("");
      setParsed(null);
      setTopics("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't import those questions.");
    } finally {
      setImporting(false);
    }
  }

  const questionCount = parsed ? parsed.sections.reduce((n, s) => n + s.questions.length, 0) : 0;

  return (
    <SectionCard
      title="Generate questions for a category with AI"
      subtitle="Pick any category — new or already populated — and get a ready-to-use prompt for ChatGPT or Claude. Paste its reply back in below to import the questions directly, no file round-trip needed."
    >
      <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Category</span>
        <select
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          disabled={!categories}
        >
          {!categories ? <option value="">Loading…</option> : null}
          {(categories ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {selectedCategory?.description ? <small className="font-normal">{selectedCategory.description}</small> : null}
      </label>

      <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Focus topics (optional)</span>
        <input
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          value={topics}
          onChange={(e) => setTopics(e.target.value)}
          placeholder="e.g. Reasoning, General Science — leave blank for a broad spread"
        />
      </label>

      <label className="mb-4 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Number of questions</span>
        <input
          className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          type="number"
          min={5}
          max={60}
          value={count}
          onChange={(e) => setCount(Math.max(5, Math.min(60, parseInt(e.target.value, 10) || 20)))}
        />
      </label>

      <PrimaryButton onClick={() => void handleGenerate()} loading={generating} loadingText="Generating…">
        <SparkleIcon /> Generate prompt
      </PrimaryButton>

      {prompt ? (
        <div className="mt-4">
          <label className="mb-1.5 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
            <span>Copy this into ChatGPT or Claude</span>
            <textarea className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" rows={10} readOnly value={prompt} />
          </label>
          <SecondaryButton type="button" onClick={() => void handleCopy()}>
            <CopyIcon /> Copy prompt
          </SecondaryButton>

          <label className="mb-1.5 mt-4 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
            <span>Paste the AI's reply here</span>
            <textarea
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
              rows={8}
              value={pasted}
              onChange={(e) => setPasted(e.target.value)}
              placeholder="section,question,answer&#10;..."
            />
          </label>
          {parseError ? <ErrorText>{parseError}</ErrorText> : null}
          <SecondaryButton type="button" onClick={handleParsePasted} disabled={!pasted.trim()}>
            Parse reply
          </SecondaryButton>

          {parsed ? (
            <div className="mt-4 rounded-md border border-border p-4">
              <p className="mb-3 text-sm text-muted-foreground">
                Found {parsed.sections.length} section{parsed.sections.length === 1 ? "" : "s"}, {questionCount} question{questionCount === 1 ? "" : "s"}
                {parsed.skipped ? ` (${parsed.skipped} incomplete row${parsed.skipped === 1 ? "" : "s"} skipped)` : ""}.
              </p>
              <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
                <span>Set title</span>
                <input className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground" value={title} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <PrimaryButton onClick={() => void handleImport()} loading={importing} loadingText="Importing…">
                <UploadIcon /> Import into {selectedCategory?.name ?? "category"}
              </PrimaryButton>
            </div>
          ) : null}
        </div>
      ) : null}
    </SectionCard>
  );
}
