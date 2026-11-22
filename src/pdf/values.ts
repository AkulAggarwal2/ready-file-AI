import { ACTS, CHILD_ACTS, type Act, type Ground, type Relationship } from '../checker';
import { visibleAnswers, type Answer, type Answers, type EarlierAnswers, type Field, type Questionnaire } from '../forms/questionnaire';
import { fill } from '../content';
import type { Incident } from '../organizer';
import { hasKey, pdfMap } from './maps';
import type { StampValues } from './stamp';

// Turns her answers, and what she entered on the earlier steps, into the
// values each form's map prints. Field ids in the questionnaire match the
// map keys, so most values are copied straight across.

export interface PacketInput {
  questionnaire: Questionnaire;
  answers: Answers;
  grounds: Ground[];
  relationship: Relationship | null;
  convicted: string;
  incidents: Incident[];
  // For a child's petition: parent, guardian, or other (PO-0101 question 1).
  childRole?: string;
}

/** One block of an attachment page: a heading and its lines or text. */
export interface AttachmentBlock {
  heading: string;
  text: string;
}

/** A labeled attachment, like "Attachment 8a", printed after its form. */
export interface Attachment {
  label: string;
  // The form it belongs to; a PO-0104 attachment is confidential and stays with it.
  form: string;
  blocks: AttachmentBlock[];
}

export interface FormValues {
  values: StampValues;
  // Text that may not fit on the form: if it doesn't, the form says "See
  // Attachment <label>" and the full text goes on that attachment.
  // "box" is the form's own "Continued on Attachment ..." checkbox, if any.
  continuable: Record<string, { label: string; heading: string; box?: string }>;
  attachments: Attachment[];
}

/** YYYY-MM-DD as the court writes dates: MM/DD/YYYY. Anything else is kept as typed. */
export function courtDate(value: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  return m ? `${m[2]}/${m[3]}/${m[1]}` : value.trim();
}

function incidentDate(incident: Incident): string {
  if (incident.date.kind === 'exact') return courtDate(incident.date.value);
  if (incident.date.kind === 'approximate') return incident.date.text.trim();
  return '';
}

export function fullName(answers: Answers, who: 'petitioner' | 'respondent' | 'child' | 'employee'): string {
  return ['first', 'middle', 'last']
    .map((part) => text(answers[`${who}.${part}`]))
    .filter(Boolean)
    .join(' ');
}

const text = (value: Answer | undefined): string => (typeof value === 'string' ? value.trim() : '');
const rows = (value: Answer | undefined): Record<string, string>[] =>
  Array.isArray(value) ? (value as unknown[]).filter((r): r is Record<string, string> => typeof r === 'object' && r !== null) : [];

/** Only the answers to fields that show, so a hidden answer never prints. */
function shownAnswers(input: PacketInput): Answers {
  const earlier: EarlierAnswers = { relationship: input.relationship, convicted: input.convicted, grounds: input.grounds, childRole: input.childRole };
  return visibleAnswers(input.questionnaire, input.answers, earlier);
}

/** The caption line on attachment pages, from the same answers the form prints. */
export function attachmentCaption(input: PacketInput): string {
  const a = shownAnswers(input);
  // On a workplace violence form the employer is the plaintiff.
  const petitioner = text(a['plaintiff.name']) || petitionerCaption(a) || 'Petitioner';
  return `${petitioner} v. ${fullName(a, 'respondent') || 'Respondent'}`;
}

/** A phone number split for the form's "(___) ______" blanks. */
function phone(value: string): { area: string; number: string } {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return { area: digits.slice(0, 3), number: `${digits.slice(3, 6)}-${digits.slice(6)}` };
  if (digits.length === 11 && digits.startsWith('1')) return { area: digits.slice(1, 4), number: `${digits.slice(4, 7)}-${digits.slice(7)}` };
  return { area: '', number: value.trim() };
}

/**
 * The petitioner as captions name them: the adult, or on a child's petition,
 * the child "by next friend" (PO-0103).
 */
export function petitionerCaption(answers: Answers): string {
  const child = fullName(answers, 'child');
  const filer = fullName(answers, 'petitioner');
  return child ? `${child}, by next friend ${filer}` : filer;
}

