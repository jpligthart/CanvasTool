import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastTone = "success" | "error" | "warning" | "info";

export type ToastInput = {
  title: string;
  detail?: string;
  tone?: ToastTone;
  action?: { label: string; onClick: () => void };
  durationMs?: number;
};

type ToastItem = ToastInput & { id: number };

type ToastApi = {
  show: (t: ToastInput) => void;
  success: (title: string, detail?: string) => void;
  error: (title: string, detail?: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setItems((prev) => [...prev.slice(-3), { ...t, id }]);
      const duration = t.durationMs ?? (t.tone === "error" || t.action ? 9000 : 4500);
      window.setTimeout(() => dismiss(id), duration);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      show,
      success: (title, detail) => show({ title, detail, tone: "success" }),
      error: (title, detail) => show({ title, detail, tone: "error" }),
    }),
    [show],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {items.map((t) => (
          <div key={t.id} className={`toast toast--${t.tone ?? "info"}`} role={t.tone === "error" ? "alert" : "status"}>
            <div className="toast__body">
              <div className="toast__title">{t.title}</div>
              {t.detail && <div className="toast__detail">{t.detail}</div>}
            </div>
            {t.action && (
              <button
                type="button"
                className="toast__action"
                onClick={() => {
                  t.action?.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
            <button type="button" className="toast__close" onClick={() => dismiss(t.id)} aria-label="Sluiten">
              ×
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

export function errorMessage(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}
