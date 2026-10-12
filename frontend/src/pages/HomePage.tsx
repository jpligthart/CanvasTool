import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Course } from "../api/types";
import { useShell } from "../components/Layout";
import { errorMessage, useToast } from "../components/Toast";
import {
  loadCourseFilters,
  saveCourseFilters,
  type CourseFilters,
  type CourseSortDir,
  type CourseSortKey,
  type CourseStatus,
} from "../lib/courseFilters";
import { loadFavorites, toggleFavorite } from "../lib/favorites";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  LoadingBlock,
  PageHeader,
  Select,
  TableWrap,
  Td,
  Th,
} from "../components/ui";

const isPublished = (c: Course) => c.workflow_state === "available" || c.workflow_state === "completed";

const QUICK_LINKS = [
  { to: "studenten", label: "Studenten" },
  { to: "secties", label: "Secties" },
  { to: "groepen", label: "Groepen" },
  { to: "opdrachten", label: "Opdrachten" },
];

const label = (c: Course) => c.course_code || c.name;

const shortDate = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });

function period(c: Course): string {
  const fmt = (v?: string | null) => (v ? shortDate.format(new Date(v)) : null);
  const start = fmt(c.start_at);
  const end = fmt(c.end_at);
  if (start && end) return `${start} – ${end}`;
  if (start) return `vanaf ${start}`;
  if (end) return `tot ${end}`;
  return "—";
}
const byLabel = (a: Course, b: Course) => label(a).localeCompare(label(b), "nl");

const statusLabel = (c: Course) =>
  c.workflow_state === "available"
    ? "Gepubliceerd"
    : c.workflow_state === "completed"
      ? "Afgerond"
      : (c.workflow_state ?? "");

const timestamp = (value?: string | null) => {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time;
};

function compareText(a: string, b: string, sign: number): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return a.localeCompare(b, "nl") * sign;
}

function compareNullable(a: number | null, b: number | null, sign: number): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return (a - b) * sign;
}

function compareCourses(a: Course, b: Course, key: CourseSortKey, dir: CourseSortDir): number {
  const sign = dir === "asc" ? 1 : -1;
  if (key === "name") return label(a).localeCompare(label(b), "nl") * sign;
  if (key === "term") return compareText(a.term ?? "", b.term ?? "", sign);
  if (key === "status") return compareText(statusLabel(a), statusLabel(b), sign);
  const byStart = compareNullable(timestamp(a.start_at), timestamp(b.start_at), sign);
  return byStart !== 0 ? byStart : compareNullable(timestamp(a.end_at), timestamp(b.end_at), sign);
}

function matches(c: Course, needle: string): boolean {
  return !needle || `${c.course_code ?? ""} ${c.name} ${c.term ?? ""}`.toLowerCase().includes(needle);
}

function FavoriteTile({ course, onUnfavorite }: { course: Course; onUnfavorite: () => void }) {
  return (
    <div className="tile">
      <div className="tile__head">
        <Link to={`/cursus/${course.id}/studenten`} className="tile__title">
          {label(course)}
        </Link>
        <button
          type="button"
          className="icon-btn icon-btn--active"
          onClick={onUnfavorite}
          title="Verwijder favoriet"
          aria-label={`Verwijder ${label(course)} uit favorieten`}
        >
          ★
        </button>
      </div>
      <div className="tile__sub">{[course.course_code ? course.name : null, course.term].filter(Boolean).join(" · ")}</div>
      <nav className="tile__links" aria-label={`Snelkoppelingen ${label(course)}`}>
        {QUICK_LINKS.map((l) => (
          <Link key={l.to} to={`/cursus/${course.id}/${l.to}`}>
            {l.label}
          </Link>
        ))}
      </nav>
    </div>
  );
}

function SortTh({
  label: column,
  sortKey,
  activeKey,
  dir,
  onSort,
}: {
  label: string;
  sortKey: CourseSortKey;
  activeKey: CourseSortKey;
  dir: CourseSortDir;
  onSort: (key: CourseSortKey) => void;
}) {
  const active = activeKey === sortKey;
  return (
    <Th ariaSort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button type="button" className={`th-sort${active ? " is-active" : ""}`} onClick={() => onSort(sortKey)}>
        {column}
        <span className="th-sort__mark" aria-hidden="true">
          {active ? (dir === "asc" ? "↑" : "↓") : ""}
        </span>
      </button>
    </Th>
  );
}