function caption(answers: Answers): StampValues {
  return {
    'caption.court': text(answers['court.name']),
    'caption.county': text(answers['court.county']),
    'caption.petitioner': petitionerCaption(answers),
    'caption.respondent': fullName(answers, 'respondent'),
  };
}

/** Rows that fit on the form, and an attachment block for the rest. */
function split<T>(items: T[], max: number): { onForm: T[]; rest: T[] } {
  return { onForm: items.slice(0, max), rest: items.slice(max) };
}

const PO0100_GROUNDS: Record<string, Ground> = { a: 'domestic-violence', b: 'sex-offense', c: 'stalking', d: 'harassment' };
const HOUSEHOLD: Relationship[] = [
  'spouse', 'former-spouse', 'lived-together', 'child-in-common', 'dating', 'sexual', 'blood-adoption', 'marriage',
  'guardian', 'ward', 'custodian', 'foster-parent', 'minor-child-of', 'adopted-their-child',
];

// Checkboxes and texts in question 9 whose ids match the map keys exactly.
const Q9_COPIED = [
  'q9.protectMe', 'q9.protectFamily', 'q9.protectFamily.names', 'q9.tracking', 'q9.noContact', 'q9.stayAway', 'q9.stayAway.place',
  'q9.stayAway.address', 'q9.indefinite', 'q9.familyPlaces', 'q9.familyPlaces.places', 'q9.owners', 'q9.evict', 'q9.evict.address',
  'q9.possession', 'q9.possession.residence', 'q9.possession.residence.address', 'q9.possession.vehicle',
  'q9.possession.vehicle.description', 'q9.possession.items', 'q9.possession.items.description', 'q9.animalsProtect', 'q9.animalsKeep',
  'q9.otherRelief', 'q9.otherRelief.text', 'q9.parentingTime', 'q9.supervised', 'q9.denyParenting', 'q9.attorneyFees', 'q9.rent',
  'q9.mortgage', 'q9.childSupport', 'q9.maintenance', 'q9.reimburse', 'q9.noFirearms', 'q9.surrender', 'q9.phones',
];
const REIMBURSE = ['medical', 'counseling', 'shelter', 'property', 'other'];

