import { useRef, useState } from "react";
import { generatePrompt, suggestRole } from "../../api/resume";
import type { User } from "../../api/types";
import { ApiError } from "../../api/client";
import { useToast } from "../../hooks/use-toast";
import { CopyIcon, PlusIcon, SparkleIcon, UploadIcon } from "./icons";
import { ErrorText, PrimaryButton, SecondaryButton, SectionCard } from "./SectionCard";

const DEFAULT_RESUME_CATEGORIES = [
  "HR & Behavioral",
  "Delivery & Program Management",
  "People Management",
  "Technical Architecture",
  "AI Automation & Product",
];

// Local, deterministic fallback used when the AI call fails (quota used up,
// transient error) — matches the exact prompt shape the server's
// generate-prompt endpoint produces, so "Import from CSV" above accepts the
// reply either way.
function buildLocalResumePrompt(opts: { resumeText: string; targetRole: string; categories: string[]; perCategory: number }): string {
  const categoryList = opts.categories.join(", ");
  return `You are an expert interview coach. Based on the resume and target role below, generate senior-level interview questions with detailed, specific model answers tailored to this person's background and the role they're targeting.

Target role: ${opts.targetRole}

Resume:
"""
${opts.resumeText}
"""

Generate exactly ${opts.perCategory} questions for EACH of these categories: ${categoryList}.

Output ONLY a CSV — no commentary, no markdown code fences, nothing before or after it. Use exactly this header row:
section,question,answer

Rules:
- "section" must be exactly one of: ${categoryList}.
- Each answer must be a detailed, senior-level model answer (3-6 sentences) that references relevant, specific aspects of the resume and target role — not generic advice.
- If a field contains a comma, wrap the whole field in double quotes. If a field contains a double quote, escape it by doubling it ("").
- Do not add row numbers, extra columns, or blank lines.`;
}

