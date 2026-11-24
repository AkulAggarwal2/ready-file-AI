// Voice control: using the whole app by voice, for anyone who can't easily
// type or use a mouse. Driven through the app with a fake microphone. All
// words are fictional.
import { act, renderHook, screen, waitFor, within } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copy, fill } from '../src/content';
import { leaveSite } from '../src/safety/leaveSite';
import { useInactivityTimeout, VOICE_ACTIVITY_EVENT } from '../src/safety/useInactivityTimeout';
import { begin, renderApp, type User } from './helpers';
import { installSpeech, listeningRecognition, uninstallVoice, type FakeRecognition } from './fakeVoice';

// Short pauses, so the tests don't wait. A box's microphone waits longer with
// voice control on (HANDS_FREE_PAUSE_MS) than without it (VOICE_PAUSE_MS).
vi.mock('../src/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/config')>()),
  VOICE_PAUSE_MS: 20,
  HANDS_FREE_PAUSE_MS: 250,
  HANDS_FREE_RESTART_MS: 5,
  ANSWER_PAUSE_MS: 30,
  TIDY_TIMEOUT_MS: 500,
}));
vi.mock('../src/safety/leaveSite', () => ({ leaveSite: vi.fn() }));

const hf = copy.voice.handsFree;
const bar = () => screen.queryByRole('region', { name: hf.barLabel });
const barSays = () => within(screen.getByRole('region', { name: hf.barLabel })).getByRole('status').textContent;
const voiceSwitch = () => screen.getByRole('switch', { name: hf.switchLabel });

/** Waits for voice control (or a box) to be listening, and gives that microphone. */
async function microphone(): Promise<FakeRecognition> {
  let listening: FakeRecognition | null = null;
  await waitFor(() => {
    listening = listeningRecognition();
    expect(listening).not.toBeNull();
  });
  return listening!;
}

/** Says a phrase into whichever microphone is listening. */
async function say(phrase: string) {
  const listening = await microphone();
  act(() => listening.say(phrase));
}

async function turnOn(user: User) {
  await user.click(await screen.findByRole('button', { name: hf.turnOn }));
  await microphone();
}

async function onIncidentCard(user: User) {
  await turnOn(user);
  await begin(user, 'Stalking');
  await say('Add an incident');
  await screen.findByRole('textbox', { name: copy.incident.descriptionLabel });
}

beforeEach(() => {
  installSpeech();
  vi.mocked(leaveSite).mockClear();
});

afterEach(() => {
  uninstallVoice();
});