/** Values for the adult petition (PO-0100). */
export function po0100Values(input: PacketInput): FormValues {
  const a = shownAnswers(input);
  const values: StampValues = { ...caption(a) };
  const attachments: Attachment[] = [];
  const continuable: FormValues['continuable'] = {};

  // Question 1: every ground she checked.
  for (const [box, ground] of Object.entries(PO0100_GROUNDS)) values[`q1.${box}`] = input.grounds.includes(ground);

  // Question 2: the one line that best applies.
  if (input.relationship && HOUSEHOLD.includes(input.relationship)) values[`q2.${input.relationship}`] = true;
  values['q2.blood-adoption.detail'] = text(a['q2.blood-adoption.detail']);
  values['q2.marriage.detail'] = text(a['q2.marriage.detail']);
  if (input.relationship === 'none') {
    const pick = text(a['q2.nonFamily']);
    values['q2.b'] = pick === 'stalking';
    values['q2.c'] = pick === 'sex-offense';
    values['q2.d'] = pick === 'harassment';
  }
  if (a['q2.offender.lifetime'] === 'yes') {
    values['q2.offender'] = true;
    values['q2.offender.cause'] = text(a['q2.offender.cause']);
    values['q2.offender.court'] = text(a['q2.offender.court']);
    values['q2.offender.state'] = text(a['q2.offender.state']);
    values['q2.offender.date'] = courtDate(text(a['q2.offender.date']));
  }

  values.q3 = text(a.q3);

  // Question 4: 5 cases fit; the rest go on Attachment 4a.
  const cases = rows(a['q4.cases']).filter((r) => Object.values(r).some((v) => v?.trim()));
  const { onForm, rest } = split(cases, 5);
  values['q4.rows'] = onForm.map((r) => [r.caseName ?? '', r.caseNumber ?? '', r.countyState ?? '']);
  if (rest.length > 0) {
    values['q4.continued'] = true;
    attachments.push({
      label: '4a',
      form: 'PO-0100',
      blocks: rest.map((r, i) => ({
        heading: `Case ${i + 6}`,
        text: [`Case name: ${r.caseName ?? ''}`, `Case number: ${r.caseNumber ?? ''}`, `County & State: ${r.countyState ?? ''}`].join('\n'),
      })),
    });
  }
  values['q4.school'] = text(a['q4.school']);
  continuable['q4.school'] = { label: '4a', heading: 'School and school corporation (question 4)' };

  const q5 = Array.isArray(a.q5) ? (a.q5 as string[]) : [];
  for (const box of ['a', 'b', 'c']) values[`q5.${box}`] = q5.includes(box);
  values.q6 = text(a.q6);
  continuable.q6 = { label: '6', heading: 'Public mailing address (question 6)' };

  // Question 7: every act checked on any incident, in the form's order.
  const acts = new Set<Act>(input.incidents.flatMap((incident) => incident.acts));
  for (const act of ACTS) values[`q7.${act}`] = acts.has(act);

  // Question 8: 3 incidents fit; the rest go on Attachment 8a.
  const incidentBlocks: AttachmentBlock[] = [];
  input.incidents.forEach((incident, index) => {
    const n = index + 1;
    if (n <= 3) {
      values[`q8.${n}.date`] = incidentDate(incident);
      values[`q8.${n}.place`] = incident.place.trim();
      values[`q8.${n}.description`] = incident.description.trim();
      values[`q8.${n}.present`] = incident.present.trim();
      continuable[`q8.${n}.place`] = { label: '8a', heading: `Incident #${n}: place (continued)` };
      continuable[`q8.${n}.description`] = { label: '8a', heading: `Incident #${n}: description (continued)` };
      continuable[`q8.${n}.present`] = { label: '8a', heading: `Incident #${n}: people present (continued)` };
      return;
    }
    incidentBlocks.push({
      heading: `Incident #${n}`,
      text: [
        `Date of Incident #${n}: ${incidentDate(incident)}`,
        `Place of Incident: ${incident.place.trim()}`,
        `Description of Incident:\n${incident.description.trim()}`,
        `People present during the incident: ${incident.present.trim()}`,
      ].join('\n'),
    });
  });
  if (incidentBlocks.length > 0) {
    values['q8.continued'] = true;
    attachments.push({ label: '8a', form: 'PO-0100', blocks: incidentBlocks });
  }

  // Question 9.
  for (const id of Q9_COPIED) {
    const value = a[id];
    values[id] = typeof value === 'boolean' ? value : text(value);
  }
  for (const id of ['q9.protectFamily.names', 'q9.familyPlaces.places', 'q9.owners', 'q9.possession.items.description', 'q9.otherRelief.text', 'q9.possession.vehicle.description', 'q9.evict.address', 'q9.stayAway.address']) {
    continuable[id] = { label: '9', heading: `Question 9 (continued)` };
  }
  for (const kind of REIMBURSE) {
    const amount = text(a[`q9.reimburse.${kind}.amount`]);
    values[`q9.reimburse.${kind}`] = Boolean(amount);
    values[`q9.reimburse.${kind}.amount`] = amount.replace(/^\$\s*/, '');
  }

  const animalBlocks: AttachmentBlock[] = [];
  for (const [list, title] of [['animalsProtect', 'Animals the Respondent must not harm or take'], ['animalsKeep', 'Animals in my care and custody']] as const) {
    const animals = rows(a[`q9.${list}.animals`]);
    animals.slice(0, 2).forEach((animal, i) => {
      for (const part of ['name', 'ageType', 'sizeBreed', 'description']) values[`q9.${list}.${i + 1}.${part}`] = animal[part] ?? '';
    });
    animals.slice(2).forEach((animal, i) =>
      animalBlocks.push({
        heading: `${title}: Animal ${i + 3}`,
        text: [`Name: ${animal.name ?? ''}`, `Age/Type: ${animal.ageType ?? ''}`, `Size/Breed: ${animal.sizeBreed ?? ''}`, `Color/Description: ${animal.description ?? ''}`].join('\n'),
      }),
    );
  }
  if (animalBlocks.length > 0) attachments.push({ label: '9(a)', form: 'PO-0100', blocks: animalBlocks });

  const weapons = rows(a['q9.surrender.items']).map((r) => (r.item ?? '').trim()).filter(Boolean);
  values['q9.surrender.items'] = weapons.slice(0, 6).join('\n');
  if (weapons.length > 6) {
    values['q9.surrender.continued'] = true;
    attachments.push({ label: '9(b)', form: 'PO-0100', blocks: [{ heading: 'Firearms, ammunition, or deadly weapons (continued)', text: weapons.slice(6).join('\n') }] });
  }

  const phones = rows(a['q9.phones.numbers']);
  phones.slice(0, 2).forEach((p, i) => {
    for (const part of ['numberUser', 'provider', 'holder']) values[`q9.phones.${i + 1}.${part}`] = p[part] ?? '';
  });
  if (phones.length > 2) {
    attachments.push({
      label: '9(c)',
      form: 'PO-0100',
      blocks: phones.slice(2).map((p, i) => ({
        heading: `Telephone number ${i + 3}`,
        text: [`Telephone Number and User: ${p.numberUser ?? ''}`, `Wireless Service Provider: ${p.provider ?? ''}`, `Current Account Holder: ${p.holder ?? ''}`].join('\n'),
      })),
    });
  }

  values['affirm.a'] = a.affirm === 'a';
  values['affirm.b'] = a.affirm === 'b';
  values.printedName = fullName(a, 'petitioner');
  // Question 10 (pages attached) is filled in by the packet, once the attachments are laid out.
  return { values, continuable, attachments };
}

