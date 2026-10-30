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
  begin,
  confirmIncidents,
  currentQuestion,
  renderApp,
  tellStory,
} from './helpers';

vi.mock('../src/safety/leaveSite', () => ({ leaveSite: vi.fn() }));

const summaryText = () => document.querySelector('pre.summary')?.textContent ?? '';

afterEach(() => {
  vi.restoreAllMocks();
  vi.mocked(leaveSite).mockClear();
});

describe('1. Lena, one incident', () => {
  it('asks the two-or-more question, and "Continue as is" still reaches review with a summary', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await tellStory(user, LENA_ONE_INCIDENT);
    expect(screen.getAllByRole('heading', { level: 2, name: /^Incident \d$/ })).toHaveLength(1);
    await confirmIncidents(user);

    expect(currentQuestion()).toBe(STALKING_QUESTION);
    expect(screen.getByText(fill(copy.check.unverified, { ruleId: 'stalking-two-incidents' }))).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: copy.check.continueAsIs }));
    expect(screen.getByText(copy.check.none)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));

    expect(screen.getByRole('heading', { level: 1, name: copy.review.heading })).toBeInTheDocument();
    expect(screen.getByText(copy.review.notFiling)).toBeInTheDocument();
    expect(summaryText()).toContain('Type of protection order: Stalking');
    expect(summaryText()).toContain('When: March 14');
    expect(summaryText()).toContain(LENA_ONE_INCIDENT);

    await user.click(screen.getByRole('button', { name: copy.review.copy }));
    expect(await screen.findByText(copy.review.copied)).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe(summaryText());
  });
});

describe('2. Lena, four incidents', () => {
  it('after she adds three more, the two-or-more question does not appear', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await tellStory(user, LENA_ONE_INCIDENT);
    await confirmIncidents(user);
    expect(currentQuestion()).toBe(STALKING_QUESTION);

    await user.click(screen.getByRole('button', { name: copy.check.addMore }));
    const addButton = screen.getByRole('button', { name: copy.organize.add });
    expect(addButton).toHaveFocus();

    const earlier = [
      'In January he sat in his car outside the coffee shop where I work and watched me for hours.',
      'In February he sent me more than forty texts in one night saying he was watching me.',
      'In early March he left a note on my car at my new apartment, and I never told him where I moved.',
    ];
    for (const text of earlier) {
      await user.click(screen.getByRole('button', { name: copy.organize.add }));
      const descriptions = screen.getAllByRole('textbox', { name: copy.incident.descriptionLabel });
      await user.click(descriptions[descriptions.length - 1]);
      await user.paste(text);
    }
    expect(screen.getAllByRole('heading', { level: 2, name: /^Incident \d$/ })).toHaveLength(4);

    await confirmIncidents(user);
    expect(currentQuestion()).not.toBe(STALKING_QUESTION);
    expect(screen.queryByText(STALKING_QUESTION)).not.toBeInTheDocument();
  });
});

describe('3. Not sure', () => {
  it('she can pick "Not sure" and finish', async () => {
    const user = renderApp();
    await begin(user, 'Not sure');
    await tellStory(user, LENA_ONE_INCIDENT);
    await confirmIncidents(user);
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    expect(summaryText()).toContain('Type of protection order: Not sure');
  });

  it('she is not forced to choose: Start with nothing picked continues as "Not sure"', async () => {
    const user = renderApp();
    await begin(user);
    expect(screen.getByRole('heading', { level: 1, name: copy.story.heading })).toBeInTheDocument();
    await tellStory(user, LENA_ONE_INCIDENT);
    await confirmIncidents(user);
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
    await tellStory(user, LENA_ONE_INCIDENT);
    expect(quickExit()).toBeInTheDocument();
    await confirmIncidents(user);
    expect(quickExit()).toBeInTheDocument();

    await user.click(quickExit());
    expect(leaveSite).toHaveBeenCalledWith(copy.quickExit.url);

    // State is cleared: back on Start with nothing chosen, and the story is empty.
    expect(screen.getByRole('heading', { level: 1, name: copy.start.heading })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Stalking' })).not.toBeChecked();
    await begin(user);
    expect(screen.getByRole('textbox', { name: copy.story.label })).toHaveValue('');

    // The back button cannot return: the tool adds no history entries, and
    // leaving replaces the current one.
    expect(pushState).not.toHaveBeenCalled();
    expect(replaceState).not.toHaveBeenCalled();
    expect(window.history.length).toBe(historyLength);
    expect(readFileSync('src/safety/leaveSite.ts', 'utf8')).toContain('window.location.replace(url)');
  });
});

describe('5. Timeout', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const warningMs = IDLE_TIMEOUT_MS - TIMEOUT_WARNING_SECONDS * 1000;
  const advance = (ms: number) => act(() => vi.advanceTimersByTime(ms));

  function startStory() {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: copy.start.begin }));
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
    fireEvent.click(screen.getByRole('button', { name: copy.start.begin }));
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
    await begin(user, 'Stalking');
    await tellStory(user, LENA_ONE_INCIDENT);
    await confirmIncidents(user);
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

describe('8. Never blocks', () => {
  it('every check shows "Add more" and "Continue as is", and "Continue as is" always moves on', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    // One short, undated incident triggers all three seeded rules.
    await tellStory(user, 'He yelled at me.');
    await confirmIncidents(user);

    const seen: string[] = [];
    while (currentQuestion()) {
      seen.push(currentQuestion()!);
      expect(screen.getByRole('button', { name: copy.check.addMore })).toBeEnabled();
      await user.click(screen.getByRole('button', { name: copy.check.continueAsIs }));
    }
    expect(seen).toHaveLength(3);
    expect(seen[0]).toBe(STALKING_QUESTION);

    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    expect(summaryText()).toContain('He yelled at me.');
  });

  it('she can continue with no incidents at all', async () => {
    const user = renderApp();
    await begin(user, 'Harassment');
    await tellStory(user, '   ');
    expect(screen.getByText(copy.organize.empty)).toBeInTheDocument();
    await confirmIncidents(user);
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    expect(summaryText()).toContain(copy.summary.noIncidents);
  });

  it('"Add more" on a question about one incident goes to that incident\'s field', async () => {
    const user = renderApp();
    await begin(user, 'Harassment');
    await tellStory(user, 'He yelled at me.');
    await confirmIncidents(user);
    expect(currentQuestion()).toMatch(/remember about when/);
    await user.click(screen.getByRole('button', { name: copy.check.addMore }));
    expect(screen.getByRole('combobox', { name: copy.incident.dateLabel })).toHaveFocus();
  });
});
