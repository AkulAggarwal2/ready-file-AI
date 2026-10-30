import type { CaseType } from '../checker';
import { copy, fill } from '../content';
import type { Incident } from '../organizer';

/**
 * Incidents with an exact date first, oldest to newest. The rest keep the
 * order she gave, because "early March" cannot be placed exactly.
 */
export function sortByDate(incidents: Incident[]): Incident[] {
  const exactDate = (incident: Incident) =>
    incident.date.kind === 'exact' && incident.date.value ? incident.date.value : null;

  const dated = incidents
    .filter((incident) => exactDate(incident))
    .sort((a, b) => exactDate(a)!.localeCompare(exactDate(b)!));
  const undated = incidents.filter((incident) => !exactDate(incident));
  return [...dated, ...undated];
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
