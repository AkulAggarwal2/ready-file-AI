// Pure functions behind voice typing: joining spoken words to a field,
// reading spoken answers, and checking the model's tidied text. All words are fictional.
import { afterEach, describe, expect, it, vi } from 'vitest';
import { withTimeout } from '../src/timeout';
import {
  GUIDED_FIELDS,
  isChoiceField,
  readChoiceAnswer,
  readCommand,
  readDateAnswer,
  readHowAnswer,
  readYesNoAnswer,
} from '../src/voice/incidentAnswers';
import { keepsHerMeaning, parseTidied, TIDY_PROMPTS, TIDY_SCHEMA, tidyInput } from '../src/voice/tidyText';
import { appendSpoken, appendWords, toSentence } from '../src/voice/transcript';
import { CHOICE_PROMPTS, choiceInput, choiceSchema, NO_CHOICE, readChoice } from '../src/voice/pickChoice';

describe('joining spoken words to a field', () => {
  it('ends a spoken phrase with a period, unless it already ends a sentence', () => {
    expect(toSentence('he followed me home')).toBe('he followed me home.');
    expect(toSentence('  he followed me home  ')).toBe('he followed me home.');
    expect(toSentence('why did you do that?')).toBe('why did you do that?');
    expect(toSentence('stop!')).toBe('stop!');
    expect(toSentence('She said "leave."')).toBe('She said "leave."');
    expect(toSentence('   ')).toBe('');
  });

  it('adds a phrase after what is already there, and never changes it', () => {
    expect(appendSpoken('', 'he called me')).toBe('he called me.');
    expect(appendSpoken('We worked together.', 'he called me')).toBe('We worked together. he called me.');
    expect(appendSpoken('We worked together.\n', 'he called me')).toBe('We worked together.\nhe called me.');
    expect(appendSpoken('half a thought', 'he called me')).toBe('half a thought he called me.');
    expect(appendSpoken('We worked together.', '  ')).toBe('We worked together.');
  });

  it('adds words to a one-line field without a period', () => {
    expect(appendWords('', 'the parking lot.')).toBe('the parking lot');
    expect(appendWords('outside', 'my work')).toBe('outside my work');
    expect(appendWords('outside  ', 'my work')).toBe('outside my work');
    expect(appendWords('outside', '  ')).toBe('outside');
  });
});

describe('reading spoken answers to an incident card', () => {
  it('asks every question except "What did the person do?" (question 7)', () => {
    expect(GUIDED_FIELDS).toEqual(['date', 'place', 'how', 'description', 'present', 'firsthand', 'feeling', 'evidence']);
    expect(GUIDED_FIELDS).not.toContain('acts');
    expect(GUIDED_FIELDS.filter(isChoiceField)).toEqual(['date', 'how', 'firsthand']);
  });

  it('hears "skip" and "stop" only when that is all she said', () => {
    expect(readCommand('Skip.')).toBe('skip');
    expect(readCommand('next question')).toBe('skip');
    expect(readCommand('Stop')).toBe('stop');
    expect(readCommand("I'm done")).toBe('stop');
    expect(readCommand('he told me to stop calling')).toBeNull();
    expect(readCommand('skip work')).toBeNull();
  });

  it('reads a full date as exact, and anything else as "about when" in her words', () => {
    expect(readDateAnswer('March 3, 2026.')).toEqual({ kind: 'exact', value: '2026-03-03' });
    expect(readDateAnswer('the week before Thanksgiving')).toEqual({
      kind: 'approximate',
      text: 'the week before Thanksgiving',
    });
    expect(readDateAnswer("I don't remember")).toEqual({ kind: 'unknown' });
    expect(readDateAnswer('  ')).toBeNull();
  });

  it('matches how it happened to an option, or to none', () => {
    expect(readHowAnswer('he texted me')).toBe('phone-or-text');
    expect(readHowAnswer('on Instagram')).toBe('online');
    expect(readHowAnswer('in person')).toBe('in-person');
    expect(readHowAnswer('he showed up at my door')).toBe('in-person');
    expect(readHowAnswer('other')).toBe('other');
    expect(readHowAnswer('not sure')).toBe('unknown');
    expect(readHowAnswer('banana')).toBeNull();
  });

  it('reads yes, no, and not sure', () => {
    expect(readYesNoAnswer('Yes.')).toBe('yes');
    expect(readYesNoAnswer('yeah I was there')).toBe('yes');
    expect(readYesNoAnswer('no')).toBe('no');
    expect(readYesNoAnswer('my friend told me, someone told me')).toBe('no');
    expect(readYesNoAnswer("I don't know")).toBe('unknown');
    expect(readYesNoAnswer('banana')).toBeNull();
  });

  it('turns a choice answer into the change it makes', () => {
    expect(readChoiceAnswer('how', 'he called me')).toEqual({ how: 'phone-or-text' });
    expect(readChoiceAnswer('firsthand', 'yes')).toEqual({ firsthand: 'yes' });
    expect(readChoiceAnswer('date', 'last week')).toEqual({ date: { kind: 'approximate', text: 'last week' } });
    expect(readChoiceAnswer('how', 'banana')).toBeNull();
  });
});

