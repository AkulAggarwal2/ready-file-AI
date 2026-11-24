// "Answer by voice" on an incident card: the questions are asked one at a
// time and her spoken answers fill in the fields. All words are fictional.
import { act, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy, fill } from '../src/content';
import { begin, renderApp, type User } from './helpers';
import { installSpeech, latestRecognition, uninstallVoice } from './fakeVoice';

// A shorter pause before the next question, so the tests don't wait.
vi.mock('../src/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/config')>()),
  ANSWER_PAUSE_MS: 30,
}));
vi.mock('../src/safety/leaveSite', () => ({ leaveSite: vi.fn() }));

const g = copy.voice.guide;
const c = copy.incident;
const panel = () => screen.getByRole('group', { name: g.panelLabel });
const progress = (n: number) => fill(g.progress, { n, total: 8 });

async function startGuide(user: User) {
  await begin(user, 'Stalking');
  await user.click(screen.getByRole('button', { name: copy.organize.add }));
  await user.click(await screen.findByRole('button', { name: g.start }));
  return latestRecognition();
}

beforeEach(() => {
  installSpeech();
});

afterEach(() => {
  uninstallVoice();
});

describe('answering an incident by voice', () => {
  it('is not offered without on-device speech', async () => {
    uninstallVoice();
    const user = renderApp();
    await begin(user, 'Stalking');
    await user.click(screen.getByRole('button', { name: copy.organize.add }));
    expect(screen.getByRole('textbox', { name: c.placeLabel })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: g.start })).toBeNull();
  });

  it('asks the first question and moves focus to its field', async () => {
    const user = renderApp();
    const microphone = await startGuide(user);
    expect(microphone.started).toBe(true);
    expect(within(panel()).getByText(progress(1))).toBeInTheDocument();
    expect(within(panel()).getByText(c.dateLabel)).toBeInTheDocument();
    expect(within(panel()).getByText(g.say.date)).toBeInTheDocument();
    expect(screen.getByLabelText(c.dateLabel)).toHaveFocus();
  });

  it('fills in each field from her answers, moving on by itself', async () => {
    const user = renderApp();
    const microphone = await startGuide(user);

    // A choice answer moves on as soon as it is understood.
    act(() => microphone.say('last week'));
    expect(screen.getByLabelText(c.dateLabel)).toHaveValue('approximate');
    expect(screen.getByRole('textbox', { name: c.approximateLabel })).toHaveValue('last week');
    expect(within(panel()).getByText(progress(2))).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: c.placeLabel })).toHaveFocus();

    // A written answer moves on after she pauses.
    act(() => microphone.say('outside my gym'));
    expect(screen.getByRole('textbox', { name: c.placeLabel })).toHaveValue('outside my gym');
    await waitFor(() => expect(within(panel()).getByText(progress(3))).toBeInTheDocument());

    act(() => microphone.say('in person'));
    expect(screen.getByLabelText(c.howLabel)).toHaveValue('in-person');

    act(() => microphone.say('he followed me to my car'));
    expect(screen.getByRole('textbox', { name: c.descriptionLabel })).toHaveValue('he followed me to my car.');
    await waitFor(() => expect(within(panel()).getByText(progress(5))).toBeInTheDocument());
  });

  it('asks again when a choice answer matches no option', async () => {
    const user = renderApp();
    const microphone = await startGuide(user);
    act(() => microphone.say('skip'));
    act(() => microphone.say('skip'));
    expect(within(panel()).getByText(c.howLabel)).toBeInTheDocument();

    act(() => microphone.say('banana'));
    expect(within(panel()).getByText(g.notUnderstood)).toBeInTheDocument();
    expect(within(panel()).getByText(progress(3))).toBeInTheDocument();
    expect(screen.getByLabelText(c.howLabel)).toHaveValue('unknown');
  });

  it('skips and stops when she says so, or presses the buttons', async () => {
    const user = renderApp();
    const microphone = await startGuide(user);
    act(() => microphone.say('Skip.'));
    expect(within(panel()).getByText(progress(2))).toBeInTheDocument();
    await user.click(within(panel()).getByRole('button', { name: g.skip }));
    expect(within(panel()).getByText(progress(3))).toBeInTheDocument();

    act(() => microphone.say('stop'));
    expect(screen.queryByRole('group', { name: g.panelLabel })).toBeNull();
    expect(screen.getByText(g.finished)).toBeInTheDocument();
    await waitFor(() => expect(microphone.ended).toBe(true));
    // Nothing was filled in.
    expect(screen.getByRole('textbox', { name: c.placeLabel })).toHaveValue('');
  });

  it('picks up where it paused', async () => {
    const user = renderApp();
    const microphone = await startGuide(user);
    act(() => microphone.say('skip'));
    act(() => microphone.fail('no-speech'));
    expect(within(panel()).getByText(copy.voice.errors.noSpeech)).toBeInTheDocument();

    await user.click(within(panel()).getByRole('button', { name: g.resume }));
    expect(latestRecognition()).not.toBe(microphone);
    expect(within(panel()).getByText(progress(2))).toBeInTheDocument();
  });

  it('never checks the "What did the person do?" boxes (question 7)', async () => {
    const user = renderApp();
    const microphone = await startGuide(user);
    const answers = ['last week', 'at his house', 'in person', 'he hit me and threatened to hurt me', 'my sister', 'yes'];
    for (const answer of answers) {
      act(() => microphone.say(answer));
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    for (const label of Object.values(c.acts)) {
      expect(screen.getByRole('checkbox', { name: label })).not.toBeChecked();
    }
  });
});
