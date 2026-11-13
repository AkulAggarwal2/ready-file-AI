// Desk logic with no screens: line numbers, the demo clock, call times, date
// order, plurals, the sample findings, and holds. All data is fictional.
import { describe, expect, it } from 'vitest';
import { deskConfig } from '../src/desk/config';
import { plural, staffText } from '../src/desk/content';
import { inDateOrder, sortDate } from '../src/desk/dateOrder';
import {
  formatAt,
  formatBirthDate,
  formatClock,
  formatLong,
  formatMinutesRange,
  formatShort,
  hourLabel,
} from '../src/desk/format';
import { linesFor, wrapNarrative } from '../src/desk/lineWrap';
import { initials, maskPhone, petitionById, petitions, type Contact } from '../src/desk/petitions';
import { contactSummary, insideCallTimes, overlapSentence, timelineRange } from '../src/desk/schedule';
import {
  createInitialState,
  deskReducer,
  statusOf,
  type DeskAction,
  type DeskState,
} from '../src/desk/state/deskState';
import { HOUR, MINUTE, parseDateTime } from '../src/desk/time';

const at = parseDateTime;
const lena = petitionById('lena-moore');

function run(...actions: DeskAction[]): DeskState {
  return actions.reduce(deskReducer, createInitialState());
}

describe('line numbers (66 characters per line)', () => {
  it('breaks only at spaces, keeps every word, and keeps paragraph breaks', () => {
    for (const petition of petitions) {
      for (const version of [petition.original, petition.amendment].filter((v) => v !== null)) {
        const lines = wrapNarrative(version.narrative, 66);
        expect(lines.map((l) => l.number)).toEqual(lines.map((_, i) => i + 1));
        for (const line of lines) {
          expect(line.text.length).toBeLessThanOrEqual(66);
          expect(line.text).toBe(version.narrative.slice(line.start, line.end));
          expect(line.text).toBe(line.text.trim());
        }
        // Joining the lines of each paragraph gives back the paragraph exactly.
        const paragraphs = version.narrative.split('\n\n');
        const rebuilt = paragraphs.map((_, p) =>
          lines
            .filter((l) => l.paragraph === p)
            .map((l) => l.text)
            .join(' '),
        );
        expect(rebuilt).toEqual(paragraphs);
        expect(lines.filter((l) => l.startsParagraph)).toHaveLength(paragraphs.length - 1);
      }
    }
  });

  it("numbers Lena's petitions the way the bench summary links to them", () => {
    expect(lena.original.lines).toHaveLength(8);
    expect(lena.original.incidents.map((i) => [i.firstLine, i.lastLine])).toEqual([[1, 8]]);
    expect(lena.original.statements).toEqual([]);

    const amended = lena.amendment!;
    expect(amended.lines).toHaveLength(17);
    expect(amended.incidents.map((i) => [i.firstLine, i.lastLine])).toEqual([
      [1, 3],
      [4, 6],
      [7, 9],
      [10, 15],
    ]);
    expect(amended.statements).toEqual([
      {
        text: "I am scared to be at home and I don't feel safe walking to my car anymore.",
        firstLine: 16,
        lastLine: 17,
      },
    ]);
  });

  it('gives a very long word a line of its own, and treats a single line break as a new line', () => {
    const lines = wrapNarrative(`${'x'.repeat(70)} short\nnext`, 66);
    expect(lines.map((l) => l.text)).toEqual(['x'.repeat(70), 'short', 'next']);
    expect(linesFor(lines, { start: 71, end: 76 })).toEqual({ first: 2, last: 2 });
  });
});

