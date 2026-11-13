// Loads Desk's team-edited text and the shared rules. The files are bundled at
// build time, so Desk never makes a network request to read them.
import deskCopyJson from '../../content/desk-copy.json';
import rulesJson from '../../content/rules.json';
import { validateRules, type Finding } from '../checker';

export const deskCopy = deskCopyJson;

// The same rules ReadyFile uses, checked the same way.
export const deskRules = validateRules(rulesJson.rules);

export interface PluralForms {
  zero?: string;
  one: string;
  other: string;
}

/** Fills {placeholders} in a copy string. Unknown placeholders are left as is. */
export function fill(template: string, values: Record<string, string | number | undefined>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    values[key] !== undefined ? String(values[key]) : match,
  );
}

/**
 * Picks the right form for a count ("1 question", "2 questions") and fills it.
 * {n} is the count unless `values` gives its own n.
 */
export function plural(forms: PluralForms, count: number, values: Record<string, string | number | undefined> = {}) {
  const template = count === 0 && forms.zero !== undefined ? forms.zero : count === 1 ? forms.one : forms.other;
  return fill(template, { n: count, ...values });
}

/** How a finding reads to court staff, from its rule's staffText. */
export function staffText(finding: Finding): string {
  const text = finding.staffText;
  const values = { ...finding.values };
  if (text === undefined) return fill(deskCopy.petition.questions.fallback, { id: finding.ruleId });
  if (typeof text === 'string') return fill(text, values);
  const count = (values as Record<string, number | undefined>)[text.count] ?? 0;
  return plural(text, count, values);
}
