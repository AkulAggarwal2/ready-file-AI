import { createContext, useContext } from 'react';
import type { PageControl } from './pageControls';

/** Voice control: using the whole form by voice, for anyone who can't easily type or use a mouse. */
export interface HandsFree {
  // The browser can turn speech into text on this device.
  available: boolean;
  // Still asking the browser.
  checking: boolean;
  on: boolean;
  // A field's microphone or "Answer by voice" has the microphone for now.
  paused: boolean;
  // Getting speech ready, the first time only.
  preparing: boolean;
  // Words of what she is saying now, not final yet.
  pending: string;
  // The last thing she said.
  heard: string;
  // What happened after she said it.
  message: string;
  // The choices of the list she just moved to.
  choices: string[] | null;
  helpOpen: boolean;
  // The controls with a number on them, while numbers show.
  numbered: PageControl[] | null;
  // Why it turned itself off (the microphone is blocked, or stopped working).
  stopped: string | null;
  turnOn: () => void;
  turnOff: () => void;
  toggleHelp: () => void;
  dismissStopped: () => void;
}

export const HandsFreeContext = createContext<HandsFree | null>(null);

export function useHandsFree(): HandsFree | null {
  return useContext(HandsFreeContext);
}

/** True while voice control is on. False outside the app (as in some tests). */
export function useHandsFreeOn(): boolean {
  return useContext(HandsFreeContext)?.on ?? false;
}
