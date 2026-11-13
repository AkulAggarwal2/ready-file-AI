// Loads and checks desk-config.json, so a mistake in the file stops Desk with
// an error that says what to fix.
import deskConfigJson from '../../content/desk-config.json';
import { CASE_TYPES, type CaseType } from '../checker';
import { parseClockTime, parseDateTime } from './time';

export const OUTCOME_IDS = ['granted-ex-parte', 'hearing', 'denied'] as const;
export type OutcomeId = (typeof OUTCOME_IDS)[number];

export interface DenialReason {
  id: string;
  label: string;
}

export interface DeskConfig {
  clockStart: number;
  minutesPerAction: number;
  holdHours: number;
  counter: { open: number; close: number; days: number[] };
  timelineHours: number;
  lineWidth: number;
  checkedCaseTypes: CaseType[];
  callDays: Record<string, number[]>;
  outcomes: Partial<Record<CaseType, OutcomeId[]>>;
  denialReasons: { source: string; sourceCitation: string; verified: boolean; reasons: DenialReason[] };
}

function fail(problem: string): never {
  throw new Error(`desk-config.json: ${problem}`);
}

function positive(value: unknown, name: string): number {
  if (typeof value !== 'number' || !(value > 0)) fail(`"${name}" must be a number above 0.`);
  return value;
}

function weekdays(value: unknown, name: string): number[] {
  if (!Array.isArray(value) || !value.every((d) => Number.isInteger(d) && d >= 0 && d <= 6)) {
    fail(`"${name}" must be a list of weekdays from 0 (Sunday) to 6 (Saturday).`);
  }
  return value;
}

function isCaseType(value: unknown): value is CaseType {
  return (CASE_TYPES as readonly unknown[]).includes(value);
}

export function validateDeskConfig(raw: typeof deskConfigJson): DeskConfig {
  const caseTypes = raw.checkedCaseTypes;
  if (!Array.isArray(caseTypes) || !caseTypes.every(isCaseType)) {
    fail(`"checkedCaseTypes" must use only: ${CASE_TYPES.join(', ')}.`);
  }

  const outcomes: DeskConfig['outcomes'] = {};
  for (const [caseType, list] of Object.entries(raw.outcomes)) {
    if (!isCaseType(caseType)) fail(`"outcomes" has an unknown case type "${caseType}".`);
    if (!Array.isArray(list) || !list.every((id) => (OUTCOME_IDS as readonly string[]).includes(id))) {
      fail(`"outcomes.${caseType}" must use only: ${OUTCOME_IDS.join(', ')}.`);
    }
    outcomes[caseType] = list as OutcomeId[];
  }

  const callDays: Record<string, number[]> = {};
  for (const [key, days] of Object.entries(raw.callDays)) callDays[key] = weekdays(days, `callDays.${key}`);

  const reasons = raw.denialReasons.reasons;
  if (!reasons.every((r) => typeof r.id === 'string' && typeof r.label === 'string')) {
    fail('each denial reason needs an "id" and a "label".');
  }

  return {
    clockStart: parseDateTime(raw.clock.start),
    minutesPerAction: positive(raw.clock.minutesPerAction, 'clock.minutesPerAction'),
    holdHours: positive(raw.holdHours, 'holdHours'),
    counter: {
      open: parseClockTime(raw.counter.open),
      close: parseClockTime(raw.counter.close),
      days: weekdays(raw.counter.days, 'counter.days'),
    },
    timelineHours: positive(raw.timelineHours, 'timelineHours'),
    lineWidth: positive(raw.lineWidth, 'lineWidth'),
    checkedCaseTypes: caseTypes,
    callDays,
    outcomes,
    denialReasons: { ...raw.denialReasons, reasons },
  };
}

export const deskConfig = validateDeskConfig(deskConfigJson);
