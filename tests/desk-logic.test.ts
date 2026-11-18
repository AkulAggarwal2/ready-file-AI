// ReadyFile Desk logic: plurals, line numbers, the hold timeline, and the
// checker's staff text. All data is fictional.
import { describe, expect, it } from 'vitest';
import { runChecks } from '../src/checker';
import { rules } from '../src/content';
import { deskCopy, plural, samplePetitions } from '../src/desk/content';
import { findLines, wrapNarrative } from '../src/desk/lines';
import { currentFindings, maskPhone, numberVersion, staffText, type Petition } from '../src/desk/model';
import { deskReducer, initialDeskState } from '../src/desk/state';
import { buildStrip } from '../src/desk/timeline';
import { formatShort, parseTime } from '../src/desk/time';

const petition = (id: string, state = initialDeskState()): Petition =>
  state.petitions.find((p) => p.sample.id === id)!;

describe('plural forms', () => {
  it('picks zero, one, and other, and falls back to other without zero', () => {
    const text = deskCopy.questions.title;
    expect(plural(text, { n: 0 })).toBe('No questions the counter would ask');
    expect(plural(text, { n: 1 })).toBe('1 question the counter would ask');
    expect(plural(text, { n: 2 })).toBe('2 questions the counter would ask');
    expect(plural({ by: 'n', one: '1 thing', other: '{n} things' }, { n: 0 })).toBe('0 things');
  });

  it('reads correctly for 0, 1, and 2 in staffText (acceptance test 16)', () => {
    const stalking = rules.find((r) => r.id === 'stalking-two-incidents')!.staffText!;
    expect(plural(stalking, { n: 0 })).toBe('Stalking is checked, and no incidents are described');
    expect(plural(stalking, { n: 1 })).toBe('Stalking is checked, and only 1 incident is described');
    expect(plural(stalking, { n: 2 })).toBe('Stalking is checked, and 2 incidents are described');
    const short = rules.find((r) => r.id === 'incident-too-short')!.staffText!;
    expect(plural(short, { i: 3, words: 1 })).toBe('Incident 3 is very short (1 word)');
    expect(plural(short, { i: 3, words: 9 })).toBe('Incident 3 is very short (9 words)');
    expect(plural(deskCopy.list.filters.questions, { n: 2 })).toBe('Questions found (2)');
    expect(plural(deskCopy.bench.incidents, { n: 1 })).toBe('1 incident, in date order');
    expect(plural(deskCopy.bench.incidents, { n: 4 })).toBe('4 incidents, in date order');
  });
});

describe('checker values and staff text', () => {
  const input = {
    caseType: 'stalking' as const,
    incidents: [{ id: 'a', date: { kind: 'unknown' as const }, description: 'He was waiting outside my work again last night.' }],
  };

  it('fills values so Desk never recomputes them', () => {
    const findings = runChecks(input, rules);
    expect(findings.map((f) => [f.ruleId, f.values])).toEqual([
      ['stalking-two-incidents', { n: 1 }],
      ['incident-missing-date', { i: 1 }],
      ['incident-too-short', { i: 1, words: 9 }],
    ]);
    expect(findings.map(staffText)).toEqual([
      'Stalking is checked, and only 1 incident is described',
      'Incident 1 has no date',
      'Incident 1 is very short (9 words)',
    ]);
  });

  it('asks respondent-dob-missing only when respondent details are given', () => {
    expect(runChecks(input, rules).map((f) => f.ruleId)).not.toContain('respondent-dob-missing');
    const blank = runChecks({ ...input, respondent: { dateOfBirth: '' } }, rules);
    expect(blank.map((f) => f.ruleId)).toContain('respondent-dob-missing');
    const given = runChecks({ ...input, respondent: { dateOfBirth: '1990-01-01' } }, rules);
    expect(given.map((f) => f.ruleId)).not.toContain('respondent-dob-missing');
  });

  it('shows "Question from rule {id}" for a rule with no staffText', () => {
    const [finding] = runChecks(input, [{ ...rules[0], staffText: undefined }]);
    expect(staffText(finding)).toBe('Question from rule stalking-two-incidents');
  });
});

describe('expected findings for the samples (brief section 7)', () => {
  const ids = (id: string, state = initialDeskState()) => currentFindings(petition(id, state)).map((f) => f.ruleId);

  it('matches the brief', () => {
    expect(ids('lena')).toEqual(['stalking-two-incidents', 'respondent-dob-missing']);
    expect(ids('keisha')).toEqual(['incident-missing-date']);
    expect(ids('dana')).toEqual(['incident-too-short']);
    expect(ids('marcus')).toEqual([]);
    expect(ids('ana')).toEqual([]);
  });

  it('Lena amended has only respondent-dob-missing', () => {
    let state = deskReducer(initialDeskState(), { type: 'hold', id: 'lena' });
    state = deskReducer(state, { type: 'textLink', id: 'lena' });
    state = deskReducer(state, { type: 'demoAmend', id: 'lena' });
    expect(ids('lena', state)).toEqual(['respondent-dob-missing']);
  });
});

