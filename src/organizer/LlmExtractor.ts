import { LENA_FOUR_INCIDENTS } from '../samples/lena';
import { createIncident, type Incident, type IncidentFields } from './incident';
import type { IncidentExtractor } from './IncidentExtractor';
import { ManualExtractor } from './ManualExtractor';

// Stub. Calling a real AI model from the browser would break section 8 (no
// outside network calls) and expose the API key, so a real version needs a
// small server first. For now this returns prepared drafts for the fictional
// Lena sample, as a model would, and uses the manual splitter for anything else.
const [january, february, earlyMarch, march14] = LENA_FOUR_INCIDENTS.split('\n\n');

const PREPARED_DRAFTS: Record<string, IncidentFields[]> = {
  [LENA_FOUR_INCIDENTS]: [
    { description: january, date: { kind: 'approximate', text: 'January' }, how: 'in-person', evidence: '' },
    { description: february, date: { kind: 'approximate', text: 'February' }, how: 'phone-or-text', evidence: '' },
    { description: earlyMarch, date: { kind: 'approximate', text: 'early March' }, how: 'other', evidence: '' },
    { description: march14, date: { kind: 'approximate', text: 'March 14' }, how: 'in-person', evidence: '' },
  ],
};

export class LlmExtractor implements IncidentExtractor {
  readonly name = 'llm-stub';

  async extract(story: string): Promise<Incident[]> {
    const drafts = PREPARED_DRAFTS[story.trim()];
    if (drafts) return drafts.map((fields) => createIncident(fields));
    return new ManualExtractor().extract(story);
  }
}
