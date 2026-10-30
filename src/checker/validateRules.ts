import type { CaseType, Condition, Rule } from './types';

const CASE_TYPES: CaseType[] = ['stalking', 'harassment', 'not-sure'];

function fail(index: number, id: unknown, problem: string): never {
  const name = typeof id === 'string' ? `"${id}"` : `#${index + 1}`;
  throw new Error(`Rule ${name} in rules.json: ${problem}`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function validateCondition(raw: unknown, index: number, id: unknown): Condition | null {
  if (raw === null) return null;
  if (!isRecord(raw)) fail(index, id, 'condition must be an object or null.');

  switch (raw.type) {
    case 'incidentDateMissing':
      return { type: raw.type };
    case 'incidentCountBelow':
    case 'incidentWordsBelow':
      if (typeof raw.value !== 'number' || raw.value < 0) {
        fail(index, id, `condition "${raw.type}" needs a "value" that is a number of 0 or more.`);
      }
      return { type: raw.type, value: raw.value };
    default:
      return fail(
        index,
        id,
        `unknown condition type "${String(raw.type)}". Use incidentCountBelow, incidentDateMissing, or incidentWordsBelow.`,
      );
  }
}

/**
 * Checks rules loaded from a content file and returns them typed. Throws a
 * plain-language error that names the rule, so the team can fix the file.
 */
export function validateRules(raw: unknown): Rule[] {
  if (!Array.isArray(raw)) throw new Error('rules.json: "rules" must be a list.');

  const seen = new Set<string>();
  return raw.map((item, index): Rule => {
    if (!isRecord(item)) fail(index, undefined, 'each rule must be an object.');
    const { id } = item;
    if (typeof id !== 'string' || id === '') fail(index, id, 'id must be text.');
    if (seen.has(id)) fail(index, id, 'id is used by more than one rule.');
    seen.add(id);

    if (
      !Array.isArray(item.caseTypes) ||
      !item.caseTypes.every((t): t is CaseType => CASE_TYPES.includes(t as CaseType))
    ) {
      fail(index, id, `caseTypes must be a list using only: ${CASE_TYPES.join(', ')}.`);
    }
    if (typeof item.questionText !== 'string') fail(index, id, 'questionText must be text.');
    if (typeof item.sourceCitation !== 'string') fail(index, id, 'sourceCitation must be text.');
    if (typeof item.verified !== 'boolean') fail(index, id, 'verified must be true or false.');

    return {
      id,
      caseTypes: item.caseTypes,
      condition: validateCondition(item.condition, index, id),
      questionText: item.questionText,
      sourceCitation: item.sourceCitation,
      verified: item.verified,
      todo: typeof item.todo === 'string' ? item.todo : undefined,
    };
  });
}
