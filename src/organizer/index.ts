import { LLM_ENABLED } from '../config';
import type { IncidentExtractor } from './IncidentExtractor';
import { LlmExtractor } from './LlmExtractor';
import { ManualExtractor } from './ManualExtractor';

export function getExtractor(): IncidentExtractor {
  return LLM_ENABLED ? new LlmExtractor() : new ManualExtractor();
}

export * from './incident';
export type { IncidentExtractor } from './IncidentExtractor';
export { LlmExtractor } from './LlmExtractor';
export { ManualExtractor } from './ManualExtractor';
