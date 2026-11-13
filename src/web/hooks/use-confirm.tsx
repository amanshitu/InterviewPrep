import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CloseIcon } from "../components/layout/icons";

// In-app replacement for the browser's blocking window.confirm() — same
// call-site shape (await a yes/no answer) but rendered as a themed modal
// instead of an unstyleable native dialog. A single confirm() call can be
// pending at a time, matching how confirm() was actually used (one
// destructive-action confirmation at a time, never stacked).
export interface ConfirmOptions {
  title?: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive (red) instead of primary. */
  destructive?: boolean;
}

interface PendingConfirm extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

type ConfirmFn = (options: ConfirmOptions | string) => Promise<boolean>;

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);
  const pendingRef = useRef<PendingConfirm | null>(null);

  const confirm = useCallback<ConfirmFn>((options) => {
    // A second confirm() while one is already pending would otherwise
    // silently overwrite pendingRef without ever resolving the first
    // caller's promise, leaving it awaiting forever — resolve it as
    // cancelled first so no caller ever hangs.
    pendingRef.current?.resolve(false);
    return new Promise<boolean>((resolve) => {
      const normalized: PendingConfirm = typeof options === "string" ? { message: options, resolve } : { ...options, resolve };
      pendingRef.current = normalized;
      setPending(normalized);
    });
  }, []);

  const settle = useCallback((value: boolean) => {
    pendingRef.current?.resolve(value);
    pendingRef.current = null;
    setPending(null);
  }, []);

  useEffect(() => {
    if (!pending) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") settle(false);
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [pending, settle]);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4" onClick={() => settle(false)}>
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-modal-title"
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-lg border border-border bg-card p-5 text-card-foreground shadow-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <h2 id="confirm-modal-title" className="text-base font-semibold">
                {pending.title ?? "Please confirm"}
              </h2>
              <button
                type="button"
                onClick={() => settle(false)}
                aria-label="Close"
                className="shrink-0 text-muted-foreground hover:text-foreground"
              >
                <CloseIcon width={16} height={16} />
              </button>
            </div>
            <div className="mt-2 text-sm text-muted-foreground">{pending.message}</div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                autoFocus
                onClick={() => settle(false)}
                className="inline-flex items-center gap-2 rounded-md border border-border bg-secondary px-3.5 py-2 text-sm font-semibold text-foreground hover:bg-muted"
              >
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                onClick={() => settle(true)}
                className={`inline-flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-semibold hover:opacity-90 ${
                  pending.destructive ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"
                }`}
              >
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </ConfirmContext.Provider>
  );
}

export function useConfirm(): ConfirmFn {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm() must be used inside a <ConfirmProvider>");
  return ctx;
}
