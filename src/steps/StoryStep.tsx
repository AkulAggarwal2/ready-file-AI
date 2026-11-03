import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEMO_MODE } from '../config';
import { copy, fill, rules } from '../content';
import { getExtractor } from '../organizer';
import { LENA_FOUR_INCIDENTS, LENA_ONE_INCIDENT } from '../samples/lena';
import { ADD_INCIDENT_ID, ORGANIZE_HEADING_ID } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';
import { StepHeading } from '../ui/StepHeading';
import { runChecks, type Finding } from '../checker';
import { Timeline } from '../ui/Timeline';
import { UndoToast } from '../ui/UndoToast';
import { IncidentCard } from './IncidentCard';

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

      {DEMO_MODE && (
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
  const [dragId, setDragId] = useState<string | null>(null);
  const c = copy.organize;

  // After "Add more", add, merge, delete, or move, move focus to the right place.
  useEffect(() => {
    if (!state.focusTarget) return;
    document.getElementById(state.focusTarget)?.focus();
    dispatch({ type: 'focusHandled' });
  }, [state.focusTarget, dispatch]);

  const expireUndo = useCallback(() => dispatch({ type: 'clearUndo' }), [dispatch]);

  // The questions that will come up in the next step, grouped by incident.
  const findings = useMemo(
    () => runChecks({ caseType: state.caseType ?? 'not-sure', incidents: state.incidents }, rules),
    [state.caseType, state.incidents],
  );
  const forIncident = (id: string): Finding[] => findings.filter((finding) => finding.incidentId === id);
  const forList = findings.filter((finding) => !finding.incidentId);

  return (
    <div>
      <StepHeading id={ORGANIZE_HEADING_ID}>{c.heading}</StepHeading>
      <p>{c.intro}</p>
      <p className="note">{c.draftNote}</p>
      <p className="hint">{copy.incident.reorderHint}</p>

      {state.undo && (
        <UndoToast entry={state.undo} onUndo={() => dispatch({ type: 'undo' })} onExpire={expireUndo} />
      )}

      <div className="callout">
        <h2>{copy.badges.heading}</h2>
        <p>
          {findings.length > 0
            ? fill(copy.badges.summary, { count: findings.length })
            : copy.badges.summaryNone}
        </p>
        {forList.length > 0 && (
          <ul className="chip-list">
            {forList.map((finding) => (
              <li key={finding.key} className="chip chip-warning">
                {copy.badges[finding.conditionType]}
              </li>
            ))}
          </ul>
        )}
      </div>

      <details className="disclosure">
        <summary>{copy.timeline.heading}</summary>
        <Timeline incidents={state.incidents} numbering="list" />
      </details>

      {state.incidents.length === 0 && <p>{c.empty}</p>}
      {state.incidents.map((incident, index) => (
        <IncidentCard
          key={incident.id}
          incident={incident}
          index={index}
          total={state.incidents.length}
          expanded={state.expanded.includes(incident.id)}
          findings={forIncident(incident.id)}
          dragging={dragId === incident.id}
          onDragStart={setDragId}
          onDragEnd={() => setDragId(null)}
          onDropHere={(toIndex) => {
            if (dragId) dispatch({ type: 'reorderIncident', id: dragId, toIndex });
            setDragId(null);
          }}
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
