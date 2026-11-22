import { ACTS, type Act, type Ground, type Relationship } from '../checker';
import { holds, type Answer, type Answers, type EarlierAnswers, type Field, type Questionnaire } from '../forms/questionnaire';
import type { Incident } from '../organizer';
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
  continuable: Record<string, { label: string; heading: string }>;
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

export function fullName(answers: Answers, who: 'petitioner' | 'respondent'): string {
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
  const earlier: EarlierAnswers = { relationship: input.relationship, convicted: input.convicted, grounds: input.grounds };
  const fields = new Map<string, Field>(input.questionnaire.sections.flatMap((s) => s.fields.map((f) => [f.id, f])));
  const shown: Answers = {};
  // A field can depend on another hidden one, so repeat until nothing changes.
  let changed = true;
  const current = { ...input.answers };
  while (changed) {
    changed = false;
    for (const [id, value] of Object.entries(current)) {
      const field = fields.get(id);
      if (field && !holds(field.showIf, current, earlier)) {
        delete current[id];
        changed = true;
      }
      void value;
    }
  }
  for (const [id, value] of Object.entries(current)) if (fields.has(id)) shown[id] = value;
  return shown;
}

/** A phone number split for the form's "(___) ______" blanks. */
function phone(value: string): { area: string; number: string } {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 10) return { area: digits.slice(0, 3), number: `${digits.slice(3, 6)}-${digits.slice(6)}` };
  if (digits.length === 11 && digits.startsWith('1')) return { area: digits.slice(1, 4), number: `${digits.slice(4, 7)}-${digits.slice(7)}` };
  return { area: '', number: value.trim() };
}

function caption(answers: Answers): StampValues {
  return {
    'caption.court': text(answers['court.name']),
    'caption.county': text(answers['court.county']),
    'caption.petitioner': fullName(answers, 'petitioner'),
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
  return {
    values: {
      ...caption(a),
      filedWithClerk: true,
      'text.filingOrTender': 'filing',
      'text.partyName1': 'Petitioner',
      'text.filedOrTendered': 'filed',
      'text.partyName2': 'Petitioner,',
      'text.insertName': fullName(a, 'petitioner'),
    },
    continuable: {},
    attachments: [],
  };
}