describe('demo clock and times', () => {
  it('starts Monday, November 9, 2026 at 8:35 am', () => {
    expect(formatLong(deskConfig.clockStart)).toBe('Monday, November 9 at 8:35 am');
    expect(createInitialState().now).toBe(at('2026-11-09T08:35'));
  });

  it('formats times the way the brief writes them', () => {
    expect(formatShort(at('2026-11-08T23:52'))).toBe('Sun 11:52 pm');
    expect(formatAt(at('2026-11-10T08:37'))).toBe('Tuesday at 8:37 am');
    expect(formatClock(at('2026-11-09T16:00'))).toBe('4 pm');
    expect(formatClock(at('2026-11-09T12:05'))).toBe('12:05 pm');
    expect(formatClock(at('2026-11-09T00:10'))).toBe('12:10 am');
    expect(formatMinutesRange(19 * 60 + 30, 22 * 60)).toBe('7:30 to 10 pm');
    expect(formatMinutesRange(8 * 60, 16 * 60)).toBe('8 am to 4 pm');
    expect([8, 12, 16, 20, 24, 28, 32].map(hourLabel)).toEqual(['8 am', 'Noon', '4 pm', '8 pm', 'Midnight', '4 am', '8 am']);
    expect(formatBirthDate('1989-04-17')).toBe('April 17, 1989');
  });

  it('the timeline runs 25 hours from when the counter opens', () => {
    const range = timelineRange(at('2026-11-09T08:35'));
    expect(formatShort(range.start)).toBe('Mon 8 am');
    expect(formatShort(range.end)).toBe('Tue 9 am');
    expect(formatShort(timelineRange(at('2026-11-10T03:00')).start)).toBe('Mon 8 am');
  });
});

describe('call times and the sentence under the timeline', () => {
  const base: Contact = { phone: 'x', textsOk: true, voicemailOk: false, calls: null };
  const nights = { anyTime: false as const, days: 'weeknights', from: 19 * 60 + 30, to: 22 * 60 };
  const monday = at('2026-11-09T08:35');

  it('no overlap, texts OK', () => {
    expect(overlapSentence({ ...base, calls: nights }, monday)).toBe(
      "The call times given don't overlap the counter's hours. A text link lets the petitioner add details before the hold ends.",
    );
  });

  it('no overlap, texts not OK', () => {
    expect(overlapSentence({ ...base, textsOk: false, calls: nights }, monday)).toBe(
      "The call times given don't overlap the counter's hours, and the petitioner asked not to get texts.",
    );
  });

  it('overlap', () => {
    expect(overlapSentence({ ...base, calls: { anyTime: true } }, monday)).toBe(
      "The call times given overlap the counter's hours from 8 am to 4 pm.",
    );
    expect(
      overlapSentence({ ...base, calls: { anyTime: false, days: 'weekdays', from: 15 * 60, to: 18 * 60 } }, monday),
    ).toBe("The call times given overlap the counter's hours from 3 pm to 4 pm.");
  });

  it('no call times', () => {
    expect(overlapSentence(base, monday)).toBe('No call times were given.');
  });

  it('knows when the clock is inside the call times', () => {
    expect(insideCallTimes(nights, at('2026-11-09T08:37'))).toBe(false);
    expect(insideCallTimes(nights, at('2026-11-09T20:21'))).toBe(true);
    expect(insideCallTimes(nights, at('2026-11-14T20:21'))).toBe(false); // Saturday
    expect(insideCallTimes({ anyTime: true }, at('2026-11-14T03:00'))).toBe(true);
    expect(insideCallTimes(null, at('2026-11-09T20:21'))).toBe(false);
  });

  it('summarizes contact details for the list', () => {
    expect(contactSummary(lena.contact)).toBe('Texts OK. Calls weeknights, 7:30 to 10 pm.');
    expect(contactSummary(petitionById('dana-whitfield').contact)).toBe('Texts OK. Calls any time.');
  });
});

