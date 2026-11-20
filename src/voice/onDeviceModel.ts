// A thin wrapper around Chrome's built-in language model (the Prompt API,
// `LanguageModel`). The model runs on this device. What she says is never
// sent anywhere, so it keeps section 8's no-outside-calls rule. The model
// itself is downloaded once by the browser, and the download holds none of her words.
//
// Every call here can fail or take too long on a slow device. Callers get a
// reason instead of an answer, and carry on without the model.
import { withTimeout } from '../timeout';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ModelSession {
  prompt(input: string, options?: { responseConstraint?: object; signal?: AbortSignal }): Promise<string>;
  destroy(): void;
}

interface LanguageModelApi {
  availability(options?: object): Promise<string>;
  create(options?: object): Promise<ModelSession>;
}

/** The model's answer, or why there is none (shown only in demo mode). */
export type ModelResult = { ok: true; answer: string } | { ok: false; reason: string };

const ENGLISH_TEXT = {
  expectedInputs: [{ type: 'text', languages: ['en'] }],
  expectedOutputs: [{ type: 'text', languages: ['en'] }],
};

// Some browsers take a long time to answer whether the model is there.
const CHECK_TIMEOUT_MS = 3000;

function languageModel(): LanguageModelApi | null {
  return (globalThis as { LanguageModel?: LanguageModelApi }).LanguageModel ?? null;
}

const describeError = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The browser's answer: "available", "downloadable", "downloading", "unavailable", "timeout", or "no-api". */
async function checkModel(): Promise<string> {
  const api = languageModel();
  if (!api) return 'no-api';
  try {
    return await withTimeout(api.availability(ENGLISH_TEXT), CHECK_TIMEOUT_MS);
  } catch (error) {
    return describeError(error);
  }
}

let warmUp: Promise<void> | null = null;

/**
 * Starts the browser's one-time model download, if it is needed, so the model
 * is ready next time. Browsers allow this only right after a click or key
 * press. Safe to call more than once.
 */
export function warmUpOnDeviceModel(): void {
  warmUp ??= (async () => {
    if ((await checkModel()) !== 'downloadable') return;
    const session = await languageModel()?.create(ENGLISH_TEXT);
    session?.destroy();
  })().catch(() => {
    // Not getting the model is fine: her words are added as she said them.
  });
}

// Always pick the most likely next word, so the model doesn't get creative.
// With topK 1, the temperature makes no difference; 1 is a safe value.
const NO_RANDOMNESS = { topK: 1, temperature: 1 };

/**
 * Starts a session that answers without randomness. Some Chrome versions let
 * only extensions set this, so where it is refused, a normal session is used.
 */
type SessionOptions = Record<string, unknown> & { signal: AbortSignal };

async function createSession(api: LanguageModelApi, options: SessionOptions): Promise<ModelSession> {
  try {
    return await api.create({ ...options, ...NO_RANDOMNESS });
  } catch (error) {
    if (options.signal.aborted) throw error;
    return api.create(options);
  }
}

export interface ModelQuestion {
  // The instructions and worked examples the model starts from.
  examples: ChatMessage[];
  input: string;
  // The JSON shape the answer must have.
  schema: object;
  timeoutMs: number;
}

/**
 * Asks the on-device model one question and returns its JSON answer as text.
 * Gives up after `timeoutMs`, even if the browser ignores the cancel signal.
 */
export async function promptOnDeviceModel({ examples, input, schema, timeoutMs }: ModelQuestion): Promise<ModelResult> {
  const status = await checkModel();
  const api = languageModel();
  if (status !== 'available' || !api) return { ok: false, reason: `model ${status}` };

  const cancel = new AbortController();
  let session: ModelSession | null = null;
  const ask = async () => {
    const created = await createSession(api, { ...ENGLISH_TEXT, initialPrompts: examples, signal: cancel.signal });
    // The model can finish loading after we gave up. Don't keep it around.
    if (cancel.signal.aborted) {
      created.destroy();
      throw new Error('timeout');
    }
    session = created;
    return created.prompt(input, { responseConstraint: schema, signal: cancel.signal });
  };
  const asking = ask();
  // After a timeout nothing waits for this, so its error must not go unhandled.
  asking.catch(() => {});

  try {
    const answer = await withTimeout(asking, timeoutMs);
    if (answer === 'timeout') {
      cancel.abort();
      return { ok: false, reason: 'timeout' };
    }
    return { ok: true, answer };
  } catch (error) {
    return { ok: false, reason: describeError(error) };
  } finally {
    (session as ModelSession | null)?.destroy();
  }
}