function CourseRow({
  course,
  favorite,
  onToggleFavorite,
}: {
  course: Course;
  favorite: boolean;
  onToggleFavorite: () => void;
}) {
  const navigate = useNavigate();
  const href = `/cursus/${course.id}/studenten`;
  return (
    <tr className="is-clickable" onClick={() => navigate(href)}>
      <Td className="col-check">
        <button
          type="button"
          className={`icon-btn${favorite ? " icon-btn--active" : ""}`}
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite();
          }}
          title={favorite ? "Verwijder favoriet" : "Markeer als favoriet"}
          aria-pressed={favorite}
        >
          {favorite ? "★" : "☆"}
        </button>
      </Td>
      <Td>
        <Link to={href} style={{ fontWeight: 600 }} onClick={(e) => e.stopPropagation()}>
          {label(course)}
        </Link>
        {course.course_code && <div className="cell-sub">{course.name}</div>}
      </Td>
      <Td className="cell-muted">{course.term ?? "—"}</Td>
      <Td className="cell-muted" style={{ whiteSpace: "nowrap" }}>
        {period(course)}
      </Td>
      <Td>
        <Badge tone={course.workflow_state === "available" ? "success" : "neutral"}>
          {course.workflow_state === "available"
            ? "Gepubliceerd"
            : course.workflow_state === "completed"
              ? "Afgerond"
              : course.workflow_state ?? "Onbekend"}
        </Badge>
      </Td>
      <Td className="col-actions cell-muted">Openen →</Td>
    </tr>
  );
}

