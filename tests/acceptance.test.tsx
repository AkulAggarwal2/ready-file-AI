// Acceptance tests from section 12 of PROMPT.md. All data is fictional.
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { IDLE_TIMEOUT_MS, TIMEOUT_WARNING_SECONDS } from '../src/config';
import { copy, fill } from '../src/content';
import { leaveSite } from '../src/safety/leaveSite';
import { LENA_ONE_INCIDENT } from '../src/samples/lena';
import { initialState, reducer } from '../src/state/appState';
import { courtForm } from '../src/forms';
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
  toStart,
  toStartSync,
  type User,
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
    // fills in her place, but has no people or feelings, and she has not said
    // whether he is a danger now or whether she told him to stop, so those
    // questions come up too.
    expect(screen.getByText(fill(copy.check.total, { total: 5, open: 5 }))).toBeInTheDocument();
    expect(questionToggles()).toHaveLength(5);
    expect(openQuestionText()).toBeNull();

    await user.click(questionToggles()[0]);
    expect(openQuestionText()).toBe(STALKING_QUESTION);
    // Verified rules show no "Unverified rule" label, even in demo mode.
    expect(screen.queryByText(fill(copy.check.unverified, { ruleId: 'stalking-two-incidents' }))).toBeNull();

    await user.click(screen.getByRole('button', { name: copy.check.continueAsIs }));
    expect(screen.getByText(copy.check.answered)).toBeInTheDocument();
    expect(screen.getByText(fill(copy.check.total, { total: 5, open: 4 }))).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));

    expect(screen.getByRole('heading', { level: 1, name: copy.review.heading })).toBeInTheDocument();
    expect(screen.getByText(copy.review.notFiling)).toBeInTheDocument();
    expect(summaryText()).toContain(fill(copy.summary.grounds, { grounds: copy.start.grounds.stalking }));
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

describe('2b. More than one ground (PO-0100 question 1: "check those which apply")', () => {
  it('lists every ground she checked, in the form\'s order, and asks a shared question once', async () => {
    const user = renderApp();
    await toStart(user);
    await user.click(screen.getByRole('checkbox', { name: copy.start.grounds.harassment }));
    await user.click(screen.getByRole('checkbox', { name: copy.start.grounds.stalking }));
    await user.click(screen.getByRole('button', { name: copy.start.begin }));
    await loadSample(user, 'one');
    await toQuestions(user);
    // stalking-two-incidents and harassment-repeated ask the same thing; only one is listed.
    expect(questionToggles().filter((t) => t.textContent?.includes(copy.badges.incidentCountBelow))).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    expect(summaryText()).toContain(
      fill(copy.summary.grounds, { grounds: `${copy.start.grounds.stalking}; ${copy.start.grounds.harassment}` }),
    );
    // Not harassment alone, so the harassment-only note is not shown.
    expect(screen.queryByText(copy.review.formHarassment)).toBeNull();
  });
});

