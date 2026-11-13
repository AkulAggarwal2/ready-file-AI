// Acceptance tests from section 12 of DESK_PROMPT.md. All data is fictional.
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import axe from 'axe-core';
import { describe, expect, it } from 'vitest';
import rulesJson from '../content/rules.json';
import { DeskApp } from '../src/desk/DeskApp';
import { deskCopy, plural, samplePetitions } from '../src/desk/content';
import { maskPhone } from '../src/desk/model';

type User = ReturnType<typeof userEvent.setup>;

function renderDesk() {
  const user = userEvent.setup();
  render(<DeskApp />);
  return user;
}

const sample = (id: string) => samplePetitions.find((s) => s.id === id)!;
const rows = () => screen.queryAllByRole('listitem').filter((li) => li.classList.contains('petition-row'));
const rowFor = (id: string) => rows().find((row) => row.textContent!.includes(sample(id).caseNumber))!;
const filterButton = (key: 'questions' | 'none' | 'all') =>
  screen.getByRole('button', { name: new RegExp(`^${deskCopy.list.filters[key].replace(' ({n})', '')} \\(`) });

/** The top bar's section links (the breadcrumbs reuse the same words). */
async function goTo(user: User, section: 'petitions' | 'review') {
  const nav = screen.getByRole('navigation', { name: deskCopy.app.navLabel });
  await user.click(within(nav).getByRole('button', { name: deskCopy.app.nav[section] }));
}

async function openPetition(user: User, id: string) {
  await user.click(filterButton('all'));
  await user.click(screen.getByRole('button', { name: plural(deskCopy.list.openLabel, { caseNumber: sample(id).caseNumber }) }));
}

async function openBench(user: User, id: string) {
  await goTo(user, 'review');
  const caption = `${sample(id).petitioner.last} v. ${sample(id).respondent.last}`;
  await user.click(screen.getByRole('button', { name: plural(deskCopy.review.openLabel, { caption }) }));
}

async function expectNoViolations() {
  const results = await axe.run(document.body, {
    runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] },
    // jsdom does no layout, so contrast is checked in a real browser instead.
    rules: { 'color-contrast': { enabled: false } },
  });
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
}

describe('1. List', () => {
  it('"Questions found" shows Lena, Keisha, and Dana; "No questions" shows Marcus and Ana', async () => {
    const user = renderDesk();
    expect(screen.getByText(/5 stalking and harassment petitions came in online\. 3 have questions/)).toBeInTheDocument();
    expect(filterButton('questions')).toHaveAttribute('aria-pressed', 'true');
    expect(filterButton('questions')).toHaveTextContent('Questions found (3)');
    expect(rows().map((r) => r.querySelector('.row-name')!.textContent)).toEqual(['D. W.', 'K. T.', 'L. M.']);

    await user.click(filterButton('none'));
    expect(filterButton('none')).toHaveTextContent('No questions (2)');
    expect(rows().map((r) => r.querySelector('.row-name')!.textContent)).toEqual(['M. R.', 'A. P.']);

    await user.click(filterButton('all'));
    expect(rows()).toHaveLength(5);
  });
});

describe('2. Privacy', () => {
  it('hides names and masks phone numbers by default; the toggles reveal them', async () => {
    const user = renderDesk();
    expect(screen.queryByText('Lena Moore')).not.toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: deskCopy.list.showNames }));
    expect(within(rowFor('lena')).getByText('Lena Moore')).toBeInTheDocument();

    await openPetition(user, 'lena');
    const phone = sample('lena').contact.phone!;
    expect(screen.getByText(maskPhone(phone))).toBeInTheDocument();
    expect(screen.queryByText(phone)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: deskCopy.contactPanel.showLabel }));
    expect(screen.getByText(phone)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: deskCopy.contactPanel.hideLabel }));
    expect(screen.queryByText(phone)).not.toBeInTheDocument();
  });
});

describe('3. Traceable', () => {
  it('every finding shows a rule id from rules.json, its source, and "Wording not approved yet"', async () => {
    const user = renderDesk();
    const ruleIds = new Set(rulesJson.rules.map((r) => r.id));
    for (const id of ['lena', 'keisha', 'dana']) {
      await goTo(user, 'petitions');
      await openPetition(user, id);
      const cards = Array.from(document.querySelectorAll('.question-card'));
      expect(cards.length).toBeGreaterThan(0);
      for (const card of cards) {
        const ruleId = card.textContent!.match(/Rule ([a-z-]+)/)![1];
        expect(ruleIds.has(ruleId)).toBe(true);
        const rule = rulesJson.rules.find((r) => r.id === ruleId)!;
        expect(card).toHaveTextContent(`Source: ${rule.sourceCitation}`);
        if (!rule.verified) expect(card).toHaveTextContent(deskCopy.questions.notApproved);
      }
    }
  });
});

