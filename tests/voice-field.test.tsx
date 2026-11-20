// The microphone in each text box, driven through the whole app with a fake
// microphone and a fake built-in model. All words are fictional.
import { act, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy, fill } from '../src/content';
import { begin, renderApp, type User } from './helpers';
import {
  FakeRecognition,
  installModel,
  installSpeech,
  latestRecognition,
  modelAnswer,
  uninstallVoice,
} from './fakeVoice';

// Shorter pauses, so the tests don't wait a real second.
vi.mock('../src/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/config')>()),
  VOICE_PAUSE_MS: 30,
  TIDY_TIMEOUT_MS: 500,
}));
vi.mock('../src/safety/leaveSite', () => ({ leaveSite: vi.fn() }));

const f = copy.voice.field;
const speakName = (label: string) => fill(f.speak, { field: label });
const stopName = (label: string) => fill(f.stop, { field: label });
const storyBox = () => screen.getByRole('textbox', { name: copy.story.label });
const status = (fieldId: string) => document.getElementById(`${fieldId}-voice-status`)?.textContent ?? '';

async function toStory(user: User) {
  await begin(user, 'Stalking');
  await user.click(screen.getByRole('button', { name: copy.organize.confirm }));
}

/** Presses a box's microphone, says these phrases, and waits for the pause to stop it. */
async function speakInto(user: User, label: string, ...phrases: string[]) {
  await user.click(await screen.findByRole('button', { name: speakName(label) }));
  const microphone = latestRecognition();
  act(() => phrases.forEach((phrase) => microphone.say(phrase)));
  await waitFor(() => expect(microphone.ended).toBe(true));
  return microphone;
}

beforeEach(() => {
  installSpeech();
});

afterEach(() => {
  uninstallVoice();
});

describe('where the microphones are', () => {
  it('has none, and says why, in a browser without on-device speech', async () => {
    uninstallVoice();
    const user = renderApp();
    await toStory(user);
    expect(await screen.findByText(copy.voice.unavailable, { exact: false })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Speak into/ })).toBeNull();
    // Typing still works.
    await user.type(storyBox(), 'We worked together.');
    expect(storyBox()).toHaveValue('We worked together.');
  });

  it('is in every text box on Your story, with a note on how it works', async () => {
    const user = renderApp();
    await toStory(user);
    expect(await screen.findByText(f.note)).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: speakName(copy.story.label) })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: speakName(copy.story.threatLabel) })).toBeInTheDocument();

    // The third box appears only after "Yes".
    await user.selectOptions(screen.getByLabelText(copy.story.askedToStopLabel), 'yes');
    expect(await screen.findByRole('button', { name: speakName(copy.story.askedToStopDetailLabel) })).toBeInTheDocument();
  });

  it("is in every text box on an incident card, but not on the choices", async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await user.click(screen.getByRole('button', { name: copy.organize.add }));
    const c = copy.incident;
    for (const label of [c.placeLabel, c.descriptionLabel, c.presentLabel, c.feelingLabel, c.evidenceLabel]) {
      expect(await screen.findByRole('button', { name: speakName(label) })).toBeInTheDocument();
    }
    expect(screen.getAllByRole('button', { name: /^Speak into/ })).toHaveLength(5);

    // "About when" gets one once she picks it.
    await user.selectOptions(screen.getByLabelText(c.dateLabel), 'approximate');
    expect(await screen.findByRole('button', { name: speakName(c.approximateLabel) })).toBeInTheDocument();
  });
});

describe('while the browser is still answering', () => {
  it('keeps the box she is typing in, with its focus and text, when the microphones appear', async () => {
    // Every box asks the browser; none gets an answer until she has typed.
    const waiting: ((status: string) => void)[] = [];
    FakeRecognition.availability = () => new Promise<string>((resolve) => waiting.push(resolve));
    const user = renderApp();
    await begin(user, 'Stalking');
    await user.click(screen.getByRole('button', { name: copy.organize.add }));
    const place = screen.getByRole('textbox', { name: copy.incident.placeLabel });
    await user.type(place, 'outside my work');

    act(() => waiting.forEach((answer) => answer('available')));
    await screen.findAllByRole('button', { name: speakName(copy.incident.placeLabel) });
    // The same box, not a rebuilt one.
    expect(screen.getByRole('textbox', { name: copy.incident.placeLabel })).toBe(place);
    expect(place).toHaveFocus();
    expect(place).toHaveValue('outside my work');
  });
});

