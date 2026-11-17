import { useEffect } from 'react';
import type { YesNoUnknown } from '../checker';
import { copy } from '../content';
import type { PersonDetails } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';
import { StepHeading } from '../ui/StepHeading';

export const THREAT_ID = 'threat';
export const ASKED_TO_STOP_ID = 'asked-to-stop';
const ASKED_OPTIONS: YesNoUnknown[] = ['unknown', 'yes', 'no'];

/**
 * Her account in her own words, plus two questions about the person as a whole:
 * whether they could hurt her now, and whether she told them to stop. All optional.
 */
export function StoryStep() {
  const { state, dispatch } = useAppState();
  const c = copy.story;
  const setDetails = (changes: PersonDetails) => dispatch({ type: 'setPersonDetails', changes });

  // After "Add more" on one of these questions, focus its field.
  useEffect(() => {
    if (state.focusTarget !== THREAT_ID && state.focusTarget !== ASKED_TO_STOP_ID) return;
    document.getElementById(state.focusTarget)?.focus();
    dispatch({ type: 'focusHandled' });
  }, [state.focusTarget, dispatch]);

  return (
    <div>
      <StepHeading>{c.heading}</StepHeading>
      <p>{c.intro}</p>

      <label htmlFor="story">{c.label}</label>
      <p id="story-hint" className="hint">
        {c.hint}
      </p>
      <textarea
        id="story"
        rows={12}
        aria-describedby="story-hint"
        value={state.story}
        onChange={(e) => dispatch({ type: 'setStory', story: e.target.value })}
      />

      <h2>{c.personHeading}</h2>

      <label htmlFor={THREAT_ID}>{c.threatLabel}</label>
      <p id="threat-hint" className="hint">
        {c.threatHint}
      </p>
      <textarea
        id={THREAT_ID}
        rows={4}
        aria-describedby="threat-hint"
        value={state.threat}
        onChange={(e) => setDetails({ threat: e.target.value })}
      />

      <label htmlFor={ASKED_TO_STOP_ID}>{c.askedToStopLabel}</label>
      <select
        id={ASKED_TO_STOP_ID}
        value={state.askedToStop}
        onChange={(e) => setDetails({ askedToStop: e.target.value as YesNoUnknown })}
      >
        {ASKED_OPTIONS.map((value) => (
          <option key={value} value={value}>
            {c.askedToStopOptions[value]}
          </option>
        ))}
      </select>

      {state.askedToStop === 'yes' && (
        <>
          <label htmlFor="asked-to-stop-detail">{c.askedToStopDetailLabel}</label>
          <p id="asked-to-stop-detail-hint" className="hint">
            {c.askedToStopDetailHint}
          </p>
          <textarea
            id="asked-to-stop-detail"
            rows={2}
            aria-describedby="asked-to-stop-detail-hint"
            value={state.askedToStopDetail}
            onChange={(e) => setDetails({ askedToStopDetail: e.target.value })}
          />
        </>
      )}

      <div className="button-row">
        <button type="button" className="btn" onClick={() => dispatch({ type: 'goTo', step: 'incidents' })}>
          {c.back}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'goTo', step: 'questions' })}>
          {c.next}
        </button>
      </div>
    </div>
  );
}