export function HomePage() {
  const { me, courses, setCourses } = useShell();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CourseFilters>(() => loadCourseFilters(me?.user?.id));
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());
  const { scope, term, status, sortKey, sortDir } = filters;

  useEffect(() => {
    if (!me?.user?.id) return;
    setFavorites(loadFavorites(me.user.id));
    setFilters(loadCourseFilters(me.user.id));
  }, [me?.user?.id]);

  const updateFilters = (patch: Partial<CourseFilters>) => {
    setFilters((prev) => {
      const next = { ...prev, ...patch };
      saveCourseFilters(me?.user?.id, next);
      return next;
    });
  };

  useEffect(() => {
    if (courses) return;
    api.courses()
      .then(setCourses)
      .catch((e) => setError(errorMessage(e, "Cursussen laden mislukt")));
  }, [courses, setCourses]);

  const needle = q.trim().toLowerCase();

  const favoriteCourses = useMemo(() => {
    if (!courses) return [];
    return [...courses.active, ...courses.past].filter((c) => favorites.has(c.id)).sort(byLabel);
  }, [courses, favorites]);

  const source = useMemo(() => (courses ? (scope === "active" ? courses.active : courses.past) : []), [courses, scope]);

  const terms = useMemo(
    () => [...new Set(source.map((c) => c.term).filter((t): t is string => !!t))].sort((a, b) => b.localeCompare(a, "nl")),
    [source],
  );
  const effectiveTerm = terms.includes(term) ? term : "";

  const list = useMemo(
    () =>
      source
        .filter((c) => matches(c, needle))
        .filter((c) => !effectiveTerm || c.term === effectiveTerm)
        .filter((c) => !status || (status === "published") === isPublished(c))
        .sort((a, b) => compareCourses(a, b, sortKey, sortDir)),
    [source, needle, effectiveTerm, status, sortKey, sortDir],
  );

  const onSort = (key: CourseSortKey) => {
    if (sortKey === key) updateFilters({ sortDir: sortDir === "asc" ? "desc" : "asc" });
    else updateFilters({ sortKey: key, sortDir: "asc" });
  };

  const filtersActive = !!(needle || effectiveTerm || status);

  const toggleFav = (courseId: number) => {
    if (!me?.user?.id) return;
    setFavorites(new Set(toggleFavorite(me.user.id, courseId)));
  };

  const refreshAll = async () => {
    setRefreshing(true);
    try {
      const fresh = await api.refreshAll();
      setCourses(fresh);
      setError(null);
      const warm = fresh.active.filter((c) => favorites.has(c.id));
      await Promise.allSettled(warm.map((c) => api.students(c.id)));
      toast.success(
        "Alles ververst",
        warm.length ? `Cursuslijst en ${warm.length} favoriete cursus${warm.length === 1 ? "" : "sen"} opnieuw geladen.` : undefined,
      );
    } catch (e) {
      toast.error("Verversen mislukt", errorMessage(e, "Onbekende fout"));
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Jouw cursussen"
        subtitle="Cursussen waarin je docent bent. Tip: Ctrl+K zoekt cursussen, en studenten in je favoriete cursussen."
        actions={
          <Button
            variant="secondary"
            onClick={() => void refreshAll()}
            disabled={refreshing}
            title="Haalt cursussen, studenten, secties, groepen en cijfers opnieuw op uit Canvas. Handig aan het begin van het semester."
          >
            {refreshing ? "Bezig met verversen…" : "Alles verversen"}
          </Button>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}
      {!courses && !error && <LoadingBlock />}

      {courses && (
        <>
          {favoriteCourses.length > 0 ? (
            <section style={{ marginBottom: 28 }}>
              <h2 className="section-title">Favorieten</h2>
              <div className="tile-grid">
                {favoriteCourses.map((c) => (
                  <FavoriteTile key={c.id} course={c} onUnfavorite={() => toggleFav(c.id)} />
                ))}
              </div>
            </section>
          ) : (
            <p className="muted" style={{ margin: "0 0 20px" }}>
              Markeer je vaste cursussen met ☆; ze verschijnen dan hier bovenaan met directe snelkoppelingen.
            </p>
          )}

          <div className="toolbar">
            <div className="tabs" role="tablist" style={{ marginBottom: 0, borderBottom: "none" }}>
              <button
                type="button"
                role="tab"
                aria-selected={scope === "active"}
                className={`tab${scope === "active" ? " is-active" : ""}`}
                onClick={() => updateFilters({ scope: "active" })}
              >
                Lopend <span className="tab__count">{courses.active.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={scope === "past"}
                className={`tab${scope === "past" ? " is-active" : ""}`}
                onClick={() => updateFilters({ scope: "past" })}
              >
                Afgerond <span className="tab__count">{courses.past.length}</span>
              </button>
            </div>
            <div className="toolbar__grow">
              <Input
                type="search"
                placeholder="Filter op naam, code of periode…"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                aria-label="Filter cursussen"
              />
            </div>
            <Select
              value={effectiveTerm}
              onChange={(e) => updateFilters({ term: e.target.value })}
              aria-label="Filter op periode"
              className={effectiveTerm ? "select--active" : undefined}
              disabled={terms.length === 0}
            >
              <option value="">Alle periodes</option>
              {terms.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
            <Select
              value={status}
              onChange={(e) => updateFilters({ status: e.target.value as CourseStatus })}
              aria-label="Filter op status"
              className={status ? "select--active" : undefined}
            >
              <option value="">Alle statussen</option>
              <option value="published">Gepubliceerd</option>
              <option value="unpublished">Niet gepubliceerd</option>
            </Select>
          </div>

          {filtersActive && (
            <div className="filter-summary">
              <span>
                {list.length} van {source.length} cursussen
              </span>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setQ("");
                  updateFilters({ term: "", status: "" });
                }}
              >
                Filters wissen
              </button>
            </div>
          )}

          {list.length === 0 ? (
            <EmptyState
              title={
                filtersActive ? "Geen cursussen gevonden" : scope === "active" ? "Geen lopende cursussen" : "Geen afgeronde cursussen"
              }
              hint={filtersActive ? "Pas je zoekterm of filters aan." : undefined}
            />
          ) : (
            <TableWrap fill>
              <thead>
                <tr>
                  <Th className="col-check" />
                  <SortTh label="Cursus" sortKey="name" activeKey={sortKey} dir={sortDir} onSort={onSort} />
                  <SortTh label="Periode" sortKey="term" activeKey={sortKey} dir={sortDir} onSort={onSort} />
                  <SortTh label="Looptijd" sortKey="period" activeKey={sortKey} dir={sortDir} onSort={onSort} />
                  <SortTh label="Status" sortKey="status" activeKey={sortKey} dir={sortDir} onSort={onSort} />
                  <Th className="col-actions" />
                </tr>
              </thead>
              <tbody>
                {list.map((c) => (
                  <CourseRow key={c.id} course={c} favorite={favorites.has(c.id)} onToggleFavorite={() => toggleFav(c.id)} />
                ))}
              </tbody>
            </TableWrap>
          )}
        </>
      )}
    </div>
  );
}
