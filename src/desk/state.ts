// Desk's state lives in memory only. A reload resets the demo. All screens
// share it, so a hold started on one screen shows on the others.
import { createContext, createElement, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import { deskConfig, deskCopy, plural, samplePetitions, type CallResult, type Outcome } from './content';
import {
  activeHold,
  callResultText,
  currentFindings,
  filedAt,
  findingsFor,
  hasPhone,
  holdEndFrom,
  nextActionTime,
  wasHeld,
  type FollowUp,
  type Petition,
} from './model';
import { formatShort, parseTime } from './time';

export type Filter = 'questions' | 'none' | 'all';

export type View =
  | { screen: 'petitions' }
  | { screen: 'petition'; id: string }
  | { screen: 'review' }
  | { screen: 'bench'; id: string; preview: boolean };

export interface DeskState {
  clock: number;
  view: View;
  showNames: boolean;
  filter: Filter;
  // In filing order, oldest first.
  petitions: Petition[];
}

export type DeskAction =
  | { type: 'go'; view: View }
  | { type: 'showNames'; show: boolean }
  | { type: 'filter'; filter: Filter }
  | { type: 'hold'; id: string }
  | { type: 'sendNow'; id: string }
  | { type: 'textLink'; id: string }
  | { type: 'logCall'; id: string; result: CallResult }
  | { type: 'askFollowUp'; id: string }
  | { type: 'saveOutcome'; id: string; choice: Outcome; reasons: string[] }
  | { type: 'demoAmend'; id: string }
  | { type: 'demoJumpToHoldEnd'; id: string }
  | { type: 'reset' };

const log = deskCopy.log;

export function initialDeskState(): DeskState {
  const petitions = samplePetitions
    .map((sample): Petition => ({
      sample,
      followUp: {
        // Desk checks each petition when it arrives.
        log: [
          {
            at: parseTime(sample.filedAt),
            text: plural(log.checked, { n: findingsFor(sample, sample.original).length }),
          },
        ],
      },
    }))
    .sort((a, b) => filedAt(a) - filedAt(b));
  return {
    clock: parseTime(deskConfig.demoClockStart),
    view: { screen: 'petitions' },
    showNames: false,
    filter: 'questions',
    petitions,
  };
}

function update(state: DeskState, id: string, change: (p: Petition) => FollowUp): DeskState {
  return {
    ...state,
    petitions: state.petitions.map((p) => (p.sample.id === id ? { ...p, followUp: change(p) } : p)),
  };
}

const withLog = (f: FollowUp, at: number, text: string): FollowUp => ({ ...f, log: [...f.log, { at, text }] });

/**
 * Moves the demo clock to `to`. Any hold that runs out on the way ends, and
 * the petition goes to the magistrate.
 */
function moveClock(state: DeskState, to: number): DeskState {
  const clock = Math.max(state.clock, to);
  return {
    ...state,
    clock,
    petitions: state.petitions.map((p) => {
      const hold = activeHold(p);
      if (!hold || hold.end > clock) return p;
      return {
        ...p,
        followUp: withLog({ ...p.followUp, hold: { ...hold, endedAt: hold.end } }, hold.end, log.holdEnded),
      };
    }),
  };
}

/** Each staff action moves the demo clock forward a few minutes. */
const tick = (state: DeskState) => moveClock(state, nextActionTime(state.clock));

const find = (state: DeskState, id: string) => state.petitions.find((p) => p.sample.id === id);

export function deskReducer(state: DeskState, action: DeskAction): DeskState {
  switch (action.type) {
    case 'go':
      return { ...state, view: action.view };
    case 'showNames':
      return { ...state, showNames: action.show };
    case 'filter':
      return { ...state, filter: action.filter };
    case 'hold':
    case 'askFollowUp': {
      const p = find(state, action.id);
      // A petition can be held once, and only if there's someone to follow up with.
      if (!p || wasHeld(p) || !hasPhone(p)) return state;
      const next = tick(state);
      const start = next.clock;
      const end = holdEndFrom(start);
      const by = action.type === 'hold' ? 'specialist' : 'magistrate';
      const text = plural(by === 'specialist' ? log.held : log.asked, { until: formatShort(end) });
      return update(next, action.id, (q) => withLog({ ...q.followUp, hold: { start, end, by } }, start, text));
    }
    case 'sendNow': {
      const p = find(state, action.id);
      if (!p || !activeHold(p)) return state;
      const next = tick(state);
      return update(next, action.id, (q) => {
        const hold = activeHold(q);
        // The clock may have reached the hold's end on its own.
        if (!hold) return q.followUp;
        return withLog({ ...q.followUp, hold: { ...hold, endedAt: next.clock } }, next.clock, log.sent);
      });
    }
    case 'textLink': {
      const p = find(state, action.id);
      if (!p || !activeHold(p) || !p.sample.contact.texts) return state;
      const next = tick(state);
      return update(next, action.id, (q) => withLog({ ...q.followUp, textedAt: next.clock }, next.clock, log.texted));
    }
    case 'logCall': {
      const p = find(state, action.id);
      if (!p || !activeHold(p)) return state;
      const next = tick(state);
      const text = plural(log.called, { result: callResultText(action.result) });
      return update(next, action.id, (q) => withLog(q.followUp, next.clock, text));
    }
    case 'saveOutcome': {
      const next = tick(state);
      const text = plural(log.outcome, { outcome: deskCopy.outcome.choices[action.choice] });
      return update(next, action.id, (q) =>
        withLog({ ...q.followUp, outcome: { choice: action.choice, reasons: action.reasons, at: next.clock } }, next.clock, text),
      );
    }
    case 'demoAmend': {
      const p = find(state, action.id);
      if (!p?.sample.amended || !activeHold(p) || p.followUp.textedAt === undefined || p.followUp.amendedAt !== undefined) {
        return state;
      }
      // The amendment has to arrive while the hold is still running.
      const arrives = Math.max(state.clock, parseTime(deskConfig.demoAmendTime));
      if (arrives >= activeHold(p)!.end) return state;
      const next = moveClock(state, arrives);
      const added = p.sample.amended.incidents.length - p.sample.original.incidents.length;
      return update(next, action.id, (q) =>
        withLog({ ...q.followUp, amendedAt: next.clock }, next.clock, plural(log.amended, { n: added })),
      );
    }
    case 'demoJumpToHoldEnd': {
      const p = find(state, action.id);
      const hold = p && activeHold(p);
      return hold ? moveClock(state, hold.end) : state;
    }
    case 'reset':
      return initialDeskState();
  }
}

/** Petitions with questions on the current version. */
export const withQuestions = (petitions: Petition[]) => petitions.filter((p) => currentFindings(p).length > 0);

const DeskContext = createContext<{ state: DeskState; dispatch: Dispatch<DeskAction> } | null>(null);

export function DeskStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(deskReducer, undefined, initialDeskState);
  return createElement(DeskContext.Provider, { value: { state, dispatch } }, children);
}

export function useDesk() {
  const value = useContext(DeskContext);
  if (!value) throw new Error('useDesk must be used inside DeskStateProvider.');
  return value;
}
