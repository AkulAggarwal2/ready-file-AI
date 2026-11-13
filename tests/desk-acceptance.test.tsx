// Acceptance tests 1–13 from section 12 of DESK_PROMPT.md. All data is fictional.
import { screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import rulesJson from '../content/rules.json';
import { deskRules } from '../src/desk/content';
import { textMessage } from '../src/desk/messages';
import { petitions } from '../src/desk/petitions';
import { createInitialState } from '../src/desk/state/deskState';
import { HOUR } from '../src/desk/time';
import {
  ANA,
  DANA,
  KEISHA,
  LENA,
  MARCUS,
  click,
  d,
  goToList,
  goToReview,
  lenaFlow,
  listRow,
  openBench,
  openPetition,
  renderDesk,
  reviewRow,
  showAll,
} from './desk-helpers';
import { begin, loadSample, questionToggles, renderApp, toQuestions } from './helpers';

vi.mock('../src/safety/leaveSite', () => ({ leaveSite: vi.fn() }));

const rowsShown = () =>
  screen
    .getAllByRole('button', { name: /^Open petition for case / })
    .map((b) => b.textContent!.replace(`${d.list.open} for case `, '').trim());

const statusIn = (row: HTMLElement) => row.querySelector('.row-status .chip')!.textContent;

describe('1. List', () => {
  it('"Questions found" shows Lena, Keisha, and Dana; "No questions" shows Marcus and Ana; the counts match', async () => {
    const user = renderDesk();
    expect(screen.getByRole('button', { name: 'Questions found (3)' })).toHaveAttribute('aria-pressed', 'true');
    expect(rowsShown().sort()).toEqual([DANA, KEISHA, LENA].sort());

    await click(user, 'No questions (2)');
    expect(rowsShown().sort()).toEqual([MARCUS, ANA].sort());

    await click(user, 'All (5)');
    // Oldest first.
    expect(rowsShown()).toEqual([DANA, MARCUS, KEISHA, ANA, LENA]);

    expect(
      screen.getByText(
        'Since the counter closed Friday at 4 pm, 5 stalking and harassment petitions came in online. 3 have questions the counter would ask.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Updated Mon 8:35 am')).toBeInTheDocument();
  });

  it('each row shows the case, findings, contact, and status', () => {
    renderDesk();
    const lena = listRow(LENA);
    expect(within(lena).getByRole('heading', { name: 'Stalking, L. M.' })).toBeInTheDocument();
    expect(within(lena).getByText('Filed Sun 11:52 pm')).toBeInTheDocument();
    expect(within(lena).getByText('Stalking is checked, and 1 incident is described')).toBeInTheDocument();
    expect(within(lena).getByText("The respondent's date of birth is blank")).toBeInTheDocument();
    expect(within(lena).getByText('Texts OK. Calls weeknights, 7:30 to 10 pm.')).toBeInTheDocument();
    expect(statusIn(lena)).toBe('Not held yet');

    const keisha = listRow(KEISHA);
    expect(within(keisha).getByText('No phone given')).toBeInTheDocument();
    expect(within(keisha).getByText('The question goes to review with the petition.')).toBeInTheDocument();
    expect(statusIn(keisha)).toBe('In review queue');
  });
});

describe('2. Privacy', () => {
  it('hides names and masks phone numbers by default; the toggles reveal them', async () => {
    const user = renderDesk();
    await showAll(user);
    expect(screen.queryByText(/Lena Moore/)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Stalking, L. M.' })).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: d.list.showNames }));
    expect(screen.getByRole('heading', { name: 'Stalking, Lena Moore' })).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: d.list.showNames }));
    expect(screen.queryByRole('heading', { name: 'Stalking, Lena Moore' })).not.toBeInTheDocument();

    await openPetition(user, LENA);
    expect(screen.getByText('(260) •••-••41')).toBeInTheDocument();
    expect(screen.queryByText(/555-0141/)).not.toBeInTheDocument();
    await click(user, d.petition.contactPanel.showNumber);
    expect(screen.getByText('(260) 555-0141')).toBeInTheDocument();
    await click(user, d.petition.contactPanel.hideNumber);
    expect(screen.queryByText(/555-0141/)).not.toBeInTheDocument();
  });
});

