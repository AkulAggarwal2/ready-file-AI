// What Desk works out from a petition and its follow-up record. Nothing here
// changes the petitioner's words. It numbers them, sorts them, and runs the
// same checker ReadyFile uses.
import { runChecks, type ConditionType, type Finding, type Rule } from '../checker';
import { rules } from '../content';
import { deskConfig, deskCopy, plural, type CallResult, type Outcome, type PetitionVersion, type SamplePetition } from './content';
import { findLines, paragraphsOf, wrapNarrative, type LineRange, type NumberedLine } from './lines';
import { HOUR, MINUTE, parseTime } from './time';

export type VersionName = 'original' | 'amended';

export interface Hold {
  start: number;
  end: number;
  by: 'specialist' | 'magistrate';
  // Set when the hold ends early or runs out.
  endedAt?: number;
}

export interface LogEntry {
  at: number;
  text: string;
}

/** Everything staff did with one petition. Sample data never changes. */
export interface FollowUp {
  hold?: Hold;
  textedAt?: number;
  amendedAt?: number;
  outcome?: { choice: Outcome; reasons: string[]; at: number };
  log: LogEntry[];
}

export interface Petition {
  sample: SamplePetition;
  followUp: FollowUp;
}

export const filedAt = (p: Petition) => parseTime(p.sample.filedAt);

export function currentVersionName(p: Petition): VersionName {
  return p.followUp.amendedAt !== undefined && p.sample.amended ? 'amended' : 'original';
}

export function version(p: Petition, name: VersionName): PetitionVersion {
  return name === 'amended' && p.sample.amended ? p.sample.amended : p.sample.original;
}

// Sample versions never change, so each one's findings are worked out once.
const findingsCache = new WeakMap<PetitionVersion, Finding[]>();

/** The questions for one version. Case types not in checkedCaseTypes get none. */
export function findingsFor(sample: SamplePetition, v: PetitionVersion): Finding[] {
  const cached = findingsCache.get(v);
  if (cached) return cached;
  const findings = deskConfig.checkedCaseTypes.includes(sample.caseType)
    ? runChecks(
        {
          grounds: [sample.caseType],
          incidents: v.incidents.map((incident, i) => ({ id: `${sample.id}-${i + 1}`, ...incident })),
          respondent: { dateOfBirth: sample.respondent.dateOfBirth },
        },
        rules,
      )
    : [];
  findingsCache.set(v, findings);
  return findings;
}

// The conditions findingsFor can answer from what Desk passes the checker.
// Rules about anything else (threat, feeling, acts, today's date...) never
// ask on Desk, so the bench must not list them as if they were checked.
const DESK_CONDITIONS: ReadonlySet<ConditionType> = new Set<ConditionType>([
  'incidentCountBelow',
  'incidentWordsBelow',
  'incidentContactInfo',
  'incidentDateMissing',
  'incidentPlaceMissing',
  'incidentsOutOfOrder',
  'respondentDobBlank',
]);

/** The rules Desk checks for this petition's case type. */
export function deskRules(sample: SamplePetition): Rule[] {
  if (!deskConfig.checkedCaseTypes.includes(sample.caseType)) return [];
  return rules.filter(
    (rule) => rule.condition && DESK_CONDITIONS.has(rule.condition.type) && rule.grounds.includes(sample.caseType),
  );
}

export const currentFindings = (p: Petition) => findingsFor(p.sample, version(p, currentVersionName(p)));

/** How a finding reads to court staff. */
export function staffText(finding: Finding): string {
  if (finding.staffText === undefined) return plural(deskCopy.questions.fallback, { id: finding.ruleId });
  return plural(finding.staffText, finding.values ?? {});
}

export const ruleFor = (finding: Finding): Rule | undefined => rules.find((rule) => rule.id === finding.ruleId);

export const activeHold = (p: Petition) => (p.followUp.hold && p.followUp.hold.endedAt === undefined ? p.followUp.hold : undefined);
export const wasHeld = (p: Petition) => p.followUp.hold !== undefined;
export const inReview = (p: Petition) => !activeHold(p);
export const hasPhone = (p: Petition) => p.sample.contact.phone !== null;

/** When the petition joined (or came back to) the magistrate's queue. */
export function inQueueSince(p: Petition): number {
  return p.followUp.hold?.endedAt ?? filedAt(p);
}

export type Status =
  | { kind: 'notHeld' }
  | { kind: 'inQueue' }
  | { kind: 'held'; until: number }
  | { kind: 'asked'; until: number }
  | { kind: 'sent'; at: number };

