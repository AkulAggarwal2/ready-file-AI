import type { Incident } from './incident';
import type { IncidentExtractor } from './IncidentExtractor';
import { ManualExtractor } from './ManualExtractor';
import { DRAFTS_SCHEMA, draftsToIncidents, MODEL_PROMPTS, parseDrafts } from './modelDrafts';
import { promptOnDeviceModel } from './onDeviceModel';

/** Which splitter ran and why, for the demo-only note under voice typing. */
export interface ExtractionReport {
  splitter: string;
  // Why the model was not used, or '' when it was.
  reason: string;
  seconds: number;
}

/**
 * Splits her story with the browser's built-in model, which runs on this
 * device. It also fills in when, where, how, who else was there, how she
 * felt, and proof, using only her own words. It never checks the question 7
 * boxes. If the model is not ready or its answer can't be used, the
 * rule-based splitter runs instead. Either way, the result is a draft she checks.
 */
export class OnDeviceLlmExtractor implements IncidentExtractor {
  readonly name = 'on-device-llm';

  constructor(
    private readonly onReport: (report: ExtractionReport) => void = () => {},
    private readonly fallback: IncidentExtractor = new ManualExtractor(),
  ) {}

  async extract(story: string): Promise<Incident[]> {
    const text = story.trim();
    if (!text) return [];
    const started = Date.now();
    const report = (splitter: string, reason: string) =>
      this.onReport({ splitter, reason, seconds: Math.round((Date.now() - started) / 100) / 10 });

    const result = await promptOnDeviceModel(MODEL_PROMPTS, text, DRAFTS_SCHEMA);
    const drafts = result.ok ? parseDrafts(result.answer) : null;
    const incidents = drafts && draftsToIncidents(text, drafts);

    if (incidents && incidents.length > 0) {
      report(this.name, '');
      return incidents;
    }
    report(this.fallback.name, !result.ok ? result.reason : drafts ? 'answer did not match her words' : 'answer was not readable');
    return this.fallback.extract(story);
  }
}
