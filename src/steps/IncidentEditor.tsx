import { ACTS, isDateInFuture, YES_NO_UNKNOWN, type Act, type Firsthand } from '../checker';
import { copy } from '../content';
import { HOW_OPTIONS, type HowItHappened, type Incident, type IncidentDate } from '../organizer';
import { todayIso } from '../state/findings';
import { useAppState } from '../state/AppStateProvider';

const DATE_KINDS: IncidentDate['kind'][] = ['exact', 'approximate', 'unknown'];

export const dateKindId = (incidentId: string) => `${incidentId}-date-kind`;
export const descriptionId = (incidentId: string) => `${incidentId}-description`;
export const exactDateId = (incidentId: string) => `${incidentId}-date`;
export const placeId = (incidentId: string) => `${incidentId}-place`;
export const howId = (incidentId: string) => `${incidentId}-how`;
export const evidenceId = (incidentId: string) => `${incidentId}-evidence`;
export const presentId = (incidentId: string) => `${incidentId}-present`;
export const firsthandId = (incidentId: string) => `${incidentId}-firsthand`;
export const feelingId = (incidentId: string) => `${incidentId}-feeling`;
export const actId = (incidentId: string, act: Act) => `${incidentId}-act-${act}`;

function changeDateKind(date: IncidentDate, kind: IncidentDate['kind']): IncidentDate {
  if (kind === 'exact') return { kind, value: date.kind === 'exact' ? date.value : '' };
  if (kind === 'approximate') return { kind, text: date.kind === 'approximate' ? date.text : '' };
  return { kind };
}

/** The editable fields of one incident. The card around them is in IncidentCard. */
export function IncidentFields({ incident }: { incident: Incident }) {
  const { dispatch } = useAppState();
  const { id, date } = incident;
  const c = copy.incident;

  const update = (changes: Partial<Incident>) => dispatch({ type: 'updateIncident', id, changes });
  const today = todayIso();
  const inFuture = isDateInFuture(date, today);
  const toggleAct = (act: Act, on: boolean) =>
    update({ acts: ACTS.filter((a) => (a === act ? on : incident.acts.includes(a))) });

  return (
    <>
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
          <label htmlFor={exactDateId(id)}>{c.exactLabel}</label>
          <input
            id={exactDateId(id)}
            type="date"
            autoComplete="off"
            max={today}
            aria-invalid={inFuture || undefined}
            aria-describedby={inFuture ? `${id}-date-future` : undefined}
            value={date.value}
            onChange={(e) => update({ date: { kind: 'exact', value: e.target.value } })}
          />
          {inFuture && (
            <p id={`${id}-date-future`} className="hint field-warning">
              {c.futureHint}
            </p>
          )}
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

      <label htmlFor={placeId(id)}>{c.placeLabel}</label>
      <p id={`${id}-place-hint`} className="hint">
        {c.placeHint}
      </p>
      <input
        id={placeId(id)}
        type="text"
        autoComplete="off"
        aria-describedby={`${id}-place-hint`}
        value={incident.place}
        onChange={(e) => update({ place: e.target.value })}
      />

      <label htmlFor={howId(id)}>{c.howLabel}</label>
      <select
        id={howId(id)}
        value={incident.how}
        onChange={(e) => update({ how: e.target.value as HowItHappened })}
      >
        {HOW_OPTIONS.map((how) => (
          <option key={how} value={how}>
            {c.how[how]}
          </option>
        ))}
      </select>

      <label htmlFor={descriptionId(id)}>{c.descriptionLabel}</label>
      <p id={`${id}-description-hint`} className="hint">
        {c.descriptionHint}
      </p>
      <textarea
        id={descriptionId(id)}
        rows={5}
        aria-describedby={`${id}-description-hint`}
        value={incident.description}
        onChange={(e) => update({ description: e.target.value })}
      />

      <fieldset aria-describedby={`${id}-acts-hint`}>
        <legend>{c.actsLegend}</legend>
        <p id={`${id}-acts-hint`} className="hint">
          {c.actsHint}
        </p>
        {ACTS.map((act) => (
          <label key={act} className="choice">
            <input
              id={actId(id, act)}
              type="checkbox"
              checked={incident.acts.includes(act)}
              onChange={(e) => toggleAct(act, e.target.checked)}
            />
            {c.acts[act]}
          </label>
        ))}
      </fieldset>

      <label htmlFor={presentId(id)}>{c.presentLabel}</label>
      <p id={`${id}-present-hint`} className="hint">
        {c.presentHint}
      </p>
      <textarea
        id={presentId(id)}
        rows={2}
        aria-describedby={`${id}-present-hint`}
        value={incident.present}
        onChange={(e) => update({ present: e.target.value })}
      />

      <label htmlFor={firsthandId(id)}>{c.firsthandLabel}</label>
      <select
        id={firsthandId(id)}
        aria-describedby={incident.firsthand === 'no' ? `${id}-firsthand-note` : undefined}
        value={incident.firsthand}
        onChange={(e) => update({ firsthand: e.target.value as Firsthand })}
      >
        {YES_NO_UNKNOWN.map((value) => (
          <option key={value} value={value}>
            {c.firsthandOptions[value]}
          </option>
        ))}
      </select>
      {incident.firsthand === 'no' && (
        <p id={`${id}-firsthand-note`} className="hint field-warning">
          {c.firsthandNote}
        </p>
      )}

      <label htmlFor={feelingId(id)}>{c.feelingLabel}</label>
      <p id={`${id}-feeling-hint`} className="hint">
        {c.feelingHint}
      </p>
      <textarea
        id={feelingId(id)}
        rows={2}
        aria-describedby={`${id}-feeling-hint`}
        value={incident.feeling}
        onChange={(e) => update({ feeling: e.target.value })}
      />

      <label htmlFor={evidenceId(id)}>{c.evidenceLabel}</label>
      <p id={`${id}-evidence-hint`} className="hint">
        {c.evidenceHint}
      </p>
      <textarea
        id={evidenceId(id)}
        rows={2}
        aria-describedby={`${id}-evidence-hint`}
        value={incident.evidence}
        onChange={(e) => update({ evidence: e.target.value })}
      />
    </>
  );
}
