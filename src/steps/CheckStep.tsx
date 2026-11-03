import { useEffect, useMemo, useState } from 'react';
import { runChecks, type Finding } from '../checker';
import { DEMO_MODE } from '../config';
import { copy, fill, rules } from '../content';
import { ADD_INCIDENT_ID } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';
import { StepHeading } from '../ui/StepHeading';
import { dateKindId, descriptionId } from './IncidentEditor';

/** Where "Add more" takes her: the field the question is about. */
function addMoreTarget(finding: Finding): string {
  if (!finding.incidentId) return ADD_INCIDENT_ID;
  return finding.conditionType === 'incidentDateMissing'
    ? dateKindId(finding.incidentId)
    : descriptionId(finding.incidentId);
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

  const findings = useMemo(
    () => runChecks({ caseType: state.caseType ?? 'not-sure', incidents: state.incidents }, rules),
    [state.caseType, state.incidents],
  );
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
            const about = index === -1 ? c.allIncidents : fill(copy.timeline.incident, { n: index + 1 });

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
                        onClick={() =>
                          dispatch({
                            type: 'addMore',
                            focusTarget: addMoreTarget(finding),
                            expandId: finding.incidentId,
                          })
                        }
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
