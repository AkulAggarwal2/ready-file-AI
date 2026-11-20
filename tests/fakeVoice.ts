// Stand-ins for the browser's on-device speech recognition and its built-in
// language model (Chrome's Prompt API), so tests can "speak" and decide what
// the model answers. jsdom has neither. All words used in tests are fictional.
import { vi } from 'vitest';

type ResultList = ({ isFinal: boolean } & { transcript: string }[])[];

/** A fake SpeechRecognition. Each press of a microphone creates one. */
export class FakeRecognition {
  static instances: FakeRecognition[] = [];
  // What the browser says when asked about on-device speech.
  static availability: string | (() => Promise<string>) = 'available';
  static availableCalls: unknown[] = [];
  static install = vi.fn(async (_options: unknown) => true);

  static async available(options: unknown): Promise<string> {
    FakeRecognition.availableCalls.push(options);
    const answer = FakeRecognition.availability;
    return typeof answer === 'function' ? answer() : answer;
  }

  static reset() {
    FakeRecognition.instances = [];
    FakeRecognition.availability = 'available';
    FakeRecognition.availableCalls = [];
    FakeRecognition.install = vi.fn(async (_options: unknown) => true);
  }

  lang = '';
  continuous = false;
  interimResults = false;
  processLocally = false;
  onresult: ((event: { resultIndex: number; results: ResultList }) => void) | null = null;
  onerror: ((event: { error: string }) => void) | null = null;
  onend: (() => void) | null = null;
  started = false;
  ended = false;
  aborted = false;
  private results: ResultList = [];

  constructor() {
    FakeRecognition.instances.push(this);
  }

  start() {
    this.started = true;
  }

  stop() {
    this.end();
  }

  abort() {
    this.aborted = true;
    this.end();
  }

  /** Words of a phrase she is still saying (not final yet). */
  hear(text: string) {
    this.emit(text, false);
  }

  /** A finished phrase. */
  say(text: string) {
    this.emit(text, true);
  }

  /** The browser reports an error, then stops. */
  fail(error: string) {
    this.onerror?.({ error });
    this.end();
  }

  private end() {
    if (this.ended) return;
    this.ended = true;
    this.onend?.();
  }

  private emit(transcript: string, isFinal: boolean) {
    const last = this.results.at(-1);
    const index = last && !last.isFinal ? this.results.length - 1 : this.results.length;
    this.results[index] = Object.assign([{ transcript }], { isFinal });
    this.onresult?.({ resultIndex: index, results: this.results });
  }
}

/** The microphone that was started last. */
export function latestRecognition(): FakeRecognition {
  const recognition = FakeRecognition.instances.at(-1);
  if (!recognition) throw new Error('No microphone was started');
  return recognition;
}

type Globals = { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown; LanguageModel?: unknown };
const globals = globalThis as Globals;

export function installSpeech() {
  globals.SpeechRecognition = FakeRecognition;
}

export interface FakeModelOptions {
  availability?: string;
  // The model's answer to what it is asked. Defaults to echoing nothing useful.
  answer?: (input: string) => string | Promise<string>;
  // Like Chrome versions that let only extensions set topK and temperature.
  refuseSampling?: boolean;
}

/** What the fake model was asked, for checks. */
export interface FakeModel {
  inputs: string[];
  createOptions: Record<string, unknown>[];
  promptOptions: Record<string, unknown>[];
  destroyed: number;
}

/** A fake built-in model (window.LanguageModel). */
export function installModel({ availability = 'available', answer, refuseSampling = false }: FakeModelOptions = {}) {
  const model: FakeModel = { inputs: [], createOptions: [], promptOptions: [], destroyed: 0 };
  globals.LanguageModel = {
    availability: vi.fn(async () => availability),
    create: vi.fn(async (options: Record<string, unknown>) => {
      model.createOptions.push(options);
      if (refuseSampling && 'topK' in options) throw new TypeError('topK is not allowed here');
      return {
        prompt: async (input: string, promptOptions: Record<string, unknown>) => {
          model.inputs.push(input);
          model.promptOptions.push(promptOptions);
          return answer ? answer(input) : modelAnswer(true, input);
        },
        destroy: () => {
          model.destroyed += 1;
        },
      };
    }),
  };
  return model;
}

/** The JSON the tidying model answers with. */
export const modelAnswer = (relevant: boolean, text: string) => JSON.stringify({ relevant, text });

/** Removes every fake, so the next test starts with a browser that has neither. */
export function uninstallVoice() {
  delete globals.SpeechRecognition;
  delete globals.webkitSpeechRecognition;
  delete globals.LanguageModel;
  FakeRecognition.reset();
}
