// Acceptance tests from section 12 of PROMPT.md. All data is fictional.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { IDLE_TIMEOUT_MS, TIMEOUT_WARNING_SECONDS } from '../src/config';
import { copy, fill } from '../src/content';
import { leaveSite } from '../src/safety/leaveSite';
import { LENA_ONE_INCIDENT } from '../src/samples/lena';
import {
  STALKING_QUESTION,
  addIncident,
  begin,
  goToStep,
  stepName,
  loadSample,
  openQuestionText,
  questionToggle,
  questionToggles,
  renderApp,
  toQuestions,
} from './helpers';

vi.mock('../src/safety/leaveSite', () => ({ leaveSite: vi.fn() }));

const summaryText = () => document.querySelector('pre.summary')?.textContent ?? '';

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(leaveSite).mockClear();
});

describe('1. Lena, one incident', () => {
  it('lists the question closed, and "Continue as is" still reaches review with a summary', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await loadSample(user, 'one');
    expect(screen.getAllByRole('heading', { level: 2, name: /^Incident \d$/ })).toHaveLength(1);
    await toQuestions(user);

    // The count is visible and nothing is open until she opens it. The sample
    // has no place, people, or feelings, and she has not said whether he is a
    // danger now or whether she told him to stop, so those questions come up too.
    expect(screen.getByText(fill(copy.check.total, { total: 6, open: 6 }))).toBeInTheDocument();
    expect(questionToggles()).toHaveLength(6);
    expect(openQuestionText()).toBeNull();

    await user.click(questionToggles()[0]);
    expect(openQuestionText()).toBe(STALKING_QUESTION);
    expect(screen.getByText(fill(copy.check.unverified, { ruleId: 'stalking-two-incidents' }))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: copy.check.continueAsIs }));
    expect(screen.getByText(copy.check.answered)).toBeInTheDocument();
    expect(screen.getByText(fill(copy.check.total, { total: 6, open: 5 }))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));

    expect(screen.getByRole('heading', { level: 1, name: copy.review.heading })).toBeInTheDocument();
    expect(screen.getByText(copy.review.notFiling)).toBeInTheDocument();
    expect(summaryText()).toContain('Type of protection order: Stalking');
    expect(summaryText()).toContain(fill(copy.summary.when, { when: 'March 14' }));
    expect(summaryText()).toContain(LENA_ONE_INCIDENT);

    await user.click(screen.getByRole('button', { name: copy.review.copy }));
    expect(await screen.findByText(copy.review.copied)).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(summaryText());
  });
});

describe('2. Lena, four incidents', () => {
  it('after she adds three more, the two-or-more question is not on the list', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await loadSample(user, 'one');
    await toQuestions(user);
    await user.click(questionToggles()[0]);
    expect(openQuestionText()).toBe(STALKING_QUESTION);

    await user.click(screen.getByRole('button', { name: copy.check.addMore }));
    expect(screen.getByRole('button', { name: copy.organize.add })).toHaveFocus();

    const earlier = [
      'In January he sat in his car outside the coffee shop where I work and watched me for hours.',
      'In February he sent me more than forty texts in one night saying he was watching me.',
      'In early March he left a note on my car at my new apartment, and I never told him where I moved.',
    ];
    for (const text of earlier) await addIncident(user, text);
    expect(screen.getAllByRole('heading', { level: 2, name: /^Incident \d$/ })).toHaveLength(4);

    await toQuestions(user);
    for (const toggle of questionToggles()) await user.click(toggle);
    expect(screen.queryByText(STALKING_QUESTION)).not.toBeInTheDocument();
  });
});

describe('3. Not sure', () => {
  it('she can pick "Not sure" and finish', async () => {
    const user = renderApp();
    await begin(user, 'Not sure');
    await loadSample(user, 'one');
    await toQuestions(user);
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    expect(summaryText()).toContain('Type of protection order: Not sure');
  });

  it('she is not forced to choose: Start with nothing picked continues as "Not sure"', async () => {
    const user = renderApp();
    await begin(user);
    expect(screen.getByRole('heading', { level: 1, name: copy.organize.heading })).toBeInTheDocument();
    await loadSample(user, 'one');
    await toQuestions(user);
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    expect(summaryText()).toContain('Type of protection order: Not sure');
  });
});

