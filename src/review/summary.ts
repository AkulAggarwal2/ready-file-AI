import type { CaseType } from '../checker';
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

/** Plain-text summary she can paste into the court's e-filing form or print. */
export function buildSummary(caseType: CaseType, incidents: Incident[]): string {
  const s = copy.summary;
  const lines = [s.title, fill(s.caseType, { caseType: copy.start.caseTypes[caseType] }), ''];

  if (incidents.length === 0) lines.push(s.noIncidents);

  sortByDate(incidents).forEach((incident, index) => {
    lines.push(
      fill(s.incident, { n: index + 1 }),
      fill(s.when, { when: describeDate(incident) }),
      fill(s.how, { how: copy.incident.how[incident.how] }),
      s.what,
      incident.description.trim(),
    );
    if (incident.evidence.trim()) lines.push(fill(s.evidence, { evidence: incident.evidence.trim() }));
    lines.push('');
  });

  return lines.join('\n').trim();
}
