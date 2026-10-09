import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { api } from "../api/client";
import type { Assignment, GradeRow, Submission } from "../api/types";
import { errorMessage } from "../components/Toast";
import {
  Alert,
  Badge,
  EmptyState,
  Input,
  LoadingBlock,
  PageHeader,
  TableWrap,
  Td,
  Th,
  type BadgeTone,
} from "../components/ui";

type Tab = "assignments" | "grades";
type SubFilter = "all" | "submitted" | "missing" | "ungraded";

const num = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 });
const date = new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric" });

const STATE: Record<string, { label: string; tone: BadgeTone }> = {
  graded: { label: "Beoordeeld", tone: "success" },
  submitted: { label: "Ingeleverd", tone: "accent" },
  pending_review: { label: "Te beoordelen", tone: "warning" },
  unsubmitted: { label: "Niet ingeleverd", tone: "neutral" },
};

const isSubmitted = (s: Submission) => !!s.submitted_at || (!!s.workflow_state && s.workflow_state !== "unsubmitted");
const isGraded = (s: Submission) => s.score != null || s.workflow_state === "graded";

function scoreLabel(score: number | null | undefined, grade: string | null | undefined): string {
  if (score != null) return num.format(score);
  return grade ?? "—";
}

function Submissions({ courseId, assignment }: { courseId: number; assignment: Assignment }) {
  const [rows, setRows] = useState<Submission[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SubFilter>("all");

  useEffect(() => {
    setRows(null);
    setError(null);
    setFilter("all");
    api.submissions(courseId, assignment.id)
      .then((r) => setRows([...r].sort((a, b) => (a.user_name ?? "").localeCompare(b.user_name ?? "", "nl"))))
      .catch((e) => setError(errorMessage(e, "Inzendingen laden mislukt")));
  }, [courseId, assignment.id]);

  const stats = useMemo(() => {
    if (!rows) return null;
    const submitted = rows.filter(isSubmitted).length;
    const graded = rows.filter(isGraded);
    const scores = graded.map((s) => s.score).filter((v): v is number => v != null);
    const avg = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
    return { total: rows.length, submitted, graded: graded.length, avg };
  }, [rows]);

  const visible = useMemo(() => {
    if (!rows) return [];
    switch (filter) {
      case "submitted":
        return rows.filter(isSubmitted);
      case "missing":
        return rows.filter((s) => !isSubmitted(s));
      case "ungraded":
        return rows.filter((s) => isSubmitted(s) && !isGraded(s));
      default:
        return rows;
    }
  }, [rows, filter]);

  if (error) return <Alert tone="error">{error}</Alert>;
  if (!rows || !stats) return <LoadingBlock />;

  const filters: { id: SubFilter; label: string; count: number }[] = [
    { id: "all", label: "Alle", count: stats.total },
    { id: "submitted", label: "Ingeleverd", count: stats.submitted },
    { id: "missing", label: "Niet ingeleverd", count: stats.total - stats.submitted },
    { id: "ungraded", label: "Nog te beoordelen", count: rows.filter((s) => isSubmitted(s) && !isGraded(s)).length },
  ];

  return (
    <>
      <div className="detail-head">
        <h2>{assignment.name}</h2>
        <div className="muted">
          {[
            assignment.points_possible != null ? `${num.format(assignment.points_possible)} punten` : null,
            assignment.due_at ? `deadline ${date.format(new Date(assignment.due_at))}` : "geen deadline",
            assignment.published === false ? "niet gepubliceerd" : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </div>
      </div>

      <div className="stats">
        <div className="stat">
          <span className="stat__value">
            {stats.submitted}
            <span className="stat__of">/{stats.total}</span>
          </span>
          <span className="stat__label">Ingeleverd</span>
        </div>
        <div className="stat">
          <span className="stat__value">{stats.graded}</span>
          <span className="stat__label">Beoordeeld</span>
        </div>
        <div className="stat">
          <span className="stat__value">
            {stats.avg != null ? num.format(stats.avg) : "—"}
            {stats.avg != null && assignment.points_possible ? (
              <span className="stat__of">/{num.format(assignment.points_possible)}</span>
            ) : null}
          </span>
          <span className="stat__label">Gemiddelde score</span>
        </div>
      </div>

      <div className="segmented" role="group" aria-label="Filter inzendingen">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            className={filter === f.id ? "is-active" : undefined}
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
          >
            {f.label} <span className="segmented__count">{f.count}</span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <EmptyState title="Geen inzendingen in deze selectie" />
      ) : (
        <TableWrap fill>
          <thead>
            <tr>
              <Th>Student</Th>
              <Th>Status</Th>
              <Th>Ingeleverd op</Th>
              <Th style={{ textAlign: "right" }}>Score</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((s) => {
              const state = STATE[s.workflow_state ?? ""] ?? { label: s.workflow_state ?? "—", tone: "neutral" as const };
              return (
                <tr key={s.user_id}>
                  <Td>{s.user_name ?? `Student ${s.user_id}`}</Td>
                  <Td>
                    <Badge tone={state.tone}>{state.label}</Badge>
                  </Td>
                  <Td className="cell-muted">{s.submitted_at ? date.format(new Date(s.submitted_at)) : "—"}</Td>
                  <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {scoreLabel(s.score, s.grade)}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </TableWrap>
      )}
    </>
  );
}

function GradeOverview({ grades }: { grades: GradeRow[] }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<"name" | "current">("name");

  const visible = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const rows = grades.filter((g) => !needle || (g.name ?? "").toLowerCase().includes(needle));
    if (sort === "current") {
      return [...rows].sort((a, b) => (a.current_score ?? -1) - (b.current_score ?? -1));
    }
    return rows;
  }, [grades, q, sort]);

  const pct = (score: number | null | undefined, grade: string | null | undefined) =>
    score != null ? `${num.format(score)}%` : grade ?? "—";

  return (
    <>
      <div className="toolbar">
        <div className="toolbar__grow">
          <Input type="search" placeholder="Zoek student…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="segmented" role="group" aria-label="Sortering">
          <button type="button" className={sort === "name" ? "is-active" : undefined} onClick={() => setSort("name")}>
            Op naam
          </button>
          <button
            type="button"
            className={sort === "current" ? "is-active" : undefined}
            onClick={() => setSort("current")}
          >
            Laagste eerst
          </button>
        </div>
      </div>
      {visible.length === 0 ? (
        <EmptyState title="Geen studenten gevonden" />
      ) : (
        <TableWrap fill>
          <thead>
            <tr>
              <Th>Student</Th>
              <Th style={{ textAlign: "right" }}>Huidig</Th>
              <Th style={{ textAlign: "right" }}>Eind</Th>
            </tr>
          </thead>
          <tbody>
            {visible.map((g) => (
              <tr key={g.user_id}>
                <Td>{g.name}</Td>
                <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {pct(g.current_score, g.current_grade)}
                </Td>
                <Td style={{ textAlign: "right", fontVariantNumeric: "tabular-nums" }} className="cell-muted">
                  {pct(g.final_score, g.final_grade)}
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}
      <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        "Huidig" telt alleen beoordeelde opdrachten; "Eind" rekent niet-ingeleverd werk als 0.
      </p>
    </>
  );
}

export function AssignmentsPage() {
  const { courseId } = useParams();
  const id = Number(courseId);
  const [tab, setTab] = useState<Tab>("assignments");
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [grades, setGrades] = useState<GradeRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    api.assignments(id)
      .then((a) => {
        setAssignments(a);
        setSelectedId((prev) => prev ?? a[0]?.id ?? null);
      })
      .catch((e) => setError(errorMessage(e, "Opdrachten laden mislukt")))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (tab !== "grades" || grades) return;
    api.gradeSummary(id)
      .then(setGrades)
      .catch((e) => setError(errorMessage(e, "Cijfers laden mislukt")));
  }, [tab, grades, id]);

  const visibleAssignments = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return assignments.filter((a) => !needle || a.name.toLowerCase().includes(needle));
  }, [assignments, q]);

  const selected = assignments.find((a) => a.id === selectedId) ?? null;

  return (
    <>
      <PageHeader
        title="Opdrachten & cijfers"
        subtitle="Alleen bekijken. Deze app schrijft geen cijfers naar Canvas."
        actions={<Badge>Alleen-lezen</Badge>}
      />

      <div className="tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "assignments"}
          className={`tab${tab === "assignments" ? " is-active" : ""}`}
          onClick={() => setTab("assignments")}
        >
          Per opdracht <span className="tab__count">{assignments.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "grades"}
          className={`tab${tab === "grades" ? " is-active" : ""}`}
          onClick={() => setTab("grades")}
        >
          Cijferoverzicht cursus
        </button>
      </div>

      {error && <Alert tone="error">{error}</Alert>}

      {tab === "grades" ? (
        grades ? (
          <GradeOverview grades={grades} />
        ) : (
          !error && <LoadingBlock />
        )
      ) : loading ? (
        <LoadingBlock />
      ) : assignments.length === 0 ? (
        <EmptyState title="Geen opdrachten in deze cursus" />
      ) : (
        <div className="master-detail fill">
          <div className="master">
            <Input type="search" placeholder="Zoek opdracht…" value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="master__list">
              {visibleAssignments.length === 0 && <li className="muted" style={{ padding: 10 }}>Niets gevonden</li>}
              {visibleAssignments.map((a) => (
                <li key={a.id}>
                  <button
                    type="button"
                    className={`master__item${a.id === selectedId ? " is-active" : ""}`}
                    aria-current={a.id === selectedId}
                    onClick={() => setSelectedId(a.id)}
                  >
                    <span className="master__name">{a.name}</span>
                    <span className="master__sub">
                      {[
                        a.points_possible != null ? `${num.format(a.points_possible)} ptn` : null,
                        a.due_at ? date.format(new Date(a.due_at)) : null,
                        a.published === false ? "concept" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
          <div className="detail">
            {selected ? (
              <Submissions courseId={id} assignment={selected} />
            ) : (
              <EmptyState title="Kies een opdracht" hint="Selecteer links een opdracht om de inzendingen te zien." />
            )}
          </div>
        </div>
      )}
    </>
  );
}