describe('3. Traceable', () => {
  it('every finding shows a rule id from rules.json, its source, and "Wording not approved yet" when unverified', async () => {
    const user = renderDesk();
    const ruleIds = new Set(rulesJson.rules.map((r) => r.id));
    for (const caseNumber of [LENA, KEISHA, DANA]) {
      await openPetition(user, caseNumber);
      const questions = document.querySelectorAll('.questions .question');
      expect(questions.length).toBeGreaterThan(0);
      for (const question of questions) {
        const id = question.querySelector('.rule-meta li')!.textContent!.match(/^Rule ([\w-]+)$/)![1];
        expect(ruleIds.has(id)).toBe(true);
        const rule = deskRules.find((r) => r.id === id)!;
        expect(question).toHaveTextContent(`Source: ${rule.sourceCitation}`);
        expect(question).toHaveTextContent(`“${rule.questionText}”`);
        expect(question.querySelector('.badge-unverified') !== null).toBe(!rule.verified);
      }
    }
  });
});

describe('4. Never holds on its own', () => {
  it('nothing is held on load; a hold starts only from "Hold for follow-up"; "Send to magistrate now" works', async () => {
    const user = renderDesk();
    await showAll(user);
    for (const caseNumber of [LENA, KEISHA, DANA, MARCUS, ANA]) expect(statusIn(listRow(caseNumber))).not.toMatch(/Held/);
    expect(Object.values(createInitialState().records).every((r) => r.hold === null)).toBe(true);

    await openPetition(user, DANA);
    expect(screen.getByRole('heading', { level: 2, name: 'Not held' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: d.petition.hold.sendNow })).not.toBeInTheDocument();

    await click(user, d.petition.hold.holdButton);
    expect(screen.getByRole('heading', { level: 2, name: 'Hold ends Tuesday at 8:37 am' })).toHaveFocus();
    expect(screen.getByText('You held it at 8:37 am Monday. It goes to the magistrate then, answered or not.')).toBeInTheDocument();

    // Held petitions don't appear in the review list.
    await goToReview(user);
    expect(reviewRow(DANA)).toBeNull();

    await openPetition(user, DANA);
    await click(user, d.petition.hold.sendNow);
    expect(screen.getByRole('heading', { level: 2, name: 'Sent to the magistrate' })).toHaveFocus();
    expect(screen.getByText('Sent at Mon 8:39 am. The hold has ended.')).toBeInTheDocument();

    await goToReview(user);
    expect(reviewRow(DANA)).not.toBeNull();
  });

  it('with no phone number, the hold button is off', async () => {
    const user = renderDesk();
    await openPetition(user, KEISHA);
    expect(screen.getByRole('button', { name: d.petition.hold.holdButton })).toBeDisabled();
    expect(screen.getByText(d.petition.hold.noPhone)).toBeInTheDocument();
  });
});

describe('5. Hold ends', () => {
  it('"Jump to the end of the hold" sends the petition to review and logs it', async () => {
    const user = renderDesk();
    await openPetition(user, LENA);
    await click(user, d.petition.hold.holdButton);
    await click(user, d.petition.demo.jump);
    expect(screen.getByRole('heading', { level: 2, name: 'Sent to the magistrate' })).toBeInTheDocument();
    const activity = screen.getByRole('heading', { name: d.petition.activity.title }).closest('section')!;
    expect(activity).toHaveTextContent('Tue 8:37 am: The hold ended, and the petition went to the magistrate.');

    await goToList(user);
    expect(statusIn(listRow(LENA))).toBe('Sent to review Tue 8:37 am');
    await goToReview(user);
    expect(reviewRow(LENA)).not.toBeNull();
  });
});

