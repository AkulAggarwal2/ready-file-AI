import { courtForm } from './index';

// The questions for a packet of court forms, in each form's own order
// (content/questionnaires/*.json). Field ids match the keys in the PDF maps,
// so an answer lands on the right blank.

export type FieldType = 'text' | 'textarea' | 'date' | 'number' | 'phone' | 'checkbox' | 'yesno' | 'choice' | 'multi' | 'group';

export interface FieldOption {
  value: string;
  label: string;
}

/**
 * When a field shows. "$relationship", "$convicted", "$grounds" and "$childRole" come from
 * the earlier steps; anything else is another field's answer.
 */
export type Condition =
  | { field: string; equals?: string | boolean; notEquals?: string | boolean; includes?: string }
  | { all: Condition[] }
  | { any: Condition[] };

export interface Field {
  id: string;
  type: FieldType;
  label: string;
  hint?: string;
  options?: FieldOption[];
  required?: boolean;
  showIf?: Condition;
  rows?: number;
  inputMode?: 'decimal' | 'numeric';
  // Shown with a note that only the court, clerk, prosecutor, and police see it.
  private?: boolean;
  // Groups: the fields of one item, how many fit on the form, and the
  // attachment the rest go on. "mapAs" names the map keys' prefix when it
  // differs from the field id; "join" prints the items one per line on a
  // single multi-line blank.
  fields?: Field[];
  mapAs?: string;
  join?: boolean;
  // Prints the items as table rows, one column per item field (like
  // "Law enforcement agency | Address").
  table?: boolean;
  max?: number;
  overflow?: string;
  // The most items the court accepts at all (9 protected people per order).
  limit?: number;
  itemLabel?: string;
  addLabel?: string;
}

export interface Section {
  id: string;
  form: string;
  // Where the section is on the form, like "questions 4 to 6".
  ref?: string;
  title: string;
  intro?: string;
  fields: Field[];
}

/** A form in a packet, how many copies to bring, and whether it is confidential. */
export interface PacketForm {
  form: string;
  copies: number;
  // Confidential forms go in their own PDF. A petition is public and one
  // copy is served on the other person, so a confidential page must never
  // be printed with it.
  confidential?: boolean;
  // Only the case heading is filled; someone else completes the form.
  captionOnly?: boolean;
}

export interface Questionnaire {
  id: string;
  // Who signs: the petitioner (the protected person, or a child's next
  // friend) or the respondent.
  filer: 'petitioner' | 'respondent';
  // The forms the answers fill, in filing order.
  packet: PacketForm[];
  // The first page of the public PDF: how to use it. It is not filed.
  instructions: { title: string; lines: string[] };
  // Answers the route already decides, like which PO-0108 box to check.
  fixed?: Answers;
  sections: Section[];
}

// A text answer, a checkbox, the values picked in a "multi" field, or a group's items.
export type Answer = string | boolean | string[] | Record<string, string>[];
export type Answers = Record<string, Answer>;

/** What conditions can read from the earlier steps. */
export interface EarlierAnswers {
  relationship: string | null;
  convicted: string;
  grounds: string[];
  // For a child's petition: parent, guardian, or other.
  childRole?: string;
}

const TYPES: FieldType[] = ['text', 'textarea', 'date', 'number', 'phone', 'checkbox', 'yesno', 'choice', 'multi', 'group'];