describe('date order on the bench summary', () => {
  const filed = at('2026-11-08T23:52');
  const sort = (text: string) => {
    const t = sortDate({ kind: 'approximate', text }, filed);
    return t === null ? null : new Date(t).toISOString().slice(0, 10);
  };

  it('works out a sort date from her date phrase', () => {
    expect(sort('Mid-August')).toBe('2026-08-15');
    expect(sort('Early September')).toBe('2026-09-05');
    expect(sort('October 21')).toBe('2026-10-21');
    expect(sort('Friday, November 6, about 7 pm')).toBe('2026-11-06');
    expect(sort('Last night')).toBe('2026-11-07');
    expect(sort('late December')).toBe('2025-12-25');
    expect(sort('two weeks ago')).toBe('2026-10-25');
    expect(sort('last Friday')).toBe('2026-11-06');
    expect(sort('around then')).toBeNull();
    expect(sortDate({ kind: 'exact', value: '2026-03-14' }, filed)).toBe(at('2026-03-14T00:00'));
    expect(sortDate({ kind: 'unknown' }, filed)).toBeNull();
  });

  it("puts Lena's amended incidents in date order", () => {
    const amended = lena.amendment!;
    const shuffled = [amended.incidents[3], amended.incidents[1], amended.incidents[0], amended.incidents[2]];
    expect(inDateOrder(shuffled, amended.filedAt).map((i) => i.position)).toEqual([1, 2, 3, 4]);
  });

  it('puts undated incidents last, and ties keep the order filed', () => {
    const items = [
      { id: 'a', date: { kind: 'unknown' as const } },
      { id: 'b', date: { kind: 'approximate' as const, text: 'October 3' } },
      { id: 'c', date: { kind: 'approximate' as const, text: 'Oct 3?' } },
      { id: 'd', date: { kind: 'approximate' as const, text: 'October 3' } },
      { id: 'e', date: { kind: 'approximate' as const, text: 'September 12' } },
    ];
    expect(inDateOrder(items, filed).map((i) => i.id)).toEqual(['e', 'b', 'd', 'a', 'c']);
  });
});

describe('plurals', () => {
  const forms = { zero: 'No questions', one: '1 question', other: '{n} questions' };
  it('picks zero, one, or other', () => {
    expect([0, 1, 2, 7].map((n) => plural(forms, n))).toEqual(['No questions', '1 question', '2 questions', '7 questions']);
    expect(plural({ one: '1 thing', other: '{n} things' }, 0)).toBe('0 things');
  });
});

describe('expected findings with today\'s rules (section 7)', () => {
  const ids = (id: string, version: 'original' | 'amendment' = 'original') =>
    petitionById(id)[version]!.findings.map((f) => [f.ruleId, staffText(f)]);

  it('Lena, original and amended', () => {
    expect(ids('lena-moore')).toEqual([
      ['stalking-two-incidents', 'Stalking is checked, and 1 incident is described'],
      ['respondent-dob-missing', "The respondent's date of birth is blank"],
    ]);
    expect(ids('lena-moore', 'amendment')).toEqual([['respondent-dob-missing', "The respondent's date of birth is blank"]]);
  });

  it('Keisha, Dana, Marcus, and Ana', () => {
    expect(ids('keisha-turner')).toEqual([['incident-missing-date', 'Incident 2 has no date']]);
    expect(ids('dana-whitfield')).toEqual([['incident-too-short', 'Incident 3 is very short (9 words)']]);
    expect(ids('marcus-reid')).toEqual([]);
    expect(ids('ana-perez')).toEqual([]);
  });
});

describe('sample petitions', () => {
  it('shows initials and masks phone numbers', () => {
    expect(initials(lena.petitioner)).toBe('L. M.');
    expect(maskPhone(lena.contact.phone!)).toBe('(260) •••-••41');
  });
});

