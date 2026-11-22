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

/** Whose petition it is: the adult's own (PO-0100) or a child's (PO-0101). */
export type Variant = 'adult' | 'child';

type Copy = typeof copyJson;

function merge<T>(base: T, over: unknown): T {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return (over ?? base) as T;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [key, value] of Object.entries(over)) {
    out[key] = key in out && typeof out[key] === 'object' && !Array.isArray(out[key]) ? merge(out[key], value) : value;
  }
  return out as T;
}

const childCopy: Copy = merge(copyJson, copyJson.child);

/** The UI text for an adult's own petition, or for a child's (copy.child replaces matching keys). */
export function copyFor(variant: Variant): Copy {
  return variant === 'child' ? childCopy : copyJson;
}
export const rules = validateRules(rulesJson.rules);
export const resources: Resource[] = resourcesJson.resources;
export const safetyQuestions: SafetyQuestion[] = safetyJson.questions;

/** Fills {placeholders} in a copy string. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
