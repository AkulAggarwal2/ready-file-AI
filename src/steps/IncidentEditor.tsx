import { copy, fill } from '../content';
import { HOW_OPTIONS, type HowItHappened, type Incident, type IncidentDate } from '../organizer';
import { headingId } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';
import { ConfirmButton } from '../ui/ConfirmButton';

const DATE_KINDS: IncidentDate['kind'][] = ['exact', 'approximate', 'unknown'];

export const dateKindId = (incidentId: string) => `${incidentId}-date-kind`;
export const descriptionId = (incidentId: string) => `${incidentId}-description`;

function changeDateKind(date: IncidentDate, kind: IncidentDate['kind']): IncidentDate {
  if (kind === 'exact') return { kind, value: date.kind === 'exact' ? date.value : '' };
  if (kind === 'approximate') return { kind, text: date.kind === 'approximate' ? date.text : '' };
  return { kind };
}

export function IncidentEditor({ incident, number, isLast }: { incident: Incident; number: number; isLast: boolean }) {
  const { dispatch } = useAppState();
  const { id, date } = incident;
  const c = copy.incident;

  const update = (changes: Partial<Incident>) => dispatch({ type: 'updateIncident', id, changes });

  return (
    <section className="card" aria-labelledby={headingId(id)}>
      <h2 id={headingId(id)} tabIndex={-1}>
        {fill(c.heading, { n: number })}
      </h2>

      <label htmlFor={dateKindId(id)}>{c.dateLabel}</label>
      <select
        id={dateKindId(id)}
        value={date.kind}
        onChange={(e) => update({ date: changeDateKind(date, e.target.value as IncidentDate['kind']) })}
      >
        {DATE_KINDS.map((kind) => (
          <option key={kind} value={kind}>
            {c.dateKinds[kind]}
          </option>
        ))}
      </select>

      {date.kind === 'exact' && (
        <>
          <label htmlFor={`${id}-date`}>{c.exactLabel}</label>
          <input
            id={`${id}-date`}
            type="date"
            autoComplete="off"
            value={date.value}
            onChange={(e) => update({ date: { kind: 'exact', value: e.target.value } })}
          />
        </>
      )}
      {date.kind === 'approximate' && (
        <>
          <label htmlFor={`${id}-approx`}>{c.approximateLabel}</label>
          <p id={`${id}-approx-hint`} className="hint">
            {c.approximateHint}
          </p>
          <input
            id={`${id}-approx`}
            type="text"
            autoComplete="off"
            aria-describedby={`${id}-approx-hint`}
            value={date.text}
            onChange={(e) => update({ date: { kind: 'approximate', text: e.target.value } })}
          />
        </>
      )}

      <label htmlFor={descriptionId(id)}>{c.descriptionLabel}</label>
      <textarea
        id={descriptionId(id)}
        rows={5}
        value={incident.description}
        onChange={(e) => update({ description: e.target.value })}
      />

      <label htmlFor={`${id}-how`}>{c.howLabel}</label>
      <select
        id={`${id}-how`}
        value={incident.how}
        onChange={(e) => update({ how: e.target.value as HowItHappened })}
      >
        {HOW_OPTIONS.map((how) => (
          <option key={how} value={how}>
            {c.how[how]}
          </option>
        ))}
      </select>

      <label htmlFor={`${id}-evidence`}>{c.evidenceLabel}</label>
      <p id={`${id}-evidence-hint`} className="hint">
        {c.evidenceHint}
      </p>
      <textarea
        id={`${id}-evidence`}
        rows={2}
        aria-describedby={`${id}-evidence-hint`}
        value={incident.evidence}
        onChange={(e) => update({ evidence: e.target.value })}
      />

      <div className="button-row">
        {!isLast && (
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
