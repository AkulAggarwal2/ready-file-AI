import { useState, type FormEvent } from 'react';
import type { CaseType } from '../checker';
import { IDLE_TIMEOUT_MS } from '../config';
import { copy, fill } from '../content';
import { useAppState } from '../state/AppStateProvider';
import { StepHeading } from '../ui/StepHeading';

const CASE_TYPES: CaseType[] = ['stalking', 'harassment', 'not-sure'];

export function StartStep() {
  const { state, dispatch } = useAppState();
  const [caseType, setCaseType] = useState<CaseType | null>(state.caseType);

  function begin(event: FormEvent) {
    event.preventDefault();
    // Never blocks: with no choice made, she continues as "Not sure".
    dispatch({ type: 'begin', caseType: caseType ?? 'not-sure' });
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

      <div className="button-row">
        <button type="submit" className="btn btn-primary">
          {copy.start.begin}
        </button>
      </div>
    </form>
  );
}
