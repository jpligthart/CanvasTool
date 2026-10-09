import { useCallback, useDeferredValue, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api } from "../api/client";
import type { BulkResult, GroupCategory, Section, Student } from "../api/types";
import { AssignDialog, type AssignMode } from "../components/AssignDialog";
import { RowMenu, type RowMenuItem } from "../components/RowMenu";
import { errorMessage, useToast } from "../components/Toast";
import { loadSelection, saveSelection } from "../lib/selection";
import {
  Alert,
  BulkResultList,
  Button,
  EmptyState,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  Select,
  TableWrap,
  Td,
  Th,
} from "../components/ui";

type GroupRef = Student["groups"][number];

function searchText(s: Student): string {
  return [
    s.name,
    s.email,
    s.sis_user_id,
    s.login_id,
    ...s.section_names,
    ...(s.groups ?? []).map((g) => g.name),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

export function StudentsPage() {
  const { courseId } = useParams();
  const id = Number(courseId);
  const toast = useToast();

  const [students, setStudents] = useState<Student[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [categories, setCategories] = useState<GroupCategory[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const deferredQ = useDeferredValue(q);
  const [searchParams, setSearchParams] = useSearchParams();
  const [sectionFilter, setSectionFilter] = useState("");
  const [groupFilter, setGroupFilter] = useState("");

  useEffect(() => {
    if (!["q", "sectie", "groep"].some((k) => searchParams.has(k))) return;
    setQ(searchParams.get("q") ?? "");
    setSectionFilter(searchParams.get("sectie") ?? "");
    setGroupFilter(searchParams.get("groep") ?? "");
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const [selected, setSelected] = useState<Set<number>>(() => loadSelection(id));
  const [assign, setAssign] = useState<{ mode: AssignMode; userIds: number[]; fromSelection: boolean } | null>(null);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [removal, setRemoval] = useState<{ student: Student; group: GroupRef } | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [s, sec] = await Promise.all([api.students(id), api.sections(id)]);
      setStudents(s);
      setSections(sec);
    } catch (e) {
      setError(errorMessage(e, "Studenten laden mislukt"));
    } finally {
      setLoading(false);
    }
    api.groups(id)
      .then(setCategories)
      .catch(() => setCategories([]));
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    saveSelection(id, selected);
  }, [id, selected]);

  const index = useMemo(() => new Map(students.map((s) => [s.id, searchText(s)])), [students]);
  const nameById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s.name])), [students]);

  const filtered = useMemo(() => {
    const needle = deferredQ.trim().toLowerCase();
    const [gKind, gId] = groupFilter.split(":");
    return students.filter((s) => {
      if (needle && !index.get(s.id)?.includes(needle)) return false;
      if (sectionFilter && !s.section_ids.includes(Number(sectionFilter))) return false;
      if (gKind === "g" && !s.groups.some((g) => g.id === Number(gId))) return false;
      if (gKind === "none" && s.groups.some((g) => g.category_id === Number(gId))) return false;
      return true;
    });
  }, [students, index, deferredQ, sectionFilter, groupFilter]);

  const filtersActive = !!(q || sectionFilter || groupFilter);
  const hiddenSelected = useMemo(() => {
    const visible = new Set(filtered.map((s) => s.id));
    return [...selected].filter((sid) => !visible.has(sid)).length;
  }, [filtered, selected]);

  const allVisibleSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));

  const toggle = (uid: number) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid);
      else next.add(uid);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) filtered.forEach((s) => next.delete(s.id));
      else filtered.forEach((s) => next.add(s.id));
      return next;
    });
  };

  const clearFilters = () => {
    setQ("");
    setSectionFilter("");
    setGroupFilter("");
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector(".modal, .menu, .switcher__pop, .palette")) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" && (target as HTMLInputElement).value) return;
      setSelected((prev) => (prev.size ? new Set() : prev));
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const onAssignDone = (allSucceeded: boolean) => {
    if (assign?.fromSelection && allSucceeded) setSelected(new Set());
    setAssign(null);
    void load();
  };

  const confirmRemoval = async () => {
    if (!removal) return;
    setRemoving(true);
    try {
      await api.removeGroupMember(id, removal.group.id, removal.student.id, removal.group.category_id);
      toast.success(`${removal.student.name} verwijderd uit ${removal.group.name}`);
      setRemoval(null);
      await load();
    } catch (e) {
      toast.error("Verwijderen mislukt", errorMessage(e, "Onbekende fout"));
    } finally {
      setRemoving(false);
    }
  };

  const rowMenu = (s: Student): RowMenuItem[] => {
    const items: RowMenuItem[] = [
      {
        kind: "item",
        label: "Naar sectie…",
        onSelect: () => setAssign({ mode: "section", userIds: [s.id], fromSelection: false }),
      },
      {
        kind: "item",
        label: "Naar groep…",
        onSelect: () => setAssign({ mode: "group", userIds: [s.id], fromSelection: false }),
      },
    ];
    if (s.groups.length > 0) {
      items.push({ kind: "divider" }, { kind: "label", label: "Groepen" });
      for (const g of s.groups) {
        items.push({
          kind: "item",
          label: `Verwijder uit ${g.name}`,
          danger: true,
          onSelect: () => setRemoval({ student: s, group: g }),
        });
      }
    }
    return items;
  };

  const categoryName = (catId: number) => categories?.find((c) => c.id === catId)?.name;

  return (
    <>
      <PageHeader
        title="Studenten"
        subtitle="Zoek, filter en selecteer. Toewijzen aan sectie of groep doe je vanuit de balk onderin of via ⋯ per student."
      />

      {error && <Alert tone="error">{error}</Alert>}

      <div className="toolbar">
        <div className="toolbar__grow">
          <Input
            type="search"
            autoFocus
            placeholder="Zoek op naam, e-mail, SIS, sectie of groep…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            aria-label="Zoek studenten"
          />
        </div>
        <Select
          value={sectionFilter}
          onChange={(e) => setSectionFilter(e.target.value)}
          aria-label="Filter op sectie"
          className={sectionFilter ? "select--active" : undefined}
        >
          <option value="">Alle secties</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </Select>
        <Select
          value={groupFilter}
          onChange={(e) => setGroupFilter(e.target.value)}
          aria-label="Filter op groep"
          disabled={!categories}
          className={groupFilter ? "select--active" : undefined}
        >
          <option value="">{categories ? "Alle groepen" : "Groepen laden…"}</option>
          {(categories ?? []).map((cat) => (
            <optgroup key={cat.id} label={cat.name}>
              <option value={`none:${cat.id}`}>Zonder groep in {cat.name}</option>
              {cat.groups.map((g) => (
                <option key={g.id} value={`g:${g.id}`}>
                  {g.name}
                </option>
              ))}
            </optgroup>
          ))}
        </Select>
      </div>

      {!loading && students.length > 0 && (
        <div className="filter-summary">
          <span>
            {filtersActive ? `${filtered.length} van ${students.length} studenten` : `${students.length} studenten`}
          </span>
          {filtersActive && (
            <button type="button" className="link-btn" onClick={clearFilters}>
              Filters wissen
            </button>
          )}
        </div>
      )}

      {loading ? (
        <LoadingBlock />
      ) : students.length === 0 ? (
        <EmptyState title="Geen studenten in deze cursus" />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="Geen studenten gevonden"
          hint="Pas je zoekterm of filters aan."
          action={
            <Button variant="secondary" onClick={clearFilters}>
              Filters wissen
            </Button>
          }
        />
      ) : (
        <TableWrap>
          <thead>
            <tr>
              <Th className="col-check">
                <input
                  type="checkbox"
                  aria-label="Alle zichtbare studenten selecteren"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                />
              </Th>
              <Th>Naam</Th>
              <Th>E-mail</Th>
              <Th>Sectie</Th>
              <Th>Groepen</Th>
              <Th className="col-actions" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((s) => (
              <tr
                key={s.id}
                className={`is-clickable${selected.has(s.id) ? " is-selected" : ""}`}
                onClick={() => toggle(s.id)}
              >
                <Td className="col-check">
                  <input
                    type="checkbox"
                    aria-label={`Selecteer ${s.name}`}
                    checked={selected.has(s.id)}
                    onChange={() => toggle(s.id)}
                    onClick={(e) => e.stopPropagation()}
                  />
                </Td>
                <Td>
                  <div style={{ fontWeight: 600 }}>{s.name}</div>
                  {s.sis_user_id && <div className="cell-sub">SIS {s.sis_user_id}</div>}
                </Td>
                <Td className="cell-muted">{s.email ?? "—"}</Td>
                <Td>{s.section_names.join(", ") || <span className="cell-muted">—</span>}</Td>
                <Td>
                  {s.groups.length === 0 ? (
                    <span className="cell-muted">—</span>
                  ) : (
                    <div className="name-list">
                      {s.groups.map((g) => (
                        <span key={g.id} className="badge" title={categoryName(g.category_id)}>
                          {g.name}
                        </span>
                      ))}
                    </div>
                  )}
                </Td>
                <Td className="col-actions">
                  <RowMenu label={`Acties voor ${s.name}`} items={rowMenu(s)} />
                </Td>
              </tr>
            ))}
          </tbody>
        </TableWrap>
      )}

      {selected.size > 0 && (
        <div className="action-bar" role="region" aria-label="Acties voor selectie">
          <span className="action-bar__count">
            {selected.size} geselecteerd
            {hiddenSelected > 0 && <span className="action-bar__hint"> · {hiddenSelected} buiten filter</span>}
          </span>
          <Button
            variant="primary"
            onClick={() => setAssign({ mode: "section", userIds: [...selected], fromSelection: true })}
          >
            Naar sectie
          </Button>
          <Button
            variant="primary"
            onClick={() => setAssign({ mode: "group", userIds: [...selected], fromSelection: true })}
          >
            Naar groep
          </Button>
          <div className="action-bar__spacer" />
          <span className="action-bar__hint">Esc wist selectie</span>
          <button type="button" className="action-bar__clear" onClick={() => setSelected(new Set())}>
            Wis selectie
          </button>
        </div>
      )}

      <AssignDialog
        open={!!assign}
        mode={assign?.mode ?? "section"}
        courseId={id}
        userIds={assign?.userIds ?? []}
        students={students}
        sections={sections}
        categories={categories}
        onClose={() => setAssign(null)}
        onDone={onAssignDone}
        onShowResults={setResults}
      />

      <Modal
        open={!!results}
        title="Resultaat per student"
        onClose={() => setResults(null)}
        footer={
          <Button variant="primary" onClick={() => setResults(null)}>
            Sluiten
          </Button>
        }
      >
        {results && <BulkResultList results={results} nameById={nameById} />}
      </Modal>

      <Modal
        open={!!removal}
        title="Uit groep verwijderen?"
        onClose={() => !removing && setRemoval(null)}
        footer={
          <>
            <Button variant="secondary" disabled={removing} onClick={() => setRemoval(null)}>
              Annuleren
            </Button>
            <Button variant="danger" disabled={removing} onClick={() => void confirmRemoval()}>
              {removing ? "Bezig…" : "Verwijderen"}
            </Button>
          </>
        }
      >
        <p style={{ margin: 0 }}>
          <strong>{removal?.student.name}</strong> wordt verwijderd uit groep <strong>{removal?.group.name}</strong>
          {removal && categoryName(removal.group.category_id) ? ` (${categoryName(removal.group.category_id)})` : ""}.
        </p>
      </Modal>
    </>
  );
}