/** Values for the Confidential Form (PO-0104). */
export function po0104Values(input: PacketInput): FormValues {
  const a = shownAnswers(input);
  const { 'caption.court': _court, ...cap } = caption(a);
  void _court;
  const values: StampValues = { ...cap };
  const attachments: Attachment[] = [];
  const continuable: FormValues['continuable'] = {};

  for (const id of [
    'restrained.email', 'restrained.homeAddress', 'restrained.postalAddress', 'restrained.business', 'restrained.race', 'restrained.hair',
    'restrained.eyes', 'restrained.height', 'restrained.weight', 'restrained.scars.description', 'restrained.ssn', 'petitioner.homeAddress',
    'petitioner.postalAddress', 'petitioner.ssn', 'petitioner.race', 'petitioner.email', 'petitioner.reachWhen', 'petitioner.otherAddress',
    'petitioner.acpAddress', 'petitioner.sendTo',
  ]) {
    values[id] = text(a[id]);
  }
  for (const id of ['restrained.homeAddress', 'restrained.postalAddress', 'restrained.business', 'restrained.scars.description', 'petitioner.homeAddress', 'petitioner.postalAddress', 'petitioner.acpAddress', 'petitioner.sendTo', 'petitioner.otherAddress', 'petitioner.reachWhen']) {
    continuable[id] = { label: 'to Confidential Form', heading: 'Confidential Form (continued)' };
  }
  values['restrained.name'] = fullName(a, 'respondent');
  // On a workplace violence case the employer is the plaintiff and the employee has a line of their own.
  if (text(a['plaintiff.name'])) {
    values['caption.petitioner'] = text(a['plaintiff.name']);
    values['caption.employee'] = text(a['employee.name']);
  }
  values['restrained.dob'] = courtDate(text(a['restrained.dob']));
  values['petitioner.dob'] = courtDate(text(a['petitioner.dob']));

  for (const who of ['restrained', 'petitioner'] as const) {
    for (const kind of ['home', 'work', 'cell', 'fax']) {
      const { area, number } = phone(text(a[`${who}.phone.${kind}`]));
      values[`${who}.phone.${kind}.area`] = area;
      values[`${who}.phone.${kind}.number`] = number;
    }
    values[`${who}.sex.male`] = a[`${who}.sex`] === 'male';
    values[`${who}.sex.female`] = a[`${who}.sex`] === 'female';
  }
  values['restrained.scars.yes'] = a['restrained.scars'] === 'yes';
  values['restrained.scars.no'] = a['restrained.scars'] === 'no';
  values['notify.yes'] = a.notify === 'yes';
  values['notify.no'] = a.notify === 'no';
  values['notify.email'] = a['notify.method'] === 'email';
  values['notify.text'] = a['notify.method'] === 'text';

  const people = (id: string, max: number, keyPrefix: string, title: string, parts: [string, string][]) => {
    const list = rows(a[id]).filter((r) => Object.values(r).some((v) => v?.trim()));
    list.slice(0, max).forEach((person, i) => {
      for (const [part] of parts) {
        if (part === 'sex') {
          values[`${keyPrefix}.${i + 1}.sex.male`] = person.sex === 'male';
          values[`${keyPrefix}.${i + 1}.sex.female`] = person.sex === 'female';
        } else {
          values[`${keyPrefix}.${i + 1}.${part}`] = part === 'dob' ? courtDate(person[part] ?? '') : (person[part] ?? '');
        }
      }
    });
    if (list.length > max) {
      attachments.push({
        label: 'to Confidential Form',
        form: 'PO-0104',
        blocks: list.slice(max).map((person, i) => ({
          heading: `${title} ${max + i + 1}`,
          text: parts.map(([part, label]) => `${label}: ${part === 'dob' ? courtDate(person[part] ?? '') : person[part] ?? ''}`).join('\n'),
        })),
      });
    }
  };
  people('household', 6, 'household', 'Person living in the household who is not protected', [['name', 'Name'], ['age', 'Age'], ['sex', 'Sex'], ['race', 'Race']]);
  people('protected', 3, 'protected', 'Other protected party', [['name', 'Name'], ['age', 'Age'], ['dob', 'Date of Birth'], ['sex', 'Sex'], ['race', 'Race']]);

  return { values, continuable, attachments };
}