describe('holds (ground rule 1)', () => {
  it('on load, nothing is held, and every log starts with the check at the filing time', () => {
    const state = createInitialState();
    for (const petition of petitions) {
      const record = state.records[petition.id];
      expect(record.hold).toBeNull();
      expect(record.log[0].at).toBe(petition.original.filedAt);
      expect(record.log[0].text).toMatch(/^Desk checked the petition and found/);
    }
  });

  it('a staff hold lasts 24 hours, and each action moves the clock 2 minutes', () => {
    const state = run({ type: 'hold', id: 'lena-moore' });
    const { hold } = state.records['lena-moore'];
    expect(state.now).toBe(at('2026-11-09T08:37'));
    expect(hold).toEqual({ start: at('2026-11-09T08:37'), end: at('2026-11-10T08:37'), byMagistrate: false });
    expect(statusOf(lena, state.records['lena-moore']).text).toBe('Held until Tue 8:37 am');
    expect(state.records['lena-moore'].log.at(-1)).toEqual({ at: state.now, text: 'Held for follow-up until Tue 8:37 am.' });
  });

  it("can't hold a petition with no phone number, or hold it twice", () => {
    expect(run({ type: 'hold', id: 'keisha-turner' }).records['keisha-turner'].hold).toBeNull();
    const twice = run({ type: 'hold', id: 'lena-moore' }, { type: 'hold', id: 'lena-moore' });
    expect(twice.records['lena-moore'].log.filter((e) => e.text.startsWith('Held'))).toHaveLength(1);
  });

  it('"Send to magistrate now" ends the hold at once', () => {
    const state = run({ type: 'hold', id: 'dana-whitfield' }, { type: 'sendNow', id: 'dana-whitfield' });
    const record = state.records['dana-whitfield'];
    expect(record.hold).toBeNull();
    expect(record.sentAt).toBe(at('2026-11-09T08:39'));
    expect(record.queueSince).toBe(at('2026-11-09T08:39'));
    expect(statusOf(petitionById('dana-whitfield'), record).text).toBe('Sent to review Mon 8:39 am');
  });

  it('any hold ends on its own when the clock passes its end time', () => {
    const state = run(
      { type: 'hold', id: 'dana-whitfield' },
      { type: 'hold', id: 'lena-moore' },
      { type: 'demoJumpToHoldEnd', id: 'lena-moore' },
    );
    expect(state.now).toBe(at('2026-11-10T08:39'));
    for (const id of ['dana-whitfield', 'lena-moore']) {
      const record = state.records[id];
      expect(record.hold).toBeNull();
      expect(record.log.at(-1)!.text).toBe('The hold ended, and the petition went to the magistrate.');
    }
    expect(state.records['dana-whitfield'].sentAt).toBe(at('2026-11-10T08:37'));
  });

  it('the magistrate can ask for a new 24-hour hold', () => {
    const state = run({ type: 'askFollowUp', id: 'dana-whitfield' });
    const record = state.records['dana-whitfield'];
    expect(record.hold).toEqual({ start: state.now, end: state.now + 24 * HOUR, byMagistrate: true });
    expect(statusOf(petitionById('dana-whitfield'), record).text).toBe('Magistrate asked for follow-up');
    // Not for a petition with no phone, or with no open questions.
    expect(run({ type: 'askFollowUp', id: 'keisha-turner' }).records['keisha-turner'].hold).toBeNull();
    expect(run({ type: 'askFollowUp', id: 'marcus-reid' }).records['marcus-reid'].hold).toBeNull();
  });

  it('the amendment arrives only after the link is texted, during a hold', () => {
    expect(run({ type: 'demoAddIncidents', id: 'lena-moore' }).records['lena-moore'].amendedAt).toBeNull();
    const notTexted = run({ type: 'hold', id: 'lena-moore' }, { type: 'demoAddIncidents', id: 'lena-moore' });
    expect(notTexted.records['lena-moore'].amendedAt).toBeNull();

    const state = run(
      { type: 'hold', id: 'lena-moore' },
      { type: 'textLink', id: 'lena-moore' },
      { type: 'demoAddIncidents', id: 'lena-moore' },
    );
    expect(state.now).toBe(at('2026-11-09T20:21'));
    expect(state.records['lena-moore'].log.slice(-2).map((e) => [formatShort(e.at), e.text])).toEqual([
      ['Mon 8:21 pm', 'The petitioner filed an amended petition that adds 3 incidents.'],
      ['Mon 8:21 pm', 'Desk checked the amended petition and found 1 question.'],
    ]);
    expect(state.now - at('2026-11-09T08:39')).toBeGreaterThan(MINUTE);
  });

  it('saving an outcome checks the choices for the case type and needs a reason for Denied', () => {
    expect(run({ type: 'saveOutcome', id: 'keisha-turner', choice: 'granted-ex-parte', reasons: [] }).records['keisha-turner'].outcome).toBeNull();
    expect(run({ type: 'saveOutcome', id: 'ana-perez', choice: 'denied', reasons: [] }).records['ana-perez'].outcome).toBeNull();
    const saved = run({ type: 'saveOutcome', id: 'ana-perez', choice: 'denied', reasons: ['vague'] });
    expect(saved.records['ana-perez'].outcome).toMatchObject({ choice: 'denied', reasons: ['vague'] });
  });
});