describe('3. Not sure', () => {
  it('she can pick "Not sure" and finish', async () => {
    const user = renderApp();
    await begin(user, 'Not sure');
    await loadSample(user, 'one');
    await toQuestions(user);
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    expect(summaryText()).toContain(copy.summary.groundsNotSure);
  });

  it('she is not forced to choose: Start with nothing picked continues as "Not sure"', async () => {
    const user = renderApp();
    await begin(user);
    expect(screen.getByRole('heading', { level: 1, name: copy.organize.heading })).toBeInTheDocument();
    await loadSample(user, 'one');
    await toQuestions(user);
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    expect(summaryText()).toContain(copy.summary.groundsNotSure);
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

    // State is cleared: back at the first question with nothing chosen, no
    // incidents, and an empty story.
    expect(screen.getByRole('heading', { level: 1, name: copy.route.heading })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'Me' })).not.toBeChecked();
    await toStart(user);
    expect(screen.getByRole('checkbox', { name: copy.start.grounds.stalking })).not.toBeChecked();
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
    expect(screen.getByRole('heading', { level: 1, name: copy.route.heading })).toBeInTheDocument();
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
    toStartSync();
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
    expect(screen.getByRole('heading', { level: 1, name: copy.route.heading })).toBeInTheDocument();
    toStartSync();
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
    await toStart(user);
    await user.click(screen.getByRole('checkbox', { name: copy.start.grounds['domestic-violence'] }));
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

describe('12. Numbers and pages match the form', () => {
  async function addDated(user: User, details: string, date: string) {
    await addIncident(user, details);
    const kinds = screen.getAllByRole('combobox', { name: copy.incident.dateLabel });
    await user.selectOptions(kinds[kinds.length - 1], 'exact');
    const dates = document.querySelectorAll<HTMLInputElement>('input[type="date"]');
    fireEvent.change(dates[dates.length - 1], { target: { value: date } });
  }

  it('keeps her order and numbers everywhere, and asks once if full dates are out of order', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await addDated(user, 'Sent fourteen texts in one night saying he knew where I worked and lived.', '2026-10-02');
    await addDated(user, 'Tried to force open my screen door late at night and yelled my name.', '2026-09-14');
    await toQuestions(user);

    // Incident 2 is still the screen door on the Questions step.
    const placeQuestion = `${fill(copy.timeline.incident, { n: 2 })} · ${copy.badges.incidentPlaceMissing}`;
    await user.click(questionToggle(placeQuestion));
    expect(screen.getByText(/screen door/, { selector: 'blockquote' })).toBeInTheDocument();
    await user.click(questionToggle(placeQuestion));

    // "Add more" on the order question goes to the top of her list.
    await user.click(questionToggle(copy.badges.incidentsOutOfOrder));
    await user.click(screen.getByRole('button', { name: copy.check.addMore }));
    expect(screen.getByRole('heading', { level: 1, name: copy.organize.heading })).toHaveFocus();

    // The summary keeps her order and numbers, with readable dates.
    await toQuestions(user);
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    const text = summaryText();
    expect(text.indexOf('fourteen texts')).toBeLessThan(text.indexOf('screen door'));
    expect(text.indexOf(fill(copy.summary.incident, { n: 2 }))).toBeLessThan(text.indexOf('screen door'));
    expect(text).toContain(fill(copy.summary.when, { when: 'September 14, 2026' }));
  });

  it('labels incidents 4 and up as Attachment 8a', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await loadSample(user, 'four');
    await toQuestions(user);
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    const text = summaryText();
    expect(text).toContain(copy.summary.attachmentNote);
    expect(text).toContain(fill(copy.summary.incident, { n: 3 }));
    expect(text).toContain(fill(copy.summary.incidentAttachment, { n: 4 }));
  });
});

describe('13. Sex offense', () => {
  it('asks about a conviction on Your story, and the Review checklist explains question 2', async () => {
    const user = renderApp();
    await toStart(user);
    await user.click(screen.getByRole('checkbox', { name: copy.start.grounds['sex-offense'] }));
    await user.click(screen.getByRole('button', { name: copy.start.begin }));
    await addIncident(user, 'He came to my apartment after a party and forced me into sexual activity.');
    await toQuestions(user);
    expect(questionToggles().some((t) => t.textContent?.includes(copy.badges.incidentsOutOfOrder))).toBe(false);
    await user.click(questionToggle(copy.badges.convictionMissing));
    await user.click(screen.getByRole('button', { name: copy.check.addMore }));
    const select = screen.getByRole('combobox', { name: copy.story.convictedLabel });
    expect(select).toHaveFocus();
    await user.selectOptions(select, 'yes');
    await user.click(screen.getByRole('button', { name: copy.check.backToQuestion }));
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    expect(summaryText()).toContain(copy.summary.convicted);
    expect(screen.getByText(copy.review.formSexOffense)).toBeInTheDocument();
  });

  it('does not ask about a conviction for other order types', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await addIncident(user, 'He waited outside my work for two hours and followed my car when I left for home.');
    await user.click(screen.getByRole('button', { name: copy.organize.confirm }));
    expect(screen.queryByRole('combobox', { name: copy.story.convictedLabel })).toBeNull();
  });
});

