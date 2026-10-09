import { useEffect, useMemo, useState } from "react";
import { api } from "../api/client";
import type { BulkResult, GroupCategory, Section, Student } from "../api/types";
import { errorMessage, useToast } from "./Toast";
import { Button, Modal, Select, summarizeBulk } from "./ui";

export type AssignMode = "section" | "group";

const MAX_NAMES = 6;

export function AssignDialog({
  open,
  mode,
  courseId,
  userIds,
  students,
  sections,
  categories,
  onClose,
  onDone,
  onShowResults,
  initialTarget,
}: {
  open: boolean;
  mode: AssignMode;
  courseId: number;
  userIds: number[];
  students: Student[];
  sections: Section[];
  categories: GroupCategory[] | null;
  onClose: () => void;
  onDone: (allSucceeded: boolean) => void;
  onShowResults: (results: BulkResult[]) => void;
  /** Section id, or `${categoryId}:${groupId}` for groups. */
  initialTarget?: string;
}) {
  const toast = useToast();
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) setTarget(initialTarget ?? "");
  }, [open, mode, initialTarget]);

  const picked = useMemo(() => {
    const ids = new Set(userIds);
    return students.filter((s) => ids.has(s.id));
  }, [students, userIds]);

  const section = mode === "section" ? sections.find((s) => String(s.id) === target) : undefined;

  const groupTarget = useMemo(() => {
    if (mode !== "group" || !target || !categories) return null;
    const [catId, groupId] = target.split(":").map(Number);
    const category = categories.find((c) => c.id === catId);
    const group = category?.groups.find((g) => g.id === groupId);
    return category && group ? { category, group } : null;
  }, [mode, target, categories]);

  const impact = useMemo(() => {
    if (section) {
      const already = picked.filter((s) => s.section_ids.includes(section.id)).length;
      const moving = picked.filter((s) => s.section_ids.some((sid) => sid !== section.id)).length;
      return { already, moving };
    }
    if (groupTarget) {
      const { category, group } = groupTarget;
      const already = picked.filter((s) => s.groups.some((g) => g.id === group.id)).length;
      const moving = picked.filter((s) =>
        s.groups.some((g) => g.category_id === category.id && g.id !== group.id),
      ).length;
      return { already, moving };
    }
    return null;
  }, [section, groupTarget, picked]);

  const capacityWarning = useMemo(() => {
    if (!groupTarget || !impact) return null;
    const max = groupTarget.group.max_membership;
    if (!max) return null;
    const after = groupTarget.group.member_count + picked.length - impact.already;
    return after > max ? `Deze groep heeft een maximum van ${max}; na toewijzen zijn het er ${after}.` : null;
  }, [groupTarget, impact, picked.length]);

  const targetName = section?.name ?? groupTarget?.group.name ?? "";
  const nameById = useMemo(() => Object.fromEntries(students.map((s) => [s.id, s.name])), [students]);

  const run = async () => {
    if (!target || userIds.length === 0) return;
    setBusy(true);
    try {
      const r =
        mode === "section"
          ? await api.bulkPlaceSection(courseId, userIds, Number(target))
          : await api.bulkAddGroup(courseId, userIds, groupTarget!.group.id, groupTarget!.category.id);
      const { ok, failed, skipped } = summarizeBulk(r.results);
      const single = userIds.length === 1;
      toast.show({
        tone: failed > 0 ? (ok > 0 ? "warning" : "error") : "success",
        title: single
          ? failed
            ? `${nameById[userIds[0]] ?? "Student"} niet geplaatst`
            : `${nameById[userIds[0]] ?? "Student"} → ${targetName}`
          : `${ok} van ${userIds.length} geplaatst in ${targetName}`,
        detail: [failed && `${failed} fout`, skipped && `${skipped} overgeslagen`].filter(Boolean).join(" · ") || undefined,
        action: single && !failed ? undefined : { label: "Details", onClick: () => onShowResults(r.results) },
      });
      onDone(failed === 0);
    } catch (e) {
      toast.error("Toewijzen mislukt", errorMessage(e, "Onbekende fout"));
    } finally {
      setBusy(false);
    }
  };

  const groupsLoading = mode === "group" && !categories;
  const noGroups = mode === "group" && categories && categories.every((c) => c.groups.length === 0);

  return (
    <Modal
      open={open}
      title={mode === "section" ? "Naar sectie" : "Naar groep"}
      onClose={() => !busy && onClose()}
      footer={
        <>
          <Button variant="secondary" disabled={busy} onClick={onClose}>
            Annuleren
          </Button>
          <Button variant="primary" disabled={busy || !target} onClick={() => void run()}>
            {busy ? "Bezig…" : `Plaats ${picked.length} student${picked.length === 1 ? "" : "en"}`}
          </Button>
        </>
      }
    >
      <div className="stack" style={{ gap: 14 }}>
        <div>
          <div className="field-label">Student{picked.length === 1 ? "" : `en (${picked.length})`}</div>
          <div className="name-list">
            {picked.slice(0, MAX_NAMES).map((s) => (
              <span key={s.id} className="badge">
                {s.name}
              </span>
            ))}
            {picked.length > MAX_NAMES && <span className="muted">en {picked.length - MAX_NAMES} meer</span>}
          </div>
        </div>

        <label className="stack" style={{ gap: 4 }}>
          <span className="field-label">{mode === "section" ? "Doelsectie" : "Doelgroep"}</span>
          {mode === "section" ? (
            <Select autoFocus value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: "100%" }}>
              <option value="">Kies een sectie…</option>
              {sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                  {s.total_students != null ? ` (${s.total_students})` : ""}
                </option>
              ))}
            </Select>
          ) : groupsLoading ? (
            <span className="muted">Groepen laden…</span>
          ) : noGroups ? (
            <span className="muted">Deze cursus heeft nog geen groepen. Maak ze aan op het tabblad Groepen.</span>
          ) : (
            <Select autoFocus value={target} onChange={(e) => setTarget(e.target.value)} style={{ width: "100%" }}>
              <option value="">Kies een groep…</option>
              {categories!.map((cat) => (
                <optgroup key={cat.id} label={cat.name}>
                  {cat.groups.map((g) => (
                    <option key={g.id} value={`${cat.id}:${g.id}`}>
                      {g.name} ({g.member_count}
                      {g.max_membership ? `/${g.max_membership}` : ""})
                    </option>
                  ))}
                </optgroup>
              ))}
            </Select>
          )}
        </label>

        {impact && (
          <div className="impact">
            <div className="impact__title">Wat er gebeurt</div>
            <ul>
              <li>
                {picked.length - impact.already} student{picked.length - impact.already === 1 ? "" : "en"} naar{" "}
                <strong>{targetName}</strong>
              </li>
              {impact.already > 0 && <li>{impact.already} zit{impact.already === 1 ? "" : "ten"} er al in</li>}
              {impact.moving > 0 &&
                (mode === "section" ? (
                  <li>
                    {impact.moving} verhuist uit een andere sectie; die inschrijving wordt afgerond (conclude). Cijfers
                    blijven behouden.
                  </li>
                ) : (
                  <li>
                    {impact.moving} wordt eerst uit een andere groep in <strong>{groupTarget?.category.name}</strong>{" "}
                    gehaald.
                  </li>
                ))}
            </ul>
            {capacityWarning && <div className="impact__warn">{capacityWarning}</div>}
          </div>
        )}
      </div>
    </Modal>
  );
}
