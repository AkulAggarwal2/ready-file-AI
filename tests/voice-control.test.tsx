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
import {
  installModel,
  installSpeech,
  listeningRecognition,
  modelAnswer,
  uninstallVoice,
  type FakeRecognition,
} from './fakeVoice';

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
const g = hf.guide;
const modelAnswerChoice = (choice: string) => JSON.stringify({ choice });
/** The question the bar is asking. */
const asking = () => document.querySelector('.hands-free-question')?.textContent ?? null;
const choicesShown = () =>
  Array.from(document.querySelectorAll('.hands-free-choices li')).map((item) => item.firstChild?.textContent);
async function nowAsking(prompt: string) {
  await waitFor(() => expect(asking()).toBe(prompt));
}

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
  await nowAsking(hf.ask.addIncident);
  await say('Add an incident');
  await screen.findByRole('textbox', { name: copy.incident.descriptionLabel });
  await nowAsking(copy.incident.dateLabel);
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
    // It starts with the step's first question.
    expect(asking()).toBe(copy.start.caseTypeLegend);
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
    // It starts with the step's first question.
    expect(asking()).toBe(copy.start.caseTypeLegend);
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

describe('answering the questions in order', () => {
  it("asks the Start step's questions one at a time, and moves on as she answers", async () => {
    const user = renderApp();
    await turnOn(user);
    expect(document.querySelector('.hands-free-progress')?.textContent).toBe(fill(g.progress, { n: 1, total: 3 }));
    expect(choicesShown()).toEqual(Object.values(copy.start.caseTypes));

    // A choice by its number.
    await say('2');
    expect(screen.getByRole('radio', { name: copy.start.caseTypes.harassment })).toBeChecked();
    await nowAsking(copy.start.relationshipLabel);
    expect(screen.getByRole('combobox', { name: copy.start.relationshipLabel })).toHaveFocus();
    // Its choices, without "Choose one".
    expect(choicesShown()).not.toContain(copy.start.relationships['']);

    await say('back');
    await nowAsking(copy.start.caseTypeLegend);
    // A choice by one of its words.
    await say('stalking');
    expect(screen.getByRole('radio', { name: copy.start.caseTypes.stalking })).toBeChecked();
    await nowAsking(copy.start.relationshipLabel);

    await say('dating');
    expect(screen.getByRole('combobox', { name: copy.start.relationshipLabel })).toHaveValue('dating');
    await nowAsking(hf.ask.start);
    expect(document.querySelector('.hands-free-say')?.textContent).toBe(fill(g.sayYes, { name: copy.start.begin }));

    await say('yes');
    expect(await screen.findByRole('button', { name: copy.organize.add })).toBeInTheDocument();
    await nowAsking(hf.ask.addIncident);
  });

  it('moves between questions with the Skip and Previous buttons too', async () => {
    const user = renderApp();
    await turnOn(user);
    await user.click(screen.getByRole('button', { name: g.skip }));
    await nowAsking(copy.start.relationshipLabel);
    await user.click(screen.getByRole('button', { name: g.previous }));
    await nowAsking(copy.start.caseTypeLegend);
    await user.click(screen.getByRole('button', { name: g.previous }));
    expect(barSays()).toBe(g.first);
  });

  it('says so when it did not catch an answer', async () => {
    const user = renderApp();
    await turnOn(user);
    await say('banana bread');
    // With no model in the browser, it says so once it knows.
    await waitFor(() => expect(barSays()).toBe(g.notUnderstood));
    expect(asking()).toBe(copy.start.caseTypeLegend);
  });

  it('fills in an incident: a spoken date, a box, a list, and check boxes', async () => {
    const user = renderApp();
    await onIncidentCard(user);

    // "When did it happen?" takes the date itself.
    await say('last week');
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: copy.incident.approximateLabel })).toHaveValue('last week'),
    );

    // A box: its own microphone listens, and the question stays in the bar.
    await nowAsking(copy.incident.placeLabel);
    const place = screen.getByRole('textbox', { name: copy.incident.placeLabel });
    expect(place).toHaveFocus();
    expect(within(bar()!).getByText(g.listeningText)).toBeInTheDocument();
    await say('outside my gym');
    await waitFor(() => expect(place).toHaveValue('outside my gym'));

    await nowAsking(copy.incident.howLabel);
    await say('in person');
    expect(screen.getByRole('combobox', { name: copy.incident.howLabel })).toHaveValue('in-person');

    await nowAsking(copy.incident.descriptionLabel);
    await say('he waited by my car');
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: copy.incident.descriptionLabel })).toHaveValue('he waited by my car.'),
    );

    // Check boxes: each one she says, then "done".
    await nowAsking(copy.incident.actsLegend);
    const box = (act: keyof typeof copy.incident.acts) => screen.getByRole('checkbox', { name: copy.incident.acts[act] });
    // A wrong check on a sworn form is serious: one word, or a "not", checks nothing.
    await say('afraid');
    expect(box('placed-in-fear')).not.toBeChecked();
    await say("he didn't hurt me");
    expect(box('caused-harm')).not.toBeChecked();
    expect(barSays()).toBe(g.notChecked);
    // In a sentence: only the one she named in full.
    await say('he threatened to hurt me');
    expect(box('threatened-harm')).toBeChecked();
    expect(box('caused-harm')).not.toBeChecked();
    await say('hurt me');
    expect(box('caused-harm')).toBeChecked();
    expect(asking()).toBe(copy.incident.actsLegend);
    await say('done');
    await nowAsking(copy.incident.presentLabel);
  });

  it('understands a choice said in a sentence', async () => {
    const user = renderApp();
    await turnOn(user);
    await say("I'm seeking for stalking");
    expect(screen.getByRole('radio', { name: copy.start.caseTypes.stalking })).toBeChecked();
    expect(barSays()).toBe(fill(g.understood, { name: copy.start.caseTypes.stalking }));

    await nowAsking(copy.start.relationshipLabel);
    await say('back');
    await nowAsking(copy.start.caseTypeLegend);
    await say("it's not stalking, it's harassment");
    expect(screen.getByRole('radio', { name: copy.start.caseTypes.harassment })).toBeChecked();

    await nowAsking(copy.start.relationshipLabel);
    await say('we used to date');
    expect(screen.getByRole('combobox', { name: copy.start.relationshipLabel })).toHaveValue('dating');
  });

  it('asks which one she meant when two fit', async () => {
    const user = renderApp();
    await turnOn(user);
    await say("I'm not sure if it's stalking");
    expect(barSays()).toBe(
      fill(g.whichOne, { names: `“${copy.start.caseTypes.stalking}” or “${copy.start.caseTypes['not-sure']}”` }),
    );
    expect(screen.getByRole('radio', { name: copy.start.caseTypes.stalking })).not.toBeChecked();
    expect(asking()).toBe(copy.start.caseTypeLegend);
  });

  it('with the on-device model, understands her own words, and only picks from the list', async () => {
    const model = installModel({
      answer: (input) =>
        modelAnswerChoice(input.includes("my ex") ? copy.start.relationships.dating : input.includes('weather') ? 'none' : 'Something else'),
    });
    const user = renderApp();
    await turnOn(user);
    await say('skip');
    await nowAsking(copy.start.relationshipLabel);

    // Not a choice.
    await say('the weather is nice');
    await waitFor(() => expect(barSays()).toBe(g.notUnderstood));
    // An answer that isn't on the list is never used.
    await say('he lives down the road');
    await waitFor(() => expect(barSays()).toBe(g.notUnderstood));
    expect(screen.getByRole('combobox', { name: copy.start.relationshipLabel })).toHaveValue('');

    await say("he's my ex");
    await waitFor(() => expect(screen.getByRole('combobox', { name: copy.start.relationshipLabel })).toHaveValue('dating'));
    expect(barSays()).toBe(fill(g.understood, { name: copy.start.relationships.dating }));
    // The model was told the question and its choices, and kept to them.
    expect(model.inputs.at(-1)).toContain(`Question: ${copy.start.relationshipLabel}`);
    expect(model.promptOptions.at(-1)?.responseConstraint).toMatchObject({
      properties: { choice: { enum: expect.arrayContaining([copy.start.relationships.dating, 'none']) } },
    });
  });

  it("ignores the model's answer if she has moved on by then", async () => {
    installModel({
      answer: () =>
        new Promise<string>((resolve) => setTimeout(() => resolve(modelAnswerChoice(copy.start.relationships.dating)), 150)),
    });
    const user = renderApp();
    await turnOn(user);
    await say('skip');
    await nowAsking(copy.start.relationshipLabel);
    await say("he's my ex");
    expect(barSays()).toBe(g.thinking);
    await say('skip');
    await nowAsking(hf.ask.start);
    await new Promise((resolve) => setTimeout(resolve, 250));
    expect(screen.getByRole('combobox', { name: copy.start.relationshipLabel })).toHaveValue('');
    expect(asking()).toBe(hf.ask.start);
  });

  it('understands yes, no, and skip in a sentence', async () => {
    const user = renderApp();
    await turnOn(user);
    await say('can we skip this one');
    await nowAsking(copy.start.relationshipLabel);
    await say('skip');
    await nowAsking(hf.ask.start);
    await say("yeah let's start");
    await nowAsking(hf.ask.addIncident);
    await say("no I'm done");
    await nowAsking(hf.ask.incidentsDone);
  });

  it('puts "it happened last week" in the "about when" box as "last week"', async () => {
    const user = renderApp();
    await onIncidentCard(user);
    await say('I think it happened last week');
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: copy.incident.approximateLabel })).toHaveValue('last week'),
    );
  });

  it('puts a date said in a sentence in the date box', async () => {
    const user = renderApp();
    await onIncidentCard(user);
    await say('the date was March 3, 2026');
    await waitFor(() => expect(screen.getByLabelText(copy.incident.exactLabel)).toHaveValue('2026-03-03'));
  });

  it('puts an exact date in the date box', async () => {
    const user = renderApp();
    await onIncidentCard(user);
    await say('March 3, 2026');
    await waitFor(() => expect(screen.getByLabelText(copy.incident.exactLabel)).toHaveValue('2026-03-03'));
    await nowAsking(copy.incident.placeLabel);
  });

  it('never puts other talk into "When did it happen?"', async () => {
    const user = renderApp();
    await onIncidentCard(user);
    await say('turn the TV down');
    expect(barSays()).toBe(g.notUnderstood);
    expect(screen.getByRole('combobox', { name: copy.incident.dateLabel })).toHaveValue('exact');
    expect(asking()).toBe(copy.incident.dateLabel);
  });

  it('"skip" said into a box moves on at once, and adds nothing', async () => {
    const user = renderApp();
    await onIncidentCard(user);
    await say('skip');
    await nowAsking(copy.incident.exactLabel);
    await say('skip');
    await nowAsking(copy.incident.placeLabel);
    const boxMicrophone = await microphone();
    act(() => boxMicrophone.say('skip'));
    // At once: well before the pause a box waits for (HANDS_FREE_PAUSE_MS).
    await waitFor(() => expect(asking()).toBe(copy.incident.howLabel), { timeout: 200 });
    expect(screen.getByRole('textbox', { name: copy.incident.placeLabel })).toHaveValue('');
  });

  it('when nothing went into a box, she can try again', async () => {
    const user = renderApp();
    await onIncidentCard(user);
    await say('skip');
    await say('skip');
    await nowAsking(copy.incident.placeLabel);
    const first = await microphone();
    act(() => first.fail('no-speech'));
    await waitFor(() => expect(barSays()).toBe(g.noAnswer));
    expect(asking()).toBe(copy.incident.placeLabel);

    await say('try again');
    await waitFor(() => expect(within(bar()!).getByText(g.listeningText)).toBeInTheDocument());
    await say('the parking lot');
    await waitFor(() => expect(screen.getByRole('textbox', { name: copy.incident.placeLabel })).toHaveValue('the parking lot'));
  });

  it('waits while her words are tidied, then moves on', async () => {
    // A model that takes a moment to tidy.
    installModel({
      answer: () => new Promise<string>((resolve) => setTimeout(() => resolve(modelAnswer(true, 'Outside my gym.')), 200)),
    });
    const user = renderApp();
    await onIncidentCard(user);
    await say('skip');
    await say('skip');
    await nowAsking(copy.incident.placeLabel);
    await say('um outside my gym');
    const place = screen.getByRole('textbox', { name: copy.incident.placeLabel });
    await waitFor(() => expect(place).not.toHaveValue(''));
    await nowAsking(copy.incident.howLabel);
    expect(barSays()).not.toBe(g.noAnswer);
  });

  it('starts the questions of a step she moves to with the mouse', async () => {
    const user = renderApp();
    await turnOn(user);
    await user.click(screen.getByRole('button', { name: copy.start.begin }));
    await nowAsking(hf.ask.addIncident);
  });

  it('starts the next step after the last question of this one', async () => {
    const user = renderApp();
    await turnOn(user);
    await say('skip');
    await say('skip');
    await nowAsking(hf.ask.start);
    await say('no');
    expect(barSays()).toBe(g.last);
    await user.click(screen.getByRole('button', { name: copy.start.begin }));
    await nowAsking(hf.ask.addIncident);
  });

  it('opens each card on the Questions step and offers its two answers', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await user.click(screen.getByRole('button', { name: copy.organize.confirm }));
    await user.click(screen.getByRole('button', { name: copy.story.next }));
    await user.click(voiceSwitch());
    await microphone();

    const toggles = document.querySelectorAll<HTMLElement>('.question-toggle');
    await waitFor(() => expect(toggles[0]).toHaveAttribute('aria-expanded', 'true'));
    const firstQuestion = document.querySelector('.question-text')!.textContent!;
    await nowAsking(firstQuestion);
    expect(document.querySelector('.hands-free-say')?.textContent).toBe(
      fill(g.sayButtons, { names: `“${copy.check.addMore}” or “${copy.check.continueAsIs}.”` }),
    );

    await say('continue as is');
    await waitFor(() => expect(within(toggles[0]).getByText(copy.check.answered)).toBeInTheDocument());
    // Then the next question on the step.
    await waitFor(() => expect(asking()).not.toBe(firstQuestion));
  });
});

describe('saying what she sees', () => {
  it("speaks into a box by its name, and moves on once she has answered", async () => {
    const user = renderApp();
    await onIncidentCard(user);
    const commands = listeningRecognition();

    await say('What happened');
    const box = screen.getByRole('textbox', { name: copy.incident.descriptionLabel });
    expect(box).toHaveFocus();
    // The box's own microphone has taken over.
    expect(listeningRecognition()).not.toBe(commands);
    await nowAsking(copy.incident.descriptionLabel);

    await say('he waited by my car');
    await waitFor(() => expect(box).toHaveValue('he waited by my car.'));
    await nowAsking(copy.incident.actsLegend);

    await say('How did it happen');
    await nowAsking(copy.incident.howLabel);
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

    // Without numbers showing, a number picks one of the question's choices.
    await say('7');
    expect(barSays()).toBe(fill(hf.noNumber, { n: 7 }));

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

  it('hides "Answer by voice" on a card while voice control asks the questions', async () => {
    const user = renderApp();
    await onIncidentCard(user);
    expect(screen.queryByRole('button', { name: copy.voice.guide.start })).toBeNull();
    await say('stop listening');
    expect(await screen.findByRole('button', { name: copy.voice.guide.start })).toBeInTheDocument();
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