describe('4. Quick exit', () => {
  it('is on every screen, clears all state, and leaves with location.replace', async () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    const replaceState = vi.spyOn(window.history, 'replaceState');
    const historyLength = window.history.length;
    const user = renderApp();
    const quickExit = () => screen.getByRole('button', { name: copy.quickExit.label });

    expect(quickExit()).toBeInTheDocument();
    await begin(user, 'Stalking');
    expect(quickExit()).toBeInTheDocument();
    await loadSample(user, 'one');
    expect(quickExit()).toBeInTheDocument();
    await toQuestions(user);
    expect(quickExit()).toBeInTheDocument();

    await user.click(quickExit());
    expect(leaveSite).toHaveBeenCalledWith(copy.quickExit.url);

    // State is cleared: back on Start with nothing chosen, no incidents, and an empty story.
    expect(screen.getByRole('heading', { level: 1, name: copy.start.heading })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Stalking' })).not.toBeChecked();
    await begin(user);
    expect(screen.getByText(copy.organize.empty)).toBeInTheDocument();
    await goToStep(user, 'story');
    expect(screen.getByRole('textbox', { name: copy.story.label })).toHaveValue('');

    // The back button cannot return: the tool adds no history entries, and
    // leaving replaces the current one.
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(window.history.length).toBe(historyLength);
    expect(readFileSync('src/safety/leaveSite.ts', 'utf8')).toContain('window.location.replace(url)');
  });

  it('also leaves when Escape is pressed twice quickly, but not once', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await user.keyboard('{Escape}');
    expect(leaveSite).not.toHaveBeenCalled();
    await user.keyboard('{Escape}');
    expect(leaveSite).toHaveBeenCalledWith(copy.quickExit.url);
    expect(screen.getByRole('heading', { level: 1, name: copy.start.heading })).toBeInTheDocument();
  });
});

describe('5. Timeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const warningMs = IDLE_TIMEOUT_MS - TIMEOUT_WARNING_SECONDS * 1000;
  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  /** Start, then open Your story with the step bar and type into it. */
  function startStory() {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: copy.start.begin }));
    fireEvent.click(screen.getByRole('button', { name: stepName('story') }));
    fireEvent.change(screen.getByRole('textbox', { name: copy.story.label }), {
      target: { value: LENA_ONE_INCIDENT },
    });
  }

  it('warns first, then clears all data after 15 minutes with no activity', () => {
    startStory();
    advance(warningMs - 1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    advance(1);
    const dialog = screen.getByRole('alertdialog', { name: copy.timeout.heading });
    expect(within(dialog).getByText(fill(copy.timeout.body, { seconds: 60 }))).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: copy.timeout.stay })).toHaveFocus();
    // Quick exit stays available during the warning.
    expect(screen.getByRole('button', { name: copy.quickExit.label })).toBeInTheDocument();

    advance(59_000);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    advance(1000);

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 1, name: copy.start.heading })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: stepName('story') }));
    expect(screen.getByRole('textbox', { name: copy.story.label })).toHaveValue('');
  });

  it('"Stay here" keeps her data and restarts the timer', () => {
    startStory();
    advance(warningMs + 30_000);
    fireEvent.click(screen.getByRole('button', { name: copy.timeout.stay }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();

    advance(warningMs - 1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: copy.story.label })).toHaveValue(LENA_ONE_INCIDENT);
  });

  it('activity resets the timer', () => {
    startStory();
    advance(10 * 60 * 1000);
    fireEvent.keyDown(screen.getByRole('textbox', { name: copy.story.label }), { key: 'a' });
    advance(warningMs - 1);
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    advance(1);
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
  });
});

describe('6. No storage', () => {
  it('writes nothing to browser storage at any step', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const setCookie = vi.spyOn(Document.prototype, 'cookie', 'set');
    const openDb = globalThis.indexedDB ? vi.spyOn(globalThis.indexedDB, 'open') : null;

    const user = renderApp();
    await user.click(screen.getByRole('switch', { name: copy.theme.label }));
    await begin(user, 'Stalking');
    await loadSample(user, 'one');
    await toQuestions(user);
    await user.click(questionToggles()[0]);
    await user.click(screen.getByRole('button', { name: copy.check.continueAsIs }));
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    await user.click(screen.getByRole('button', { name: copy.review.copy }));
    await user.click(screen.getByRole('button', { name: copy.quickExit.label }));

    expect(setItem).not.toHaveBeenCalled();
    expect(setCookie).not.toHaveBeenCalled();
    if (openDb) expect(openDb).not.toHaveBeenCalled();
    expect(window.localStorage.length).toBe(0);
    expect(window.sessionStorage.length).toBe(0);
    expect(document.cookie).toBe('');
  });
});

