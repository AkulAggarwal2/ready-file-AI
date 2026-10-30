import type { Incident } from './incident';

/**
 * Turns her written story into a draft list of incidents. The result is only a
 * draft: she always reviews, edits, and confirms the list herself.
 */
export interface IncidentExtractor {
  readonly name: string;
  extract(story: string): Promise<Incident[]>;
}
