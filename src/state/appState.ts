import type { CaseType } from '../checker';
import { createIncident, mergeIncidents, type Incident, type IncidentFields } from '../organizer';

// All state lives in memory only (section 8). Nothing here is ever written to
// browser storage, cookies, or a server.

export type Step = 'start' | 'story' | 'check' | 'review';
export const STEPS: Step[] = ['start', 'story', 'check', 'review'];

export interface AppState {
  step: Step;
  caseType: CaseType | null;
  story: string;
  storyPhase: 'write' | 'organize';
  incidents: Incident[];
  // Keys of check questions she answered with "Continue as is".
  dismissed: string[];
  // Id of the element to focus after a screen change, for keyboard and
  // screen reader users.
  focusTarget: string | null;
}

export const initialState: AppState = {
  step: 'start',
  caseType: null,
  story: '',
  storyPhase: 'write',
  incidents: [],
  dismissed: [],
  focusTarget: null,
};

export type Action =
  | { type: 'begin'; caseType: CaseType }
  | { type: 'goTo'; step: Step }
  | { type: 'setStory'; story: string }
  | { type: 'backToWriting' }
  | { type: 'organized'; incidents: Incident[] }
  | { type: 'addMore'; focusTarget: string }
  | { type: 'updateIncident'; id: string; changes: Partial<IncidentFields> }
  | { type: 'addIncident' }
  | { type: 'deleteIncident'; id: string }
  | { type: 'mergeWithNext'; id: string }
  | { type: 'dismissFinding'; key: string }
  | { type: 'focusHandled' }
  | { type: 'reset' };

export const headingId = (incidentId: string) => `${incidentId}-heading`;
export const ORGANIZE_HEADING_ID = 'organize-heading';
export const ADD_INCIDENT_ID = 'add-incident';

export function reducer(state: AppState, action: Action): AppState {
  switch (action.type) {
    case 'begin':
      return { ...state, caseType: action.caseType, step: 'story' };
    case 'goTo':
      return { ...state, step: action.step };
    case 'setStory':
      return { ...state, story: action.story };
    case 'backToWriting':
      return { ...state, storyPhase: 'write' };
    case 'organized':
      return { ...state, incidents: action.incidents, storyPhase: 'organize' };
    case 'addMore':
      return { ...state, step: 'story', storyPhase: 'organize', focusTarget: action.focusTarget };
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
        focusTarget: headingId(incident.id),
      };
    }
    case 'deleteIncident':
      return {
        ...state,
        incidents: state.incidents.filter((incident) => incident.id !== action.id),
        focusTarget: ORGANIZE_HEADING_ID,
      };
    case 'mergeWithNext': {
      const index = state.incidents.findIndex((incident) => incident.id === action.id);
      const next = state.incidents[index + 1];
      if (index === -1 || !next) return state;
      const incidents = [...state.incidents];
      incidents.splice(index, 2, mergeIncidents(incidents[index], next));
      return { ...state, incidents, focusTarget: headingId(action.id) };
    }
    case 'dismissFinding':
      return { ...state, dismissed: [...state.dismissed, action.key] };
    case 'focusHandled':
      return { ...state, focusTarget: null };
    case 'reset':
      return initialState;
  }
}