describe('dark mode', () => {
  afterEach(() => vi.useRealTimers());

  it('the header switch turns dark mode on and off', async () => {
    const user = renderApp();
    const toggle = within(screen.getByRole('banner')).getByRole('switch', { name: copy.theme.label });
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset.theme).toBe('dark');

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(document.documentElement.dataset.theme).toBe('light');
  });

  it('stays on when the timeout clears her data', () => {
    vi.useFakeTimers();
    render(<App />);
    fireEvent.click(screen.getByRole('switch', { name: copy.theme.label }));
    act(() => vi.advanceTimersByTime(IDLE_TIMEOUT_MS));

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: copy.theme.label })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
});

describe('8. Never blocks', () => {
  it('every question shows "Add more" and "Continue as is", and "Continue as is" always moves on', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    // One short, undated incident with nothing else filled in triggers eight rules.
    await addIncident(user, 'He yelled at me.');
    await toQuestions(user);

    expect(screen.getByText(fill(copy.check.total, { total: 8, open: 8 }))).toBeInTheDocument();
    const seen: string[] = [];
    for (let i = 0; i < 8; i++) {
      await user.click(questionToggles()[i]);
      seen.push(openQuestionText()!);
      expect(screen.getByRole('button', { name: copy.check.addMore })).toBeEnabled();
      await user.click(screen.getByRole('button', { name: copy.check.continueAsIs }));
    }
    expect(seen).toHaveLength(8);
    expect(seen[0]).toBe(STALKING_QUESTION);
    expect(screen.getByText(fill(copy.check.total, { total: 8, open: 0 }))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    expect(summaryText()).toContain('He yelled at me.');
  });

  it('she can continue with no incidents at all', async () => {
    const user = renderApp();
    await begin(user, 'Not sure');
    expect(screen.getByText(copy.organize.empty)).toBeInTheDocument();
    await toQuestions(user);
    expect(screen.getByText(copy.check.totalNone)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    expect(summaryText()).toContain(copy.summary.noIncidents);
  });

  it('"Add more" on a question about one incident goes to that incident\'s field', async () => {
    const user = renderApp();
    await begin(user, 'Harassment');
    await addIncident(user, 'He yelled at me.');
    await toQuestions(user);
    await user.click(questionToggle(copy.badges.incidentDateMissing));
    expect(openQuestionText()).toMatch(/remember about when/);
    await user.click(screen.getByRole('button', { name: copy.check.addMore }));
    expect(screen.getByRole('combobox', { name: copy.incident.dateLabel })).toHaveFocus();
  });
});

describe('9. Order and moving around', () => {
  it('puts the dated incidents first and her story after, in the summary', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await loadSample(user, 'one');
    await toQuestions(user);
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    const text = summaryText();
    const first = fill(copy.summary.incident, { n: 1 });
    expect(text.indexOf(first)).toBeGreaterThan(-1);
    expect(text.indexOf(copy.summary.story)).toBeGreaterThan(text.indexOf(first));
  });

  it('the step bar goes to any step and keeps her answers', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await loadSample(user, 'one');

    await goToStep(user, 'review');
    expect(screen.getByRole('heading', { level: 1, name: copy.review.heading })).toBeInTheDocument();
    await goToStep(user, 'questions');
    expect(screen.getByRole('heading', { level: 1, name: copy.check.heading })).toBeInTheDocument();
    await goToStep(user, 'incidents');
    expect(screen.getAllByRole('heading', { level: 2, name: /^Incident \d$/ })).toHaveLength(1);
    await goToStep(user, 'story');
    expect(screen.getByRole('textbox', { name: copy.story.label })).toHaveValue(LENA_ONE_INCIDENT);
    expect(screen.getByRole('button', { name: stepName('story') })).toHaveAttribute('aria-current', 'step');
  });
});

