// Section 8: clear all data after 15 minutes with no activity, with a warning first.
export const IDLE_TIMEOUT_MS = 15 * 60 * 1000;
export const TIMEOUT_WARNING_SECONDS = 60;

// How long the Undo button stays after she deletes or merges an incident.
export const UNDO_MS = 10 * 1000;

// Section 9: the AI splitter is off unless this flag is set at build time.
export const LLM_ENABLED = import.meta.env.VITE_ENABLE_LLM === 'true';

// Demo mode shows sample-story buttons, the "Unverified rule" labels, and
// resources that still have TODO contacts. It is on in development and when
// built with VITE_DEMO_MODE=true. Real users never see it.
export const DEMO_MODE = import.meta.env.DEV || import.meta.env.VITE_DEMO_MODE === 'true';