// Petition Review Flags, petitioner side. All data is fictional.
describe('14. Petition review flags', () => {
  it('marks a possible phone number, never changes her words, and "Continue as is" still works', async () => {
    const user = renderApp();
    await begin(user, 'Harassment');
    const words = 'He waited by my car after my shift and followed me home. Call me at 260-555-0142 if needed.';
    await addIncident(user, words);
    await user.type(screen.getByRole('textbox', { name: copy.incident.placeLabel }), 'Outside my job');
    await toQuestions(user);

    // Harassment asks other questions too, so open this one by its badge.
    await user.click(questionToggle(copy.badges.incidentContactInfo));
    expect(openQuestionText()).toMatch(/confidential section/);
    expect(document.querySelector('.question-body mark')?.textContent).toBe('260-555-0142');
    expect(document.querySelector('.question-body blockquote')?.textContent).toBe(words);

    await user.click(screen.getByRole('button', { name: copy.check.continueAsIs }));
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    expect(summaryText()).toContain(words);
    expect(summaryText()).toContain(fill(copy.summary.place, { place: 'Outside my job' }));
  });

  it('safety questions are optional, can be cleared, and only answered ones reach the summary', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await loadSample(user, 'one');
    await toQuestions(user);

    expect(screen.getByRole('heading', { level: 2, name: copy.safety.heading })).toBeInTheDocument();
    const choke = screen.getByRole('group', { name: /choked or strangled/ });
    await user.click(within(choke).getByRole('radio', { name: copy.safety.answers.yes }));
    const weapon = screen.getByRole('group', { name: /gun or other weapon/ });
    await user.click(within(weapon).getByRole('radio', { name: copy.safety.answers.unsure }));
    await user.click(within(weapon).getByRole('button', { name: new RegExp(copy.safety.clear) }));
    expect(within(weapon).getByRole('radio', { name: copy.safety.answers.unsure })).not.toBeChecked();

    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    expect(summaryText()).toContain(copy.summary.safety);
    expect(summaryText()).toContain('Has the person ever choked or strangled you? Yes');
    expect(summaryText()).not.toContain('weapon');
  });

  it('quick exit and timeout (both reset) clear safety answers', () => {
    const answered = reducer(initialState, { type: 'setSafetyAnswer', id: 'choke', answer: 'yes' });
    expect(answered.safetyAnswers).toEqual({ choke: 'yes' });
    expect(reducer(answered, { type: 'reset' }).safetyAnswers).toEqual({});
  });

  it('with no safety answers, the summary has no safety section', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await loadSample(user, 'one');
    await toQuestions(user);
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    expect(summaryText()).not.toContain(copy.summary.safety);
  });
});

describe('getting back to a question, and one incident at a time', () => {
  it('"Back to the question" returns to the question she came from, open and focused', async () => {
    const user = renderApp();
    await begin(user, 'Harassment');
    await addIncident(user, 'He yelled at me.');
    await toQuestions(user);
    await user.click(questionToggle(copy.badges.incidentPlaceMissing));
    await user.click(screen.getByRole('button', { name: copy.check.addMore }));
    expect(screen.getByRole('textbox', { name: copy.incident.placeLabel })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: copy.check.backToQuestion }));
    const toggle = questionToggle(copy.badges.incidentPlaceMissing);
    expect(toggle).toHaveFocus();
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });

  it('has no way back when she came to the incidents another way', async () => {
    const user = renderApp();
    await begin(user, 'Harassment');
    await addIncident(user, 'He yelled at me.');
    expect(screen.queryByRole('button', { name: copy.check.backToQuestion })).toBeNull();
  });

  it('a question chip on an incident opens it at that field', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await loadSample(user, 'four');
    const card = screen.getAllByRole('region', { name: /^Incident \d$/ })[0];
    const chip = within(card).getAllByRole('button', { name: copy.badges.incidentPeopleMissing })[0];
    await user.click(chip);
    expect(within(card).getByRole('textbox', { name: copy.incident.presentLabel })).toHaveFocus();
  });

  it('keeps one incident open, and Done closes it', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await loadSample(user, 'four');
    const edits = screen.getAllByRole('button', { name: copy.incident.edit });
    await user.click(edits[0]);
    await user.click(edits[1]);
    expect(screen.getAllByRole('textbox', { name: copy.incident.descriptionLabel })).toHaveLength(1);

    const done = screen.getAllByRole('button', { name: copy.incident.done });
    await user.click(done[done.length - 1]);
    expect(screen.queryAllByRole('textbox', { name: copy.incident.descriptionLabel })).toHaveLength(0);
    expect(screen.getByRole('heading', { level: 2, name: 'Incident 2' })).toHaveFocus();
  });
});

