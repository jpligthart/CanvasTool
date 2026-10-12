import { Link } from "react-router-dom";

export type MemberRosterItem = { id: number; name: string };

type MemberRosterProps = {
  members: MemberRosterItem[];
  emptyLabel: string;
  studentsLink?: string;
  onRemove?: (member: MemberRosterItem) => void;
  /** Shown in remove button labels, e.g. group name */
  removeFromLabel?: string;
};

export function MemberRoster({
  members,
  emptyLabel,
  studentsLink,
  onRemove,
  removeFromLabel,
}: MemberRosterProps) {
  const removable = !!onRemove;

  return (
    <div className={`member-roster${members.length > 0 ? " member-roster--card" : ""}`}>
      {members.length === 0 ? (
        <span className="muted">{emptyLabel}</span>
      ) : (
        <ul className={`member-list${removable ? " member-list--removable" : ""}`}>
          {members.map((m) => (
            <li key={m.id}>
              <span className="member-list__name">{m.name}</span>
              {onRemove && (
                <button
                  type="button"
                  className="icon-btn member-list__remove"
                  title={
                    removeFromLabel ? `Verwijder ${m.name} uit ${removeFromLabel}` : `Verwijder ${m.name}`
                  }
                  aria-label={
                    removeFromLabel ? `Verwijder ${m.name} uit ${removeFromLabel}` : `Verwijder ${m.name}`
                  }
                  onClick={() => onRemove(m)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {studentsLink && (
        <div className="member-roster__footer">
          <Link className="link-btn" to={studentsLink}>
            Open in Studenten →
          </Link>
        </div>
      )}
    </div>
  );
}
