// Turns desk-sample.json into petitions Desk can show. In production, the
// incidents would come from ReadyFile, or from running ReadyFile's
// ManualExtractor on the filed text. For v1, the sample file stores them.
import sampleJson from '../../content/desk-sample.json';
import { CASE_TYPES, runChecks, type CaseType, type CheckDate, type Finding } from '../checker';
import { HOW_OPTIONS, type HowItHappened } from '../organizer/incident';
import { deskConfig } from './config';
import { deskRules } from './content';
import { sortDate } from './dateOrder';
import { linesFor, locateAll, uncoveredParts, wrapNarrative, type NumberedLine } from './lineWrap';
import { parseClockTime, parseDateTime } from './time';

export type VersionKind = 'original' | 'amended';

export type CallTimes = { anyTime: true } | { anyTime: false; days: string; from: number; to: number };

export interface Contact {
  // Only ever a fictional 555-01xx number from the sample file.
  phone: string | null;
  textsOk: boolean;
  voicemailOk: boolean;
  calls: CallTimes | null;
}

export interface DeskIncident {
  id: string;
  // Its place in the petition as filed, from 1.
  position: number;
  date: CheckDate;
  // Her words, exactly as filed.
  description: string;
  how: HowItHappened;
  start: number;
  end: number;
  firstLine: number;
  lastLine: number;
  sortDate: number | null;
}

/** Words in the narrative that aren't part of any incident. */
export interface Statement {
  text: string;
  firstLine: number;
  lastLine: number;
}

export interface PetitionVersion {
  kind: VersionKind;
  filedAt: number;
  narrative: string;
  lines: NumberedLine[];
  incidents: DeskIncident[];
  statements: Statement[];
  findings: Finding[];
}

export interface Person {
  firstName: string;
  lastName: string;
}

export interface Petition {
  id: string;
  caseNumber: string;
  caseType: CaseType;
  petitioner: Person;
  respondent: Person & { relationship: string; dateOfBirth: string; address?: string };
  contact: Contact;
  original: PetitionVersion;
  // Filed later through the text link. In v1, only the demo control adds it.
  amendment: PetitionVersion | null;
}

type Raw = Record<string, unknown>;