// The route step picks the court forms (content/routing.json), from the
// IOJA forms page and the PO-0102, PO-0103 and WV-0100 instructions.
describe('15. Your situation picks the court forms', () => {
  async function choose(user: User, ...options: string[]) {
    for (const option of options) {
      await user.click(screen.getByRole('radio', { name: option }));
      await user.click(screen.getByRole('button', { name: copy.route.continue }));
    }
  }

  it('shows no step bar while she answers, then the petition steps once a petition is picked', async () => {
    const user = renderApp();
    expect(screen.queryByRole('navigation', { name: copy.app.stepsLabel })).toBeNull();
    expect(screen.getByText(fill(copy.route.questionNumber, { n: 1 }))).toBeInTheDocument();
    await choose(user, 'Me', 'Ask for a new protection order', 'At or near my home');
    expect(screen.getByRole('heading', { level: 1, name: 'Petition for an order for protection' })).toBeInTheDocument();
    // Plain names first, with the court's title beneath.
    expect(screen.getByText('The petition')).toBeInTheDocument();
    expect(screen.getByText(courtForm('PO-0100').title)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: stepName('route') })).toHaveAttribute('aria-current', 'step');
    expect(screen.getByRole('button', { name: stepName('start') })).toBeEnabled();
    await user.click(screen.getByRole('button', { name: copy.route.toPetition }));
    expect(screen.getByRole('heading', { level: 1, name: copy.start.heading })).toBeInTheDocument();
  });

  it('shows no step bar on an outcome that only explains', async () => {
    const user = renderApp();
    await choose(user, 'Me', 'I want a no contact order in a criminal case');
    expect(screen.queryByRole('navigation', { name: copy.app.stepsLabel })).toBeNull();
  });

  it('tells someone harassed at work that only an employer files the workplace forms', async () => {
    const user = renderApp();
    await choose(user, 'Me', 'Ask for a new protection order');
    await user.click(screen.getByRole('radio', { name: 'At or near my work' }));
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent(/Only an employer can file the workplace violence forms/);
  });

  it('gives an employer the workplace violence packet and goes on to fill it', async () => {
    const user = renderApp();
    await choose(user, 'An employee of my business or organization', 'Yes', 'Made a believable threat of violence', 'Yes', 'No', 'Ask for a new workplace violence restraining order');
    for (const number of ['WV-0101', 'WV-0102', 'WV-0104', 'WV-0105', 'WV-0103']) expect(screen.getByText(number)).toBeInTheDocument();
    expect(screen.queryByText(copy.route.notFilledYet)).toBeNull();
    expect(screen.queryByRole('button', { name: copy.route.toPetition })).toBeNull();
    await user.click(screen.getByRole('button', { name: copy.route.toForm }));
    expect(screen.getByRole('textbox', { name: "The employer's full legal name" })).toBeInTheDocument();
    expect(screen.getByText(/· WV-0101/)).toBeInTheDocument();
  });

  it('sends an employer without 2 employees to an explanation, and Start over goes back to the first question', async () => {
    const user = renderApp();
    await choose(user, 'An employee of my business or organization', 'No');
    expect(screen.getByRole('heading', { level: 1, name: 'Workplace violence orders are for employers' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.route.startOver }));
    expect(screen.getByRole('radio', { name: 'Me' })).not.toBeChecked();
    expect(screen.queryByRole('button', { name: copy.route.back })).toBeNull();
  });

  it('explains that a no contact order comes from a criminal case', async () => {
    const user = renderApp();
    await choose(user, 'Me', 'I want a no contact order in a criminal case');
    expect(screen.getByRole('heading', { level: 1, name: 'No contact orders' })).toBeInTheDocument();
    expect(screen.queryByText(copy.route.formsHeading)).toBeNull();
  });
});