/** Values for the Notice of Exclusion of Confidential Information (PNW-0102). */
export function pnw0102Values(input: PacketInput): FormValues {
  const a = shownAnswers(input);
  const employer = text(a['plaintiff.name']);
  const party = employer ? 'Plaintiff' : 'Petitioner';
  return {
    values: {
      ...caption(a),
      ...(employer && { 'caption.petitioner': employer }),
      filedWithClerk: true,
      'text.filingOrTender': 'filing',
      'text.partyName1': party,
      'text.filedOrTendered': 'filed',
      'text.partyName2': `${party},`,
      'text.insertName': text(a['signer.name']) || fullName(a, 'petitioner'),
    },
    continuable: {},
    attachments: [],
  };
}

const CHILD_HOUSEHOLD: Relationship[] = [
  'spouse-lived', 'lived-together', 'parent', 'dating', 'sexual', 'child-in-common', 'blood-adoption', 'marriage',
  'guardian', 'custodian', 'foster-parent', 'minor-child-of',
];

/**
 * Values for the petition filed on behalf of a child (PO-0101). Its questions
 * match PO-0100's except the caption, question 1 (the filer's role), the
 * relationship lines, the non-family choices, question 5d, the grooming act,
 * and the signature (the child's printed name).
 */
export function po0101Values(input: PacketInput): FormValues {
  const built = po0100Values(input);
  const a = shownAnswers(input);
  const values: StampValues = {};
  // Copy everything that means the same on both forms; the adult-only keys
  // are left out, so nothing from PO-0100's layout leaks onto PO-0101.
  for (const [key, value] of Object.entries(built.values)) {
    if (/^(caption\.petitioner|q1\.|q2\.|q7\.|printedName)/.test(key) && !key.startsWith('q2.offender') && !/^q2\.(blood-adoption|marriage)\.detail$/.test(key)) continue;
    values[key] = value;
  }
  values['caption.child'] = fullName(a, 'child');
  values['caption.nextFriend'] = fullName(a, 'petitioner');

  const role = input.childRole ?? '';
  values['q1.parent'] = role === 'parent';
  values['q1.guardian'] = role === 'guardian';
  values['q1.other'] = role === 'other';
  values['q1.other.detail'] = role === 'other' ? text(a['q1.other.detail']) : '';

  if (input.relationship && CHILD_HOUSEHOLD.includes(input.relationship)) values[`q2.${input.relationship}`] = true;
  if (input.relationship === 'none') {
    const pick = text(a['q2.nonFamily']);
    for (const kind of ['stalking', 'sex-offense', 'sex-grooming', 'harassment']) values[`q2.nf.${kind}`] = pick === kind;
  }

  const q5 = Array.isArray(a.q5) ? (a.q5 as string[]) : [];
  values['q5.d'] = q5.includes('d');

  const acts = new Set<Act>(input.incidents.flatMap((incident) => incident.acts));
  for (const act of CHILD_ACTS) values[`q7.${act}`] = acts.has(act);

  values.printedName = fullName(a, 'child');
  // The attachments belong to the child's petition, not the adult one.
  const attachments = built.attachments.map((attachment) => ({ ...attachment, form: 'PO-0101' }));
  return { ...built, values, attachments };
}

