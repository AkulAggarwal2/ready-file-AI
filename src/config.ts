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

// Voice typing listens for this language. Speech is turned into text only on
// this device (see src/voice/speechRecognition.ts).
export const VOICE_LANGUAGE = 'en-US';

// When answering an incident's questions by voice, a written answer is done
// after this long with no speech, and the next question starts.
export const ANSWER_PAUSE_MS = 2500;

// Voice typing in a text box stops after this long with no speech, and what
// she said is added. Counted from the browser's last finished phrase, which
// itself comes a moment after she stops talking.
export const VOICE_PAUSE_MS = 1000;

// Tidying voice typing with the browser's built-in model, which runs on this
// device (src/voice/onDeviceModel.ts). Like the AI splitter (section 9), it is
// off by default: on only in demo mode, or when built with
// VITE_ENABLE_ON_DEVICE_AI=true. The team decides whether real users get it.
export const ON_DEVICE_AI_ENABLED = DEMO_MODE || import.meta.env.VITE_ENABLE_ON_DEVICE_AI === 'true';

// How long tidying one field's voice typing may take before her words are
// added as she said them. She is waiting at the field, so this is short.
export const TIDY_TIMEOUT_MS = 20 * 1000;
