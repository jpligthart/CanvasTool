import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import type { Course } from "../api/types";
import { useShell } from "../components/Layout";
import { errorMessage, useToast } from "../components/Toast";
import { loadFavorites, toggleFavorite } from "../lib/favorites";
import { Alert, Badge, Button, EmptyState, Input, LoadingBlock, PageHeader, TableWrap, Td, Th } from "../components/ui";

type Scope = "active" | "past";

const QUICK_LINKS = [
  { to: "studenten", label: "Studenten" },
  { to: "secties", label: "Secties" },
  { to: "groepen", label: "Groepen" },
  { to: "opdrachten", label: "Opdrachten" },
];

const label = (c: Course) => c.course_code || c.name;
const byLabel = (a: Course, b: Course) => label(a).localeCompare(label(b), "nl");

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
  const [scope, setScope] = useState<Scope>("active");
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const [favorites, setFavorites] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (me?.user?.id) setFavorites(loadFavorites(me.user.id));
  }, [me?.user?.id]);

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

  const list = useMemo(() => {
    if (!courses) return [];
    const source = scope === "active" ? courses.active : courses.past;
    return source.filter((c) => matches(c, needle)).sort(byLabel);
  }, [courses, scope, needle]);

  const toggleFav = (courseId: number) => {
    if (!me?.user?.id) return;
    setFavorites(new Set(toggleFavorite(me.user.id, courseId)));
  };

  const refresh = async () => {
    setRefreshing(true);
    try {
      setCourses(await api.refreshCourses());
      setError(null);
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
        subtitle="Cursussen waarin je docent bent. Tip: Ctrl+K zoekt overal naar cursussen en studenten."
        actions={
          <Button variant="secondary" onClick={() => void refresh()} disabled={refreshing}>
            {refreshing ? "Bezig…" : "Verversen"}
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
                onClick={() => setScope("active")}
              >
                Lopend <span className="tab__count">{courses.active.length}</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={scope === "past"}
                className={`tab${scope === "past" ? " is-active" : ""}`}
                onClick={() => setScope("past")}
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
          </div>

          {list.length === 0 ? (
            <EmptyState
              title={needle ? "Geen cursussen gevonden" : scope === "active" ? "Geen lopende cursussen" : "Geen afgeronde cursussen"}
              hint={needle ? "Probeer een andere zoekterm." : undefined}
            />
          ) : (
            <TableWrap>
              <thead>
                <tr>
                  <Th className="col-check" />
                  <Th>Cursus</Th>
                  <Th>Periode</Th>
                  <Th>Status</Th>
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
