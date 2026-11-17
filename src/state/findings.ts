import { runChecks, type Finding } from '../checker';
import { rules } from '../content';
import type { AppState } from './appState';

/** Today as YYYY-MM-DD in her own time zone, to match the date picker. */
export function todayIso(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The follow-up questions for what she has entered so far. */
export function findingsFor(state: AppState): Finding[] {
  return runChecks(
    {
      caseType: state.caseType ?? 'not-sure',
      relationship: state.relationship,
      incidents: state.incidents,
      today: todayIso(),
    },
    rules,
  );
}
