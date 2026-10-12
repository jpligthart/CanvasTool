import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { MemberRoster } from "../components/MemberRoster";
import { api } from "../api/client";
import type { BulkResult, Section, Student } from "../api/types";
import { AssignDialog } from "../components/AssignDialog";
import { ManageActionButton } from "../components/ManageActionButton";
import { StudentPicker } from "../components/StudentPicker";
import { errorMessage, useToast } from "../components/Toast";
import {
  Alert,
  Button,
  EmptyState,
  Input,
  LoadingBlock,
  PageHeader,
  ResultsModal,
  TableWrap,
  Td,
  Th,
} from "../components/ui";

export function SectionsPage() {
  const { courseId } = useParams();
  const id = Number(courseId);
  const toast = useToast();
  const [sections, setSections] = useState<Section[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [pickerFor, setPickerFor] = useState<Section | null>(null);
  const [assignIds, setAssignIds] = useState<number[] | null>(null);
  const [results, setResults] = useState<BulkResult[] | null>(null);

  const load = useCallback(async () => {
    try {
      const [sec, st] = await Promise.all([api.sections(id), api.students(id)]);
      setSections(sec);
      setStudents(st);
      setError(null);
    } catch (e) {
      setError(errorMessage(e, "Secties laden mislukt"));
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const membersBySection = useMemo(() => {
    const map = new Map<number, Student[]>();
    for (const s of students) {
      for (const sid of s.section_ids) {
        const list = map.get(sid) ?? [];
        list.push(s);
        map.set(sid, list);
      }
    }
    return map;
  }, [students]);

  const nameById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s.name])), [students]);

  const toggleExpanded = (sid: number) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });

  const createSection = async (close: () => void) => {
    const name = newName.trim();
    if (!name) return;
    try {
      await api.createSection(id, name);
      setNewName("");
      close();
      toast.success(`Sectie "${name}" aangemaakt`);
      await load();
    } catch (e) {
      toast.error("Sectie aanmaken mislukt", errorMessage(e, "Onbekende fout"));
    }
  };

  const isMember = useCallback((s: Student) => !!pickerFor && s.section_ids.includes(pickerFor.id), [pickerFor]);
  const describe = useCallback((s: Student) => s.section_names.join(", "), []);

  const finishAssign = () => {
    setAssignIds(null);
    setPickerFor(null);
    void load();
  };

  return (
    <>
      <PageHeader
        title="Secties"
        subtitle="Klap een sectie open om de leden te zien. Met 'Studenten toevoegen' kies je er meerdere tegelijk."
        actions={
          <ManageActionButton label="Nieuwe sectie">
            {({ close }) => (
              <form
                className="row"
                onSubmit={(e) => {
                  e.preventDefault();
                  void createSection(close);
                }}
              >
                <Input
                  autoFocus
                  placeholder="Naam sectie"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  style={{ flex: 1, minWidth: 200 }}
                />
                <Button type="submit" variant="primary" disabled={!newName.trim()}>
                  Aanmaken
                </Button>
              </form>
            )}
          </ManageActionButton>
        }
      />

      {error && <Alert tone="error">{error}</Alert>}
      {loading ? (
        <LoadingBlock />
      ) : sections.length === 0 ? (
        <EmptyState title="Nog geen secties" hint="Maak er een aan met 'Nieuwe sectie'." />
      ) : (
        <TableWrap fill>
          <thead>
            <tr>
              <Th>Sectie</Th>
              <Th style={{ width: 140 }}>Leden</Th>
              <Th className="col-actions" />
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => {
              const members = membersBySection.get(sec.id) ?? [];
              const open = expanded.has(sec.id);
              return (
                <Fragment key={sec.id}>
                  <tr className="is-clickable" onClick={() => toggleExpanded(sec.id)}>
                    <Td>
                      <div style={{ fontWeight: 600 }}>
                        <span className="disclosure" aria-hidden>
                          {open ? "▾" : "▸"}
                        </span>
                        {sec.name}
                      </div>
                      {sec.sis_section_id && <div className="cell-sub indent">SIS {sec.sis_section_id}</div>}
                    </Td>
                    <Td>{members.length}</Td>
                    <Td className="col-actions">
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setPickerFor(sec);
                        }}
                      >
                        Studenten toevoegen
                      </Button>
                    </Td>
                  </tr>
                  {open && (
                    <tr className="row-detail">
                      <td colSpan={3}>
                        <MemberRoster
                          members={members}
                          emptyLabel="Geen studenten in deze sectie."
                          studentsLink={`/cursus/${id}/studenten?sectie=${sec.id}`}
                        />
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </TableWrap>
      )}

      <StudentPicker
        open={!!pickerFor}
        title={`Toevoegen aan ${pickerFor?.name ?? ""}`}
        subtitle="Kies een of meer studenten. Je ziet de gevolgen voordat er iets in Canvas verandert."
        students={students}
        isMember={isMember}
        describe={describe}
        onClose={() => setPickerFor(null)}
        onConfirm={setAssignIds}
      />

      <AssignDialog
        open={!!assignIds}
        mode="section"
        courseId={id}
        userIds={assignIds ?? []}
        students={students}
        sections={sections}
        categories={null}
        initialTarget={pickerFor ? String(pickerFor.id) : undefined}
        onClose={() => setAssignIds(null)}
        onDone={finishAssign}
        onShowResults={setResults}
      />

      <ResultsModal results={results} nameById={nameById} onClose={() => setResults(null)} />
    </>
  );
}