// ---------------------------------------------------------------------------
// Forms filed in a case that already exists (PO-0107 to PO-0128). Their
// questionnaires use the map keys as field ids, so one builder fills them all;
// a few need a small adjustment after it.

const fieldIndex = (q: Questionnaire) => new Map<string, Field>(q.sections.flatMap((s) => s.fields.map((f) => [f.id, f])));

/** The case heading, for a case that already has a number. */
function existingCaption(a: Answers): StampValues {
  return {
    ...caption(a),
    'caption.division': text(a['court.division']),
    'caption.room': text(a['court.room']),
    'caption.caseNumber': text(a['case.number']),
  };
}

// The forms' own "Continued on Attachment ..." boxes: the answer (or group)
// that continues, the attachment the form names, and the box to check.
const CONTINUED: Record<string, Record<string, { label: string; box: string }>> = {
  'WV-0101': {
    'conduct.description': { label: '5b', box: 'conduct.continued' },
    'harm.text': { label: '6', box: 'harm.continued' },
    household: { label: '8a', box: 'household.continued' },
  },
  'WV-0102': { household: { label: '5c', box: 'household.continued' } },
  'WV-0104': { 'statement.text': { label: '5b', box: 'statement.continued' } },
  'WV-0107': {
    change: { label: '3a', box: 'change.continued' },
    household: { label: '8a', box: 'household.continued' },
  },
};

/**
 * Answers that belong only on a confidential form in the packet (like the
 * Confidential Form's household list). They never go on a public form, even
 * when a public form has a blank with the same name.
 */
function confidentialOnly(q: Questionnaire, form: string): Set<string> {
  const confidential = new Set(q.packet.filter((p) => p.confidential && p.form !== form).map((p) => p.form));
  return new Set(q.sections.filter((s) => confidential.has(s.form)).flatMap((s) => s.fields.map((f) => f.id)));
}

/** Only the case heading, for a form someone else completes. */
export function captionValues(form: string, input: PacketInput): FormValues {
  const a = shownAnswers(input);
  const values: StampValues = form.startsWith('WV-') ? { ...existingCaption(a), ...wvCaption(a) } : existingCaption(a);
  return { values, continuable: {}, attachments: [] };
}

