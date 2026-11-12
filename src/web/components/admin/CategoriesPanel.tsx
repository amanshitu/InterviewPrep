import { useState, type FormEvent } from "react";
import { createCategory } from "../../api/admin";
import type { Category } from "../../api/types";
import { useToast } from "../../hooks/use-toast";
import { PlusIcon } from "../layout/icons";

export function CategoriesPanel({ categories, onCreated }: { categories: Category[]; onCreated: () => void }) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { success, error } = useToast();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSubmitting(true);
    try {
      await createCategory(name.trim(), description.trim() || undefined);
      success("Category created.");
      setName("");
      setDescription("");
      onCreated();
    } catch (err) {
      error(err instanceof Error ? err.message : "Failed to create category.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        A pending set can be tagged into one or more of these when you approve it below — e.g. a shared "General
        Knowledge" set serving both Railway and Police.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {categories.length === 0 ? (
          <span className="text-sm text-muted-foreground">No categories yet.</span>
        ) : (
          categories.map((c) => (
            <span
              key={c.id}
              title={c.description || ""}
              className="rounded-full bg-secondary px-3 py-1 text-xs font-medium text-foreground"
            >
              {c.name}
            </span>
          ))
        )}
      </div>
      <form onSubmit={handleSubmit} className="mt-4 flex flex-wrap items-end gap-3">
        <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-sm font-medium text-muted-foreground">
          New category name
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Railway Exam"
            required
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <label className="flex min-w-[240px] flex-[2] flex-col gap-1 text-sm font-medium text-muted-foreground">
          Description (optional)
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Shown as a tooltip above"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>
        <button
          type="submit"
          disabled={submitting}
          className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-60"
        >
          <PlusIcon /> {submitting ? "Creating…" : "Create category"}
        </button>
      </form>
    </div>
  );
}
