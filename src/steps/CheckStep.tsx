import { useEffect, useMemo, useState } from 'react';
import { ACTS, type Finding } from '../checker';
import { DEMO_MODE } from '../config';
import { copy, fill } from '../content';
import { ADD_INCIDENT_ID, ORGANIZE_HEADING_ID, type Action } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';
import { findingsFor } from '../state/findings';
import { StepHeading } from '../ui/StepHeading';
import {
  actId,
  dateKindId,
  descriptionId,
  exactDateId,
  feelingId,
  firsthandId,
  placeId,
  presentId,
} from './IncidentEditor';
import { RELATIONSHIP_ID } from './StartStep';
import { ASKED_TO_STOP_ID, THREAT_ID } from './StoryStep';

/** Where "Add more" takes her: the screen and field the question is about. */
function addMoreAction(finding: Finding, firstIncidentId: string | undefined): Action {
  const id = finding.incidentId;
  switch (finding.conditionType) {
    case 'relationshipNotHousehold':
      return { type: 'addMore', step: 'start', focusTarget: RELATIONSHIP_ID };
    case 'incidentsOutOfOrder':
      return { type: 'addMore', focusTarget: ORGANIZE_HEADING_ID };
    case 'presentThreatMissing':
      return { type: 'addMore', step: 'story', focusTarget: THREAT_ID };
    case 'askedToStopMissing':
      return { type: 'addMore', step: 'story', focusTarget: ASKED_TO_STOP_ID };
    case 'feelingMissing':
      // Asked about all incidents, so it opens the first one.
      return firstIncidentId
        ? { type: 'addMore', focusTarget: feelingId(firstIncidentId), expandId: firstIncidentId }
        : { type: 'addMore', focusTarget: ADD_INCIDENT_ID };
  }
  if (!id) return { type: 'addMore', focusTarget: ADD_INCIDENT_ID };

  const targets: Partial<Record<Finding['conditionType'], string>> = {
    incidentDateMissing: dateKindId(id),
    incidentDateInFuture: exactDateId(id),
    incidentPlaceMissing: placeId(id),
    incidentPeopleMissing: presentId(id),
    incidentNotFirsthand: firsthandId(id),
    incidentActsMissing: actId(id, ACTS[0]),
  };
  return { type: 'addMore', focusTarget: targets[finding.conditionType] ?? descriptionId(id), expandId: id };
}

const toggleId = (key: string) => `question-${key}-toggle`;
const panelId = (key: string) => `question-${key}-panel`;
export const questionTextId = (key: string) => `question-${key}-text`;

/**
 * Every question is listed up front, closed, so she can see how many there are
 * before she opens any. Nothing opens by itself.
 */
export function CheckStep() {
  const { state, dispatch } = useAppState();
  const c = copy.check;
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  // After she answers, focus goes back to that question's heading button.
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const findings = useMemo(() => findingsFor(state), [state.caseType, state.relationship, state.incidents]);
  const stillOpen = findings.filter((finding) => !state.dismissed.includes(finding.key)).length;

  useEffect(() => {
    if (!focusKey) return;
    document.getElementById(toggleId(focusKey))?.focus();
    setFocusKey(null);
  }, [focusKey]);

  const toggle = (key: string) =>
    setOpenKeys((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));

  return (
    <div>
      <StepHeading>{c.heading}</StepHeading>
      <p>{c.intro}</p>
      <p className="note" role="status">
        {findings.length > 0 ? fill(c.total, { total: findings.length, open: stillOpen }) : c.totalNone}
      </p>

      {findings.length > 0 && (
        <ul className="question-list">
          {findings.map((finding) => {
            const isOpen = openKeys.includes(finding.key);
            const answered = state.dismissed.includes(finding.key);
            const index = state.incidents.findIndex((incident) => incident.id === finding.incidentId);
            const about =
              finding.conditionType === 'relationshipNotHousehold'
                ? c.aboutRelationship
                : finding.conditionType === 'presentThreatMissing' || finding.conditionType === 'askedToStopMissing'
                  ? c.aboutPerson
                  : index === -1
                  ? c.allIncidents
                  : fill(copy.timeline.incident, { n: index + 1 });

            return (
              <li key={finding.key} className="card question">
                <h2 className="question-title">
                  <button
                    id={toggleId(finding.key)}
                    type="button"
                    className="question-toggle"
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? panelId(finding.key) : undefined}
                    onClick={() => toggle(finding.key)}
                  >
                    <span className="question-label">
                      {about} · {copy.badges[finding.conditionType]}
                    </span>
                    {answered && <span className="chip chip-success">{c.answered}</span>}
                    <span className="chevron" aria-hidden="true" />
                  </button>
                </h2>

                {isOpen && (
                  <div id={panelId(finding.key)} className="question-body">
                    {index !== -1 && (
                      <>
                        <p>{fill(c.aboutIncident, { n: index + 1 })}</p>
                        <blockquote>{state.incidents[index].description || copy.common.ellipsis}</blockquote>
                      </>
                    )}
                    <p id={questionTextId(finding.key)} className="question-text">
                      {finding.questionText}
                      {DEMO_MODE && !finding.verified && (
                        <span className="badge badge-dev">{fill(c.unverified, { ruleId: finding.ruleId })}</span>
                      )}
                    </p>
                    {/* Ground rule 2: both choices always present, with equal visual weight. */}
                    <div className="button-row equal">
                      <button
                        type="button"
                        className="btn btn-choice"
                        onClick={() => dispatch(addMoreAction(finding, state.incidents[0]?.id))}
                      >
                        {c.addMore}
                      </button>
                      <button
                        type="button"
                        className="btn btn-choice"
                        onClick={() => {
                          dispatch({ type: 'dismissFinding', key: finding.key });
                          setOpenKeys((keys) => keys.filter((k) => k !== finding.key));
                          setFocusKey(finding.key);
                        }}
                      >
                        {c.continueAsIs}
                      </button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="button-row">
        <button type="button" className="btn" onClick={() => dispatch({ type: 'goTo', step: 'story' })}>
          {c.back}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'goTo', step: 'review' })}>
          {c.toReview}
        </button>
      </div>
    </div>
  );
}