/** Values copied straight from the answers, by field id, for any form. */
export function genericValues(form: string, input: PacketInput): FormValues {
  const a = shownAnswers(input);
  const fields = fieldIndex(input.questionnaire);
  const skip = confidentialOnly(input.questionnaire, form);
  const values: StampValues = { ...existingCaption(a) };
  const attachments: Attachment[] = [];
  const continuable: FormValues['continuable'] = {};

  for (const [id, value] of Object.entries(a)) {
    if (skip.has(id)) continue;
    // A fixed answer has no field; text fills the map key "<id>.<value>",
    // and true checks the box "<id>".
    const field =
      fields.get(id) ??
      (typeof value === 'string' ? ({ id, type: 'choice', label: id } as Field) : typeof value === 'boolean' ? ({ id, type: 'checkbox', label: id } as Field) : undefined);
    if (!field) continue;
    switch (field.type) {
      case 'checkbox':
        values[id] = value === true;
        break;
      case 'date':
        values[id] = courtDate(text(value));
        break;
      case 'yesno':
      case 'choice':
        values[id] = text(value);
        values[`${id}.${text(value)}`] = true;
        break;
      case 'multi':
        for (const picked of Array.isArray(value) ? (value as string[]) : []) values[`${field.mapAs ?? id}.${picked}`] = true;
        break;
      case 'group': {
        const prefix = field.mapAs ?? id;
        // A list this form has no lines for doesn't go on it, or on an attachment to it.
        if (!hasKey(form, prefix)) break;
        const continued = CONTINUED[form]?.[prefix];
        const items = rows(value).filter((r) => Object.values(r).some((v) => v?.trim()));
        const max = field.max ?? items.length;
        const line = (item: Record<string, string>) =>
          field.fields!.map((sub) => (sub.type === 'date' ? courtDate(item[sub.id] ?? '') : (item[sub.id] ?? '').trim())).filter(Boolean).join(', ');
        if (field.table) {
          values[field.mapAs ?? id] = items.slice(0, max).map((item) => field.fields!.map((sub) => (item[sub.id] ?? '').trim()));
        } else if (field.join) {
          values[field.mapAs ?? id] = items.slice(0, max).map(line).join('\n');
        } else {
          items.slice(0, max).forEach((item, i) => {
            for (const sub of field.fields!) {
              const key = `${field.mapAs ?? id}.${i + 1}.${sub.id}`;
              values[key] = sub.type === 'date' ? courtDate(item[sub.id] ?? '') : (item[sub.id] ?? '');
              // A choice in a row also checks its box, like "household.1.sex.male".
              if (sub.type === 'choice' && item[sub.id]) values[`${key}.${item[sub.id]}`] = true;
            }
          });
        }
        // Which list an item belongs to, on the attachment: PO-0115 has two
        // lists of animals, so "The animals" alone can't say which.
        const listName = field.overflowHeading ?? field.label;
        const label = continued?.label ?? field.overflow ?? field.label;
        if (!field.table && !field.join) {
          // A long answer in one item's blank continues on the list's attachment.
          items.slice(0, max).forEach((_, i) => {
            for (const sub of field.fields!) {
              continuable[`${prefix}.${i + 1}.${sub.id}`] = { label, heading: `${listName}: ${fill(field.itemLabel ?? '{n}', { n: i + 1 })}, ${sub.label} (continued)`, box: continued?.box };
            }
          });
        }
        if (items.length > max) {
          if (continued) values[continued.box] = true;
          // A form with no "Continued on Attachment" box of its own for the list
          // (like PO-0119's children) gets a note by the list instead.
          else if (pdfMap(form).fields.some((f) => f.key === `${prefix}.continued` && f.kind === 'text')) values[`${prefix}.continued`] = `(more listed on Attachment ${label})`;
          // Lists that share an attachment (like both animal lists on PO-0115's
          // "attached document") go on one attachment, not one each.
          let attachment = attachments.find((a) => a.label === label && a.form === form);
          if (!attachment) {
            attachment = { label, form, blocks: [] };
            attachments.push(attachment);
          }
          attachment.blocks.push(
            ...items.slice(max).map((item, i) => ({
              heading: `${listName}: ${fill(field.itemLabel ?? '{n}', { n: max + i + 1 })}`,
              text: field.fields!.map((sub) => `${sub.label}: ${sub.type === 'date' ? courtDate(item[sub.id] ?? '') : (item[sub.id] ?? '')}`).join('\n'),
            })),
          );
        }
        break;
      }
      default:
        values[id] = text(value);
    }
  }

  // An amount typed for an expense also checks that expense's box.
  for (const [id, value] of Object.entries(values)) {
    const m = /^(.*)\.amount$/.exec(id);
    if (m && typeof value === 'string') {
      // Only ever checks: a blank amount leaves a box she checked alone.
      if (value) values[m[1]] = true;
      values[id] = value.replace(/^\$\s*/, '');
    }
  }

  const signer = input.questionnaire.filer === 'respondent' ? 'respondent' : 'petitioner';
  // For an employer, a person signs for the business and gives their title.
  values.printedName = text(a['signer.name']) || fullName(a, signer);

  // Long free text goes on an attachment rather than being cut off.
  for (const [id, field] of fields) {
    if (field.type !== 'textarea' || skip.has(id)) continue;
    const own = CONTINUED[form]?.[id];
    continuable[id] = { label: own?.label ?? `to ${form}`, heading: `${field.label} (continued)`, box: own?.box };
  }
  return { values, continuable, attachments };
}


/** "2026-03-14" as day, month name and the year's last digits, for "the ___ day of ______, 20__". */
function dateParts(value: string): { day: string; month: string; year: string } {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return { day: '', month: value.trim(), year: '' };
  const month = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(m[2]) - 1];
  return { day: String(Number(m[3])), month, year: m[1].slice(2) };
}