describe('speaking into a box', () => {
  it('adds her words after what she typed when she pauses, without pressing Stop', async () => {
    const user = renderApp();
    await toStory(user);
    await user.type(storyBox(), 'We worked together.');
    await user.click(await screen.findByRole('button', { name: speakName(copy.story.label) }));
    const microphone = latestRecognition();
    expect(microphone).toMatchObject({ started: true, processLocally: true });
    expect(screen.getByRole('button', { name: stopName(copy.story.label) })).toBeInTheDocument();
    expect(status('story')).toBe(f.listening);

    act(() => microphone.say('he came to my work'));
    await waitFor(() => expect(microphone.ended).toBe(true));
    // No model in this browser, so her words go in as she said them.
    await waitFor(() => expect(storyBox()).toHaveValue('We worked together. he came to my work.'));
    expect(status('story')).toBe(fill(f.added, { field: copy.story.label }));
  });

  it('keeps listening while she is mid-phrase, and through a short gap', async () => {
    const user = renderApp();
    await toStory(user);
    await user.click(await screen.findByRole('button', { name: speakName(copy.story.label) }));
    const microphone = latestRecognition();

    act(() => microphone.hear('he came to'));
    await new Promise((resolve) => setTimeout(resolve, 100));
    expect(microphone.ended).toBe(false);
    // Words not final yet are shown, never saved.
    expect(screen.getByText('he came to')).toBeInTheDocument();
    expect(storyBox()).toHaveValue('');

    act(() => microphone.say('he came to my work'));
    act(() => microphone.say('and waited outside'));
    await waitFor(() => expect(storyBox()).toHaveValue('he came to my work. and waited outside.'));
  });

  it('stops when she presses the microphone again', async () => {
    const user = renderApp();
    await toStory(user);
    await user.click(await screen.findByRole('button', { name: speakName(copy.story.label) }));
    const microphone = latestRecognition();
    act(() => microphone.hear('he came'));
    await user.click(screen.getByRole('button', { name: stopName(copy.story.label) }));
    expect(microphone.ended).toBe(true);
  });

  it('listens with one microphone at a time', async () => {
    const user = renderApp();
    await toStory(user);
    await user.click(await screen.findByRole('button', { name: speakName(copy.story.label) }));
    const first = latestRecognition();
    await user.click(screen.getByRole('button', { name: speakName(copy.story.threatLabel) }));
    expect(first.aborted).toBe(true);
    expect(latestRecognition()).not.toBe(first);
  });

  it('turns the microphone off when she leaves the step', async () => {
    const user = renderApp();
    await toStory(user);
    await user.click(await screen.findByRole('button', { name: speakName(copy.story.label) }));
    const microphone = latestRecognition();
    await user.click(screen.getByRole('button', { name: copy.story.back }));
    expect(microphone.aborted).toBe(true);
  });

  it('says when the microphone is blocked', async () => {
    const user = renderApp();
    await toStory(user);
    await user.click(await screen.findByRole('button', { name: speakName(copy.story.label) }));
    act(() => latestRecognition().fail('not-allowed'));
    expect(status('story')).toBe(copy.voice.errors.blocked);
  });

  it('downloads the speech model the first time, then listens', async () => {
    FakeRecognition.availability = 'downloadable';
    const user = renderApp();
    await toStory(user);
    await user.click(await screen.findByRole('button', { name: speakName(copy.story.label) }));
    expect(FakeRecognition.install).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(latestRecognition().started).toBe(true));
  });
});

