// Section 8: clear all data after 15 minutes with no activity, with a warning first.
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const TIMEOUT_WARNING_SECONDS = 60;

// Section 9: the AI splitter is off unless this flag is set at build time.
export const LLM_ENABLED = import.meta.env.VITE_ENABLE_LLM === 'true';
