import { useEffect, useMemo, useRef, useState } from "react";
import type { Student } from "../api/types";
import { Button, Input } from "./ui";

export function StudentPicker({
  open,
  title,
  subtitle,
  students,
  isMember,
  describe,
  onClose,
  onConfirm,
}: {
  open: boolean;
  title: string;
  subtitle?: string;
  students: Student[];
  isMember: (s: Student) => boolean;
  describe: (s: Student) => string;
  onClose: () => void;
  onConfirm: (userIds: number[]) => void;
}) {
  const [q, setQ] = useState("");
  const [hideMembers, setHideMembers] = useState(true);
  const [picked, setPicked] = useState<Set<number>>(new Set());
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    setQ("");
    setPicked(new Set());
    setHideMembers(true);
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector(".modal")) {
        e.stopPropagation();
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("keydown", onKey, true);
      previouslyFocused?.focus?.();
    };
  }, [open]);

  const memberCount = useMemo(() => students.filter(isMember).length, [students, isMember]);

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return students.filter((s) => {
      if (hideMembers && isMember(s)) return false;
      if (!needle) return true;
      return [s.name, s.email, s.sis_user_id, describe(s)].filter(Boolean).join(" ").toLowerCase().includes(needle);
    });
  }, [students, q, hideMembers, isMember, describe]);

  const selectable = visible.filter((s) => !isMember(s));
  const allPicked = selectable.length > 0 && selectable.every((s) => picked.has(s.id));

  const toggle = (id: number) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (allPicked) selectable.forEach((s) => next.delete(s.id));
      else selectable.forEach((s) => next.add(s.id));
      return next;
    });

  if (!open) return null;

  return (
    <div className="drawer-backdrop" onMouseDown={onClose}>
      <aside
        ref={panelRef}
        className="drawer"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="drawer__header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Sluiten">
            ×
          </button>
        </header>

        <div className="drawer__tools">
          <Input
            type="search"
            autoFocus
            placeholder="Zoek op naam, e-mail, SIS, sectie of groep…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && selectable.length === 1) {
                e.preventDefault();
                toggle(selectable[0].id);
              }
            }}
          />
          <div className="drawer__tool-row">
            <label className="check">
              <input type="checkbox" checked={allPicked} onChange={toggleAll} disabled={selectable.length === 0} />
              Alles ({selectable.length})
            </label>
            {memberCount > 0 && (
              <label className="check muted">
                <input type="checkbox" checked={hideMembers} onChange={(e) => setHideMembers(e.target.checked)} />
                Verberg wie er al in zit ({memberCount})
              </label>
            )}
          </div>
        </div>

        <ul className="picker-list">
          {visible.length === 0 && <li className="picker-list__empty">Geen studenten gevonden</li>}
          {visible.map((s) => {
            const member = isMember(s);
            return (
              <li key={s.id}>
                <label className={`picker-item${member ? " is-disabled" : ""}${picked.has(s.id) ? " is-picked" : ""}`}>
                  <input
                    type="checkbox"
                    checked={member || picked.has(s.id)}
                    disabled={member}
                    onChange={() => toggle(s.id)}
                  />
                  <span className="picker-item__text">
                    <span className="picker-item__name">{s.name}</span>
                    <span className="picker-item__sub">{member ? "Zit er al in" : describe(s) || "—"}</span>
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <footer className="drawer__footer">
          <span className="muted">{picked.size} gekozen</span>
          <div className="row">
            <Button variant="secondary" onClick={onClose}>
              Annuleren
            </Button>
            <Button variant="primary" disabled={picked.size === 0} onClick={() => onConfirm([...picked])}>
              Verder ({picked.size})
            </Button>
          </div>
        </footer>
      </aside>
    </div>
  );
}
