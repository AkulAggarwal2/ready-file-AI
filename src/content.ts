// Loads the team-edited content files. They are bundled into the app at build
// time, so the app never makes a network request to read them.
import copyJson from '../content/copy.json';
import rulesJson from '../content/rules.json';
import resourcesJson from '../content/resources.json';
import safetyJson from '../content/safety-questions.json';
import { validateRules } from './checker';

export interface Resource {
  id: string;
  name: string;
  description: string;
  contact: string;
  url?: string;
  verified: boolean;
}

export interface SafetyQuestion {
  id: string;
  question: string;
  // How a "yes" reads to court staff in Desk.
  staffLabel: string;
  sourceCitation: string;
  verified: boolean;
}

export type SafetyAnswer = 'yes' | 'no' | 'unsure';
export const SAFETY_ANSWERS: SafetyAnswer[] = ['yes', 'no', 'unsure'];

export const copy = copyJson;
export const rules = validateRules(rulesJson.rules);
export const resources: Resource[] = resourcesJson.resources;
export const safetyQuestions: SafetyQuestion[] = safetyJson.questions;

/** Fills {placeholders} in a copy string. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
