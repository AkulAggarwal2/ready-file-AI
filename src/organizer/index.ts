import { LLM_ENABLED, ON_DEVICE_AI_ENABLED } from '../config';
import type { IncidentExtractor } from './IncidentExtractor';
import { LlmExtractor } from './LlmExtractor';
import { ManualExtractor } from './ManualExtractor';
import { OnDeviceLlmExtractor, type ExtractionReport } from './OnDeviceLlmExtractor';

/** The splitter to use. onReport hears which one ran, when the on-device model is tried. */
export function getExtractor(onReport?: (report: ExtractionReport) => void): IncidentExtractor {
  if (LLM_ENABLED) return new LlmExtractor();
  if (ON_DEVICE_AI_ENABLED) return new OnDeviceLlmExtractor(onReport);
  return new ManualExtractor();
}

export * from './incident';
export type { IncidentExtractor } from './IncidentExtractor';
export { LlmExtractor } from './LlmExtractor';
export { ManualExtractor } from './ManualExtractor';
export { OnDeviceLlmExtractor, type ExtractionReport } from './OnDeviceLlmExtractor';
export { warmUpOnDeviceModel } from './onDeviceModel';
