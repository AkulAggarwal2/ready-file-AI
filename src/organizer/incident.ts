import type { CheckDate } from '../checker';

export type IncidentDate = CheckDate;

export type HowItHappened = 'in-person' | 'online' | 'phone-or-text' | 'other' | 'unknown';

export const HOW_OPTIONS: HowItHappened[] = ['in-person', 'online', 'phone-or-text', 'other', 'unknown'];

export interface Incident {
  id: string;
  date: IncidentDate;
  // Her words, unchanged unless she edits them.
  description: string;
  how: HowItHappened;
  evidence: string;
}

export type IncidentFields = Omit<Incident, 'id'>;

let nextId = 1;

export function createIncident(fields: Partial<IncidentFields> = {}): Incident {
  return {
    id: `incident-${nextId++}`,
    date: { kind: 'unknown' },
    description: '',
    how: 'unknown',
    evidence: '',
    ...fields,
  };
}

function joinText(a: string, b: string): string {
  return [a.trim(), b.trim()].filter(Boolean).join('\n\n');
}

/** Combines two incidents into one, keeping the first one's id. */
export function mergeIncidents(first: Incident, second: Incident): Incident {
  return {
    id: first.id,
    date: first.date.kind === 'unknown' ? second.date : first.date,
    description: joinText(first.description, second.description),
    how: first.how === 'unknown' ? second.how : first.how,
    evidence: joinText(first.evidence, second.evidence),
  };
}
