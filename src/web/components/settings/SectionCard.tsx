import type { ReactNode } from "react";

// Shared card chrome for every settings section — replaces the old
// `.card` CSS class with Tailwind utilities against the new theme tokens.
export function SectionCard({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card p-5 text-card-foreground">
      <h2 className="text-base font-semibold">{title}</h2>
      {subtitle ? <p className="mt-1.5 text-sm text-muted-foreground">{subtitle}</p> : null}
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function FieldLabel({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
      <span>{label}</span>
      {children}
      {hint ? <small className="font-normal text-muted-foreground">{hint}</small> : null}
    </label>
  );
}

export function inputClass(extra = "") {
  return `rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring ${extra}`;
}

export function PrimaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function SecondaryButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-muted disabled:opacity-50 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function GhostButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50 ${props.className ?? ""}`}
    >
      {children}
    </button>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm text-destructive">{children}</p>;
}

export function SuccessText({ children }: { children: ReactNode }) {
  return <p className="mt-2 text-sm text-success">{children}</p>;
}