/** Throws on a field with an unknown type, a choice without options, a duplicate id, or a condition on an unknown field. */
export function validateQuestionnaire(raw: Questionnaire): Questionnaire {
  const fail = (message: string) => {
    throw new Error(`${raw.id}: ${message}`);
  };
  const ids = new Set<string>();
  const conditions: [string, Condition][] = [];
  if (!raw.packet?.length) fail('needs a packet of forms.');
  raw.packet.forEach((p) => courtForm(p.form));
  if (!raw.instructions?.lines?.length) fail('needs instructions.');
  for (const section of raw.sections) {
    courtForm(section.form);
    for (const field of section.fields) {
      if (ids.has(field.id)) fail(`field "${field.id}" is used twice.`);
      ids.add(field.id);
      if (!TYPES.includes(field.type)) fail(`field "${field.id}" has unknown type "${field.type}".`);
      if ((field.type === 'choice' || field.type === 'multi') && !field.options?.length) fail(`field "${field.id}" needs options.`);
      if (field.type === 'group' && (!field.fields?.length || !field.max)) fail(`group "${field.id}" needs fields and max.`);
      if (field.showIf) conditions.push([field.id, field.showIf]);
    }
  }
  const check = (owner: string, condition: Condition) => {
    if ('all' in condition) condition.all.forEach((c) => check(owner, c));
    else if ('any' in condition) condition.any.forEach((c) => check(owner, c));
    else if (!condition.field.startsWith('$') && !ids.has(condition.field)) {
      fail(`field "${owner}" depends on unknown field "${condition.field}".`);
    }
  };
  conditions.forEach(([owner, condition]) => check(owner, condition));
  return raw;
}

const files = import.meta.glob<Questionnaire>('../../content/questionnaires/*.json', { eager: true, import: 'default' });

/** Every questionnaire in content/questionnaires, by id. */
export const questionnaires: Record<string, Questionnaire> = Object.fromEntries(
  Object.values(files).map((raw) => [raw.id, validateQuestionnaire(raw)]),
);

function valueOf(field: string, answers: Answers, earlier: EarlierAnswers): Answer | null | undefined {
  if (field === '$relationship') return earlier.relationship;
  if (field === '$convicted') return earlier.convicted;
  if (field === '$grounds') return earlier.grounds;
  if (field === '$childRole') return earlier.childRole ?? '';
  return answers[field];
}

/** Whether a condition holds. */
export function holds(condition: Condition | undefined, answers: Answers, earlier: EarlierAnswers): boolean {
  if (!condition) return true;
  if ('all' in condition) return condition.all.every((c) => holds(c, answers, earlier));
  if ('any' in condition) return condition.any.some((c) => holds(c, answers, earlier));
  const value = valueOf(condition.field, answers, earlier);
  if (condition.includes !== undefined) return Array.isArray(value) && (value as string[]).includes(condition.includes);
  if (condition.equals !== undefined) return value === condition.equals;
  if (condition.notEquals !== undefined) return value !== condition.notEquals;
  return Boolean(value);
}

/**
 * The answers to fields that show, with fixed answers added. A field can
 * depend on another that is hidden, so this repeats until nothing changes.
 * The screens, the "still blank" list and the PDF all use it, so a field
 * that shows is always one whose answer prints.
 */
export function visibleAnswers(questionnaire: Questionnaire, answers: Answers, earlier: EarlierAnswers): Answers {
  const fields = new Map<string, Field>(questionnaire.sections.flatMap((s) => s.fields.map((f) => [f.id, f])));
  const current: Answers = { ...questionnaire.fixed, ...answers };
  let changed = true;
  while (changed) {
    changed = false;
    for (const id of Object.keys(current)) {
      const field = fields.get(id);
      if (field && !holds(field.showIf, current, earlier)) {
        delete current[id];
        changed = true;
      }
    }
  }
  const visible: Answers = {};
  for (const [id, value] of Object.entries(current)) if (fields.has(id) || id in (questionnaire.fixed ?? {})) visible[id] = value;
  return visible;
}

/** Whether a field shows, given the answers that are themselves visible. */
export function isShown(field: Field, visible: Answers, earlier: EarlierAnswers): boolean {
  return holds(field.showIf, visible, earlier);
}

/** Whether a field has an answer. */
export function isAnswered(value: Answer | undefined): boolean {
  if (value === undefined || value === false) return false;
  if (typeof value === 'string') return value.trim() !== '';
  if (Array.isArray(value)) return value.length > 0;
  return true;
}

/** The required fields that show but have no answer, by section. */
export function missingRequired(questionnaire: Questionnaire, answers: Answers, earlier: EarlierAnswers): { section: Section; field: Field }[] {
  const visible = visibleAnswers(questionnaire, answers, earlier);
  return questionnaire.sections.flatMap((section) =>
    section.fields
      .filter((field) => field.required && isShown(field, visible, earlier) && !isAnswered(visible[field.id]))
      .map((field) => ({ section, field })),
  );
}
