import type { DragEvent } from 'react';
import type { Finding } from '../checker';
import { copy, fill } from '../content';
import type { Incident } from '../organizer';
import { describeDate, formatExactDate } from '../review/summary';
import { headingId, moveButtonId } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';
import { ConfirmButton } from '../ui/ConfirmButton';
import { IncidentFields } from './IncidentEditor';

interface Props {
  incident: Incident;
  index: number;
  total: number;
  expanded: boolean;
  // The follow-up questions that apply to this incident.
  findings: Finding[];
  dragging: boolean;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropHere: (index: number) => void;
}

/** One incident as a card: date, how it happened, and a short preview. Editing opens inline. */
export function IncidentCard({
  incident,
  index,
  total,
  expanded,
  findings,
  dragging,
  onDragStart,
  onDragEnd,
  onDropHere,
}: Props) {
  const { dispatch } = useAppState();
  const { id, date } = incident;
  const c = copy.incident;
  const description = incident.description.trim();
  const fieldsId = `${id}-fields`;
  const when =
    date.kind === 'exact' && date.value ? formatExactDate(date.value) : describeDate(incident);

  function startDrag(event: DragEvent<HTMLSpanElement>) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', id);
    const card = event.currentTarget.closest('.incident-card');
    if (card) event.dataTransfer.setDragImage(card, 16, 16);
    onDragStart(id);
  }

  return (
    <section
      className={`card incident-card${dragging ? ' is-dragging' : ''}`}
      aria-labelledby={headingId(id)}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDropHere(index);
      }}
    >
      <div className="card-top">
        {/* Dragging is for mouse users. Keyboard and touch users have the move buttons. */}
        <span className="drag-handle" draggable aria-hidden="true" onDragStart={startDrag} onDragEnd={onDragEnd}>
          ⋮⋮
        </span>
        <h2 id={headingId(id)} tabIndex={-1}>
          {fill(c.heading, { n: index + 1 })}
        </h2>
      </div>

      <p className="incident-meta">
        <strong>{when}</strong>
        {incident.how !== 'unknown' && <span> · {c.how[incident.how]}</span>}
      </p>
      <p className="incident-preview preview">{description || c.preview.empty}</p>

      <ul className="chip-list" aria-label={copy.badges.perIncident}>
        {findings.length === 0 ? (
          <li className="chip chip-success">{copy.badges.none}</li>
        ) : (
          findings.map((finding) => (
            <li key={finding.key} className="chip chip-warning">
              {copy.badges[finding.conditionType]}
            </li>
          ))
        )}
      </ul>

      <div className="button-row card-actions">
        <button
          type="button"
          className="btn"
          aria-expanded={expanded}
          aria-controls={expanded ? fieldsId : undefined}
          aria-describedby={headingId(id)}
          onClick={() => dispatch({ type: 'toggleIncident', id })}
        >
          {expanded ? c.done : c.edit}
        </button>
        <button
          id={moveButtonId(id, 'up')}
          type="button"
          className="btn"
          disabled={index === 0}
          aria-describedby={headingId(id)}
          onClick={() => dispatch({ type: 'moveIncident', id, direction: 'up' })}
        >
          {c.moveUp}
        </button>
        <button
          id={moveButtonId(id, 'down')}
          type="button"
          className="btn"
          disabled={index === total - 1}
          aria-describedby={headingId(id)}
          onClick={() => dispatch({ type: 'moveIncident', id, direction: 'down' })}
        >
          {c.moveDown}
        </button>
      </div>

      {expanded && (
        <div id={fieldsId} className="card-fields">
          <IncidentFields incident={incident} />
        </div>
      )}

      <div className="button-row card-actions">
        {index < total - 1 && (
          <button type="button" className="btn" onClick={() => dispatch({ type: 'mergeWithNext', id })}>
            {c.merge}
          </button>
        )}
        <ConfirmButton
          label={c.delete}
          question={c.deleteQuestion}
          confirmLabel={c.deleteYes}
          onConfirm={() => dispatch({ type: 'deleteIncident', id })}
        />
      </div>
    </section>
  );
}