describe('line numbers', () => {
  it('wraps at 66 characters on spaces, keeps paragraphs, and never changes the words', () => {
    for (const sample of samplePetitions) {
      for (const v of [sample.original, sample.amended].filter(Boolean)) {
        const lines = wrapNarrative(v!.narrative, 66);
        expect(lines.every((line) => line.text.length <= 66)).toBe(true);
        expect(lines.map((line) => line.text).join(' ')).toBe(v!.narrative.split(/\s+/).join(' '));
        expect(lines.map((line) => line.n)).toEqual(lines.map((_, i) => i + 1));
      }
    }
  });

  it('finds each incident on its lines, and paragraphs start new lines', () => {
    const lena = samplePetitions.find((s) => s.id === 'lena')!;
    const lines = wrapNarrative(lena.amended!.narrative, 66);
    const ranges = lena.amended!.incidents.map((i) => findLines(lines, lena.amended!.narrative, i.description));
    expect(ranges[0]!.a).toBe(1);
    for (let k = 1; k < ranges.length; k++) expect(ranges[k]!.a).toBe(ranges[k - 1]!.b + 1);
    expect(lines.find((line) => line.n === ranges[1]!.a)!.newParagraph).toBe(true);
  });

  it('finds the statement not tied to one incident', () => {
    let state = deskReducer(initialDeskState(), { type: 'hold', id: 'lena' });
    state = deskReducer(state, { type: 'textLink', id: 'lena' });
    state = deskReducer(state, { type: 'demoAmend', id: 'lena' });
    const v = numberVersion(petition('lena', state), 'amended');
    expect(v.notTied.map((s) => s.text)).toEqual([
      "I am scared to be at home and I don't feel safe walking to my car anymore.",
    ]);
  });
});

describe('phone masking', () => {
  it('keeps the area code and last two digits', () => {
    expect(maskPhone('(260) 555-0141')).toBe('(260) •••-••41');
  });
});

describe('hold timeline', () => {
  it('starts at the counter opening and runs 25 hours, with the computed sentence', () => {
    const state = initialDeskState();
    const strip = buildStrip(petition('lena', state), state.clock);
    expect(formatShort(strip.start)).toBe('Mon 8 am');
    expect(formatShort(strip.end)).toBe('Tue 9 am');
    expect(strip.ticks).toHaveLength(7);
    expect(strip.sentence).toBe(deskCopy.timeline.sentences.noOverlapTexts);
    expect(formatShort(strip.ifHeld!.end)).toBe('Tue 8:37 am');
    expect(strip.alt).toContain('Counter open: Mon 8 am to Mon 4 pm, Tue 8 am to Tue 9 am.');
    expect(strip.alt).toContain('Call times: Mon 7:30 pm to Mon 10 pm.');
  });

  it('starts at 8 am the day before when it is after midnight', () => {
    const strip = buildStrip(petition('lena'), parseTime('2026-11-10T00:30'));
    expect(formatShort(strip.start)).toBe('Mon 8 am');
  });

  it('says when call times overlap, and when there are none', () => {
    const state = initialDeskState();
    expect(buildStrip(petition('dana', state), state.clock).sentence).toBe(
      "The petitioner's call times overlap the counter's hours from 8 am to 4 pm.",
    );
    expect(buildStrip(petition('keisha', state), state.clock).sentence).toBe(deskCopy.timeline.sentences.noCallTimes);
  });
});

describe('the demo clock and holds', () => {
  it('never holds on its own, holds once, and a hold ends after 24 hours', () => {
    let state = initialDeskState();
    expect(state.petitions.every((p) => p.followUp.hold === undefined)).toBe(true);

    state = deskReducer(state, { type: 'hold', id: 'lena' });
    const hold = petition('lena', state).followUp.hold!;
    expect(formatShort(hold.start)).toBe('Mon 8:37 am');
    expect(formatShort(hold.end)).toBe('Tue 8:37 am');

    // A second hold, by anyone, does nothing.
    expect(deskReducer(state, { type: 'askFollowUp', id: 'lena' })).toBe(state);
    // No phone, no hold.
    expect(deskReducer(state, { type: 'hold', id: 'keisha' })).toBe(state);

    state = deskReducer(state, { type: 'demoJumpToHoldEnd', id: 'lena' });
    const ended = petition('lena', state);
    expect(ended.followUp.hold!.endedAt).toBe(hold.end);
    expect(ended.followUp.log.at(-1)!.text).toBe(deskCopy.log.holdEnded);
    expect(deskReducer(state, { type: 'hold', id: 'lena' })).toBe(state);
  });

  it('starts each log at the filing time', () => {
    const lena = petition('lena');
    expect(formatShort(lena.followUp.log[0].at)).toBe('Sun 11:52 pm');
    expect(lena.followUp.log[0].text).toBe('Desk checked the petition and found 2 questions.');
  });
});