describe('checking the tidied text keeps her meaning', () => {
  const SAID =
    'I was I was chilling at home and this Suraj came and then he randomly pushes me out of my bed. And then I was like why did you do that and then he removes a knife and like shows a knife to me.';

  it.each([
    ['grammar and punctuation', 'um so he he come to my work on friday', 'So he came to my work on Friday.'],
    [
      'repeats and small words',
      SAID,
      'I was chilling at home, and this Suraj came, and then he randomly pushed me out of my bed. And then I was like, "Why did you do that?" And then he removed a knife and showed a knife to me.',
    ],
    ['an apostrophe added', 'he didnt touch me', "He didn't touch me."],
    ['a curly apostrophe', "he didn't touch me", 'He didn’t touch me.'],
    ['filler sounds removed', 'uh he uh waited outside', 'He waited outside.'],
  ])('accepts %s', (_name, said, tidied) => {
    expect(keepsHerMeaning(said, tidied)).toBe(true);
  });

  it.each([
    ['a changed number', 'he sent me 20 texts in one night', 'He sent me 2 texts in one night.'],
    ['an added number', 'he sent me texts', 'He sent me 5 texts.'],
    ['a dropped "not"', 'he did not touch me', 'He touched me.'],
    ['an added "not"', 'he went to my work', 'He did not go to my work.'],
    ['an added "never"', 'he called me', 'He never called me.'],
    [
      'added accusations',
      'he was outside my house',
      'He was stalking me outside my house and threatening my family and friends.',
    ],
    [
      'a rewrite',
      SAID,
      'I was relaxing at home when Suraj arrived and pushed me out of bed for no reason. When I asked why, he pulled out a knife and threatened me with it.',
    ],
    [
      'added details',
      SAID,
      'I was chilling at home when Suraj came and angrily pushed me out of my bed, and then he pulled out a knife and threatened me.',
    ],
    ['an empty answer', 'he called me', ''],
  ])('rejects %s', (_name, said, tidied) => {
    expect(keepsHerMeaning(said, tidied)).toBe(false);
  });
});

