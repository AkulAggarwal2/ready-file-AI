// Acceptance test 15: axe-core (WCAG 2.2 AA) on all four Desk screens, full
// keyboard use, and visible focus. axe catches about a third of issues; a
// person still needs to test with a keyboard and a screen reader.
import { screen } from '@testing-library/react';
import axe from 'axe-core';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ANA,
  DANA,
  KEISHA,
  LENA,
  click,
  d,
  goToList,
  goToReview,
  lenaFlow,
  openBench,
  openPetition,
  renderDesk,
} from './desk-helpers';

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
  it('Screen 1: Online petitions, with each filter and with names shown', async () => {
    const user = renderDesk();
    await expectNoViolations();
    await click(user, /^No questions/);
    await expectNoViolations();
    await click(user, /^All/);
    await user.click(screen.getByRole('checkbox', { name: d.list.showNames }));
    await expectNoViolations();
  });

  it('Screen 2: Petition follow-up, before, during, and after a hold', async () => {
    const user = renderDesk();
    await openPetition(user, LENA);
    await expectNoViolations();

    await click(user, d.petition.hold.holdButton);
    await click(user, d.petition.contactPanel.textLink);
    await click(user, d.petition.contactPanel.logCall);
    await click(user, d.petition.contactPanel.saveCall); // shows the error
    await expectNoViolations();
    await click(user, d.petition.contactPanel.cancel);

    await click(user, d.petition.demo.addIncidents);
    await click(user, d.petition.demo.jump);
    await expectNoViolations();

    // No phone number.
    await openPetition(user, KEISHA);
    await expectNoViolations();
  });

  it('Screen 3: Ex parte review, with and without rows held back', async () => {
    const user = renderDesk();
    await goToReview(user);
    await expectNoViolations();
    await openPetition(user, DANA);
    await click(user, d.petition.hold.holdButton);
    await goToReview(user);
    await expectNoViolations();
  });

  it('Screen 4: Bench summary, every tab, the outcome form, and the preview', async () => {
    const user = renderDesk();
    await lenaFlow(user);
    await openBench(user, LENA);
    await expectNoViolations();

    await click(user, 'Amended petition, lines 1 to 3');
    await expectNoViolations();
    await user.click(screen.getByRole('tab', { name: d.bench.tabs.original }));
    await expectNoViolations();

    await click(user, d.bench.outcome.save); // shows the error
    await user.click(screen.getByRole('radio', { name: 'Denied' }));
    await expectNoViolations();

    await click(user, d.bench.openQuestions.ask);
    await expectNoViolations();

    await openBench(user, ANA);
    await expectNoViolations();

    await openPetition(user, LENA);
    await click(user, d.petition.hold.preview);
    await expectNoViolations();
  });
});

describe('keyboard use and focus', () => {
  it('the page title takes focus after every screen change', async () => {
    const user = renderDesk();
    await openPetition(user, LENA);
    expect(screen.getByRole('heading', { level: 1, name: 'Stalking petition from Lena Moore' })).toHaveFocus();
    await goToReview(user);
    expect(screen.getByRole('heading', { level: 1, name: d.review.title })).toHaveFocus();
    await openBench(user, LENA);
    expect(screen.getByRole('heading', { level: 1, name: 'Moore v. Ostrander' })).toHaveFocus();
    await goToList(user);
    expect(screen.getByRole('heading', { level: 1, name: d.list.title })).toHaveFocus();
  });

  it('a hold can be started, the link texted, and a call logged with the keyboard only', async () => {
    const user = renderDesk();
    await openPetition(user, LENA);
    screen.getByRole('button', { name: d.petition.hold.holdButton }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('heading', { level: 2, name: /^Hold ends/ })).toHaveFocus();

    screen.getByRole('button', { name: d.petition.contactPanel.textLink }).focus();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: d.petition.contactPanel.textAgain })).toHaveFocus();

    await user.tab();
    expect(screen.getByRole('button', { name: d.petition.contactPanel.logCall })).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(screen.getByText(d.petition.contactPanel.callLegend)).toHaveFocus();
    await user.tab();
    await user.keyboard(' ');
    expect(screen.getByRole('radio', { name: d.petition.contactPanel.callResults.reached })).toBeChecked();
    await user.keyboard('{Enter}');
    expect(screen.getByRole('button', { name: d.petition.contactPanel.logCall })).toHaveFocus();
    expect(screen.getByText('Logged a call: reached the petitioner.')).toBeInTheDocument();
  });

  it('the bench summary tabs work with the arrow keys, Home, and End', async () => {
    const user = renderDesk();
    await lenaFlow(user);
    await openBench(user, LENA);
    const tab = (name: string) => screen.getByRole('tab', { name });
    tab(d.bench.tabs.summary).focus();

    await user.keyboard('{ArrowRight}');
    expect(tab(d.bench.tabs.amended)).toHaveFocus();
    expect(tab(d.bench.tabs.amended)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel', { name: d.bench.tabs.amended })).toBeVisible();

    await user.keyboard('{End}');
    expect(tab(d.bench.tabs.original)).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(tab(d.bench.tabs.summary)).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(tab(d.bench.tabs.original)).toHaveFocus();
    await user.keyboard('{Home}');
    expect(tab(d.bench.tabs.summary)).toHaveFocus();
    // Only the selected tab is in the tab order.
    expect(tab(d.bench.tabs.amended)).toHaveAttribute('tabindex', '-1');
  });

  it('wide tables scroll in their own box, which keyboard users can reach', async () => {
    const user = renderDesk();
    await goToReview(user);
    const region = screen.getByRole('region', { name: d.review.tableLabel });
    expect(region).toHaveAttribute('tabindex', '0');
    expect(region).toContainElement(screen.getByRole('table', { name: d.review.tableLabel }));
  });

  it('focus is always visible: a 3 px #B07A12 ring, 2 px away', () => {
    const css = readFileSync('src/desk/desk.css', 'utf8');
    expect(css).toMatch(/--focus:\s*#b07a12;/i);
    expect(css).toMatch(/:focus-visible[^{]*\{\s*outline:\s*3px solid var\(--focus\);\s*outline-offset:\s*2px;/);
  });
});
