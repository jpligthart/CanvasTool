import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { api } from "../api/client";
import type { BulkResult, Group, GroupCategory, GroupMember, Student } from "../api/types";
import { AssignDialog } from "../components/AssignDialog";
import { ManageActionButton } from "../components/ManageActionButton";
import { StudentPicker } from "../components/StudentPicker";
import { errorMessage, useToast } from "../components/Toast";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  Input,
  LoadingBlock,
  Modal,
  PageHeader,
  ResultsModal,
  TableWrap,
  Td,
  Th,
} from "../components/ui";

function occupancy(g: Group): { label: string; full: boolean } {
  if (!g.max_membership) return { label: `${g.member_count} leden`, full: false };
  return { label: `${g.member_count}/${g.max_membership}`, full: g.member_count >= g.max_membership };
}

export function GroupsPage() {
  const { courseId } = useParams();
  const id = Number(courseId);
  const toast = useToast();
  const [categories, setCategories] = useState<GroupCategory[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeCatId, setActiveCatId] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [catName, setCatName] = useState("");
  const [groupName, setGroupName] = useState("");
  const [pickerFor, setPickerFor] = useState<Group | null>(null);
  const [assignIds, setAssignIds] = useState<number[] | null>(null);
  const [results, setResults] = useState<BulkResult[] | null>(null);
  const [removal, setRemoval] = useState<{ group: Group; member: GroupMember } | null>(null);
  const [removing, setRemoving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [cats, st] = await Promise.all([api.groups(id), api.students(id)]);
      setCategories(cats);
      setStudents(st);
      setActiveCatId((prev) => (prev && cats.some((c) => c.id === prev) ? prev : cats[0]?.id ?? null));
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "Groepen laden mislukt"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const active = categories.find((c) => c.id === activeCatId) ?? null;
  const nameById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s.name])), [students]);

  const withoutGroup = useMemo(() => {
    if (!active) return 0;
    return students.filter((s) => !s.groups.some((g) => g.category_id === active.id)).length;
  }, [students, active]);

  const toggleExpanded = (gid: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(gid)) next.delete(gid);
      else next.add(gid);
      return next;
    });

  const createCategory = async (close: () => void) => {
    const name = catName.trim();
    if (!name) return;
    try {
      const created = (await api.createGroupCategory(id, name)) as { id: number };
      setCatName("");
      close();
      toast.success(`Groepset "${name}" aangemaakt`);
      setActiveCatId(created.id);
      await load();
    } catch (e) {
      toast.error("Groepset aanmaken mislukt", errorMessage(e, "Onbekende fout"));
    }
  };

  const createGroup = async (close: () => void) => {
    const name = groupName.trim();
    if (!active || !name) return;
    try {
      await api.createGroup(id, active.id, name);
      setGroupName("");
      close();
      toast.success(`Groep "${name}" aangemaakt in ${active.name}`);
      await load();
    } catch (e) {
      toast.error("Groep aanmaken mislukt", errorMessage(e, "Onbekende fout"));
    }
  };

  const confirmRemoval = async () => {
    if (!removal || !active) return;
    setRemoving(true);
    try {
      await api.removeGroupMember(id, removal.group.id, removal.member.id, active.id);
      toast.success(`${removal.member.name} verwijderd uit ${removal.group.name}`);
      setRemoval(null);
      await load();
    } catch (e) {
      toast.error("Verwijderen mislukt", errorMessage(e, "Onbekende fout"));
    } finally {
      setRemoving(false);
    }
  };

  const isMember = useCallback((s: Student) => !!pickerFor && s.groups.some((g) => g.id === pickerFor.id), [pickerFor]);
  const describe = useCallback(
    (s: Student) => {
      const inSet = active ? s.groups.find((g) => g.category_id === active.id) : undefined;
      return inSet ? `Nu in ${inSet.name}` : "Nog geen groep in deze set";
    },
    [active],
  );

  const finishAssign = () => {
    setAssignIds(null);
    setPickerFor(null);
    void load();
  };

  return (
    <>
      <PageHeader
        title="Groepen"
        subtitle="Kies een groepset. Klap een groep open voor de leden, of voeg er meerdere studenten tegelijk aan toe."
        actions={
          <>
            <ManageActionButton label="Nieuwe groepset">
              {({ close }) => (
                <form
                  className="row"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void createCategory(close);
                  }}
                >
                  <Input autoFocus value={catName} onChange={(e) => setCatName(e.target.value)} placeholder="Naam groepset" />
                  <Button type="submit" variant="primary" disabled={!catName.trim()}>
                    Aanmaken
                  </Button>
                </form>
              )}
            </ManageActionButton>
            {active && (
              <ManageActionButton label="Nieuwe groep">
                {({ close }) => (
                  <form
                    className="row"
                    onSubmit={(e) => {
                      e.preventDefault();
                      void createGroup(close);
                    }}
                  >
                    <Input
                      autoFocus
                      value={groupName}
                      onChange={(e) => setGroupName(e.target.value)}
                      placeholder={`Groepsnaam in ${active.name}`}
                    />
                    <Button type="submit" variant="primary" disabled={!groupName.trim()}>
                      Aanmaken
                    </Button>
                  </form>
                )}
              </ManageActionButton>
            )}
          </>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}
      {loading ? (
        <LoadingBlock />
      ) : categories.length === 0 ? (
        <EmptyState title="Nog geen groepsets" hint="Maak er een aan met 'Nieuwe groepset'." />
      ) : (
        <>
          <div className="tabs" role="tablist" aria-label="Groepsets">
            {categories.map((c) => (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={c.id === activeCatId}
                className={`tab${c.id === activeCatId ? " is-active" : ""}`}
                onClick={() => setActiveCatId(c.id)}
              >
                {c.name}
                <span className="tab__count">{c.groups.length}</span>
              </button>
            ))}
          </div>

          {active && (
            <>
              <div className="filter-summary" style={{ marginTop: 0 }}>
                <span>
                  {active.groups.length} groepen · {withoutGroup} student{withoutGroup === 1 ? "" : "en"} nog zonder groep
                </span>
                {withoutGroup > 0 && (
                  <Link className="link-btn" to={`/cursus/${id}/studenten?groep=none:${active.id}`}>
                    Bekijk wie →
                  </Link>
                )}
              </div>

              {active.groups.length === 0 ? (
                <EmptyState title="Nog geen groepen in deze set" hint="Maak er een aan met 'Nieuwe groep'." />
              ) : (
                <TableWrap fill>
                  <thead>
                    <tr>
                      <Th>Groep</Th>
                      <Th style={{ width: 120 }}>Leden</Th>
                      <Th className="col-actions" />
                    </tr>
                  </thead>
                  <tbody>
                    {active.groups.map((g) => {
                      const occ = occupancy(g);
                      const open = expanded.has(g.id);
                      return (
                        <Fragment key={g.id}>
                          <tr className="is-clickable" onClick={() => toggleExpanded(g.id)}>
                            <Td>
                              <div style={{ fontWeight: 600 }}>
                                <span className="disclosure" aria-hidden>
                                  {open ? "▾" : "▸"}
                                </span>
                                {g.name}
                              </div>
                            </Td>
                            <Td>
                              {g.max_membership ? (
                                <Badge tone={occ.full ? "warning" : "neutral"}>{occ.label}</Badge>
                              ) : (
                                g.member_count
                              )}
                            </Td>
                            <Td className="col-actions">
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setPickerFor(g);
                                }}
                              >
                                Toevoegen
                              </Button>
                            </Td>
                          </tr>
                          {open && (
                            <tr className="row-detail">
                              <td colSpan={3}>
                                {g.members.length === 0 ? (
                                  <span className="muted">Geen leden in deze groep.</span>
                                ) : (
                                  <ul className="member-list">
                                    {g.members.map((m) => (
                                      <li key={m.id}>
                                        <span>{m.name}</span>
                                        <button
                                          type="button"
                                          className="icon-btn"
                                          title={`Verwijder ${m.name} uit ${g.name}`}
                                          aria-label={`Verwijder ${m.name} uit ${g.name}`}
                                          onClick={() => setRemoval({ group: g, member: m })}
                                        >
                                          ×
                                        </button>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </TableWrap>
              )}
            </>
          )}
        </>
      )}

      <StudentPicker
        open={!!pickerFor}
        title={`Toevoegen aan ${pickerFor?.name ?? ""}`}
        subtitle={active ? `Groepset ${active.name}. Wie al in een andere groep van deze set zit, wordt verplaatst.` : undefined}
        students={students}
        isMember={isMember}
        describe={describe}
        onClose={() => setPickerFor(null)}
        onConfirm={setAssignIds}
      />

      <AssignDialog
        open={!!assignIds}
        mode="group"
        courseId={id}
        userIds={assignIds ?? []}
        students={students}
        sections={[]}
        categories={categories}
        initialTarget={pickerFor && active ? `${active.id}:${pickerFor.id}` : undefined}
        onClose={() => setAssignIds(null)}
        onDone={finishAssign}
        onShowResults={setResults}
      />

      <ResultsModal results={results} nameById={nameById} onClose={() => setResults(null)} />

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
          <strong>{removal?.member.name}</strong> wordt verwijderd uit <strong>{removal?.group.name}</strong>.
        </p>
      </Modal>
    </>
  );
}