// The Court forms step asks the rest of what PO-0100, PO-0104 and PNW-0102
// need, in each form's order, and builds the PDF on the device.
describe('16. Court forms', () => {
  async function toForms(user: User) {
    await begin(user, 'Stalking');
    await loadSample(user, 'one');
    await toQuestions(user);
    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    await user.click(screen.getByRole('button', { name: copy.review.toForms }));
  }

  it('starts with the case heading of the petition and shows a field only when it applies', async () => {
    const user = renderApp();
    await toForms(user);
    expect(screen.getByRole('heading', { level: 1, name: 'The court and the people in the case' })).toHaveFocus();
    expect(screen.getByText(/Section 1 of \d+ · PO-0100/)).toBeInTheDocument();
    await user.type(screen.getByRole('textbox', { name: 'County where you are filing' }), 'Allen');

    await user.click(screen.getByRole('button', { name: 'Other cases, the county, and your public address' }));
    const address = () => screen.queryByRole('textbox', { name: 'Your public mailing address' });
    expect(address()).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: copy.forms.yes }));
    expect(address()).toBeNull();

    await user.click(screen.getByRole('button', { name: 'Orders the judge can make right away' }));
    expect(screen.queryByRole('textbox', { name: 'Which place?' })).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: /stay away from my home, school, work/ }));
    expect(screen.getByRole('textbox', { name: 'Which place?' })).toBeInTheDocument();
  });

  it('adds and removes items in a list, and says where extra ones go', async () => {
    const user = renderApp();
    await toForms(user);
    await user.click(screen.getByRole('button', { name: 'Other cases, the county, and your public address' }));
    expect(screen.getByText(/5 fit on the form. Any more go on Attachment 4a/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Add a case' }));
    await user.type(screen.getByRole('textbox', { name: 'Case name' }), 'Doe v. Doe');
    expect(screen.getByRole('group', { name: 'Case 1' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Remove Case 1' }));
    expect(screen.queryByRole('group', { name: 'Case 1' })).toBeNull();
  });

  it('lists what is still blank, links back to it, and makes the PDF on the device', async () => {
    const create = vi.fn(() => 'blob:readyfile-test');
    const revoke = vi.fn();
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = renderApp();
    await toForms(user);
    await user.click(screen.getByRole('button', { name: copy.forms.downloadHeading }));
    expect(screen.getByRole('heading', { level: 1, name: copy.forms.downloadHeading })).toBeInTheDocument();
    for (const number of ['PO-0100', 'PO-0104', 'PNW-0102']) expect(screen.getByText(number)).toBeInTheDocument();
    const missing = screen.getByRole('region', { name: copy.forms.missingHeading });
    await user.click(within(missing).getByRole('button', { name: 'County where you are filing' }));
    expect(screen.getByRole('heading', { level: 1, name: 'The court and the people in the case' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: copy.forms.downloadHeading }));
    await user.click(screen.getByRole('button', { name: copy.forms.downloadPublic }));
    await screen.findByText(copy.forms.madePublic, {}, { timeout: 5000 });
    // The Confidential Form is a separate file, so it is never printed with the petition.
    const confidential = screen.getByRole('region', { name: copy.forms.confidentialHeading });
    expect(within(confidential).getByText('PO-0104')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: copy.forms.publicHeading })).queryByText('PO-0104')).toBeNull();
    await user.click(within(confidential).getByRole('button', { name: copy.forms.downloadConfidential }));
    await screen.findByText(copy.forms.madeConfidential, {}, { timeout: 5000 });
    expect(create).toHaveBeenCalledTimes(2);
    expect(click).toHaveBeenCalledTimes(2);
    click.mockRestore();
  });

  it('keeps her answers when she moves between steps', async () => {
    const user = renderApp();
    await toForms(user);
    await user.type(screen.getByRole('textbox', { name: "The other person's first name" }), 'Sam');
    await goToStep(user, 'review');
    await goToStep(user, 'forms');
    expect(screen.getByRole('textbox', { name: "The other person's first name" })).toHaveValue('Sam');
  });
});

