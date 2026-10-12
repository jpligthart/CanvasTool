import {
  useEffect,
  useRef,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type InputHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
  type SelectHTMLAttributes,
} from "react";

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

type BtnVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button({
  variant = "secondary",
  size = "md",
  className,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: BtnVariant; size?: "sm" | "md" }) {
  return (
    <button
      type={type}
      className={cx("btn", `btn--${variant}`, size === "sm" && "btn--sm", className)}
      {...props}
    />
  );
}

export function Card({ children, style, className }: PropsWithChildren<{ style?: CSSProperties; className?: string }>) {
  return (
    <div className={cx("card", className)} style={style}>
      {children}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </div>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx("input", className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx("select", className)} {...props} />;
}

export type BadgeTone = "neutral" | "success" | "accent" | "warning" | "danger";

export function Badge({ children, tone = "neutral" }: PropsWithChildren<{ tone?: BadgeTone }>) {
  return <span className={cx("badge", tone !== "neutral" && `badge--${tone}`)}>{children}</span>;
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <p className="empty__title">{title}</p>
      {hint && <p className="empty__hint">{hint}</p>}
      {action && <div style={{ marginTop: 14 }}>{action}</div>}
    </div>
  );
}

export function Spinner({ onDark }: { onDark?: boolean }) {
  return <span className={cx("spinner", onDark && "spinner--on-dark")} role="status" aria-label="Laden" />;
}

export function LoadingBlock() {
  return (
    <div className="loading-block">
      <Spinner />
    </div>
  );
}

export function TableWrap({ children, style, fill }: PropsWithChildren<{ style?: CSSProperties; fill?: boolean }>) {
  return (
    <div className={cx("table-wrap", fill && "fill")} style={style}>
      <table className="table">{children}</table>
    </div>
  );
}

export function Th({
  children,
  style,
  className,
  ariaSort,
}: PropsWithChildren<{ style?: CSSProperties; className?: string; ariaSort?: "ascending" | "descending" | "none" }>) {
  return (
    <th className={className} style={style} aria-sort={ariaSort}>
      {children}
    </th>
  );
}

export function Td({ children, style, className }: PropsWithChildren<{ style?: CSSProperties; className?: string }>) {
  return (
    <td className={className} style={style}>
      {children}
    </td>
  );
}

export function Alert({ children, tone = "info" }: PropsWithChildren<{ tone?: "info" | "error" | "success" }>) {
  return (
    <div className={`alert alert--${tone}`} role={tone === "error" ? "alert" : undefined}>
      {children}
    </div>
  );
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    if (!dialog?.contains(document.activeElement)) {
      const body = dialog?.querySelector<HTMLElement>(`.modal__body :is(${FOCUSABLE})`);
      const primary = dialog?.querySelector<HTMLElement>(".modal__footer .btn:not(.btn--secondary):not(:disabled)");
      (body ?? primary ?? dialog?.querySelector<HTMLElement>(FOCUSABLE))?.focus();
    }

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== "Tab" || !dialog) return;
      const items = [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  if (!open) return null;
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="modal__header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Sluiten">
            ×
          </button>
        </div>
        <div className="modal__body">{children}</div>
        {footer && <div className="modal__footer">{footer}</div>}
      </div>
    </div>
  );
}

export type BulkResultItem = { user_id: number; status: string; detail?: unknown };

const STATUS_LABEL: Record<string, { label: string; tone: BadgeTone }> = {
  ok: { label: "Ok", tone: "success" },
  skipped: { label: "Overgeslagen", tone: "warning" },
  error: { label: "Fout", tone: "danger" },
};

export function BulkResultList({
  results,
  nameById,
}: {
  results: BulkResultItem[];
  nameById: Record<number, string>;
}) {
  const ordered = [...results].sort((a, b) => Number(a.status === "ok") - Number(b.status === "ok"));
  return (
    <ul className="result-list">
      {ordered.map((r) => {
        const meta = STATUS_LABEL[r.status] ?? STATUS_LABEL.error;
        return (
          <li key={r.user_id}>
            <div>
              <div>{nameById[r.user_id] ?? `Student ${r.user_id}`}</div>
              {r.status !== "ok" && typeof r.detail === "string" && (
                <div className="result-list__detail">{r.detail}</div>
              )}
            </div>
            <Badge tone={meta.tone}>{meta.label}</Badge>
          </li>
        );
      })}
    </ul>
  );
}

export function ResultsModal({
  results,
  nameById,
  onClose,
}: {
  results: BulkResultItem[] | null;
  nameById: Record<number, string>;
  onClose: () => void;
}) {
  return (
    <Modal
      open={!!results}
      title="Resultaat per student"
      onClose={onClose}
      footer={
        <Button variant="primary" onClick={onClose}>
          Sluiten
        </Button>
      }
    >
      {results && <BulkResultList results={results} nameById={nameById} />}
    </Modal>
  );
}

export function summarizeBulk(results: BulkResultItem[]): { ok: number; failed: number; skipped: number } {
  let ok = 0;
  let failed = 0;
  let skipped = 0;
  for (const r of results) {
    if (r.status === "ok") ok += 1;
    else if (r.status === "skipped") skipped += 1;
    else failed += 1;
  }
  return { ok, failed, skipped };
}