describe('10. Follows the petition (PO-0100)', () => {
  it('"Add more" on the place question goes to that incident\'s place field', async () => {
    const user = renderApp();
    await begin(user, 'Not sure');
    await addIncident(user, 'He waited outside my work for two hours and followed my car when I left for home.');
    await toQuestions(user);
    await user.click(questionToggle(copy.badges.incidentPlaceMissing));
    await user.click(screen.getByRole('button', { name: copy.check.addMore }));
    expect(screen.getByRole('textbox', { name: copy.incident.placeLabel })).toHaveFocus();
  });

  it('puts the place, people present, and what the person did in the summary', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await addIncident(user, 'He waited outside my work for two hours and followed my car when I left for home.');
    await user.type(screen.getByRole('textbox', { name: copy.incident.placeLabel }), 'Parking lot at my work');
    await user.type(screen.getByRole('textbox', { name: copy.incident.presentLabel }), 'Me, my coworker Dana');
    await user.click(screen.getByRole('checkbox', { name: copy.incident.acts['placed-in-fear'] }));
    await user.selectOptions(screen.getByRole('combobox', { name: copy.incident.firsthandLabel }), 'no');
    expect(screen.getByText(copy.incident.firsthandNote)).toBeInTheDocument();
    await toQuestions(user);
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));

    const text = summaryText();
    expect(text).toContain(fill(copy.summary.place, { place: 'Parking lot at my work' }));
    expect(text).toContain(fill(copy.summary.present, { present: 'Me, my coworker Dana' }));
    expect(text).toContain(fill(copy.summary.acts, { acts: copy.incident.acts['placed-in-fear'] }));
    expect(text).toContain(copy.summary.firsthandNo);
    expect(screen.getByRole('heading', { level: 2, name: copy.review.formHeading })).toBeInTheDocument();
  });

  it('for domestic violence, "none of these" asks about the relationship and goes back to it', async () => {
    const user = renderApp();
    await user.click(screen.getByRole('radio', { name: copy.start.caseTypes['domestic-violence'] }));
    await user.selectOptions(screen.getByRole('combobox', { name: copy.start.relationshipLabel }), 'none');
    await user.click(screen.getByRole('button', { name: copy.start.begin }));
    await toQuestions(user);
    await user.click(questionToggle(copy.badges.relationshipNotHousehold));
    await user.click(screen.getByRole('button', { name: copy.check.addMore }));
    const select = screen.getByRole('combobox', { name: copy.start.relationshipLabel });
    expect(select).toHaveFocus();
    expect(select).toHaveValue('none');
  });

  it('shows the harassment hearing note only for harassment', async () => {
    const user = renderApp();
    await begin(user, 'Harassment');
    await toQuestions(user);
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    expect(screen.getByText(copy.review.formHarassment)).toBeInTheDocument();
  });
});

describe('11. Questions about the person', () => {
  it('"Add more" on the danger question goes to that field on Your story', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await loadSample(user, 'one');
    await toQuestions(user);
    await user.click(questionToggle(copy.badges.presentThreatMissing));
    await user.click(screen.getByRole('button', { name: copy.check.addMore }));
    expect(screen.getByRole('heading', { level: 1, name: copy.story.heading })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: copy.story.threatLabel })).toHaveFocus();
  });

  it('puts the danger answer and "told them to stop" in the summary', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await loadSample(user, 'one');
    await user.click(screen.getByRole('button', { name: copy.organize.confirm }));
    await user.type(screen.getByRole('textbox', { name: copy.story.threatLabel }), 'He said he would be back.');
    await user.selectOptions(screen.getByRole('combobox', { name: copy.story.askedToStopLabel }), 'yes');
    await user.type(screen.getByRole('textbox', { name: copy.story.askedToStopDetailLabel }), 'I texted him on March 2.');
    await user.click(screen.getByRole('button', { name: copy.story.next }));
    expect(questionToggles().some((t) => t.textContent?.includes(copy.badges.presentThreatMissing))).toBe(false);
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));

    const text = summaryText();
    expect(text).toContain(copy.summary.threat);
    expect(text).toContain('He said he would be back.');
    expect(text).toContain(fill(copy.summary.askedToStop, { answer: 'Yes. I texted him on March 2.' }));
  });
});