describe('6. Neutral text', () => {
  const banned = ['stalking', 'harassment', 'protection order', 'protective order'];

  it('the message for every sample petition names no case type and not the respondent', () => {
    const state = createInitialState();
    for (const petition of petitions) {
      for (const record of [state.records[petition.id], { ...state.records[petition.id], hold: { start: 0, end: state.now + HOUR, byMagistrate: false } }]) {
        const message = textMessage(petition, record, state.now).toLowerCase();
        for (const word of [...banned, d.caseTypes[petition.caseType].toLowerCase()]) expect(message).not.toContain(word);
        expect(message).not.toContain(petition.respondent.firstName.toLowerCase());
        expect(message).not.toContain(petition.respondent.lastName.toLowerCase());
      }
    }
  });

  it("Lena's message reads as the brief says", async () => {
    const user = renderDesk();
    await openPetition(user, LENA);
    await click(user, d.petition.hold.holdButton);
    expect(
      screen.getByText(
        'Hi, this is Allen County staff about the form you sent on Sunday. You can add more details here until Tuesday 8:37 am: [link]. Reply STOP to end texts.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(d.petition.contactPanel.messageNote)).toBeInTheDocument();
  });
});

describe('7. Call times', () => {
  it('logging a call outside the call times shows the warning', async () => {
    const user = renderDesk();
    await openPetition(user, LENA);
    await click(user, d.petition.hold.holdButton);
    await click(user, d.petition.contactPanel.logCall);
    expect(screen.getByRole('group', { name: d.petition.contactPanel.callLegend })).toBeInTheDocument();
    expect(screen.getByText(d.petition.contactPanel.outsideCallTimes)).toBeInTheDocument();

    await click(user, d.petition.contactPanel.saveCall);
    expect(screen.getByRole('alert')).toHaveTextContent(d.petition.contactPanel.pickResult);

    await user.click(screen.getByRole('radio', { name: d.petition.contactPanel.callResults['no-answer'] }));
    await click(user, d.petition.contactPanel.saveCall);
    expect(screen.getByRole('button', { name: d.petition.contactPanel.logCall })).toHaveFocus();
    expect(screen.getByText('Logged a call: no answer.')).toBeInTheDocument();
  });

  it('no warning when the petitioner takes calls any time', async () => {
    const user = renderDesk();
    await openPetition(user, DANA);
    await click(user, d.petition.hold.holdButton);
    await click(user, d.petition.contactPanel.logCall);
    expect(screen.queryByText(d.petition.contactPanel.outsideCallTimes)).not.toBeInTheDocument();
    await click(user, d.petition.contactPanel.cancel);
    expect(screen.queryByRole('group', { name: d.petition.contactPanel.callLegend })).not.toBeInTheDocument();
  });

  it('texts the link and notes it', async () => {
    const user = renderDesk();
    await openPetition(user, LENA);
    expect(screen.getByText(d.petition.contactPanel.holdFirst)).toBeInTheDocument();
    await click(user, d.petition.hold.holdButton);
    await click(user, d.petition.contactPanel.textLink);
    expect(screen.getByRole('button', { name: d.petition.contactPanel.textAgain })).toBeInTheDocument();
    expect(screen.getByText('Link texted at 8:39 am. Not opened yet.')).toBeInTheDocument();
  });
});

describe("8. Lena's flow", () => {
  it('hold, text the link, add incidents, end of hold: 4 incidents in date order, and "Answered Mon 8:21 pm"', async () => {
    const user = renderDesk();
    await lenaFlow(user);

    await goToReview(user);
    const row = reviewRow(LENA)!;
    expect(row).toHaveTextContent('Moore v. Ostrander');
    expect(row).toHaveTextContent('Followed up: 3 incidents added');

    await openBench(user, LENA);
    expect(screen.getByRole('heading', { level: 1, name: 'Moore v. Ostrander' })).toHaveFocus();
    expect(
      screen.getByText(
        'Stalking petition. Filed online Sunday at 11:52 pm, amended Monday at 8:21 pm. In your review queue since Tuesday at 8:37 am.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '4 incidents, in date order' })).toBeInTheDocument();
    const dates = [...document.querySelectorAll('#panel-summary .bench-incident .incident-meta span:first-child')].map(
      (el) => el.textContent,
    );
    expect(dates.slice(0, 4)).toEqual(['Mid-August', 'Early September', 'October 21', 'Friday, November 6, about 7 pm']);

    const table = screen.getByRole('table', { name: d.bench.questionsTableLabel });
    const stalkingRow = within(table).getByText('Stalking means two or more incidents. Are there other times?').closest('tr')!;
    expect(stalkingRow).toHaveTextContent('Answered Mon 8:21 pm');
    const dobRow = within(table).getByText(/Do you know the other person's date of birth/).closest('tr')!;
    expect(dobRow).toHaveTextContent("Still open: The respondent's date of birth is blank");
    expect(within(table).getAllByText('No question')).toHaveLength(2);

    expect(screen.getByText(/The petitioner filed an amended petition that adds 3 incidents/)).toBeInTheDocument();
    expect(screen.getByText(d.bench.recordNote)).toBeInTheDocument();
  });
});

describe('9. Verbatim', () => {
  it('every incident on the bench summary appears word for word in the filed narrative', async () => {
    const user = renderDesk();
    await lenaFlow(user);
    for (const petition of petitions) {
      await openBench(user, petition.caseNumber);
      const version = petition.id === 'lena-moore' ? petition.amendment! : petition.original;
      const shown = [...document.querySelectorAll('#panel-summary .verbatim p')].map((p) => p.textContent!);
      expect(shown.length).toBe(version.incidents.length + version.statements.length);
      for (const text of shown) expect(version.narrative).toContain(text);
      for (const incident of version.incidents) expect(shown).toContain(incident.description);
    }
  });
});

describe('10. Line links', () => {
  it("an incident's line link opens the right tab with those lines highlighted", async () => {
    const user = renderDesk();
    await lenaFlow(user);
    await openBench(user, LENA);

    await click(user, 'Amended petition, lines 10 to 15');
    expect(screen.getByRole('tab', { name: d.bench.tabs.amended })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Lines 10 to 15 are highlighted.')).toHaveFocus();
    const highlighted = [...document.querySelectorAll('#panel-amended .line-highlight')].map((el) =>
      Number(el.getAttribute('data-line')),
    );
    expect(highlighted).toEqual([10, 11, 12, 13, 14, 15]);

    await click(user, d.bench.petitionTab.clear);
    expect(document.querySelectorAll('.line-highlight')).toHaveLength(0);

    await user.click(screen.getByRole('tab', { name: d.bench.tabs.summary }));
    await click(user, 'Amended petition, lines 16 to 17');
    expect(screen.getByText('Lines 16 to 17 are highlighted.')).toBeInTheDocument();
  });

  it("on a petition with no amendment, the link opens the original petition", async () => {
    const user = renderDesk();
    await openBench(user, DANA);
    expect(screen.queryByRole('tab', { name: d.bench.tabs.amended })).not.toBeInTheDocument();
    await click(user, 'Original petition, line 5');
    expect(screen.getByRole('tab', { name: d.bench.tabs.original })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText('Line 5 is highlighted.')).toBeInTheDocument();
  });
});

describe('11. Outcome', () => {
  it('Save needs an outcome, Denied needs a reason, and reasons are off unless Denied is picked', async () => {
    const user = renderDesk();
    await openBench(user, ANA);
    const reasons = screen.getByRole('group', { name: d.bench.outcome.reasonsLegend });
    expect(reasons).toBeDisabled();
    expect(screen.getByText(d.bench.outcome.told.none)).toBeInTheDocument();

    await click(user, d.bench.outcome.save);
    expect(screen.getByRole('alert')).toHaveTextContent(d.bench.outcome.needOutcome);

    await user.click(screen.getByRole('radio', { name: 'Set for hearing' }));
    expect(reasons).toBeDisabled();
    expect(screen.getByText(d.bench.outcome.told.hearing)).toBeInTheDocument();

    await user.click(screen.getByRole('radio', { name: 'Denied' }));
    expect(reasons).toBeEnabled();
    expect(screen.getByText(d.bench.outcome.told.denied)).toBeInTheDocument();
    await click(user, d.bench.outcome.save);
    expect(screen.getByRole('alert')).toHaveTextContent(d.bench.outcome.needReason);

    await user.click(screen.getByRole('checkbox', { name: 'Time, place, or acts are too vague' }));
    await click(user, d.bench.outcome.save);
    expect(screen.getByText('Saved as Denied. Your order is still entered as usual.')).toBeInTheDocument();
    expect(screen.getByText('From the common denial reasons in the PO-0102 booklet.')).toBeInTheDocument();

    await goToReview(user);
    expect(reviewRow(ANA)).toHaveTextContent('Denied');
  });

  it('harassment petitions don\'t offer "Granted ex parte"', async () => {
    const user = renderDesk();
    await openBench(user, MARCUS);
    expect(screen.queryByRole('radio', { name: 'Granted ex parte' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('radio').map((r) => r.closest('label')!.textContent)).toEqual(['Set for hearing', 'Denied']);

    await openBench(user, ANA);
    expect(screen.getByRole('radio', { name: 'Granted ex parte' })).toBeInTheDocument();
  });
});

describe('12. Ask the specialist', () => {
  it('moves the petition back to the specialist list with a new 24-hour hold', async () => {
    const user = renderDesk();
    await lenaFlow(user);
    await openBench(user, LENA);

    expect(screen.getByRole('heading', { name: '1 question still open' })).toBeInTheDocument();
    await click(user, d.bench.openQuestions.ask);
    expect(screen.getByText('Sent to T. Reyes. It comes back to you within 24 hours.')).toHaveFocus();

    await goToReview(user);
    expect(reviewRow(LENA)).toBeNull();

    await goToList(user);
    expect(statusIn(listRow(LENA))).toBe(d.status.magistrateHold);

    await openPetition(user, LENA);
    expect(screen.getByRole('heading', { level: 2, name: 'Hold ends Wednesday at 8:39 am' })).toBeInTheDocument();
    expect(screen.getByText('The magistrate asked for follow-up at Tue 8:39 am.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: d.petition.hold.sendNow })).toBeInTheDocument();
  });

  it('without a phone number, there is no one to follow up with', async () => {
    const user = renderDesk();
    await openBench(user, KEISHA);
    expect(screen.queryByRole('button', { name: d.bench.openQuestions.ask })).not.toBeInTheDocument();
    expect(screen.getByText(d.bench.openQuestions.noPhone)).toBeInTheDocument();
  });

  it('"Preview the bench summary" opens it without the side column', async () => {
    const user = renderDesk();
    await openPetition(user, LENA);
    await click(user, d.petition.hold.holdButton);
    await click(user, d.petition.hold.preview);
    expect(screen.getByRole('heading', { level: 1, name: 'Moore v. Ostrander' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: d.bench.outcome.title })).not.toBeInTheDocument();
    expect(screen.getByText(/On hold until Tuesday at 8:37 am\./)).toBeInTheDocument();
    await click(user, d.bench.back);
    expect(screen.getByRole('heading', { level: 1, name: 'Stalking petition from Lena Moore' })).toHaveFocus();
  });
});

describe('13. ReadyFile unchanged', () => {
  it('ReadyFile never asks respondent-dob-missing', async () => {
    const user = renderApp();
    await begin(user, 'Stalking');
    await loadSample(user, 'one');
    await toQuestions(user);
    expect(document.body).toHaveTextContent('Questions: 1.');
    for (const toggle of questionToggles()) await user.click(toggle);
    expect(document.body).toHaveTextContent('Stalking means two or more incidents. Are there other times?');
    expect(document.body).not.toHaveTextContent(/other person's date of birth/);
  });
});

describe('Reset demo', () => {
  it('puts everything back as it was on load', async () => {
    const user = renderDesk();
    await openPetition(user, LENA);
    await click(user, d.petition.hold.holdButton);
    await click(user, d.petition.demo.reset);
    expect(screen.getByRole('heading', { level: 1, name: d.list.title })).toHaveFocus();
    expect(statusIn(listRow(LENA))).toBe('Not held yet');
    expect(screen.getByText('Updated Mon 8:35 am')).toBeInTheDocument();
  });
});
