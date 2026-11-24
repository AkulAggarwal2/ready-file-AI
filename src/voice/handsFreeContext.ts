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
  helpOpen: boolean;
  // The controls with a number on them, while numbers show.
  numbered: PageControl[] | null;
  // Why it turned itself off (the microphone is blocked, or stopped working).
  stopped: string | null;
  turnOn: () => void;
  turnOff: () => void;
  toggleHelp: () => void;
  dismissStopped: () => void;
  // Guided mode: the question being asked, and moving between questions.
  question: import('./formQuestions').FormQuestion | null;
  // Where the question is among the questions on this step (from 0), and how many there are.
  questionNumber: number;
  questionCount: number;
  skipQuestion: () => void;
  previousQuestion: () => void;
  /**
   * What she said into a box's microphone, when it is only a command like
   * "skip" or "go back". Returns true if voice control used it, so the box
   * leaves it out.
   */
  takeSpokenCommand: (said: string) => boolean;
}

export const HandsFreeContext = createContext<HandsFree | null>(null);

export function useHandsFree(): HandsFree | null {
  return useContext(HandsFreeContext);
}

/** True while voice control is on. False outside the app (as in some tests). */
export function useHandsFreeOn(): boolean {
  return useContext(HandsFreeContext)?.on ?? false;
}
