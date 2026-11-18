import type { CaseType, Relationship, YesNoUnknown } from '../checker';
import { copy, fill, type SafetyAnswer } from '../content';
import { createIncident, mergeIncidents, type Incident, type IncidentFields } from '../organizer';

// All state lives in memory only (section 8). Nothing here is ever written to
// browser storage, cookies, or a server.

// The five steps, in order. They are also the labels in the step bar at the top.
export type Step = 'start' | 'incidents' | 'story' | 'questions' | 'review';
export const STEPS: Step[] = ['start', 'incidents', 'story', 'questions', 'review'];

/**
 * What a delete or merge removed, kept so it can be undone. Only the removed
 * incidents are kept, so undoing never overwrites edits she made elsewhere.
 */
export interface UndoEntry {
  // Changes with every entry, so a second delete restarts the toast timer.
  id: number;
  kind: 'deleted' | 'merged';
  // Where the incidents were in the list.
  index: number;
  // The incidents to put back.
  restore: Incident[];
  // For a merge: the merged incident that these replace.
  replaceId?: string;
  focusId: string;
}

export interface AppState {
  step: Step;
  caseType: CaseType | null;
  // How she knows the person (question 2 on the petition). Optional.
  relationship: Relationship | null;
  // Her account in her own words, written after the incidents.
  story: string;
  // About the person as a whole, asked on the Your story step.
  threat: string;
  askedToStop: YesNoUnknown;
  askedToStopDetail: string;
  // Asked only for sexual assault.
  convicted: YesNoUnknown;
  incidents: Incident[];
  // Ids of incidents whose fields are open for editing.
  expanded: string[];
  // Keys of check questions she answered with "Continue as is".
  dismissed: string[];
  // Her answers to the optional safety questions, by question id. A question
  // she hasn't answered has no entry.
  safetyAnswers: Record<string, SafetyAnswer>;
  // Id of the element to focus after a screen change, for keyboard and
  // screen reader users.
  focusTarget: string | null;
  // The step to go back to after "Add more" sends her to an earlier step whose
  // own button would otherwise move her on, such as Start.
  returnTo: Step | null;
  // Spoken by the live region after organizing, merging, deleting, and so on.
  announcement: string;
  undo: UndoEntry | null;
}

export type PersonDetails = Partial<Pick<AppState, 'threat' | 'askedToStop' | 'askedToStopDetail' | 'convicted'>>;

export const initialState: AppState = {
  step: 'start',
  caseType: null,
  relationship: null,
  story: '',
  threat: '',
  askedToStop: 'unknown',
  askedToStopDetail: '',
  convicted: 'unknown',
  incidents: [],
  expanded: [],
  dismissed: [],
  safetyAnswers: {},
  focusTarget: null,
  returnTo: null,
  announcement: '',
  undo: null,
};

export type Action =
  | { type: 'begin'; caseType: CaseType; relationship: Relationship | null }
  | { type: 'goTo'; step: Step }
  | { type: 'setStory'; story: string }
  | { type: 'setPersonDetails'; changes: PersonDetails }
  | { type: 'loadSample'; story: string; incidents: Incident[] }
  | { type: 'addMore'; focusTarget: string; expandId?: string; step?: Step; returnTo?: Step }
  | { type: 'updateIncident'; id: string; changes: Partial<IncidentFields> }
  | { type: 'addIncident' }
  | { type: 'deleteIncident'; id: string }
  | { type: 'mergeWithNext'; id: string }
  | { type: 'moveIncident'; id: string; direction: 'up' | 'down' }
  | { type: 'reorderIncident'; id: string; toIndex: number }
  | { type: 'toggleIncident'; id: string }
  | { type: 'undo' }
  | { type: 'clearUndo' }
  | { type: 'dismissFinding'; key: string }
  | { type: 'setSafetyAnswer'; id: string; answer: SafetyAnswer | null }
  | { type: 'focusHandled' }
  | { type: 'reset' };

export const headingId = (incidentId: string) => `${incidentId}-heading`;
export const moveButtonId = (incidentId: string, direction: 'up' | 'down') => `${incidentId}-move-${direction}`;
export const ORGANIZE_HEADING_ID = 'organize-heading';
export const ADD_INCIDENT_ID = 'add-incident';

let undoCounter = 0;

