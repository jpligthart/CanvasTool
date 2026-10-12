import { useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useMatch, useOutletContext, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Course, CoursesResponse, MeResponse } from "../api/types";
import { currentTheme, setTheme, type Theme } from "../lib/theme";
import { CommandPalette } from "./CommandPalette";
import { CourseSwitcher } from "./CourseSwitcher";
import { Spinner } from "./ui";

export type ShellContext = {
  me: MeResponse | null;
  courses: CoursesResponse | null;
  setCourses: (c: CoursesResponse) => void;
};

export function useShell(): ShellContext {
  return useOutletContext<ShellContext>();
}

function canvasHostLabel(host: string): string {
  return host.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function isTestCanvas(host: string): boolean {
  const name = canvasHostLabel(host).toLowerCase();
  return name.includes(".test.") || name.startsWith("test.");
}

function findCourse(courses: CoursesResponse | null, id: number): Course | null {
  if (!courses) return null;
  return courses.active.find((c) => c.id === id) ?? courses.past.find((c) => c.id === id) ?? null;
}

export function AppShell() {
  const [me, setMe] = useState<MeResponse | null>(null);
  const [meError, setMeError] = useState<string | null>(null);
  const [courses, setCourses] = useState<CoursesResponse | null>(null);
  const courseMatch = useMatch("/cursus/:courseId/*");
  const courseId = courseMatch ? Number(courseMatch.params.courseId) : null;

  useEffect(() => {
    api.me()
      .then(setMe)
      .catch((e) => setMeError(e instanceof Error ? e.message : "Verbinding mislukt"));
    api.courses()
      .then(setCourses)
      .catch(() => undefined);
  }, []);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [theme, setThemeState] = useState<Theme>(currentTheme);

  const toggleTheme = () => {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    setThemeState(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const current = courseId ? findCourse(courses, courseId) : null;

  return (
    <div className="app">
      <header className="topbar">
        <Link to="/" className="brand" title={`Canvastool v${__APP_VERSION__}`}>
          <span className="brand__mark" aria-hidden="true">Ct</span>
          Canvastool
          <span className="brand__version">v{__APP_VERSION__}</span>
        </Link>
        {courseId && (
          <nav className="breadcrumb" aria-label="Kruimelpad">
            <span className="breadcrumb__sep">/</span>
            <CourseSwitcher current={current} courses={courses} accountId={me?.user.id} />
          </nav>
        )}
        <div className="topbar__spacer" />
        <button type="button" className="search-trigger" onClick={() => setPaletteOpen(true)}>
          <span>Zoek cursus of student…</span>
          <kbd>Ctrl K</kbd>
        </button>
        <button
          type="button"
          className="theme-toggle"
          onClick={toggleTheme}
          title={theme === "dark" ? "Licht thema" : "Donker thema"}
          aria-label={theme === "dark" ? "Schakel naar licht thema" : "Schakel naar donker thema"}
        >
          {theme === "dark" ? "☀" : "☾"}
        </button>
        <div className="topbar__status">
          {!me && !meError && <Spinner onDark />}
          {meError && <span className="topbar__error" title={meError}>Niet verbonden</span>}
          {me && (
            <>
              <span className="status-dot" aria-hidden />
              <span>{me.user.name}</span>
              <span
                className={isTestCanvas(me.host) ? "topbar__host topbar__host--test" : "topbar__host"}
                title={`Verbonden met ${canvasHostLabel(me.host)}`}
              >
                {canvasHostLabel(me.host)}
              </span>
            </>
          )}
        </div>
      </header>
      <Outlet context={{ me, courses, setCourses } satisfies ShellContext} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        courses={courses}
        courseId={courseId}
        accountId={me?.user.id}
      />
    </div>
  );
}

type Counts = Partial<Record<"studenten" | "secties" | "groepen" | "opdrachten", number>>;

const navItems: { to: keyof Counts; label: string }[] = [
  { to: "studenten", label: "Studenten" },
  { to: "secties", label: "Secties" },
  { to: "groepen", label: "Groepen" },
  { to: "opdrachten", label: "Opdrachten" },
];

function formatAgo(ts: number | null, now: number): string {
  if (!ts) return "Nog niet geladen";
  const min = Math.floor((now - ts) / 60000);
  if (min < 1) return "Zojuist bijgewerkt";
  if (min === 1) return "1 min geleden";
  if (min < 60) return `${min} min geleden`;
  return `${Math.floor(min / 60)} uur geleden`;
}

export function CourseLayout() {
  const shell = useShell();
  const { courseId } = useParams();
  const id = Number(courseId);
  const course = findCourse(shell.courses, id);
  const [counts, setCounts] = useState<Counts>({});
  const [reloadKey, setReloadKey] = useState(0);
  const [refreshing, setRefreshing] = useState(false);
  const [now, setNow] = useState(Date.now());

  const loadCounts = useCallback(() => {
    api.students(id).then((s) => setCounts((c) => ({ ...c, studenten: s.length }))).catch(() => undefined);
    api.sections(id).then((s) => setCounts((c) => ({ ...c, secties: s.length }))).catch(() => undefined);
    api.assignments(id).then((a) => setCounts((c) => ({ ...c, opdrachten: a.length }))).catch(() => undefined);
    api.groups(id)
      .then((cats) => setCounts((c) => ({ ...c, groepen: cats.reduce((n, cat) => n + cat.groups.length, 0) })))
      .catch(() => undefined);
  }, [id]);

  useEffect(() => {
    setCounts({});
    loadCounts();
    return api.onInvalidate((changed) => {
      if (changed === id || changed === null) loadCounts();
    });
  }, [id, loadCounts]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(t);
  }, []);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await api.refreshCourse(id);
      await api.students(id);
    } catch {
      /* page shows its own error */
    } finally {
      setRefreshing(false);
      setNow(Date.now());
      setReloadKey((k) => k + 1);
    }
  };

  return (
    <div className="course">
      <aside className="rail">
        <div className="rail__course">
          <div className="rail__code">{course ? course.course_code || course.name : `Cursus ${id}`}</div>
          {course?.course_code && <div className="rail__name">{course.name}</div>}
          {course?.term && <div className="rail__term">{course.term}</div>}
        </div>
        <nav className="rail__nav" aria-label="Cursusonderdelen">
          {navItems.map((item) => (
            <NavLink key={item.to} to={`/cursus/${id}/${item.to}`} className="rail-link">
              <span>{item.label}</span>
              {counts[item.to] !== undefined && <span className="rail-link__count">{counts[item.to]}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="rail__footer">
          <span>{formatAgo(api.studentsFetchedAt(id), now)}</span>
          <button type="button" className="rail__refresh" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? "Bezig…" : "Verversen"}
          </button>
        </div>
      </aside>
      <main className="main">
        <Outlet key={`${id}-${reloadKey}`} context={shell} />
      </main>
    </div>
  );
}
