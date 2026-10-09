import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import type { Course, CoursesResponse } from "../api/types";
import { loadFavorites } from "../lib/favorites";

type Entry = { course: Course; group: string };

function courseLabel(c: Course): string {
  return c.course_code || c.name;
}

export function CourseSwitcher({
  current,
  courses,
  accountId,
}: {
  current: Course | null;
  courses: CoursesResponse | null;
  accountId: number | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const location = useLocation();

  const entries = useMemo<Entry[]>(() => {
    if (!courses) return [];
    const favs = accountId ? loadFavorites(accountId) : new Set<number>();
    const needle = q.trim().toLowerCase();
    const matches = (c: Course) =>
      !needle || `${c.course_code ?? ""} ${c.name} ${c.term ?? ""}`.toLowerCase().includes(needle);
    const byLabel = (a: Course, b: Course) => courseLabel(a).localeCompare(courseLabel(b), "nl");
    const fav = courses.active.filter((c) => favs.has(c.id) && matches(c)).sort(byLabel);
    const rest = courses.active.filter((c) => !favs.has(c.id) && matches(c)).sort(byLabel);
    const past = needle ? courses.past.filter(matches).sort(byLabel) : [];
    return [
      ...fav.map((course) => ({ course, group: "Favorieten" })),
      ...rest.map((course) => ({ course, group: "Lopend" })),
      ...past.map((course) => ({ course, group: "Afgerond" })),
    ];
  }, [courses, accountId, q, open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    setActive(0);
  }, [q, open]);

  const go = (course: Course) => {
    const tab = location.pathname.split("/")[3] || "studenten";
    setOpen(false);
    setQ("");
    navigate(`/cursus/${course.id}/${tab}`);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      setOpen(false);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, entries.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && entries[active]) {
      e.preventDefault();
      go(entries[active].course);
    }
  };

  return (
    <div className="switcher" ref={rootRef}>
      <button
        type="button"
        className="switcher__trigger"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
        title="Wissel van cursus"
      >
        <span className="switcher__label">
          {current ? `${courseLabel(current)}${current.course_code ? ` · ${current.name}` : ""}` : "Cursus…"}
        </span>
        <span className="switcher__caret">▼</span>
      </button>
      {open && (
        <div className="switcher__pop" onKeyDown={onKeyDown}>
          <div className="switcher__search">
            <input
              className="input"
              autoFocus
              placeholder="Zoek cursus op naam, code of periode…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
          <div className="switcher__list" role="listbox">
            {entries.length === 0 && <div className="switcher__group">Geen cursussen gevonden</div>}
            {entries.map((entry, i) => (
              <div key={entry.course.id}>
                {(i === 0 || entries[i - 1].group !== entry.group) && (
                  <div className="switcher__group">{entry.group}</div>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  className={[
                    "switcher__item",
                    i === active && "is-active",
                    entry.course.id === current?.id && "is-current",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => go(entry.course)}
                >
                  <div className="switcher__item-name">{courseLabel(entry.course)}</div>
                  <div className="switcher__item-sub">
                    {[entry.course.course_code ? entry.course.name : null, entry.course.term]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
