import { useEffect, useRef, useState } from "react";
import type { Category, User } from "../../api/types";
import { listCategories } from "../../api/categories";
import { createQuestionSet, generateCategoryPrompt, type QuestionSetSection } from "../../api/queue";
import { ApiError } from "../../api/client";
import { useToast } from "../../hooks/use-toast";
import { CopyIcon, SparkleIcon, UploadIcon } from "./icons";
import { ErrorText, PrimaryButton, SecondaryButton, SectionCard } from "./SectionCard";

// Local, deterministic fallback used when the AI call fails (quota used up,
// transient error) — matches the exact prompt shape the server's
// generate-prompt endpoint produces, so the import below accepts the reply
// either way.
function buildLocalCategoryPrompt(opts: { categoryName: string; categoryDescription: string | null; topics: string; count: number }): string {
  return `You are an expert exam/interview-prep content writer. Generate questions and model answers for the "${opts.categoryName}" category on a study app.

Category description: ${opts.categoryDescription || "(no description given)"}
${opts.topics ? `Focus specifically on these topics/areas within the category: ${opts.topics}` : "Cover a broad, representative spread of sub-topics within this category."}

Generate exactly ${opts.count} questions total, organized into logical sub-topic sections appropriate for this category (group related questions under a shared section label; use as many or as few distinct sections as make sense for ${opts.count} questions — roughly 5-15 questions per section is a reasonable spread).

Respond with ONLY valid JSON — no commentary, no markdown code fences (do not wrap it in \`\`\`json), nothing before or after the JSON itself. Use exactly this shape:

{
  "sections": [
    {
      "label": "Section name",
      "questions": [
        { "q": "The question text.", "a": "The model answer text." }
      ]
    }
  ]
}

Rules:
- The top-level value is a single JSON object with exactly one key, "sections", whose value is an array.
- Each section object has exactly two keys: "label" (a short string) and "questions" (an array).
- Each question object has exactly two keys, "q" and "a", both strings.
- Every answer must be accurate, specific, and exam/interview-appropriate for this category — not generic filler. Where a question has a worked solution (e.g. a calculation), write the answer as a numbered list of short steps ending in the final answer in bold Markdown (e.g. "1. First step.\\n2. Second step, so the answer is **42**."), and put any formula or computed expression in Markdown inline code (backticks), e.g. \`n(n+1)/2\`.
- In every answer (not just worked solutions), **bold** the specific key terms, numbers, formulas, or conclusions most worth remembering at a glance — not whole sentences — and use blank-line-separated paragraphs or a "- "/"1. " list where that makes a multi-part answer easier to scan.
- Escape every double quote, backslash, and newline inside a JSON string correctly (a literal newline inside a step-by-step answer must be written as \\n) so the result is valid, parseable JSON — this is parsed by a program, not read by a person.
- Do not add any keys beyond "sections", "label", "questions", "q", and "a". Do not add comments, trailing commas, or any text outside the single JSON object.`;
}

interface ParsedSections {
  sections: QuestionSetSection[];
  skipped: number;
}

// Deliberately forgiving: accepts either the requested {"sections": [...]}
// shape or a bare top-level array of sections (in case a model drops the
// wrapper object despite instructions), and skips individual malformed
// entries rather than failing the whole import over one bad row — same
// philosophy as csv.ts's csvRowsToSections, just for JSON.
function parseSectionsJson(text: string): { result?: ParsedSections; error?: string } {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { error: "That doesn't look like valid JSON — check for a missing comma, quote, or bracket." };
  }
  const rawSections = Array.isArray(data)
    ? data
    : data && typeof data === "object" && Array.isArray((data as { sections?: unknown }).sections)
      ? (data as { sections: unknown[] }).sections
      : null;
  if (!rawSections) {
    return { error: 'Expected a JSON object with a "sections" array (or just an array of sections).' };
  }

  let skipped = 0;
  const sections: QuestionSetSection[] = [];
  for (const raw of rawSections) {
    const section = raw as { label?: unknown; questions?: unknown };
    const label = typeof section?.label === "string" ? section.label.trim() : "";
    const rawQuestions = Array.isArray(section?.questions) ? section.questions : [];
    if (!label) {
      skipped += rawQuestions.length;
      continue;
    }
    const questions: { q: string; a: string }[] = [];
    for (const rawQ of rawQuestions) {
      const question = rawQ as { q?: unknown; a?: unknown };
      const q = typeof question?.q === "string" ? question.q.trim() : "";
      const a = typeof question?.a === "string" ? question.a.trim() : "";
      if (!q || !a) {
        skipped++;
        continue;
      }
      questions.push({ q, a });
    }
    if (questions.length > 0) sections.push({ label, questions });
  }

  if (sections.length === 0) return { error: "No complete section/question/answer entries found." };
  return { result: { sections, skipped } };
}

export function CategoryAiPromptSection({ user }: { user: User }) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [categoryId, setCategoryId] = useState(user.activeCategoryId || "");
  const [topics, setTopics] = useState("");
  const [count, setCount] = useState(20);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);
  const [pasted, setPasted] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);
  const [parsed, setParsed] = useState<ParsedSections | null>(null);
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

  function applyParsed(text: string, sourceLabel: string) {
    const { result, error } = parseSectionsJson(text);
    if (error || !result) {
      setParseError(error || `Couldn't parse that ${sourceLabel}.`);
      setParsed(null);
      return;
    }
    setParseError(null);
    setParsed(result);
    setTitle(`${selectedCategory?.name ?? "Category"} — AI generated`);
  }

  function handleParsePasted() {
    applyParsed(pasted, "reply");
  }

  async function handleJsonFile(file: File | undefined) {
    if (!file) return;
    const text = await file.text();
    setPasted(text);
    applyParsed(text, "file");
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
      subtitle="Pick any category — new or already populated — and get a ready-to-use prompt for ChatGPT or Claude. Import its JSON reply directly, no file round-trip needed — either paste it or browse for a saved .json file."
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

          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-medium text-muted-foreground">Import its reply</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void handleJsonFile(file);
              }}
            />
            <SecondaryButton type="button" onClick={() => fileInputRef.current?.click()}>
              <UploadIcon /> Browse for a JSON file
            </SecondaryButton>

            <label className="mb-1.5 mt-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
              <span>…or paste the JSON reply here</span>
              <textarea
                className="rounded-md border border-input bg-background px-3 py-2 font-mono text-xs text-foreground"
                rows={8}
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder={'{\n  "sections": [\n    { "label": "...", "questions": [{ "q": "...", "a": "..." }] }\n  ]\n}'}
              />
            </label>
            {parseError ? <ErrorText>{parseError}</ErrorText> : null}
            <SecondaryButton type="button" onClick={handleParsePasted} disabled={!pasted.trim()}>
              Parse reply
            </SecondaryButton>
          </div>

          {parsed ? (
            <div className="mt-4 rounded-md border border-border p-4">
              <p className="mb-3 text-sm text-muted-foreground">
                Found {parsed.sections.length} section{parsed.sections.length === 1 ? "" : "s"}, {questionCount} question{questionCount === 1 ? "" : "s"}
                {parsed.skipped ? ` (${parsed.skipped} incomplete entr${parsed.skipped === 1 ? "y" : "ies"} skipped)` : ""}.
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