/** PO-0107: strike through the order type and the filer that do not apply. */
export function po0107Values(input: PacketInput): FormValues {
  const built = genericValues('PO-0107', input);
  const v = built.values;
  const type = v['order.type'];
  v['strike.exParte'] = type === 'modification';
  v['strike.modification.1'] = type === 'exParte';
  v['strike.modification.2'] = type === 'exParte';
  const respondentFiles = input.questionnaire.filer === 'respondent';
  v['strike.petitioner'] = respondentFiles;
  v['strike.title.petitioner'] = respondentFiles;
  v['strike.respondent'] = !respondentFiles;
  v['strike.title.respondent'] = !respondentFiles;
  return built;
}

/** PO-0116: dates written as "the ___ day of ______, 20__". */
export function po0116Values(input: PacketInput): FormValues {
  const built = genericValues('PO-0116', input);
  const a = shownAnswers(input);
  for (const [field, prefix] of [['issued', 'issued'], ['violated.date', 'violated']] as const) {
    const { day, month, year } = dateParts(text(a[field]));
    Object.assign(built.values, { [`${prefix}.day`]: day, [`${prefix}.month`]: month, [`${prefix}.year`]: year });
  }
  return built;
}

/** PO-0119: only the section that applies is filled; its Yes/No answers check their blanks. */
export function po0119Values(input: PacketInput): FormValues {
  const built = genericValues('PO-0119', input);
  const name = fullName(shownAnswers(input), 'petitioner');
  const section = built.values.section;
  if (section === 'a') built.values['a.name'] = name;
  if (section === 'b') built.values['b.name'] = name;
  // A new registration gets its case number from the clerk.
  built.values['caption.caseNumber'] = section === 'b' ? built.values['caption.caseNumber'] : '';
  return built;
}

/** PO-0128 is the court's order; only its heading and the respondent's address are filled. */
export function po0128Values(input: PacketInput): FormValues {
  const a = shownAnswers(input);
  return { values: { ...existingCaption(a), 'respondent.address': text(a['respondent.address']) }, continuable: {}, attachments: [] };
}

// ---------------------------------------------------------------------------
// Workplace violence forms (WV-0101 to WV-0107). The employer is the
// Plaintiff and files on behalf of an employee; the other person is the
// Defendant.

/** The workplace violence caption: Plaintiff, Defendant, and Employee. */
function wvCaption(a: Answers): StampValues {
  return {
    'caption.plaintiff': text(a['plaintiff.name']),
    'caption.defendant': fullName(a, 'respondent'),
    'caption.employee': text(a['employee.name']),
  };
}

/** Values for any workplace violence form: the generic ones, plus the caption and boxes the answers imply. */
export function wvValues(form: string, input: PacketInput): FormValues {
  const built = genericValues(form, input);
  const a = shownAnswers(input);
  const v = built.values;
  Object.assign(v, wvCaption(a));
  const defendant = fullName(a, 'respondent');
  v['def.name'] = defendant;
  v['def.name.order'] = defendant;
  // The certification box is checked when any way of giving notice is.
  v['notice.certify'] = ['oralDefendant', 'writtenDefendant', 'oralAttorney', 'writtenAttorney', 'goodFaith', 'notRequired'].some((k) => v[`notice.${k}`] === true);
  v['costs.pay'] = v.costs === true;
  v.statement = Boolean(text(a['statement.text']));
  // Household members are protected only when listed; WV-0102 and WV-0107
  // also name them in the stay-away order.
  const household = (Array.isArray(a.protectedHousehold) ? (a.protectedHousehold as Record<string, string>[]) : []).map((r) => (r.name ?? '').trim()).filter(Boolean);
  v.household = household.length > 0;
  if (household.length > 0) v['stayAway.others.names'] = [text(a['employee.name']), ...household].filter(Boolean).join(', ');
  // The defendant's own Response: the "party without attorney" block asks
  // for a name as well as an address.
  if (form === 'WV-0104' && input.questionnaire.filer === 'respondent') {
    v['filer.contact'] = [defendant, text(a['filer.contact'])].filter(Boolean).join('\n');
  }
  // No filing fee for a petition about violence or threats (WV-0101 paragraph 18).
  if (form === 'WV-0101') v.fee = true;
  return built;
}
