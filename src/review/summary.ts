import { ACTS, type Act, type CaseType, type Relationship, type YesNoUnknown } from '../checker';
import { copy, fill } from '../content';
import type { Incident } from '../organizer';

const exactDate = (incident: Incident) =>
  incident.date.kind === 'exact' && incident.date.value ? incident.date.value : null;

/**
 * Splits incidents into those with an exact date (oldest to newest) and the
 * rest, which keep the order she gave, because "early March" cannot be placed
 * exactly.
 */
export function partitionByDate(incidents: Incident[]): { dated: Incident[]; undated: Incident[] } {
  const dated = incidents
    .filter((incident) => exactDate(incident))
    .sort((a, b) => exactDate(a)!.localeCompare(exactDate(b)!));
  const undated = incidents.filter((incident) => !exactDate(incident));
  return { dated, undated };
}

/** Exact-date incidents first, then the rest. */
export function sortByDate(incidents: Incident[]): Incident[] {
  const { dated, undated } = partitionByDate(incidents);
  return [...dated, ...undated];
}

/** A date she typed as 2025-03-14, written for people: March 14, 2025. */
export function formatExactDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function describeDate(incident: Incident): string {
  const { date } = incident;
  if (date.kind === 'exact' && date.value) return date.value;
  if (date.kind === 'approximate' && date.text.trim()) return date.text.trim();
  return copy.summary.dateUnknown;
}

/** Every act she checked, across all incidents, in the order of question 7. */
export function allActs(incidents: Incident[]): Act[] {
  return ACTS.filter((act) => incidents.some((incident) => incident.acts.includes(act)));
}

/** What she said about the person as a whole, on the Your story step. */
export interface PersonAnswers {
  threat: string;
  askedToStop: YesNoUnknown;
  askedToStopDetail: string;
}

const NO_ANSWERS: PersonAnswers = { threat: '', askedToStop: 'unknown', askedToStopDetail: '' };

export interface SummarySection {
  heading?: string;
  lines: string[];
  // Her own words, kept as she wrote them.
  text?: string;
}

/**
 * The summary in the order of the court's petition (PO-0100): how she knows
 * the person (question 2), what the person did (question 7), then each
 * incident with the details question 8 asks for. Empty details are left out.
 */
export function summarySections(
  caseType: CaseType,
  incidents: Incident[],
  story = '',
  relationship: Relationship | null = null,
  person: PersonAnswers = NO_ANSWERS,
): SummarySection[] {
  const s = copy.summary;
  const header: string[] = [fill(s.caseType, { caseType: copy.start.caseTypes[caseType] })];
  if (relationship && relationship !== 'not-sure') {
    header.push(fill(s.relationship, { relationship: copy.start.relationships[relationship] }));
  }
  const acts = allActs(incidents);
  if (acts.length > 0) {
    header.push(fill(s.acts, { acts: acts.map((act) => copy.incident.acts[act]).join('; ') }));
  }

  const sections: SummarySection[] = [{ heading: s.title, lines: header }];
  if (incidents.length === 0) {
    sections.push({ lines: [s.noIncidents] });
  } else {
    sections.push({ heading: s.incidentsHeading, lines: [] });
  }

  sortByDate(incidents).forEach((incident, index) => {
    const lines = [fill(s.when, { when: describeDate(incident) })];
    if (incident.place.trim()) lines.push(fill(s.place, { place: incident.place.trim() }));
    if (incident.how !== 'unknown') lines.push(fill(s.how, { how: copy.incident.how[incident.how] }));
    lines.push(s.what);
    const after: string[] = [];
    if (incident.present.trim()) after.push(fill(s.present, { present: incident.present.trim() }));
    if (incident.firsthand === 'no') after.push(s.firsthandNo);
    if (incident.feeling.trim()) after.push(fill(s.feeling, { feeling: incident.feeling.trim() }));
    if (incident.evidence.trim()) after.push(fill(s.evidence, { evidence: incident.evidence.trim() }));
    sections.push({ heading: fill(s.incident, { n: index + 1 }), lines, text: incident.description.trim() });
    if (after.length > 0) sections.push({ lines: after });
  });

  if (person.threat.trim()) sections.push({ heading: s.threat, lines: [], text: person.threat.trim() });
  if (person.askedToStop !== 'unknown') {
    const answer = s.askedToStopAnswers[person.askedToStop];
    const detail = person.askedToStop === 'yes' ? person.askedToStopDetail.trim() : '';
    sections.push({ lines: [fill(s.askedToStop, { answer: detail ? `${answer}. ${detail}` : answer })] });
  }

  // Her own words come after the dated incidents.
  if (story.trim()) sections.push({ heading: s.story, lines: [], text: story.trim() });

  return sections;
}

/** Plain-text summary she can paste into the court's e-filing form or print. */
export function buildSummary(
  caseType: CaseType,
  incidents: Incident[],
  story = '',
  relationship: Relationship | null = null,
  person: PersonAnswers = NO_ANSWERS,
): string {
  const out: string[] = [];
  for (const section of summarySections(caseType, incidents, story, relationship, person)) {
    // A section with no heading continues the one before it.
    if (section.heading) {
      if (out.length > 0) out.push('');
      out.push(section.heading);
    }
    out.push(...section.lines);
    if (section.text) out.push(section.text);
  }
  return out.join('\n').trim();
}
