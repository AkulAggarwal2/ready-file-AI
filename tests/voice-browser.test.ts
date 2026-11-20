// The thin wrappers around the browser: on-device speech recognition and the
// built-in model. Fakes stand in for both. All words are fictional.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { promptOnDeviceModel } from '../src/voice/onDeviceModel';
import {
  canAskForOnDeviceSpeech,
  checkOnDeviceSpeech,
  createOnDeviceRecognition,
  installOnDeviceSpeech,
  missingSpeechDetail,
} from '../src/voice/speechRecognition';
import { tidySpokenText } from '../src/voice/tidyText';
import { FakeRecognition, installModel, installSpeech, modelAnswer, uninstallVoice } from './fakeVoice';

const question = { examples: [{ role: 'system' as const, content: 'Be brief.' }], input: 'hello', schema: {} };

afterEach(() => {
  uninstallVoice();
  vi.useRealTimers();
});

describe('on-device speech recognition', () => {
  it('is not offered without a speech API', async () => {
    expect(canAskForOnDeviceSpeech()).toBe(false);
    expect(missingSpeechDetail()).toBe('no-speech-api');
    expect(await checkOnDeviceSpeech('en-US')).toEqual({ status: 'unavailable', detail: 'no-speech-api' });
    expect(createOnDeviceRecognition('en-US')).toBeNull();
  });

  it('is not offered when the browser can only send audio to a server', async () => {
    // Older Chrome and Safari: speech recognition, but no way to keep it on the device.
    (globalThis as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition = class {};
    expect(canAskForOnDeviceSpeech()).toBe(false);
    expect(missingSpeechDetail()).toBe('no-on-device-api');
    expect((await checkOnDeviceSpeech('en-US')).status).toBe('unavailable');
  });

  it('asks the browser for this language, on this device only', async () => {
    installSpeech();
    expect(await checkOnDeviceSpeech('en-US')).toEqual({ status: 'available', detail: 'available' });
    expect(FakeRecognition.availableCalls).toEqual([{ langs: ['en-US'], processLocally: true }]);
  });

  it.each([
    ['downloadable', 'downloadable'],
    ['downloading', 'downloadable'],
    ['unavailable', 'unavailable'],
    ['something new', 'unavailable'],
  ])('reads the answer "%s" as %s', async (answer, status) => {
    installSpeech();
    FakeRecognition.availability = answer;
    expect(await checkOnDeviceSpeech('en-US')).toEqual({ status, detail: answer });
  });

  it('is unavailable when the browser throws', async () => {
    installSpeech();
    FakeRecognition.availability = () => Promise.reject(new Error('broken'));
    expect(await checkOnDeviceSpeech('en-US')).toEqual({ status: 'unavailable', detail: 'broken' });
  });

  it('stops waiting for a browser that never answers', async () => {
    vi.useFakeTimers();
    installSpeech();
    FakeRecognition.availability = () => new Promise(() => {});
    const checking = checkOnDeviceSpeech('en-US');
    await vi.advanceTimersByTimeAsync(3000);
    expect(await checking).toEqual({ status: 'unavailable', detail: 'timeout' });
  });

  it('creates a recognizer that keeps listening and stays on the device', () => {
    installSpeech();
    const recognition = createOnDeviceRecognition('en-US');
    expect(recognition).toMatchObject({ lang: 'en-US', continuous: true, interimResults: true, processLocally: true });
  });

  it('downloads the speech model when asked, and reports failure as false', async () => {
    expect(await installOnDeviceSpeech('en-US')).toBe(false);
    installSpeech();
    expect(await installOnDeviceSpeech('en-US')).toBe(true);
    expect(FakeRecognition.install).toHaveBeenCalledWith({ langs: ['en-US'], processLocally: true });
    FakeRecognition.install.mockRejectedValueOnce(new Error('no space'));
    expect(await installOnDeviceSpeech('en-US')).toBe(false);
  });
});

describe('the built-in model', () => {
  it('gives a reason instead of an answer when there is no model', async () => {
    expect(await promptOnDeviceModel({ ...question, timeoutMs: 1000 })).toEqual({ ok: false, reason: 'model no-api' });
  });

  it.each(['downloadable', 'downloading', 'unavailable'])('is not used while it is "%s"', async (availability) => {
    const model = installModel({ availability });
    expect(await promptOnDeviceModel({ ...question, timeoutMs: 1000 })).toEqual({
      ok: false,
      reason: `model ${availability}`,
    });
    expect(model.createOptions).toEqual([]);
  });

  it('answers, shaped by the schema, from the instructions, with no randomness', async () => {
    const model = installModel({ answer: () => '{"ok":true}' });
    const schema = { type: 'object' };
    expect(await promptOnDeviceModel({ ...question, schema, timeoutMs: 1000 })).toEqual({
      ok: true,
      answer: '{"ok":true}',
    });
    expect(model.createOptions[0]).toMatchObject({ initialPrompts: question.examples, topK: 1 });
    expect(model.promptOptions[0]).toMatchObject({ responseConstraint: schema });
    expect(model.inputs).toEqual(['hello']);
    // The session is closed after each question.
    expect(model.destroyed).toBe(1);
  });

  it('still works where Chrome refuses the no-randomness setting', async () => {
    const model = installModel({ refuseSampling: true, answer: () => 'fine' });
    expect(await promptOnDeviceModel({ ...question, timeoutMs: 1000 })).toEqual({ ok: true, answer: 'fine' });
    expect(model.createOptions).toHaveLength(2);
    expect(model.createOptions[1]).not.toHaveProperty('topK');
  });

  it('gives the error as the reason when the model fails', async () => {
    installModel({ answer: () => Promise.reject(new Error('model crashed')) });
    expect(await promptOnDeviceModel({ ...question, timeoutMs: 1000 })).toEqual({ ok: false, reason: 'model crashed' });
  });

  it('gives up after the time limit, even if the model never answers, and closes the session', async () => {
    vi.useFakeTimers();
    const model = installModel({ answer: () => new Promise(() => {}) });
    const asking = promptOnDeviceModel({ ...question, timeoutMs: 5000 });
    await vi.advanceTimersByTimeAsync(5000);
    expect(await asking).toEqual({ ok: false, reason: 'timeout' });
    expect(model.destroyed).toBe(1);
  });
});

describe('tidying what she said', () => {
  const tidy = (said: string) => tidySpokenText('What happened (Short notes are fine.)', said);

  it('sends the question with what she said', async () => {
    const model = installModel({ answer: () => modelAnswer(true, 'He called me.') });
    await tidy('he called me');
    expect(model.inputs).toEqual(['Question: What happened (Short notes are fine.)\nWhat they said: he called me']);
  });

  it('gives the tidied text when it keeps her meaning', async () => {
    installModel({ answer: () => modelAnswer(true, 'So he came to my work on Friday.') });
    expect(await tidy('um so he he come to my work on friday')).toEqual({
      kind: 'tidied',
      text: 'So he came to my work on Friday.',
    });
  });

  it('says so when she did not answer the question', async () => {
    installModel({ answer: () => modelAnswer(false, 'Can you turn the TV down?') });
    expect(await tidy('can you turn the tv down')).toEqual({ kind: 'unrelated' });
  });

  it('fails when the tidied text changes her meaning', async () => {
    installModel({ answer: () => modelAnswer(true, 'He sent me 2 texts.') });
    expect(await tidy('he sent me 20 texts')).toEqual({ kind: 'failed', reason: 'answer changed too much' });
  });

  it('fails when the answer is not readable', async () => {
    installModel({ answer: () => 'He sent me texts.' });
    expect(await tidy('he sent me texts')).toEqual({ kind: 'failed', reason: 'answer was not readable' });
  });

  it('fails with the reason when there is no model', async () => {
    expect(await tidy('he sent me texts')).toEqual({ kind: 'failed', reason: 'model no-api' });
  });
});

describe('getting the model ready', () => {
  // The download starts once per page load, so each test loads the module fresh.
  beforeEach(() => {
    vi.resetModules();
  });

  it('starts the download once when the model is downloadable', async () => {
    const model = installModel({ availability: 'downloadable' });
    const { warmUpOnDeviceModel } = await import('../src/voice/onDeviceModel');
    warmUpOnDeviceModel();
    warmUpOnDeviceModel();
    await vi.waitFor(() => expect(model.createOptions).toHaveLength(1));
    expect(model.destroyed).toBe(1);
  });

  it('does nothing when the model is already there', async () => {
    const model = installModel({ availability: 'available' });
    const { warmUpOnDeviceModel } = await import('../src/voice/onDeviceModel');
    warmUpOnDeviceModel();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(model.createOptions).toEqual([]);
  });
});