// A parent, guardian, or other adult filing for a child (PO-0101, PO-0103).
describe('17. Petition for a child', () => {
  async function toChildStart(user: User, role = 'I am the child\'s parent') {
    for (const option of ['My child, or a child I am the guardian of', 'Ask for a new protection order', role, 'At or near the child\'s home']) {
      await user.click(screen.getByRole('radio', { name: option }));
      await user.click(screen.getByRole('button', { name: copy.route.continue }));
    }
    for (const number of ['PO-0101', 'PO-0104', 'PNW-0102']) expect(screen.getByText(number)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.route.toPetition }));
  }

  it('asks about the child, with sex grooming and the child form\'s relationship lines', async () => {
    const user = renderApp();
    await toChildStart(user);
    const child = copy.child.start;
    expect(screen.getByRole('heading', { level: 1, name: child.heading })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: copy.start.grounds['sex-grooming'] })).toBeInTheDocument();
    const select = screen.getByRole('combobox', { name: child.relationshipLabel });
    expect(within(select).getByRole('option', { name: child.relationships.parent })).toBeInTheDocument();
    expect(within(select).queryByRole('option', { name: copy.start.relationships.ward })).toBeNull();
  });

  it('lists the child form\'s acts, including sex grooming, in the child\'s words', async () => {
    const user = renderApp();
    await toChildStart(user);
    await user.click(screen.getByRole('button', { name: copy.start.begin }));
    await addIncident(user, 'He sent her messages every night asking her to keep secrets from her parents.');
    expect(screen.getByRole('checkbox', { name: copy.child.incident.acts['sex-grooming'] })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: copy.child.incident.acts['caused-harm'] })).toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: copy.incident.acts['caused-harm'] })).toBeNull();
  });

  it('asks for the child\'s name and, for "another adult", how they represent the child', async () => {
    const user = renderApp();
    await toChildStart(user, 'I am another adult acting for the child');
    await user.click(screen.getByRole('button', { name: copy.start.begin }));
    await goToStep(user, 'forms');
    expect(screen.getByRole('textbox', { name: "The child's first name" })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'How do you represent the child?' })).toBeInTheDocument();
    expect(screen.getByText(/· PO-0101/)).toBeInTheDocument();
  });

  it('does not ask a parent how they represent the child', async () => {
    const user = renderApp();
    await toChildStart(user);
    await user.click(screen.getByRole('button', { name: copy.start.begin }));
    await goToStep(user, 'forms');
    expect(screen.queryByRole('textbox', { name: 'How do you represent the child?' })).toBeNull();
  });
});

// Forms in a case that already exists go straight to the Court forms step.
describe('18. Forms for an existing order', () => {
  async function choose(user: User, ...options: string[]) {
    for (const option of options) {
      await user.click(screen.getByRole('radio', { name: option }));
      await user.click(screen.getByRole('button', { name: copy.route.continue }));
    }
  }

  it('extending an order skips the incident steps and shows only two steps', async () => {
    const user = renderApp();
    await choose(user, 'Me', 'I already have a protection order', 'An Indiana court', 'Make the order last longer');
    await user.click(screen.getByRole('button', { name: copy.route.toForm }));
    expect(screen.getByRole('heading', { level: 1, name: 'The case' })).toHaveFocus();
    expect(screen.getByText(/· PO-0116/)).toBeInTheDocument();
    const steps = within(screen.getByRole('navigation', { name: copy.app.stepsLabel })).getAllByRole('button');
    expect(steps.map((b) => b.textContent)).toEqual([copy.app.steps.route, copy.app.steps.forms]);
    expect(screen.getByRole('textbox', { name: 'Case number' })).toBeInTheDocument();
  });

  it('shows "How did the person break the order?" only when it was broken', async () => {
    const user = renderApp();
    await choose(user, 'Me', 'I already have a protection order', 'An Indiana court', 'Make the order last longer');
    await user.click(screen.getByRole('button', { name: copy.route.toForm }));
    await user.click(screen.getByRole('button', { name: 'Why the order is still needed' }));
    expect(screen.queryByRole('textbox', { name: 'How did the person break the order?' })).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'The other person broke the order' }));
    expect(screen.getByRole('textbox', { name: 'How did the person break the order?' })).toBeInTheDocument();
  });

  it('a respondent asking for a hearing is asked for their own name, and gets one PDF', async () => {
    const create = vi.fn(() => 'blob:readyfile-test');
    Object.assign(URL, { createObjectURL: create, revokeObjectURL: vi.fn() });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    const user = renderApp();
    await choose(user, 'Someone asked the court for an order against me', 'An order for protection issued without a hearing (ex parte), or a change to one');
    await user.click(screen.getByRole('button', { name: copy.route.toForm }));
    expect(screen.getByRole('textbox', { name: 'Your first name' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: "The petitioner's first name" })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.forms.downloadHeading }));
    expect(screen.queryByRole('region', { name: copy.forms.confidentialHeading })).toBeNull();
    await user.click(screen.getByRole('button', { name: copy.forms.downloadForms }));
    await screen.findByText(copy.forms.madePublic, {}, { timeout: 10_000 });
    expect(create).toHaveBeenCalledTimes(1);
    click.mockRestore();
  }, 20_000);
});