describe('4. Never holds on its own', () => {
  it('nothing is held on load; a hold starts only from "Hold for follow-up"; "Send to magistrate now" works', async () => {
    const user = renderDesk();
    await user.click(filterButton('all'));
    expect(rows().every((row) => !row.textContent!.includes('Held until'))).toBe(true);

    await openPetition(user, 'dana');
    await user.click(screen.getByRole('button', { name: deskCopy.hold.holdButton }));
    expect(screen.getByRole('heading', { name: 'Hold ends Tuesday at 8:37 am' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: deskCopy.hold.sendNow }));
    expect(screen.getByRole('heading', { name: deskCopy.hold.sentTitle })).toBeInTheDocument();
    expect(screen.getAllByText('T. Reyes sent the petition to the magistrate.').length).toBeGreaterThan(0);
  });

  it('without a phone number, the hold button is off', async () => {
    const user = renderDesk();
    await openPetition(user, 'keisha');
    expect(screen.getByRole('button', { name: deskCopy.hold.holdButton })).toBeDisabled();
    expect(screen.getByText(deskCopy.hold.noPhone)).toBeInTheDocument();
  });
});

describe('5. Hold ends', () => {
  it('"Jump to the end of the hold" sends the petition to review and logs it', async () => {
    const user = renderDesk();
    await openPetition(user, 'dana');
    await user.click(screen.getByRole('button', { name: deskCopy.hold.holdButton }));
    await user.click(screen.getByRole('button', { name: deskCopy.demo.jumpEnd }));
    expect(screen.getByRole('heading', { name: deskCopy.hold.sentTitle })).toBeInTheDocument();
    expect(screen.getByText(deskCopy.log.holdEnded)).toBeInTheDocument();
    await goTo(user, 'review');
    expect(screen.getByRole('rowheader', { name: /Whitfield v\. Brenner/ })).toBeInTheDocument();
  });
});

describe('6. Neutral text', () => {
  it('no text message names the case type, the order, or the respondent', async () => {
    const user = renderDesk();
    const banned = ['stalking', 'harassment', 'protection order', 'protective order'];
    for (const s of samplePetitions.filter((p) => p.contact.phone)) {
      await goTo(user, 'petitions');
      await openPetition(user, s.id);
      const message = document.querySelector('.message')!.textContent!.toLowerCase();
      for (const word of banned) expect(message).not.toContain(word);
      expect(message).not.toContain(s.respondent.first.toLowerCase());
      expect(message).not.toContain(s.respondent.last.toLowerCase());
    }
  });
});

describe('7. Call times', () => {
  it('logging a call outside the call times shows the warning, and Save needs a choice', async () => {
    const user = renderDesk();
    await openPetition(user, 'lena');
    await user.click(screen.getByRole('button', { name: deskCopy.hold.holdButton }));
    await user.click(screen.getByRole('button', { name: deskCopy.contactPanel.logCall }));
    expect(screen.getByText(deskCopy.contactPanel.outsideCallTimes)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: deskCopy.contactPanel.saveCall }));
    expect(screen.getByRole('alert')).toHaveTextContent(deskCopy.contactPanel.pickResult);
    await user.click(screen.getByRole('radio', { name: deskCopy.contactPanel.callResults.noAnswer }));
    await user.click(screen.getByRole('button', { name: deskCopy.contactPanel.saveCall }));
    expect(screen.getByText('T. Reyes logged a call: No answer.')).toBeInTheDocument();
  });
});