describe('turning voice control on and off', () => {
  it('is offered on the Start step, and says where it works when it is not available here', async () => {
    uninstallVoice();
    renderApp();
    expect(screen.getByRole('heading', { name: hf.offerHeading })).toBeInTheDocument();
    expect(screen.getByText(hf.offerUnavailable)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: hf.turnOn })).toBeNull();
    expect(screen.queryByRole('switch', { name: hf.switchLabel })).toBeNull();
  });

  it('turns on from the Start step, listens on this device only, and shows the bar', async () => {
    const user = renderApp();
    expect(await screen.findByRole('switch', { name: hf.switchLabel })).toHaveAttribute('aria-checked', 'false');
    await turnOn(user);

    const listening = listeningRecognition()!;
    expect(listening).toMatchObject({ processLocally: true, continuous: true, lang: 'en-US' });
    expect(within(bar()!).getByText(hf.listening)).toBeInTheDocument();
    expect(voiceSwitch()).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(hf.isOn)).toBeInTheDocument();
  });

  it('turns on and off from the switch in the header, on any step', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await user.click(voiceSwitch());
    await microphone();
    expect(bar()).toBeInTheDocument();
    await user.click(voiceSwitch());
    expect(bar()).toBeNull();
    expect(listeningRecognition()).toBeNull();
  });

  it('stops when she says "stop listening", and stays off', async () => {
    const user = renderApp();
    await turnOn(user);
    await say('Stop listening.');
    expect(bar()).toBeNull();
    expect(voiceSwitch()).toHaveAttribute('aria-checked', 'false');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(listeningRecognition()).toBeNull();
  });

  it('stops when she presses Stop listening', async () => {
    const user = renderApp();
    await turnOn(user);
    await user.click(within(bar()!).getByRole('button', { name: hf.stop }));
    expect(bar()).toBeNull();
    expect(listeningRecognition()).toBeNull();
  });

  it('keeps listening after the browser stops for a long silence', async () => {
    const user = renderApp();
    await turnOn(user);
    const first = listeningRecognition()!;
    act(() => first.fail('no-speech'));
    const next = await microphone();
    expect(next).not.toBe(first);
    expect(barSays()).toBe('');
  });

  it('turns itself off and says why when the microphone is blocked', async () => {
    const user = renderApp();
    await turnOn(user);
    act(() => listeningRecognition()!.fail('not-allowed'));
    expect(barSays()).toBe(copy.voice.errors.blocked);
    expect(voiceSwitch()).toHaveAttribute('aria-checked', 'false');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(listeningRecognition()).toBeNull();

    await user.click(screen.getByRole('button', { name: hf.turnOnAgain }));
    await microphone();
    expect(within(bar()!).getByText(hf.listening)).toBeInTheDocument();
  });

  it('stops trying when the microphone keeps ending as soon as it starts', async () => {
    const user = renderApp();
    await turnOn(user);
    for (let i = 0; i < 3; i++) {
      const listening = await microphone();
      act(() => listening.stop());
    }
    await waitFor(() => expect(barSays()).toBe(hf.stoppedWorking));
    expect(voiceSwitch()).toHaveAttribute('aria-checked', 'false');
    await user.click(screen.getByRole('button', { name: hf.close }));
    expect(bar()).toBeNull();
  });

  it('shows and hides what she can say', async () => {
    const user = renderApp();
    await turnOn(user);
    expect(screen.queryByRole('heading', { name: hf.helpHeading })).toBeNull();
    await say('help');
    expect(screen.getByRole('heading', { name: hf.helpHeading })).toBeInTheDocument();
    for (const item of hf.helpItems) expect(screen.getByText(item)).toBeInTheDocument();
    await say('hide help');
    expect(screen.queryByRole('heading', { name: hf.helpHeading })).toBeNull();
    await user.click(within(bar()!).getByRole('button', { name: hf.help }));
    expect(within(bar()!).getByRole('button', { name: hf.hideHelp })).toHaveAttribute('aria-expanded', 'true');
  });
});