// The court PDFs' fonts only have Western European letters.
describe('19. Letters the court forms cannot print', () => {
  it('warns under the field, says what will print, and lists it on the download page', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await goToStep(user, 'forms');
    const last = screen.getByRole('textbox', { name: "The other person's last name" });
    await user.type(last, 'Nguyễn');
    const warning = screen.getByText(/can't print these letters: ễ/);
    expect(warning).toHaveTextContent('It will show "Nguyên"');
    expect(last.getAttribute('aria-describedby')).toContain(warning.id);
    await user.click(screen.getByRole('button', { name: copy.forms.downloadHeading }));
    const check = screen.getByRole('region', { name: copy.forms.unprintableHeading });
    expect(within(check).getByText("The other person's last name")).toBeInTheDocument();
  });

  it('shows no warning for accents the form can print', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await goToStep(user, 'forms');
    await user.type(screen.getByRole('textbox', { name: "The other person's last name" }), 'Muñoz-José');
    expect(screen.queryByText(/can't print these letters/)).toBeNull();
  });
});

// Workplace violence: the employer files for an employee (WV-0100); the defendant responds.
describe('20. Workplace violence forms', () => {
  async function choose(user: User, ...options: string[]) {
    for (const option of options) {
      await user.click(screen.getByRole('radio', { name: option }));
      await user.click(screen.getByRole('button', { name: copy.route.continue }));
    }
    await user.click(screen.getByRole('button', { name: copy.route.toForm }));
  }

  it('asks about the temporary restraining order notice only when one is requested', async () => {
    const user = renderApp();
    await choose(user, 'An employee of my business or organization', 'Yes', 'Stalked the employee', 'Yes', 'No', 'Ask for a new workplace violence restraining order');
    await user.click(screen.getByRole('button', { name: 'A temporary restraining order' }));
    expect(screen.queryByRole('group', { name: 'How was the defendant told about this petition?' })).toBeNull();
    await user.click(screen.getByRole('checkbox', { name: 'Ask for a temporary restraining order now' }));
    expect(screen.getByRole('group', { name: 'How was the defendant told about this petition?' })).toBeInTheDocument();
  });

  it('the employer gets the petition and a separate Confidential Form about the employee', async () => {
    const user = renderApp();
    await choose(user, 'An employee of my business or organization', 'Yes', 'Stalked the employee', 'Yes', 'No', 'Ask for a new workplace violence restraining order');
    await user.click(screen.getByRole('button', { name: 'Confidential Form: about the employee' }));
    expect(screen.getByRole('textbox', { name: "The employee's home address" })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: copy.forms.downloadHeading }));
    expect(within(screen.getByRole('region', { name: copy.forms.confidentialHeading })).getByText('PO-0104')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: copy.forms.publicHeading })).getByText('WV-0101')).toBeInTheDocument();
  });

  it('a defendant served with an Order to Show Cause gets the Response, signed in their own name', async () => {
    const user = renderApp();
    await choose(user, 'Someone asked the court for an order against me', 'An Order to Show Cause about workplace violence');
    expect(screen.getByRole('textbox', { name: 'Your first name' })).toBeInTheDocument();
    expect(screen.getByText(/· WV-0104/)).toBeInTheDocument();
  });
});
