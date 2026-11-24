import { useEffect, useState, type ReactNode } from 'react';
import type { ContactMatch, Finding } from '../checker';
import { DEMO_MODE } from '../config';
import { copy, fill } from '../content';
import { useAppState } from '../state/AppStateProvider';
import { useFindings } from '../state/findings';
import { StepHeading } from '../ui/StepHeading';
import { addMoreAction, PLACES } from './questionTargets';
import { SafetyQuestions } from './SafetyQuestions';

/** What the question card says the question is about. */
function aboutLabel(finding: Finding, incidentIndex: number): string {
  const place = PLACES[finding.conditionType];
  if (place.kind === 'elsewhere') return copy.check[place.about];
  return incidentIndex === -1 ? copy.check.allIncidents : fill(copy.timeline.incident, { n: incidentIndex + 1 });
}

/** Her words, with possible contact details marked. The words themselves are unchanged. */
function markMatches(text: string, matches: ContactMatch[]): ReactNode[] {
  const parts: ReactNode[] = [];
  let at = 0;
  for (const match of matches) {
    if (match.start > at) parts.push(text.slice(at, match.start));
    parts.push(<mark key={match.start}>{text.slice(match.start, match.end)}</mark>);
    at = match.end;
  }
  if (at < text.length) parts.push(text.slice(at));
  return parts;
}

const toggleId = (key: string) => `question-${key}-toggle`;
const panelId = (key: string) => `question-${key}-panel`;
export const questionTextId = (key: string) => `question-${key}-text`;

/**
 * Every question is listed up front, closed, so she can see how many there are
 * before she opens any. Nothing opens by itself, except the question she
 * comes back to after "Add more".
 */
export function CheckStep() {
  const { state, dispatch } = useAppState();
  const c = copy.check;
  const findings = useFindings(state);
  // Coming back from "Add more", the question she came from is open again.
  // If what she added answered it, the question is gone, and she is told so.
  const [returned] = useState(() => {
    const key = state.returnQuestion;
    if (!key) return { key: null, resolved: false };
    return findings.some((finding) => finding.key === key) ? { key, resolved: false } : { key: null, resolved: true };
  });
  const [openKeys, setOpenKeys] = useState<string[]>(returned.key ? [returned.key] : []);
  // After she answers, or comes back, focus goes to that question's heading button.
  const [focusKey, setFocusKey] = useState<string | null>(returned.key);
  const stillOpen = findings.filter((finding) => !state.dismissed.includes(finding.key)).length;

  useEffect(() => {
    if (!focusKey) return;
    document.getElementById(toggleId(focusKey))?.focus();
    setFocusKey(null);
  }, [focusKey]);

  // She is back, so the way back is no longer needed.
  useEffect(() => {
    if (state.returnQuestion) dispatch({ type: 'questionReturned' });
  }, [state.returnQuestion, dispatch]);

  const toggle = (key: string) =>
    setOpenKeys((keys) => (keys.includes(key) ? keys.filter((k) => k !== key) : [...keys, key]));

  return (
    <div>
      <StepHeading>{c.heading}</StepHeading>
      <p>{c.intro}</p>
      {returned.resolved && <p className="note">{c.resolved}</p>}
      <p className="note" role="status">
        {findings.length > 0 ? fill(c.total, { total: findings.length, open: stillOpen }) : c.totalNone}
      </p>

      {findings.length > 0 && (
        <ul className="question-list">
          {findings.map((finding) => {
            const isOpen = openKeys.includes(finding.key);
            const answered = state.dismissed.includes(finding.key);
            const index = state.incidents.findIndex((incident) => incident.id === finding.incidentId);
            const about = aboutLabel(finding, index);

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
                      <IncidentQuote
                        n={index + 1}
                        description={state.incidents[index].description}
                        place={state.incidents[index].place}
                        evidence={state.incidents[index].evidence}
                        matches={finding.matches}
                      />
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

      <SafetyQuestions />

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

interface QuoteProps {
  n: number;
  description: string;
  place: string;
  evidence: string;
  matches?: ContactMatch[];
}

/**
 * The incident a question is about. For contact details, the place and the
 * evidence are shown too if they have any.
 */
function IncidentQuote({ n, description, place, evidence, matches = [] }: QuoteProps) {
  const c = copy.check;
  const inDescription = matches.filter((match) => match.field === 'description');
  const inPlace = matches.filter((match) => match.field === 'place');
  const inEvidence = matches.filter((match) => match.field === 'evidence');
  return (
    <>
      <p>{fill(c.aboutIncident, { n })}</p>
      <blockquote>{description ? markMatches(description, inDescription) : copy.common.ellipsis}</blockquote>
      {inPlace.length > 0 && (
        <p>
          {c.aboutPlace} <mark>{place}</mark>
        </p>
      )}
      {inEvidence.length > 0 && (
        <p>
          {c.aboutEvidence} {markMatches(evidence, inEvidence)}
        </p>
      )}
      {matches.length > 0 && <p className="hint">{c.matchesHint}</p>}
    </>
  );
}