describe('what the model is told', () => {
  it('reads the model answer, or nothing if it is the wrong shape', () => {
    expect(parseTidied('{"relevant":true,"text":"  He called me.  "}')).toEqual({ relevant: true, text: 'He called me.' });
    expect(parseTidied('{"relevant":false,"text":""}')).toEqual({ relevant: false, text: '' });
    expect(parseTidied('{"text":"He called me."}')).toBeNull();
    expect(parseTidied('{"relevant":"yes","text":"He called me."}')).toBeNull();
    expect(parseTidied('He called me.')).toBeNull();
  });

  it('must answer whether she answered, and the tidied text', () => {
    expect(TIDY_SCHEMA.required).toEqual(['relevant', 'text']);
    expect(Object.keys(TIDY_SCHEMA.properties)).toEqual(['relevant', 'text']);
  });

  it('gets the question with what she said', () => {
    expect(tidyInput('Where did it happen?', 'at my work')).toBe('Question: Where did it happen?\nWhat they said: at my work');
  });

  it('is told it may only clean up her words, and never add or reword anything', () => {
    const [system] = TIDY_PROMPTS;
    expect(system.role).toBe('system');
    expect(system.content).toMatch(/You may only:/);
    expect(system.content).toMatch(/never:[\s\S]*add any fact/);
    expect(system.content).toMatch(/swap their words/);
    expect(system.content).toMatch(/If you are not sure, say true/);
  });

  it("has worked examples that pass the app's own check, and one unrelated example", () => {
    const pairs = [];
    for (let i = 1; i < TIDY_PROMPTS.length; i += 2) {
      expect(TIDY_PROMPTS[i].role).toBe('user');
      expect(TIDY_PROMPTS[i + 1].role).toBe('assistant');
      const said = TIDY_PROMPTS[i].content.split('\nWhat they said: ')[1];
      pairs.push({ said, answer: parseTidied(TIDY_PROMPTS[i + 1].content) });
    }
    expect(pairs.length).toBeGreaterThanOrEqual(3);
    for (const { said, answer } of pairs) {
      expect(answer).not.toBeNull();
      // An example that rewrites her words would teach the model to do it.
      if (answer?.relevant) expect(keepsHerMeaning(said, answer.text)).toBe(true);
    }
    expect(pairs.some(({ answer }) => answer?.relevant === false)).toBe(true);
  });
});

describe('withTimeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('gives the answer when it comes in time', async () => {
    await expect(withTimeout(Promise.resolve('done'), 1000)).resolves.toBe('done');
  });

  it('gives "timeout" when the answer is too slow', async () => {
    vi.useFakeTimers();
    const waiting = withTimeout(new Promise(() => {}), 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(waiting).resolves.toBe('timeout');
  });

  it('leaves no timer running after an answer', async () => {
    vi.useFakeTimers();
    await withTimeout(Promise.resolve('done'), 1000);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('picking a choice with the model (guided voice control)', () => {
  const CHOICES = ['In person', 'Online', 'Phone call or text'];

  it('may only answer with one of the choices or "none"', () => {
    expect(choiceSchema(CHOICES)).toEqual({
      type: 'object',
      properties: { choice: { type: 'string', enum: [...CHOICES, NO_CHOICE] } },
      required: ['choice'],
      additionalProperties: false,
    });
  });

  it('uses only an answer that is one of the choices', () => {
    expect(readChoice('{"choice":"Online"}', CHOICES)).toBe(1);
    expect(readChoice('{"choice":"none"}', CHOICES)).toBeNull();
    expect(readChoice('{"choice":"By letter"}', CHOICES)).toBeNull();
    expect(readChoice('{"choice":"online"}', CHOICES)).toBeNull();
    expect(readChoice('Online', CHOICES)).toBeNull();
  });

  it('is told not to decide for her, and its examples keep to their own lists', () => {
    const [system, ...examples] = CHOICE_PROMPTS;
    expect(system.content).toMatch(/Do not decide for them from a story/);
    expect(system.content).toMatch(/Never guess/);
    for (let i = 0; i < examples.length; i += 2) {
      const choices = [...examples[i].content.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      const answer = JSON.parse(examples[i + 1].content).choice;
      expect([...choices, NO_CHOICE]).toContain(answer);
    }
    // At least one example where the right answer is "none".
    expect(examples.some((m) => m.role === 'assistant' && m.content.includes(NO_CHOICE))).toBe(true);
  });

  it('sends the question, its choices, and what she said', () => {
    expect(choiceInput('How?', ['A', 'B'], 'he texted')).toBe('Question: How?\nChoices: "A", "B"\nWhat they said: he texted');
  });
});
