import { ACTS, type Finding } from '../checker';
import { ADD_INCIDENT_ID, ORGANIZE_HEADING_ID, type Action, type Step } from '../state/appState';
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
export type Place =
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
export const PLACES: Record<ConditionType, Place> = {
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

/**
 * Where "Add more" takes her: the screen and field the question is about.
 * From the Questions step, `fromQuestion` is true, so the screen she lands on
 * offers a way back to that question.
 */
export function addMoreAction(finding: Finding, firstIncidentId: string | undefined, fromQuestion = true): Action {
  const place = PLACES[finding.conditionType];
  const returnQuestion = fromQuestion ? finding.key : undefined;
  switch (place.kind) {
    case 'elsewhere':
      return { type: 'addMore', step: place.step, focusTarget: place.target, returnTo: place.returnTo, returnQuestion };
    case 'list':
      return { type: 'addMore', focusTarget: place.target, returnQuestion };
    case 'incident':
    case 'first': {
      const id = place.kind === 'incident' ? finding.incidentId : firstIncidentId;
      return id
        ? { type: 'addMore', focusTarget: place.field(id, finding), expandId: id, returnQuestion }
        : { type: 'addMore', focusTarget: ADD_INCIDENT_ID, returnQuestion };
    }
  }
}