export function status(p: Petition): Status {
  const hold = p.followUp.hold;
  if (hold && hold.endedAt === undefined) {
    return hold.by === 'magistrate' ? { kind: 'asked', until: hold.end } : { kind: 'held', until: hold.end };
  }
  if (hold?.endedAt !== undefined) return { kind: 'sent', at: hold.endedAt };
  return currentFindings(p).length > 0 && hasPhone(p) ? { kind: 'notHeld' } : { kind: 'inQueue' };
}

/** The end a hold would have if one started at `time`. */
export const holdEndFrom = (time: number) => time + deskConfig.holdHours * HOUR;

/** When the next staff action happens: each one moves the demo clock forward. */
export const nextActionTime = (now: number) => now + deskConfig.minutesPerAction * MINUTE;

export interface NumberedIncident {
  k: number;
  date: string;
  how: string;
  place: string;
  description: string;
  sortDate?: string;
  lines: LineRange | null;
}

export interface NumberedVersion {
  name: VersionName;
  narrative: string;
  lines: NumberedLine[];
  incidents: NumberedIncident[];
  // Paragraphs that aren't part of any incident.
  notTied: { text: string; lines: LineRange | null }[];
}

export function dateText(date: PetitionVersion['incidents'][number]['date']): string {
  if (date.kind === 'exact') return date.value;
  if (date.kind === 'approximate') return date.text;
  return deskCopy.filed.noDate;
}

export function numberVersion(p: Petition, name: VersionName): NumberedVersion {
  const v = version(p, name);
  const lines = wrapNarrative(v.narrative, deskConfig.lineWidth);
  return {
    name,
    narrative: v.narrative,
    lines,
    incidents: v.incidents.map((incident, i) => ({
      k: i + 1,
      date: dateText(incident.date),
      how: deskCopy.how[incident.how],
      place: incident.place?.trim() || deskCopy.filed.noPlace,
      description: incident.description,
      sortDate: incident.sortDate,
      lines: findLines(lines, v.narrative, incident.description),
    })),
    notTied: paragraphsOf(v.narrative)
      // Tied if it's part of an incident's text or holds one; only wholly untied paragraphs are shown again.
      .filter((paragraph) => !v.incidents.some((incident) => overlaps(incident.description.trim(), paragraph)))
      .map((text) => ({ text, lines: findLines(lines, v.narrative, text) })),
  };
}

const overlaps = (description: string, paragraph: string) =>
  description !== '' && (description.includes(paragraph) || paragraph.includes(description));

/** Date order by sortDate. Incidents without one go last; ties keep the filed order. */
export function inDateOrder(incidents: NumberedIncident[]): NumberedIncident[] {
  return incidents
    .map((incident, index) => ({ incident, index }))
    .sort((a, b) => {
      const x = a.incident.sortDate;
      const y = b.incident.sortDate;
      if (x && y && x !== y) return x.localeCompare(y);
      if (x && !y) return -1;
      if (!x && y) return 1;
      return a.index - b.index;
    })
    .map(({ incident }) => incident);
}

export function linesText(range: LineRange): string {
  return plural(deskCopy.filed.lines, { count: range.b - range.a + 1, a: range.a, b: range.b });
}

/** "L. M." */
export function initials(p: Petition): string {
  return `${p.sample.petitioner.first[0]}. ${p.sample.petitioner.last[0]}.`;
}

export const fullName = (p: Petition) => `${p.sample.petitioner.first} ${p.sample.petitioner.last}`;
export const respondentName = (p: Petition) => `${p.sample.respondent.first} ${p.sample.respondent.last}`;
export const caption = (p: Petition) =>
  plural(deskCopy.bench.caption, { petitioner: p.sample.petitioner.last, respondent: p.sample.respondent.last });

/** "(260) •••-••41": the area code and the last two digits stay. */
export function maskPhone(phone: string): string {
  const total = phone.replace(/\D/g, '').length;
  let seen = 0;
  return phone.replace(/\d/g, (digit) => {
    seen += 1;
    return seen <= 3 || seen > total - 2 ? digit : '•';
  });
}

/** Whether `time` falls inside one of the petitioner's call windows. */
export function inCallTimes(p: Petition, time: number): boolean {
  const calls = p.sample.contact.calls;
  if (!calls) return false;
  const d = new Date(time);
  const minutes = d.getHours() * 60 + d.getMinutes();
  const toMinutes = (clock: string) => {
    const [h, m] = clock.split(':').map(Number);
    return h * 60 + m;
  };
  return calls.windows.some(
    (w) => w.days.includes(d.getDay()) && minutes >= toMinutes(w.start) && minutes < toMinutes(w.end),
  );
}

export const callResultText = (result: CallResult) => deskCopy.contactPanel.callResults[result];
