// WCAG 2.2 AA checks (section 11). axe-core catches about a third of issues;
// keyboard and screen reader testing by a person is still needed.
import { act, fireEvent, render, screen } from '@testing-library/react';
import axe from 'axe-core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../src/App';
import { IDLE_TIMEOUT_MS, TIMEOUT_WARNING_SECONDS } from '../src/config';
import { copy } from '../src/content';
import { LENA_ONE_INCIDENT } from '../src/samples/lena';
import { begin, loadSample, questionToggles, renderApp, stepName } from './helpers';

vi.mock('../src/safety/leaveSite', () => ({ leaveSite: vi.fn() }));

async function expectNoViolations() {
  const results = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    // jsdom does no layout, so contrast is checked in a real browser instead.
    rules: { 'color-contrast': { enabled: false } },
  });
  const problems = results.violations.map(
    (v) => `${v.id}: ${v.help} (${v.nodes.map((n) => n.target.join(' ')).join(', ')})`,
  );
  expect(problems).toEqual([]);
}

describe('axe finds no violations', () => {
  it('on every screen, with the advocate panel open and closed', async () => {
    const user = renderApp();
    await expectNoViolations();

    await user.click(screen.getByRole('button', { name: copy.resources.show }));
    await expectNoViolations();
    await user.click(screen.getByRole('button', { name: copy.resources.hide }));

    await user.click(screen.getByRole('switch', { name: copy.theme.label }));
    await expectNoViolations();
    await user.click(screen.getByRole('switch', { name: copy.theme.label }));

    await begin(user, 'Stalking');
    await expectNoViolations();

    await loadSample(user, 'four');
    await expectNoViolations();

    await user.click(screen.getAllByRole('button', { name: copy.incident.edit })[0]);
    await expectNoViolations();

    await user.click(screen.getByRole('button', { name: copy.organize.confirm }));
    await expectNoViolations();

    await user.click(screen.getByRole('button', { name: copy.story.next }));
    await expectNoViolations();

    for (const toggle of questionToggles()) await user.click(toggle);
    await expectNoViolations();

    await user.click(screen.getByRole('button', { name: copy.check.toReview }));
    await expectNoViolations();
  });

  it('when asking to confirm a delete, and after an undo-able delete', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await loadSample(user, 'four');

    await user.click(screen.getAllByRole('button', { name: copy.incident.delete })[0]);
    expect(screen.getByText(copy.incident.deleteQuestion)).toHaveFocus();
    await expectNoViolations();

    await user.click(screen.getByRole('button', { name: copy.common.confirmNo }));
    expect(screen.getAllByRole('button', { name: copy.incident.delete })[0]).toHaveFocus();

    await user.click(screen.getAllByRole('button', { name: copy.incident.delete })[0]);
    await user.click(screen.getByRole('button', { name: copy.incident.deleteYes }));
    await expectNoViolations();
  });
});

describe('names and focus', () => {
  it('the step bar buttons have unique names, so "Start" means one button', () => {
    render(<App />);
    expect(screen.getAllByRole('button', { name: copy.start.begin })).toHaveLength(1);
    expect(screen.getByRole('button', { name: stepName('start') })).toHaveAttribute('aria-current', 'step');
  });

  it('each step heading takes focus when it appears', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    expect(screen.getByRole('heading', { level: 1, name: copy.organize.heading })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: copy.organize.confirm }));
    expect(screen.getByRole('heading', { level: 1, name: copy.story.heading })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: copy.story.next }));
    expect(screen.getByRole('heading', { level: 1, name: copy.check.heading })).toHaveFocus();
  });
});

describe('timeout warning', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  function showWarning() {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: copy.start.begin }));
    fireEvent.click(screen.getByRole('button', { name: stepName('story') }));
    const story = screen.getByRole('textbox', { name: copy.story.label });
    fireEvent.change(story, { target: { value: LENA_ONE_INCIDENT } });
    story.focus();
    act(() => vi.advanceTimersByTime(IDLE_TIMEOUT_MS - TIMEOUT_WARNING_SECONDS * 1000));
    return story;
  }

  it('makes the page behind it inert, but not the header with Quick exit', () => {
    showWarning();
    expect(screen.getByRole('main', { hidden: true })).toHaveAttribute('inert');
    expect(screen.getByRole('banner').closest('[inert]')).toBeNull();
  });

  it('"Stay here" returns focus to where she was', () => {
    const story = showWarning();
    expect(screen.getByRole('button', { name: copy.timeout.stay })).toHaveFocus();
    fireEvent.click(screen.getByRole('button', { name: copy.timeout.stay }));
    expect(story).toHaveFocus();
    expect(screen.getByRole('main')).not.toHaveAttribute('inert');
  });

  it('Escape works the same as "Stay here"', () => {
    const story = showWarning();
    fireEvent.keyDown(screen.getByRole('alertdialog'), { key: 'Escape' });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(story).toHaveFocus();
    expect(story).toHaveValue(LENA_ONE_INCIDENT);
  });
});