describe('tidying with the built-in model', () => {
  it('adds the tidied text, and one click puts her exact words there instead', async () => {
    installModel({ answer: () => modelAnswer(true, 'So he came to my work on Friday.') });
    const user = renderApp();
    await toStory(user);
    await user.type(storyBox(), 'We worked together.');
    await speakInto(user, copy.story.label, 'um so he he come to my work', 'on friday');

    await waitFor(() => expect(storyBox()).toHaveValue('We worked together. So he came to my work on Friday.'));
    expect(status('story')).toBe(fill(f.addedTidied, { field: copy.story.label }));

    await user.click(screen.getByRole('button', { name: f.useExactWords }));
    expect(storyBox()).toHaveValue('We worked together. um so he he come to my work. on friday.');
    expect(storyBox()).toHaveFocus();
    expect(screen.queryByRole('button', { name: f.useExactWords })).toBeNull();
  });

  it('drops the exact-words link once she edits the box', async () => {
    installModel({ answer: () => modelAnswer(true, 'So he came to my work.') });
    const user = renderApp();
    await toStory(user);
    await speakInto(user, copy.story.label, 'so he come to my work');
    await screen.findByRole('button', { name: f.useExactWords });
    await user.type(storyBox(), ' He left.');
    expect(screen.queryByRole('button', { name: f.useExactWords })).toBeNull();
  });

  it('uses her exact words when the tidied text changes her meaning', async () => {
    installModel({ answer: () => modelAnswer(true, 'He said he has 3 guns.') });
    const user = renderApp();
    await toStory(user);
    await speakInto(user, copy.story.threatLabel, 'he said he has 2 guns');
    const threat = screen.getByRole('textbox', { name: copy.story.threatLabel });
    await waitFor(() => expect(threat).toHaveValue('he said he has 2 guns.'));
    expect(screen.queryByRole('button', { name: f.useExactWords })).toBeNull();
    // Demo mode says why.
    expect(screen.getByText(fill(f.demoReport, { reason: 'answer changed too much' }))).toBeInTheDocument();
  });

  it('tells the model which question the box asks', async () => {
    const model = installModel({ answer: () => modelAnswer(true, 'He called me.') });
    const user = renderApp();
    await toStory(user);
    await speakInto(user, copy.story.threatLabel, 'he called me');
    await waitFor(() => expect(model.inputs).toHaveLength(1));
    expect(model.inputs[0]).toBe(
      // Each pause ends a sentence, before the model sees it.
      `Question: ${copy.story.threatLabel} (${copy.story.threatHint})\nWhat they said: he called me.`,
    );
  });

  it("adds nothing when she didn't answer the question, unless she says to", async () => {
    installModel({ answer: () => modelAnswer(false, 'Can you turn the TV down?') });
    const user = renderApp();
    await toStory(user);
    await user.type(storyBox(), 'We worked together.');
    await speakInto(user, copy.story.label, 'can you turn the tv down');

    await screen.findByRole('button', { name: f.addAnyway });
    expect(storyBox()).toHaveValue('We worked together.');
    expect(status('story')).toBe(fill(f.unrelated, { field: copy.story.label }));

    await user.click(screen.getByRole('button', { name: f.addAnyway }));
    expect(storyBox()).toHaveValue('We worked together. can you turn the tv down.');
    expect(storyBox()).toHaveFocus();
    expect(screen.queryByRole('button', { name: f.addAnyway })).toBeNull();
  });

  it('keeps her words in a one-line box, but still skips what is not an answer', async () => {
    installModel({
      answer: (input) =>
        input.includes('tv') ? modelAnswer(false, 'Turn the TV down.') : modelAnswer(true, 'The parking lot at my work.'),
    });
    const user = renderApp();
    await begin(user, 'Stalking');
    await user.click(screen.getByRole('button', { name: copy.organize.add }));
    const place = screen.getByRole('textbox', { name: copy.incident.placeLabel });

    await speakInto(user, copy.incident.placeLabel, 'the parking lot at my work');
    await waitFor(() => expect(place).toHaveValue('the parking lot at my work'));

    await speakInto(user, copy.incident.placeLabel, 'turn the tv down');
    await screen.findByRole('button', { name: f.addAnyway });
    expect(place).toHaveValue('the parking lot at my work');
  });

  it('adds her words as she said them when the model is still downloading', async () => {
    const model = installModel({ availability: 'downloading' });
    const user = renderApp();
    await toStory(user);
    await speakInto(user, copy.story.label, 'he came to my work');
    await waitFor(() => expect(storyBox()).toHaveValue('he came to my work.'));
    expect(model.inputs).toEqual([]);
    expect(screen.getByText(fill(f.demoReport, { reason: 'model downloading' }))).toBeInTheDocument();
  });

  it("can't be pressed again while it checks what she said", async () => {
    let answer: (text: string) => void = () => {};
    installModel({ answer: () => new Promise<string>((resolve) => (answer = resolve)) });
    const user = renderApp();
    await toStory(user);
    await speakInto(user, copy.story.label, 'he came to my work');
    await waitFor(() => expect(status('story')).toBe(f.checking));
    expect(screen.getByRole('button', { name: speakName(copy.story.label) })).toBeDisabled();
    act(() => answer(modelAnswer(true, 'He came to my work.')));
    await waitFor(() => expect(storyBox()).toHaveValue('He came to my work.'));
    expect(screen.getByRole('button', { name: speakName(copy.story.label) })).toBeEnabled();
  });
});

describe('accessibility with microphones', () => {
  async function expectNoViolations() {
    const results = await axe.run(document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  }

  it('has no axe violations on an open incident card and on Your story, with the links showing', async () => {
    installModel({
      answer: (input) => (input.includes('tv') ? modelAnswer(false, '') : modelAnswer(true, 'He came to my work.')),
    });
    const user = renderApp();
    await begin(user, 'Stalking');
    await user.click(screen.getByRole('button', { name: copy.organize.add }));
    await screen.findAllByRole('button', { name: /^Speak into/ });
    await expectNoViolations();

    await user.click(screen.getByRole('button', { name: copy.organize.confirm }));
    await speakInto(user, copy.story.label, 'he come to my work');
    await screen.findByRole('button', { name: f.useExactWords });
    await speakInto(user, copy.story.threatLabel, 'turn the tv down');
    await screen.findByRole('button', { name: f.addAnyway });
    await expectNoViolations();
  });

  it('names each microphone after its box, and points it to the status line', async () => {
    const user = renderApp();
    await toStory(user);
    const microphone = await screen.findByRole('button', { name: speakName(copy.story.label) });
    expect(microphone).toHaveAttribute('aria-describedby', 'story-voice-status');
    expect(within(microphone).queryByText(/./)).toBeNull();
  });
});
