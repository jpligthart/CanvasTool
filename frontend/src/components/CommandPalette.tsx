import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Course, CoursesResponse, Student } from "../api/types";
import { loadFavorites } from "../lib/favorites";

type Item = { key: string; group: string; title: string; sub?: string; href: string };
type StudentPool = { course: Course; students: Student[] }[];

const PAGES = [
  { to: "studenten", label: "Studenten" },
  { to: "secties", label: "Secties" },
  { to: "groepen", label: "Groepen" },
  { to: "opdrachten", label: "Opdrachten" },
];

const MAX_PER_GROUP = 8;

const courseLabel = (c: Course) => c.course_code || c.name;

const matchesStudent = (s: Student, needle: string) =>
  [s.name, s.email, s.sis_user_id, s.login_id].filter(Boolean).join(" ").toLowerCase().includes(needle);

export function CommandPalette({
  open,
  onClose,
  courses,
  courseId,
  accountId,
}: {
  open: boolean;
  onClose: () => void;
  courses: CoursesResponse | null;
  courseId: number | null;
  accountId: number | undefined;
}) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);
  const [students, setStudents] = useState<StudentPool | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const currentCourse = useMemo(
    () => (courseId && courses ? [...courses.active, ...courses.past].find((c) => c.id === courseId) : undefined),
    [courses, courseId],
  );

  const searchCourses = useMemo<Course[]>(() => {
    if (!courses) return [];
    if (courseId) return currentCourse ? [currentCourse] : [];
    const favs = accountId ? loadFavorites(accountId) : new Set<number>();
    return [...courses.active, ...courses.past].filter((c) => favs.has(c.id));
  }, [courses, courseId, currentCourse, accountId]);

  useEffect(() => {
    if (!open) return;
    setQ("");
    setActive(0);
    setStudents(null);
    if (searchCourses.length === 0) {
      setStudents([]);
      return;
    }
    let cancelled = false;
    Promise.allSettled(searchCourses.map((c) => api.students(c.id))).then((results) => {
      if (cancelled) return;
      setStudents(
        results.flatMap((r, i) => (r.status === "fulfilled" ? [{ course: searchCourses[i], students: r.value }] : [])),
      );
    });
    return () => {
      cancelled = true;
    };
  }, [open, searchCourses]);

  const items = useMemo<Item[]>(() => {
    const needle = q.trim().toLowerCase();
    const out: Item[] = [];

    if (courseId) {
      const where = currentCourse ? courseLabel(currentCourse) : "deze cursus";
      for (const p of PAGES) {
        if (!needle || p.label.toLowerCase().includes(needle)) {
          out.push({ key: `p-${p.to}`, group: `Ga naar (${where})`, title: p.label, href: `/cursus/${courseId}/${p.to}` });
        }
      }
    }

    if (needle && students) {
      const hits = students
        .flatMap(({ course, students: list }) =>
          list.filter((s) => matchesStudent(s, needle)).map((s) => ({ course, s })),
        )
        .slice(0, courseId ? MAX_PER_GROUP : MAX_PER_GROUP * 2);
      for (const { course, s } of hits) {
        out.push({
          key: `s-${course.id}-${s.id}`,
          group: courseId ? "Studenten in deze cursus" : "Studenten in favoriete cursussen",
          title: s.name,
          sub: [s.email, courseId ? s.section_names.join(", ") : courseLabel(course)].filter(Boolean).join(" · "),
          href: `/cursus/${course.id}/studenten?q=${encodeURIComponent(s.name)}`,
        });
      }
    }

    if (courses) {
      const favs = accountId ? loadFavorites(accountId) : new Set<number>();
      const all = [...courses.active, ...courses.past];
      const pool = needle
        ? all.filter((c) => `${c.course_code ?? ""} ${c.name} ${c.term ?? ""}`.toLowerCase().includes(needle))
        : all.filter((c) => favs.has(c.id));
      pool
        .sort((a, b) => Number(favs.has(b.id)) - Number(favs.has(a.id)) || courseLabel(a).localeCompare(courseLabel(b), "nl"))
        .slice(0, MAX_PER_GROUP)
        .forEach((c) =>
          out.push({
            key: `c-${c.id}`,
            group: needle ? "Cursussen" : "Favoriete cursussen",
            title: courseLabel(c),
            sub: [c.course_code ? c.name : null, c.term, courses.past.includes(c) ? "afgerond" : null]
              .filter(Boolean)
              .join(" · "),
            href: `/cursus/${c.id}/studenten`,
          }),
        );
    }
    return out;
  }, [q, courseId, currentCourse, students, courses, accountId]);

  useEffect(() => setActive(0), [q]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(".palette__item.is-active")?.scrollIntoView({ block: "nearest" });
  }, [active]);

  if (!open) return null;

  const go = (item: Item) => {
    onClose();
    navigate(item.href);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, items.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && items[active]) {
      e.preventDefault();
      go(items[active]);
    }
  };

  const loadingStudents = !!q.trim() && students === null;
  const placeholder = courseId
    ? "Zoek student, cursus of onderdeel…"
    : searchCourses.length > 0
      ? "Zoek cursus, of student in je favorieten…"
      : "Zoek cursus… (studenten: maak eerst een cursus favoriet)";

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <div
        className="palette"
        role="dialog"
        aria-modal="true"
        aria-label="Snel zoeken"
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <input
          className="palette__input"
          autoFocus
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Zoekterm"
        />
        <div className="palette__list" ref={listRef} role="listbox">
          {items.length === 0 && (
            <div className="palette__empty">{loadingStudents ? "Studenten laden…" : "Niets gevonden"}</div>
          )}
          {items.map((item, i) => (
            <div key={item.key}>
              {(i === 0 || items[i - 1].group !== item.group) && <div className="palette__group">{item.group}</div>}
              <button
                type="button"
                role="option"
                aria-selected={i === active}
                className={`palette__item${i === active ? " is-active" : ""}`}
                onMouseMove={() => setActive(i)}
                onClick={() => go(item)}
              >
                <span className="palette__title">{item.title}</span>
                {item.sub && <span className="palette__sub">{item.sub}</span>}
              </button>
            </div>
          ))}
        </div>
        <div className="palette__foot">
          <span>↑↓ kiezen</span>
          <span>Enter openen</span>
          <span>Esc sluiten</span>
        </div>
      </div>
    </div>
  );
}
