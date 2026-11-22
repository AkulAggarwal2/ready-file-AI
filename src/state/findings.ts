import { useMemo } from 'react';
import { runChecks, type Finding } from '../checker';
import { rules } from '../content';
import type { AppState } from './appState';

/** Today as YYYY-MM-DD in her own time zone, to match the date picker. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Everything in the app state that the follow-up questions depend on. */
export type FindingsInput = Pick<AppState, 'grounds' | 'relationship' | 'threat' | 'askedToStop' | 'convicted' | 'incidents'>;

/** The follow-up questions for what she has entered so far. */
function findingsFor(state: FindingsInput): Finding[] {
  return runChecks(
    {
      grounds: state.grounds,
      relationship: state.relationship,
      threat: state.threat,
      askedToStop: state.askedToStop,
      convicted: state.convicted,
      incidents: state.incidents,
      today: todayIso(),
    },
    rules,
  );
}

/** The follow-up questions, worked out again only when one of their inputs changes. */
export function useFindings(state: FindingsInput): Finding[] {
  const { grounds, relationship, threat, askedToStop, convicted, incidents } = state;
  return useMemo(
    () => findingsFor({ grounds, relationship, threat, askedToStop, convicted, incidents }),
    [grounds, relationship, threat, askedToStop, convicted, incidents],
  );
}