describe('filling in the form by voice', () => {
  it('fills in the Start step: a choice, a list, and the Start button', async () => {
    const user = renderApp();
    await turnOn(user);

    await say('Stalking');
    expect(screen.getByRole('radio', { name: 'Stalking' })).toBeChecked();
    expect(barSays()).toBe(fill(hf.chosen, { name: 'Stalking' }));

    await say('How do you know this person');
    const list = screen.getByRole('combobox', { name: copy.start.relationshipLabel });
    expect(list).toHaveFocus();
    // Its choices are listed in the bar, without "Choose one".
    const choices = within(screen.getByRole('region', { name: hf.barLabel })).getAllByRole('listitem');
    expect(choices.map((item) => item.textContent)).toContain(copy.start.relationships.dating);
    expect(choices.map((item) => item.textContent)).not.toContain(copy.start.relationships['']);

    await say('dating');
    expect(list).toHaveValue('dating');

    // The page's Start button, not "Start" in the step bar.
    await say('Start');
    expect(await screen.findByRole('button', { name: copy.organize.add })).toBeInTheDocument();
  });

  it("says when nothing on the screen has that name", async () => {
    const user = renderApp();
    await turnOn(user);
    await say('banana bread');
    expect(barSays()).toBe(fill(hf.notFound, { said: 'banana bread' }));
  });

  it("speaks into a box by its name, then listens for what to press again", async () => {
    const user = renderApp();
    await onIncidentCard(user);
    const commands = listeningRecognition();

    await say('What happened');
    const box = screen.getByRole('textbox', { name: copy.incident.descriptionLabel });
    expect(box).toHaveFocus();
    // The box's own microphone has taken over, and shows its own status.
    expect(listeningRecognition()).not.toBe(commands);
    expect(bar()).toBeNull();

    await say('he waited by my car');
    await waitFor(() => expect(box).toHaveValue('he waited by my car.'));
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await microphone();

    await say('How did it happen');
    await say('online');
    expect(screen.getByRole('combobox', { name: copy.incident.howLabel })).toHaveValue('online');
  });

  it('gives her longer to pause in a box while voice control is on', async () => {
    const user = renderApp();
    await onIncidentCard(user);
    await say('What happened');
    await say('he waited');
    const box = screen.getByRole('textbox', { name: copy.incident.descriptionLabel });
    // Longer than VOICE_PAUSE_MS: still listening for more.
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(box).toHaveValue('');
    await say('by my car');
    await waitFor(() => expect(box).toHaveValue('he waited. by my car.'));
  });

  it('checks a box only when she says its name, never from a sentence', async () => {
    const user = renderApp();
    await onIncidentCard(user);
    const hurtMe = screen.getByRole('checkbox', { name: copy.incident.acts['caused-harm'] });

    await say('he hurt me');
    expect(hurtMe).not.toBeChecked();
    expect(barSays()).toBe(fill(hf.notFound, { said: 'he hurt me' }));

    await say('hurt me');
    expect(hurtMe).toBeChecked();
    expect(barSays()).toBe(fill(hf.checked, { name: copy.incident.acts['caused-harm'] }));

    await say('check hurt me');
    expect(hurtMe).toBeChecked();
    expect(barSays()).toBe(fill(hf.alreadyChecked, { name: copy.incident.acts['caused-harm'] }));

    await say('uncheck hurt me');
    expect(hurtMe).not.toBeChecked();
  });

  it('shows numbers, and a number presses what it is on', async () => {
    const user = renderApp();
    await turnOn(user);

    await say('7');
    expect(barSays()).toBe(hf.numbersFirst);

    await say('show numbers');
    expect(barSays()).toBe(hf.sayNumber);
    expect(document.querySelectorAll('.voice-number').length).toBeGreaterThan(5);

    await say('99');
    expect(barSays()).toBe(fill(hf.noNumber, { n: 99 }));

    // In the header: 1 is voice control, 2 is dark mode.
    await say('two');
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.querySelectorAll('.voice-number')).toHaveLength(0);
  });

  it('leaves with Quick exit only for its whole name, and turns the microphone off', async () => {
    const user = renderApp();
    await turnOn(user);
    await say('exit');
    expect(leaveSite).not.toHaveBeenCalled();
    await say('Quick exit');
    expect(leaveSite).toHaveBeenCalledTimes(1);
    expect(listeningRecognition()).toBeNull();
    expect(voiceSwitch()).toHaveAttribute('aria-checked', 'false');
  });

  it('turns the microphone off when she leaves with Esc pressed twice', async () => {
    const user = renderApp();
    await turnOn(user);
    await user.keyboard('{Escape}{Escape}');
    expect(leaveSite).toHaveBeenCalledTimes(1);
    expect(listeningRecognition()).toBeNull();
  });

  it('steps aside for "Answer by voice", then listens again', async () => {
    const user = renderApp();
    await onIncidentCard(user);
    const commands = listeningRecognition();

    await say('Answer by voice');
    expect(screen.getByRole('group', { name: copy.voice.guide.panelLabel })).toBeInTheDocument();
    expect(listeningRecognition()).not.toBe(commands);
    expect(bar()).toBeNull();

    await say('stop');
    expect(screen.queryByRole('group', { name: copy.voice.guide.panelLabel })).toBeNull();
    await waitFor(() => expect(bar()).toBeInTheDocument());
    await say('hurt me');
    expect(screen.getByRole('checkbox', { name: copy.incident.acts['caused-harm'] })).toBeChecked();
  });

  it('counts what she says as activity, so she is not timed out while talking', async () => {
    const user = renderApp();
    const onActivity = vi.fn();
    window.addEventListener(VOICE_ACTIVITY_EVENT, onActivity);
    await turnOn(user);
    await say('help');
    expect(onActivity).toHaveBeenCalled();
    window.removeEventListener(VOICE_ACTIVITY_EVENT, onActivity);
  });

  it('has no accessibility problems with the bar, help, and numbers showing', async () => {
    const user = renderApp();
    await turnOn(user);
    await say('help');
    await say('show numbers');
    const results = await axe.run(document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
      rules: { 'color-contrast': { enabled: false } },
    });
    expect(results.violations.map((v) => `${v.id}: ${v.help}`)).toEqual([]);
  });
});

describe('the inactivity timer', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('treats speech like a key press', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useInactivityTimeout(10_000, 2, onTimeout));
    act(() => vi.advanceTimersByTime(7_000));
    act(() => {
      window.dispatchEvent(new Event(VOICE_ACTIVITY_EVENT));
    });
    act(() => vi.advanceTimersByTime(7_000));
    expect(result.current.secondsLeft).toBeNull();
    // The warning shows 8 seconds after she last spoke, not after she began.
    act(() => vi.advanceTimersByTime(1_500));
    expect(result.current.secondsLeft).toBe(2);
    expect(onTimeout).not.toHaveBeenCalled();
  });
});
