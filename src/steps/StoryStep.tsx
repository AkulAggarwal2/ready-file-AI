import { useEffect, useMemo, useState } from 'react';
import { copy } from '../content';
import { getExtractor } from '../organizer';
import { LENA_FOUR_INCIDENTS, LENA_ONE_INCIDENT } from '../samples/lena';
import { ADD_INCIDENT_ID, ORGANIZE_HEADING_ID } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';
import { StepHeading } from '../ui/StepHeading';
import { IncidentEditor } from './IncidentEditor';

export function StoryStep() {
  const { state } = useAppState();
  return state.storyPhase === 'write' ? <WriteStory /> : <OrganizeIncidents />;
}

function WriteStory() {
  const { state, dispatch } = useAppState();
  const [busy, setBusy] = useState(false);
  const extractor = useMemo(getExtractor, []);
  const c = copy.story;

  async function organize() {
    setBusy(true);
    const incidents = await extractor.extract(state.story);
    dispatch({ type: 'organized', incidents });
  }

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

      {import.meta.env.DEV && (
        <div className="dev-only">
          <p className="hint">{c.sampleNote}</p>
          <div className="button-row">
            <button type="button" className="btn" onClick={() => dispatch({ type: 'setStory', story: LENA_ONE_INCIDENT })}>
              {c.sampleOne}
            </button>
            <button type="button" className="btn" onClick={() => dispatch({ type: 'setStory', story: LENA_FOUR_INCIDENTS })}>
              {c.sampleFour}
            </button>
          </div>
        </div>
      )}

      {state.incidents.length > 0 && <p className="note">{c.redoWarning}</p>}

      <div className="button-row">
        <button type="button" className="btn" onClick={() => dispatch({ type: 'goTo', step: 'start' })}>
          {c.back}
        </button>
        <button type="button" className="btn btn-primary" onClick={organize} disabled={busy}>
          {busy ? c.organizing : c.organize}
        </button>
      </div>
    </div>
  );
}

function OrganizeIncidents() {
  const { state, dispatch } = useAppState();
  const c = copy.organize;

  // After "Add more", add, merge, or delete, move focus to the right place.
  useEffect(() => {
    if (!state.focusTarget) return;
    document.getElementById(state.focusTarget)?.focus();
    dispatch({ type: 'focusHandled' });
  }, [state.focusTarget, dispatch]);

  return (
    <div>
      <StepHeading id={ORGANIZE_HEADING_ID}>{c.heading}</StepHeading>
      <p>{c.intro}</p>
      <p className="note">{c.draftNote}</p>

      {state.incidents.length === 0 && <p>{c.empty}</p>}
      {state.incidents.map((incident, index) => (
        <IncidentEditor
          key={incident.id}
          incident={incident}
          number={index + 1}
          isLast={index === state.incidents.length - 1}
        />
      ))}

      <button id={ADD_INCIDENT_ID} type="button" className="btn" onClick={() => dispatch({ type: 'addIncident' })}>
        {c.add}
      </button>

      <div className="button-row">
        <button type="button" className="btn" onClick={() => dispatch({ type: 'backToWriting' })}>
          {c.back}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'goTo', step: 'check' })}>
          {c.confirm}
        </button>
      </div>
    </div>
  );
}
