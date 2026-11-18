import { useEffect, useState, type ReactNode } from 'react';
import { ACTS, type ContactMatch, type Finding } from '../checker';
import { DEMO_MODE } from '../config';
import { copy, fill } from '../content';
import { ADD_INCIDENT_ID, ORGANIZE_HEADING_ID, type Action, type Step } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';
import { useFindings } from '../state/findings';
import { StepHeading } from '../ui/StepHeading';
import {
  actId,
  dateKindId,
  descriptionId,
  evidenceId,
  exactDateId,
  feelingId,
  firsthandId,
  placeId,
  presentId,
} from './IncidentEditor';
import { SafetyQuestions } from './SafetyQuestions';
import { RELATIONSHIP_ID } from './StartStep';
import { ASKED_TO_STOP_ID, CONVICTED_ID, THREAT_ID } from './StoryStep';

type ConditionType = Finding['conditionType'];

/**
 * Where each question belongs:
 * - "incident": about one incident. "Add more" opens it at this field.
 * - "list": about the whole list. "Add more" goes to this element.
 * - "first": about all incidents. "Add more" opens the first one at this field.
 * - "elsewhere": answered on another step, with its own "about" label.
 */
type Place =
  | { kind: 'incident'; field: (incidentId: string, finding: Finding) => string }
  | { kind: 'list'; target: string }
  | { kind: 'first'; field: (incidentId: string, finding: Finding) => string }
  | { kind: 'elsewhere'; step: Step; target: string; about: 'aboutRelationship' | 'aboutPerson'; returnTo?: Step };

/** The first field with a possible contact detail, in the order the editor shows them. */
function contactField(incidentId: string, finding: Finding): string {
  const fields = new Set(finding.matches?.map((match) => match.field));
  if (!fields.has('description') && fields.has('place')) return placeId(incidentId);
  if (!fields.has('description') && fields.has('evidence')) return evidenceId(incidentId);
  return descriptionId(incidentId);
}

// Every condition must be listed here, so a new one cannot be missed.
const PLACES: Record<ConditionType, Place> = {
  incidentCountBelow: { kind: 'list', target: ADD_INCIDENT_ID },
  incidentsOutOfOrder: { kind: 'list', target: ORGANIZE_HEADING_ID },
  feelingMissing: { kind: 'first', field: feelingId },
  incidentDateMissing: { kind: 'incident', field: dateKindId },
  incidentDateInFuture: { kind: 'incident', field: exactDateId },
  incidentPlaceMissing: { kind: 'incident', field: placeId },
  incidentPeopleMissing: { kind: 'incident', field: presentId },
  incidentNotFirsthand: { kind: 'incident', field: firsthandId },
  incidentActsMissing: { kind: 'incident', field: (id) => actId(id, ACTS[0]) },
  incidentWordsBelow: { kind: 'incident', field: descriptionId },
  incidentContactInfo: { kind: 'incident', field: contactField },
  // ReadyFile doesn't collect respondent details, so it never asks this one.
  respondentDobBlank: { kind: 'list', target: ADD_INCIDENT_ID },
  // Start's own button moves on to the incidents, so this brings her back to the questions.
  relationshipNotHousehold: {
    kind: 'elsewhere',
    step: 'start',
    target: RELATIONSHIP_ID,
    about: 'aboutRelationship',
    returnTo: 'questions',
  },
  // The Your story step's own button already goes on to the questions.
  presentThreatMissing: { kind: 'elsewhere', step: 'story', target: THREAT_ID, about: 'aboutPerson' },
  askedToStopMissing: { kind: 'elsewhere', step: 'story', target: ASKED_TO_STOP_ID, about: 'aboutPerson' },
  convictionMissing: { kind: 'elsewhere', step: 'story', target: CONVICTED_ID, about: 'aboutPerson' },
};

/** Where "Add more" takes her: the screen and field the question is about. */
function addMoreAction(finding: Finding, firstIncidentId: string | undefined): Action {
  const place = PLACES[finding.conditionType];
  switch (place.kind) {
    case 'elsewhere':
      return { type: 'addMore', step: place.step, focusTarget: place.target, returnTo: place.returnTo };
    case 'list':
      return { type: 'addMore', focusTarget: place.target };
    case 'incident':
    case 'first': {
      const id = place.kind === 'incident' ? finding.incidentId : firstIncidentId;
      return id
        ? { type: 'addMore', focusTarget: place.field(id, finding), expandId: id }
        : { type: 'addMore', focusTarget: ADD_INCIDENT_ID };
    }
  }
}

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
 * before she opens any. Nothing opens by itself.
 */
export function CheckStep() {
  const { state, dispatch } = useAppState();
  const c = copy.check;
  const [openKeys, setOpenKeys] = useState<string[]>([]);
  // After she answers, focus goes back to that question's heading button.
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const findings = useFindings(state);
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
