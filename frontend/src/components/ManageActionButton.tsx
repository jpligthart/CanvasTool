import { useState, type ReactNode } from "react";
import { Button } from "./ui";

export function ManageActionButton({
  label,
  children,
}: {
  label: string;
  children: (ctx: { close: () => void }) => ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <Button variant="secondary" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {label}
      </Button>
      {open && (
        <div className="panel" style={{ marginTop: 10 }}>
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  );
}
