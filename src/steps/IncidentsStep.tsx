import { useCallback, useEffect, useState } from 'react';
import type { Finding } from '../checker';
import { DEMO_MODE } from '../config';
import { copy, fill } from '../content';
import { ManualExtractor } from '../organizer';
import { LENA_FOUR_INCIDENTS, LENA_FOUR_PLACES, LENA_ONE_INCIDENT, LENA_ONE_PLACES } from '../samples/lena';
import { ADD_INCIDENT_ID, ORGANIZE_HEADING_ID } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';
import { useFindings } from '../state/findings';
import { StepHeading } from '../ui/StepHeading';
import { Timeline } from '../ui/Timeline';
import { UndoToast } from '../ui/UndoToast';
import { IncidentCard } from './IncidentCard';
import { addMoreAction } from './questionTargets';

export function IncidentsStep() {
  const { state, dispatch } = useAppState();
  const [dragId, setDragId] = useState<string | null>(null);
  const c = copy.organize;

  // After "Add more", add, merge, delete, move, or undo, move focus to the right place.
  useEffect(() => {
    if (!state.focusTarget) return;
    document.getElementById(state.focusTarget)?.focus();
    dispatch({ type: 'focusHandled' });
  }, [state.focusTarget, dispatch]);

  // Demo only: turns a fictional sample story into incidents, and keeps the story too.
  async function loadSample(story: string, places: string[]) {
    const split = await new ManualExtractor().extract(story);
    const incidents = split.map((incident, i) => ({ ...incident, place: places[i] ?? '' }));
    dispatch({ type: 'loadSample', story, incidents });
  }

  const expireUndo = useCallback(() => dispatch({ type: 'clearUndo' }), [dispatch]);

  // The questions that will come up in the next step, grouped by incident.
  const findings = useFindings(state);
  const forIncident = (id: string): Finding[] => findings.filter((finding) => finding.incidentId === id);
  const forList = findings.filter((finding) => !finding.incidentId);

  return (
    <div>
      <StepHeading id={ORGANIZE_HEADING_ID}>{c.heading}</StepHeading>
      <p>{c.intro}</p>
      {state.incidents.length > 1 && <p className="hint">{copy.incident.reorderHint}</p>}

      {DEMO_MODE && (
        <div className="dev-only">
          <p className="hint">{c.sampleNote}</p>
          <div className="button-row">
            <button type="button" className="btn" onClick={() => loadSample(LENA_ONE_INCIDENT, LENA_ONE_PLACES)}>
              {c.sampleOne}
            </button>
            <button type="button" className="btn" onClick={() => loadSample(LENA_FOUR_INCIDENTS, LENA_FOUR_PLACES)}>
              {c.sampleFour}
            </button>
          </div>
        </div>
      )}

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
              <li key={finding.key}>
                <button
                  type="button"
                  className="chip chip-warning chip-button"
                  onClick={() => dispatch(addMoreAction(finding, state.incidents[0]?.id, false))}
                >
                  {copy.badges[finding.conditionType]}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

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

      {/* Below the cards, so the incidents come first. */}
      <details className="disclosure">
        <summary>{copy.timeline.heading}</summary>
        <Timeline incidents={state.incidents} />
      </details>

      <div className="button-row">
        <button type="button" className="btn" onClick={() => dispatch({ type: 'goTo', step: 'start' })}>
          {c.back}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'goTo', step: 'story' })}>
          {c.confirm}
        </button>
      </div>

      {/* After "Add more", the way back stays at the bottom of the screen
          while she edits, so she never has to scroll to find it. */}
      {state.returnQuestion && (
        <div className="return-bar">
          <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'backToQuestion' })}>
            {copy.check.backToQuestion}
          </button>
        </div>
      )}
    </div>
  );
}