export function ResumePromptSection({ user }: { user: User }) {
  const toast = useToast();
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const [resumeText, setResumeText] = useState("");
  const [targetRole, setTargetRole] = useState(user.track || user.headline || "");
  const [categories, setCategories] = useState<{ label: string; checked: boolean }[]>(
    DEFAULT_RESUME_CATEGORIES.map((label) => ({ label, checked: true })),
  );
  const [newCategory, setNewCategory] = useState("");
  const [perCategory, setPerCategory] = useState(10);
  const [pdfStatus, setPdfStatus] = useState("");
  const [suggesting, setSuggesting] = useState(false);
  const [roleError, setRoleError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [prompt, setPrompt] = useState<string | null>(null);

  async function handlePdfChange(file: File | undefined) {
    if (!file) return;
    setPdfStatus("Reading PDF…");
    try {
      // Vendored as a static asset (src/web/public/vendor/pdfjs/), not part
      // of the bundle — loaded via an absolute runtime import so it's never
      // pulled into the normal page bundle for users who don't use this.
      // The path is built from a variable (not a string literal) so
      // TypeScript treats the import as `Promise<any>` instead of trying
      // (and failing) to resolve/typecheck this untyped vendored module.
      const extractPdfModulePath = "/vendor/pdfjs/extract.js";
      const mod = (await import(/* @vite-ignore */ extractPdfModulePath)) as {
        extractPdfText: (buffer: ArrayBuffer) => Promise<string>;
      };
      const { extractPdfText } = mod;
      const buffer = await file.arrayBuffer();
      const text: string = await extractPdfText(buffer);
      if (!text) {
        setPdfStatus("");
        toast.warning("Couldn't read text from that PDF (it may be a scanned image) — paste the resume text in manually instead.");
        return;
      }
      setResumeText(text.slice(0, 24000));
      setPdfStatus(`Loaded from ${file.name}`);
      toast.success("Resume text extracted — review it below before generating.");
    } catch {
      setPdfStatus("");
      toast.error("Couldn't read that PDF — paste the resume text in manually instead.");
    }
  }

  async function handleSuggestRole() {
    setRoleError(null);
    if (!resumeText.trim()) {
      toast.warning("Paste your resume text first.");
      return;
    }
    setSuggesting(true);
    try {
      const { role } = await suggestRole(resumeText);
      setTargetRole(role);
      toast.success("Suggested a target role from your resume — edit it if you'd like something else.");
    } catch (err) {
      setRoleError(err instanceof Error ? err.message : "Couldn't suggest a role.");
    } finally {
      setSuggesting(false);
    }
  }

  async function handleGenerate() {
    const selectedCategories = categories.filter((c) => c.checked).map((c) => c.label);
    if (!resumeText.trim()) {
      toast.warning("Paste your resume text first.");
      return;
    }
    if (!targetRole.trim()) {
      toast.warning("Enter a target role.");
      return;
    }
    if (selectedCategories.length === 0) {
      toast.warning("Pick at least one category.");
      return;
    }
    setGenerating(true);
    try {
      const { prompt: generated } = await generatePrompt({ resumeText, targetRole, categories: selectedCategories, perCategory });
      setPrompt(generated);
    } catch (err) {
      const local = buildLocalResumePrompt({ resumeText, targetRole, categories: selectedCategories, perCategory });
      setPrompt(local);
      const limited = err instanceof ApiError && err.data?.limited;
      const reason = limited ? "Today's free AI allowance is used up" : "Couldn't reach the AI right now";
      toast.warning(`${reason} — used the standard prompt template instead.`);
    } finally {
      setGenerating(false);
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

  return (
    <SectionCard
      title="Generate questions from your resume"
      subtitle="Paste your resume and target role to get a ready-to-use prompt for ChatGPT or Claude — it'll reply with categorized interview questions and detailed model answers you can import right below."
    >
      <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Resume text</span>
        <textarea
          className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          rows={10}
          maxLength={24000}
          value={resumeText}
          onChange={(e) => setResumeText(e.target.value)}
          placeholder="Paste your resume text here (copy it out of your PDF or Word document), or browse for a PDF below."
        />
        <small className="font-normal">Sent to generate a target-role suggestion and the tailored prompt below (never stored).</small>
      </label>

      <div className="mb-1 flex flex-wrap items-center gap-2">
        <input
          ref={pdfInputRef}
          type="file"
          accept="application/pdf"
          hidden
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void handlePdfChange(file);
          }}
        />
        <SecondaryButton type="button" onClick={() => pdfInputRef.current?.click()}>
          <UploadIcon /> Browse for a PDF
        </SecondaryButton>
        <span className="text-sm text-muted-foreground">{pdfStatus}</span>
      </div>
      <p className="mb-4 text-sm text-muted-foreground">
        Extracted entirely in your browser — the PDF itself is never uploaded anywhere. Works best on text-based PDFs; if extraction comes up empty, paste the text in above instead.
      </p>

      <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Target role</span>
        <div className="flex gap-2">
          <input
            className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
            value={targetRole}
            onChange={(e) => setTargetRole(e.target.value)}
            placeholder="e.g. Engineering Manager"
          />
          <SecondaryButton type="button" onClick={() => void handleSuggestRole()} disabled={suggesting}>
            <SparkleIcon /> {suggesting ? "Thinking…" : "Suggest from resume"}
          </SecondaryButton>
        </div>
        {roleError ? <ErrorText>{roleError}</ErrorText> : null}
      </label>

      <div className="mb-3">
        <span className="mb-1.5 block text-sm font-medium text-muted-foreground">Categories</span>
        <div className="flex flex-col gap-1.5">
          {categories.map((c, i) => (
            <label key={c.label} className="flex items-center gap-2 text-sm text-foreground">
              <input
                type="checkbox"
                checked={c.checked}
                onChange={(e) => setCategories((prev) => prev.map((x, idx) => (idx === i ? { ...x, checked: e.target.checked } : x)))}
              />
              {c.label}
            </label>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <input
            className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground"
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            placeholder="Add a custom category"
          />
          <button
            type="button"
            onClick={() => {
              const value = newCategory.trim();
              if (!value) return;
              setCategories((prev) => [...prev, { label: value, checked: true }]);
              setNewCategory("");
            }}
            className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <PlusIcon width={14} height={14} /> Add category
          </button>
        </div>
      </div>

      <label className="mb-4 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
        <span>Questions per category</span>
        <input
          className="w-32 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          type="number"
          min={3}
          max={20}
          value={perCategory}
          onChange={(e) => setPerCategory(parseInt(e.target.value, 10) || 10)}
        />
      </label>

      <PrimaryButton onClick={() => void handleGenerate()} disabled={generating}>
        <SparkleIcon /> {generating ? "Generating…" : "Generate prompt"}
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
          <ol className="mt-3 list-decimal space-y-1.5 pl-5 text-sm text-muted-foreground">
            <li>Copy the prompt above.</li>
            <li>Paste it into ChatGPT or Claude (your own account).</li>
            <li>Save its reply as a .csv file.</li>
            <li>Use "Import from CSV" above to bring the questions in.</li>
          </ol>
        </div>
      ) : null}
    </SectionCard>
  );
}
