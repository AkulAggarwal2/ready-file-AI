// Loads Desk's team-edited content files. They are bundled at build time, so
// Desk never makes a network request to read them.
import deskConfigJson from '../../content/desk-config.json';
import deskCopyJson from '../../content/desk-copy.json';
import deskSampleJson from '../../content/desk-sample.json';
import type { CheckDate, PluralText } from '../checker';
import { fill, type SafetyAnswer } from '../content';

export type DeskCaseType = 'stalking' | 'harassment';
export type How = 'in-person' | 'online' | 'phone-or-text' | 'other' | 'unknown';
export type Outcome = 'granted' | 'hearing' | 'denied';
export type CallResult = 'reached' | 'noAnswer' | 'notSafe';

export interface TimeWindow {
  // 0 is Sunday.
  days: number[];
  start: string;
  end: string;
}

export interface SampleIncident {
  date: CheckDate;
  how: How;
  // Where the petitioner said it happened.
  place?: string;
  // The petitioner's words, exactly as filed.
  description: string;
  // Only for date order on the bench summary. Never shown.
  sortDate?: string;
}

export interface PetitionVersion {
  narrative: string;
  incidents: SampleIncident[];
}

export interface SamplePetition {
  id: string;
  caseNumber: string;
  caseType: DeskCaseType;
  filedAt: string;
  petitioner: { first: string; last: string };
  contact: {
    phone: string | null;
    texts: boolean;
    voicemail: boolean;
    calls: { text: string; windows: TimeWindow[] } | null;
  };
  respondent: { first: string; last: string; dateOfBirth: string; address?: string };
  relationship: string;
  original: PetitionVersion;
  // In v1 the amended petition is stored here, and the demo control files it.
  amended?: PetitionVersion;
  // The petitioner's answers to the optional safety questions, by question id.
  // A question with no entry wasn't answered.
  safetyAnswers: Record<string, SafetyAnswer>;
}

export interface DeskConfig {
  demoClockStart: string;
  minutesPerAction: number;
  holdHours: number;
  counter: { opens: string; closes: string; days: number[] };
  checkedCaseTypes: DeskCaseType[];
  lineWidth: number;
  specialist: string;
  demoAmendTime: string;
  outcomes: Record<DeskCaseType, Outcome[]>;
  outcomesSource: string;
  denialReasons: { id: string; label: string }[];
  denialReasonsSource: string;
}

export const deskCopy = deskCopyJson;
export const deskConfig = deskConfigJson as DeskConfig;
export const samplePetitions = deskSampleJson.petitions as SamplePetition[];

/**
 * Fills a copy string. A plural object picks its form from the number named by
 * `by`: `zero` for 0 (or `other` without one), `one` for 1, `other` otherwise.
 */
export function plural(text: string | PluralText, values: Record<string, string | number> = {}): string {
  if (typeof text === 'string') return fill(text, values);
  const count = Number(values[text.by]);
  const form = count === 0 ? (text.zero ?? text.other) : count === 1 ? text.one : text.other;
  return fill(form, values);
}