function isRecord(value: unknown): value is Raw {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function problem(where: string, text: string): never {
  throw new Error(`desk-sample.json: ${where}: ${text}`);
}

function text(raw: Raw, key: string, where: string): string {
  if (typeof raw[key] !== 'string') problem(where, `"${key}" must be text.`);
  return raw[key] as string;
}

function flag(raw: Raw, key: string, where: string): boolean {
  if (typeof raw[key] !== 'boolean') problem(where, `"${key}" must be true or false.`);
  return raw[key] as boolean;
}

function record(raw: Raw, key: string, where: string): Raw {
  if (!isRecord(raw[key])) problem(where, `"${key}" must be an object.`);
  return raw[key] as Raw;
}

function readDate(raw: unknown, where: string): CheckDate {
  if (!isRecord(raw)) problem(where, '"date" must be an object.');
  if (raw.kind === 'unknown') return { kind: 'unknown' };
  if (raw.kind === 'exact') return { kind: 'exact', value: text(raw, 'value', where) };
  if (raw.kind === 'approximate') return { kind: 'approximate', text: text(raw, 'text', where) };
  return problem(where, '"date.kind" must be exact, approximate, or unknown.');
}

function readCalls(raw: unknown, where: string): CallTimes | null {
  if (raw === null) return null;
  if (!isRecord(raw)) problem(where, '"calls" must be an object or null.');
  if (raw.anyTime === true) return { anyTime: true };
  const days = text(raw, 'days', where);
  if (!deskConfig.callDays[days]) problem(where, `"calls.days" "${days}" isn't listed in desk-config.json callDays.`);
  return { anyTime: false, days, from: parseClockTime(text(raw, 'from', where)), to: parseClockTime(text(raw, 'to', where)) };
}

// What a version needs from its petition.
interface VersionContext {
  id: string;
  caseType: CaseType;
  dateOfBirth: string;
}

function readVersion(raw: unknown, kind: VersionKind, input: VersionContext, where: string): PetitionVersion {
  if (!isRecord(raw)) problem(where, `"${kind}" must be an object.`);
  const filedAt = parseDateTime(text(raw, 'filedAt', where));
  const narrative = text(raw, 'narrative', where).replace(/\r\n/g, '\n');
  const lines = wrapNarrative(narrative, deskConfig.lineWidth);

  if (!Array.isArray(raw.incidents)) problem(where, '"incidents" must be a list.');
  const incidentsRaw = raw.incidents.map((item, i) => {
    if (!isRecord(item)) problem(`${where}, incident ${i + 1}`, 'each incident must be an object.');
    return item;
  });
  const descriptions = incidentsRaw.map((item, i) => text(item, 'description', `${where}, incident ${i + 1}`));
  const ranges = locateAll(narrative, descriptions);

  const incidents = incidentsRaw.map((item, i): DeskIncident => {
    const at = `${where}, incident ${i + 1}`;
    const range = ranges[i];
    // Ground rule 3: Desk never changes her words, so every incident must be
    // in the narrative word for word.
    if (!range) problem(at, 'the description must appear word for word in the narrative, in order.');
    const how = item.how as HowItHappened;
    if (!HOW_OPTIONS.includes(how)) problem(at, `"how" must be one of: ${HOW_OPTIONS.join(', ')}.`);
    const date = readDate(item.date, at);
    const { first, last } = linesFor(lines, range);
    return {
      id: `${input.id}-${kind}-${i + 1}`,
      position: i + 1,
      date,
      description: descriptions[i],
      how,
      start: range.start,
      end: range.end,
      firstLine: first,
      lastLine: last,
      sortDate: sortDate(date, filedAt),
    };
  });

  const statements = uncoveredParts(narrative, lines, incidents).map((range): Statement => {
    const { first, last } = linesFor(lines, range);
    return { text: narrative.slice(range.start, range.end), firstLine: first, lastLine: last };
  });

  // Desk checks each petition when it arrives, the same way ReadyFile checks
  // hers, plus the respondent details that the court form has.
  const findings = deskConfig.checkedCaseTypes.includes(input.caseType)
    ? runChecks(
        {
          caseType: input.caseType,
          incidents: incidents.map(({ id, date, description }) => ({ id, date, description })),
          respondent: { dateOfBirth: input.dateOfBirth },
        },
        deskRules,
      )
    : [];

  return { kind, filedAt, narrative, lines, incidents, statements, findings };
}

function readPerson(raw: Raw, where: string): Person {
  return { firstName: text(raw, 'firstName', where), lastName: text(raw, 'lastName', where) };
}

export function loadPetitions(raw: unknown): Petition[] {
  if (!isRecord(raw) || !Array.isArray(raw.petitions)) throw new Error('desk-sample.json: "petitions" must be a list.');
  const seen = new Set<string>();

  return raw.petitions.map((item, index): Petition => {
    if (!isRecord(item)) problem(`petition ${index + 1}`, 'each petition must be an object.');
    const id = text(item, 'id', `petition ${index + 1}`);
    const where = `petition "${id}"`;
    if (seen.has(id)) problem(where, 'id is used by more than one petition.');
    seen.add(id);

    const caseType = item.caseType as CaseType;
    if (!CASE_TYPES.includes(caseType)) problem(where, `"caseType" must be one of: ${CASE_TYPES.join(', ')}.`);

    const respondentRaw = record(item, 'respondent', where);
    const respondent = {
      ...readPerson(respondentRaw, `${where}, respondent`),
      relationship: text(respondentRaw, 'relationship', `${where}, respondent`),
      dateOfBirth: text(respondentRaw, 'dateOfBirth', `${where}, respondent`),
      address: typeof respondentRaw.address === 'string' ? respondentRaw.address : undefined,
    };

    const contactRaw = record(item, 'contact', where);
    const phone = contactRaw.phone;
    if (phone !== null && typeof phone !== 'string') problem(where, '"contact.phone" must be text or null.');
    const contact: Contact = {
      phone,
      textsOk: flag(contactRaw, 'textsOk', `${where}, contact`),
      voicemailOk: flag(contactRaw, 'voicemailOk', `${where}, contact`),
      calls: readCalls(contactRaw.calls, `${where}, contact`),
    };

    const base = { id, caseType, dateOfBirth: respondent.dateOfBirth };
    return {
      id,
      caseNumber: text(item, 'caseNumber', where),
      caseType,
      petitioner: readPerson(record(item, 'petitioner', where), `${where}, petitioner`),
      respondent,
      contact,
      original: readVersion(item.original, 'original', base, `${where}, original`),
      amendment:
        item.amendment === undefined ? null : readVersion(item.amendment, 'amended', base, `${where}, amendment`),
    };
  });
}

export const petitions: Petition[] = loadPetitions(sampleJson);

export function petitionById(id: string): Petition {
  const petition = petitions.find((p) => p.id === id);
  if (!petition) throw new Error(`No petition with id "${id}".`);
  return petition;
}

export const fullName = (person: Person) => `${person.firstName} ${person.lastName}`;

/** "L. M." */
export const initials = (person: Person) => `${person.firstName.charAt(0)}. ${person.lastName.charAt(0)}.`;

/** Masks a phone number: only the area code and the last two digits show, like "(260) •••-••41". */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return `(${digits.slice(0, 3)}) •••-••${digits.slice(8)}`;
  return phone.replace(/\d(?=(?:\D*\d){2})/g, '•');
}