describe("8. Lena's flow", () => {
  it('hold, text, add incidents, end the hold: 4 incidents in date order, answered, no second hold', async () => {
    const user = renderDesk();
    await openPetition(user, 'lena');
    await user.click(screen.getByRole('button', { name: deskCopy.hold.holdButton }));
    await user.click(screen.getByRole('button', { name: deskCopy.contactPanel.text }));
    expect(screen.getByText('Link texted at Mon 8:39 am. Not opened yet.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: deskCopy.demo.addIncidents }));
    expect(screen.getByText('The petitioner filed an amended petition that adds 3 incidents.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: deskCopy.demo.jumpEnd }));

    await openBench(user, 'lena');
    expect(screen.getByRole('heading', { level: 1, name: 'Moore v. Ostrander' })).toBeInTheDocument();
    expect(screen.getByText(/Filed online Sunday at 11:52 pm, amended Monday at 8:21 pm\. In your review queue since Tuesday at 8:37 am\./)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '4 incidents, in date order' })).toBeInTheDocument();
    const dates = Array.from(document.querySelectorAll('.bench-incident .row-strong')).map((el) => el.textContent!.split(' · ')[0]);
    expect(dates).toEqual(['Mid August', 'Early September', 'October 21', 'Friday, November 6, about 7 pm']);

    const row = screen.getByRole('cell', { name: /Stalking means two or more incidents/ }).closest('tr')!;
    expect(row).toHaveTextContent('Answered Mon 8:21 pm');
    expect(screen.queryByRole('button', { name: deskCopy.openQuestions.ask })).not.toBeInTheDocument();
    expect(screen.getByText(deskCopy.openQuestions.alreadyHeld)).toBeInTheDocument();
  });
});

describe('9. Verbatim', () => {
  it('every incident on the bench summary appears word for word in the filed narrative', async () => {
    const user = renderDesk();
    for (const s of samplePetitions) {
      await openBench(user, s.id);
      for (const el of document.querySelectorAll('.bench-incident .verbatim')) {
        expect(s.original.narrative).toContain(el.textContent!);
      }
    }
  });
});

describe('10. Line links', () => {
  it("an incident's line link opens the right tab with those lines highlighted", async () => {
    const user = renderDesk();
    await openBench(user, 'dana');
    await user.click(screen.getByRole('button', { name: 'Original petition, line 5' }));
    expect(screen.getByRole('tab', { name: deskCopy.bench.tabs.original })).toHaveAttribute('aria-selected', 'true');
    const lit = Array.from(document.querySelectorAll('.numbered li.lit'));
    expect(lit.map((li) => li.querySelector('.line-number')!.textContent)).toEqual(['5']);
    expect(lit[0]).toHaveTextContent('He was waiting outside my work again last night.');
    expect(lit[0]).toHaveFocus();
    await user.click(screen.getByRole('button', { name: deskCopy.bench.clearHighlight }));
    expect(document.querySelectorAll('.numbered li.lit')).toHaveLength(0);
  });
});

describe('11. Outcome', () => {
  it('Save needs an outcome, Denied needs a reason, and reasons are off unless Denied is picked', async () => {
    const user = renderDesk();
    await openBench(user, 'dana');
    const reason = screen.getByRole('checkbox', { name: "Facts don't meet the definition" });
    expect(reason).toBeDisabled();
    await user.click(screen.getByRole('button', { name: deskCopy.outcome.save }));
    expect(screen.getByRole('alert')).toHaveTextContent(deskCopy.outcome.pickOutcome);

    await user.click(screen.getByRole('radio', { name: deskCopy.outcome.choices.denied }));
    expect(reason).toBeEnabled();
    expect(screen.getByText(deskCopy.outcome.toldDenied)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: deskCopy.outcome.save }));
    expect(screen.getByRole('alert')).toHaveTextContent(deskCopy.outcome.pickReason);
    await user.click(reason);
    await user.click(screen.getByRole('button', { name: deskCopy.outcome.save }));
    expect(screen.getByText('Saved as Denied. Your order is still entered as usual.')).toBeInTheDocument();
  });

  it('harassment petitions do not offer "Granted ex parte"', async () => {
    const user = renderDesk();
    await openBench(user, 'marcus');
    expect(screen.queryByRole('radio', { name: deskCopy.outcome.choices.granted })).not.toBeInTheDocument();
    expect(screen.getByRole('radio', { name: deskCopy.outcome.choices.hearing })).toBeInTheDocument();
  });
});

describe('12. Ask the specialist', () => {
  it("on Dana's bench summary, it starts the one 24-hour hold and moves the petition back", async () => {
    const user = renderDesk();
    await openBench(user, 'dana');
    await user.click(screen.getByRole('button', { name: deskCopy.openQuestions.ask }));
    expect(screen.getByText(deskCopy.openQuestions.asked)).toBeInTheDocument();

    await goTo(user, 'review');
    expect(screen.queryByRole('rowheader', { name: /Whitfield v\. Brenner/ })).not.toBeInTheDocument();
    await goTo(user, 'petitions');
    expect(rowFor('dana')).toHaveTextContent(deskCopy.list.status.asked);

    await openPetition(user, 'dana');
    expect(screen.getByText(/The magistrate asked for follow-up at Mon 8:37 am\./)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: deskCopy.demo.jumpEnd }));
    expect(screen.queryByRole('button', { name: deskCopy.hold.holdButton })).not.toBeInTheDocument();
  });
});

describe('15. Accessibility', () => {
  it('axe finds no violations on all four Desk screens', async () => {
    const user = renderDesk();
    await expectNoViolations();
    await openPetition(user, 'lena');
    await expectNoViolations();
    await user.click(screen.getByRole('button', { name: deskCopy.hold.holdButton }));
    await user.click(screen.getByRole('button', { name: deskCopy.contactPanel.logCall }));
    await expectNoViolations();
    await user.click(screen.getByRole('button', { name: deskCopy.hold.preview }));
    await expectNoViolations();
    await goTo(user, 'review');
    await expectNoViolations();
    await openBench(user, 'dana');
    await expectNoViolations();
    await user.click(screen.getByRole('tab', { name: deskCopy.bench.tabs.original }));
    await expectNoViolations();
  });

  it('tabs move with the arrow keys, and each screen title takes focus', async () => {
    const user = renderDesk();
    expect(screen.getByRole('heading', { level: 1, name: deskCopy.list.title })).toHaveFocus();
    await openBench(user, 'dana');
    expect(screen.getByRole('heading', { level: 1, name: 'Whitfield v. Brenner' })).toHaveFocus();
    screen.getByRole('tab', { name: deskCopy.bench.tabs.summary }).focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: deskCopy.bench.tabs.original })).toHaveFocus();
    expect(screen.getByRole('tab', { name: deskCopy.bench.tabs.original })).toHaveAttribute('aria-selected', 'true');
  });
});
