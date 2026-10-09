import { useEffect, useRef, useState, type CSSProperties } from "react";

export type RowMenuItem =
  | { kind: "item"; label: string; onSelect: () => void; danger?: boolean }
  | { kind: "divider" }
  | { kind: "label"; label: string };

const MENU_WIDTH = 240;

export function RowMenu({ items, label }: { items: RowMenuItem[]; label: string }) {
  const [pos, setPos] = useState<CSSProperties | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const close = () => setPos(null);

  const toggle = () => {
    if (pos) return close();
    const rect = triggerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const openUp = rect.bottom + 260 > window.innerHeight;
    setPos({
      left: Math.max(8, rect.right - MENU_WIDTH),
      width: MENU_WIDTH,
      ...(openUp ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
    });
  };

  useEffect(() => {
    if (!pos) return;
    menuRef.current?.querySelector<HTMLButtonElement>(".menu__item")?.focus();
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!menuRef.current?.contains(t) && !triggerRef.current?.contains(t)) close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        close();
        triggerRef.current?.focus();
      } else if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>(".menu__item") ?? [])];
        const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = e.key === "ArrowDown" ? (i + 1) % buttons.length : (i - 1 + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey, true);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey, true);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [pos]);

  return (
    <span onClick={(e) => e.stopPropagation()}>
      <button
        ref={triggerRef}
        type="button"
        className="icon-btn"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={!!pos}
        onClick={toggle}
      >
        ⋯
      </button>
      {pos && (
        <div ref={menuRef} className="menu" role="menu" style={pos}>
          {items.map((item, i) => {
            if (item.kind === "divider") return <div key={i} className="menu__divider" />;
            if (item.kind === "label")
              return (
                <div key={i} className="menu__label">
                  {item.label}
                </div>
              );
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                className={`menu__item${item.danger ? " menu__item--danger" : ""}`}
                onClick={() => {
                  close();
                  item.onSelect();
                }}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </span>
  );
}
