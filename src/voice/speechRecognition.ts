// A thin wrapper around the browser's speech recognition (the Web Speech API).
//
// In many browsers, speech recognition sends the audio to the browser maker's
// server. Section 8 rules out outside calls, so ReadyFile only uses speech
// recognition that the browser confirms runs on this device (processLocally).
// A browser that cannot confirm that gets no voice typing at all.

import { withTimeout } from '../timeout';

export type OnDeviceStatus = 'available' | 'downloadable' | 'unavailable';

interface RecognitionAlternative {
  transcript: string;
}

interface RecognitionResult {
  readonly isFinal: boolean;
  readonly [index: number]: RecognitionAlternative;
}

export interface RecognitionResultEvent {
  // The first result that changed since the last event.
  readonly resultIndex: number;
  readonly results: { readonly length: number; readonly [index: number]: RecognitionResult };
}

export interface RecognitionErrorEvent {
  readonly error: string;
}

/** The parts of the browser's SpeechRecognition object that ReadyFile uses. */
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  processLocally: boolean;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  onerror: ((event: RecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface OnDeviceOptions {
  langs: string[];
  processLocally: true;
}

interface RecognitionConstructor {
  new (): Recognition;
  // Only browsers that can recognize speech on the device have these.
  available?(options: OnDeviceOptions): Promise<string>;
  install?(options: OnDeviceOptions): Promise<boolean>;
}

interface SpeechWindow {
  SpeechRecognition?: RecognitionConstructor;
  webkitSpeechRecognition?: RecognitionConstructor;
}

function speechConstructor(): RecognitionConstructor | null {
  if (typeof window === 'undefined') return null;
  const speechWindow = window as unknown as SpeechWindow;
  return speechWindow.SpeechRecognition ?? speechWindow.webkitSpeechRecognition ?? null;
}

function onDeviceConstructor(): RecognitionConstructor | null {
  const constructor = speechConstructor();
  return constructor?.available ? constructor : null;
}

/** Why on-device speech can't even be asked about, for the demo-only note. */
export function missingSpeechDetail(): string {
  return speechConstructor() ? 'no-on-device-api' : 'no-speech-api';
}

const onDeviceOptions = (lang: string): OnDeviceOptions => ({ langs: [lang], processLocally: true });

/** True when this browser can at least be asked about on-device recognition. */
export function canAskForOnDeviceSpeech(): boolean {
  return onDeviceConstructor() !== null;
}

export interface OnDeviceCheck {
  status: OnDeviceStatus;
  // What the browser said, for the demo-only note: its answer, "timeout",
  // an error message, or why it can't be asked (missingSpeechDetail).
  detail: string;
}

// Some browsers never answer the question. Don't wait for them forever.
const CHECK_TIMEOUT_MS = 3000;

/** Whether speech in this language can be turned into text on this device. */
export async function checkOnDeviceSpeech(lang: string): Promise<OnDeviceCheck> {
  const constructor = onDeviceConstructor();
  if (!constructor?.available) return { status: 'unavailable', detail: missingSpeechDetail() };
  try {
    const answer = await withTimeout(constructor.available(onDeviceOptions(lang)), CHECK_TIMEOUT_MS);
    if (answer === 'available') return { status: 'available', detail: answer };
    if (answer === 'downloadable' || answer === 'downloading') return { status: 'downloadable', detail: answer };
    return { status: 'unavailable', detail: String(answer) };
  } catch (error) {
    return { status: 'unavailable', detail: error instanceof Error ? error.message : String(error) };
  }
}

/**
 * Asks the browser to download its on-device speech model. The download holds
 * no words of hers. Browsers allow this only right after a click or key press.
 */
export async function installOnDeviceSpeech(lang: string): Promise<boolean> {
  const constructor = onDeviceConstructor();
  if (!constructor?.install) return false;
  try {
    return await constructor.install(onDeviceOptions(lang));
  } catch {
    return false;
  }
}

/** A recognizer that keeps listening through pauses and runs only on this device. */
export function createOnDeviceRecognition(lang: string): Recognition | null {
  const constructor = onDeviceConstructor();
  if (!constructor) return null;
  const recognition = new constructor();
  recognition.lang = lang;
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.processLocally = true;
  return recognition;
}
