import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";

// Port of app.js's toast()/toastSuccess()/toastError()/toastWarning(): a
// single-slot notification (a new toast replaces whatever's showing, it
// doesn't stack), auto-dismissed after the same 2600ms, styled by `type`
// via "toast-{type}" the same way the original's className swap worked.
export type ToastType = "info" | "success" | "error" | "warning";

const TOAST_DURATION_MS = 2600;

interface ToastState {
  message: string;
  type: ToastType;
  visible: boolean;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
  success: (message: string) => void;
  error: (message: string) => void;
  warning: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<ToastState>({ message: "", type: "info", visible: false });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((message: string, type: ToastType = "info") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState({ message, type, visible: true });
    timerRef.current = setTimeout(() => {
      setState((prev) => ({ ...prev, visible: false }));
    }, TOAST_DURATION_MS);
  }, []);

  const success = useCallback((message: string) => toast(message, "success"), [toast]);
  const error = useCallback((message: string) => toast(message, "error"), [toast]);
  const warning = useCallback((message: string) => toast(message, "warning"), [toast]);

  return (
    <ToastContext.Provider value={{ toast, success, error, warning }}>
      {children}
      <div id="toast" className={`toast toast-${state.type}`} hidden={!state.visible}>
        {state.message}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast() must be used inside a <ToastProvider>");
  return ctx;
}
