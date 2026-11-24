import { useEffect, useState, type FormEvent } from 'react';
import { CASE_TYPES, RELATIONSHIPS, type CaseType, type Relationship } from '../checker';
import { IDLE_TIMEOUT_MS } from '../config';
import { copy, fill } from '../content';
import { useAppState } from '../state/AppStateProvider';
import { StepHeading } from '../ui/StepHeading';
import { HandsFreeOffer } from '../voice/HandsFree';

export const RELATIONSHIP_ID = 'relationship';

export function StartStep() {
  const { state, dispatch } = useAppState();
  const [caseType, setCaseType] = useState<CaseType | null>(state.caseType);
  const [relationship, setRelationship] = useState<Relationship | null>(state.relationship);
  const r = copy.start.relationships;

  // After "Add more" on the relationship question, focus the question.
  useEffect(() => {
    if (state.focusTarget !== RELATIONSHIP_ID) return;
    document.getElementById(RELATIONSHIP_ID)?.focus();
    dispatch({ type: 'focusHandled' });
  }, [state.focusTarget, dispatch]);

  function begin(event: FormEvent) {
    event.preventDefault();
    // Never blocks: with no choice made, she continues as "Not sure".
    dispatch({ type: 'begin', caseType: caseType ?? 'not-sure', relationship });
  }

  return (
    <form onSubmit={begin} autoComplete="off">
      <StepHeading>{copy.start.heading}</StepHeading>
      <p>{copy.start.intro}</p>
      <p className="note">{copy.start.notFiling}</p>

      <section className="callout" aria-labelledby="safety-heading">
        <h2 id="safety-heading">{copy.start.safetyHeading}</h2>
        <p>{fill(copy.start.safetyNote, { minutes: IDLE_TIMEOUT_MS / 60000 })}</p>
      </section>

      <HandsFreeOffer />

      <fieldset aria-describedby="case-type-hint">
        <legend>{copy.start.caseTypeLegend}</legend>
        <p id="case-type-hint" className="hint">
          {copy.start.caseTypeHint}
        </p>
        {CASE_TYPES.map((type) => (
          <label key={type} className="choice">
            <input
              type="radio"
              name="case-type"
              value={type}
              checked={caseType === type}
              onChange={() => setCaseType(type)}
            />
            {copy.start.caseTypes[type]}
          </label>
        ))}
      </fieldset>

      <label htmlFor={RELATIONSHIP_ID}>{copy.start.relationshipLabel}</label>
      <p id="relationship-hint" className="hint">
        {copy.start.relationshipHint}
      </p>
      <select
        id={RELATIONSHIP_ID}
        aria-describedby="relationship-hint"
        value={relationship ?? ''}
        onChange={(e) => setRelationship((e.target.value || null) as Relationship | null)}
      >
        <option value="">{r['']}</option>
        {RELATIONSHIPS.map((value) => (
          <option key={value} value={value}>
            {r[value]}
          </option>
        ))}
      </select>

      <div className="button-row">
        <button type="submit" className="btn btn-primary">
          {copy.start.begin}
        </button>
      </div>
    </form>
  );
}