function moveTo(state: AppState, from: number, to: number): AppState {
  if (from === -1 || to < 0 || to >= state.incidents.length || from === to) return state;
  const incidents = [...state.incidents];
  const [moved] = incidents.splice(from, 1);
  incidents.splice(to, 0, moved);
  // Keyboard focus stays on the button she used. If that button is now
  // disabled (the incident hit an end of the list), it moves to the other one.
  const direction = to < from ? 'up' : 'down';
  const atEnd = direction === 'up' ? to === 0 : to === incidents.length - 1;
  return {
    ...state,
    incidents,
    focusTarget: moveButtonId(moved.id, atEnd ? (direction === 'up' ? 'down' : 'up') : direction),
    announcement: fill(copy.announce.moved, { position: to + 1, count: incidents.length }),
  };
}

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'begin':
      return {
        ...state,
        caseType: action.caseType,
        relationship: action.relationship,
        step: state.returnTo ?? 'incidents',
        returnTo: null,
      };
    case 'goTo':
      return { ...state, step: action.step, returnTo: null, undo: null };
    case 'setStory':
      return { ...state, story: action.story };
    case 'setPersonDetails':
      return { ...state, ...action.changes };
    case 'loadSample':
      return { ...state, story: action.story, incidents: action.incidents, expanded: [], undo: null };
    case 'addMore':
      return {
        ...state,
        step: action.step ?? 'incidents',
        focusTarget: action.focusTarget,
        returnTo: action.returnTo ?? null,
        expanded:
          action.expandId && !state.expanded.includes(action.expandId)
            ? [...state.expanded, action.expandId]
            : state.expanded,
        undo: null,
      };
    case 'updateIncident':
      return {
        ...state,
        incidents: state.incidents.map((incident) =>
          incident.id === action.id ? { ...incident, ...action.changes } : incident,
        ),
      };
    case 'addIncident': {
      const incident = createIncident();
      return {
        ...state,
        incidents: [...state.incidents, incident],
        expanded: [...state.expanded, incident.id],
        focusTarget: headingId(incident.id),
        announcement: fill(copy.announce.added, { count: state.incidents.length + 1 }),
      };
    }
    case 'deleteIncident': {
      const index = state.incidents.findIndex((incident) => incident.id === action.id);
      if (index === -1) return state;
      const incidents = state.incidents.filter((incident) => incident.id !== action.id);
      return {
        ...state,
        incidents,
        expanded: state.expanded.filter((id) => id !== action.id),
        focusTarget: ORGANIZE_HEADING_ID,
        announcement: fill(copy.announce.deleted, { count: incidents.length }),
        undo: {
          id: ++undoCounter,
          kind: 'deleted',
          index,
          restore: [state.incidents[index]],
          focusId: action.id,
        },
      };
    }
    case 'mergeWithNext': {
      const index = state.incidents.findIndex((incident) => incident.id === action.id);
      const next = state.incidents[index + 1];
      if (index === -1 || !next) return state;
      const first = state.incidents[index];
      const incidents = [...state.incidents];
      incidents.splice(index, 2, mergeIncidents(first, next));
      return {
        ...state,
        incidents,
        expanded: state.expanded.filter((id) => id !== next.id),
        focusTarget: headingId(action.id),
        announcement: fill(copy.announce.merged, { count: incidents.length }),
        undo: {
          id: ++undoCounter,
          kind: 'merged',
          index,
          restore: [first, next],
          replaceId: first.id,
          focusId: action.id,
        },
      };
    }
    case 'moveIncident': {
      const from = state.incidents.findIndex((incident) => incident.id === action.id);
      return moveTo(state, from, action.direction === 'up' ? from - 1 : from + 1);
    }
    case 'reorderIncident': {
      const from = state.incidents.findIndex((incident) => incident.id === action.id);
      return moveTo(state, from, action.toIndex);
    }
    case 'toggleIncident': {
      const open = state.expanded.includes(action.id);
      const number = state.incidents.findIndex((incident) => incident.id === action.id) + 1;
      return {
        ...state,
        expanded: open ? state.expanded.filter((id) => id !== action.id) : [...state.expanded, action.id],
        announcement: fill(open ? copy.announce.collapsed : copy.announce.expanded, { n: number }),
      };
    }
    case 'undo': {
      const { undo } = state;
      if (!undo) return state;
      const incidents = [...state.incidents];
      const at = undo.replaceId ? incidents.findIndex((incident) => incident.id === undo.replaceId) : -1;
      if (at !== -1) incidents.splice(at, 1, ...undo.restore);
      else incidents.splice(Math.min(undo.index, incidents.length), 0, ...undo.restore);
      return {
        ...state,
        incidents,
        focusTarget: headingId(undo.focusId),
        announcement: fill(copy.announce.undone, { count: incidents.length }),
        undo: null,
      };
    }
    case 'clearUndo':
      return state.undo ? { ...state, undo: null } : state;
    case 'dismissFinding':
      return state.dismissed.includes(action.key)
        ? state
        : { ...state, dismissed: [...state.dismissed, action.key] };
    case 'setSafetyAnswer': {
      const { [action.id]: _previous, ...rest } = state.safetyAnswers;
      return { ...state, safetyAnswers: action.answer ? { ...rest, [action.id]: action.answer } : rest };
    }
    case 'focusHandled':
      return { ...state, focusTarget: null };
    case 'reset':
      return initialState;
  }
}
