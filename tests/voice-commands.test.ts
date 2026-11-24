// Voice control: reading what she says and finding what she named. Pure
// functions, no browser. All words are fictional.
import { describe, expect, it } from 'vitest';
import {
  isBoxCommand,
  matchName,
  namedInFull,
  normalize,
  pickMentionedChoice,
  readGuideCommand,
  readMoveWithin,
  readNumber,
  readVoiceCommand,
  readYesNoWithin,
  sameWord,
  scoreName,
  soundsLikeWhen,
  trimWhen,
  type Candidate,
  type NameAttempt,
} from '../src/voice/voiceCommands';

const said = (phrase: string): NameAttempt[] => {
  const command = readVoiceCommand(phrase);
  if (command?.kind !== 'name') throw new Error(`"${phrase}" was read as ${command?.kind}`);
  return command.attempts;
};
const words = (phrase: string) => normalize(phrase).split(' ');

// Like the incident card: the "What did the person do?" boxes and a few buttons.
const CARD: Candidate[] = [
  { names: ['Tried to hurt me'] },
  { names: ['Threatened to hurt me'] },
  { names: ['Hurt me'] },
  { names: ['Made me afraid I would be hurt'] },
  { names: ['Kept contacting or following me when I didn\'t want it'] },
  { names: ['What happened'] },
  { names: ['Who was there?'] },
  { names: ['Proof you have (optional)'] },
  { names: ['Done'] },
  { names: ['Next: Your story'] },
  { names: ['Quick exit'], exactOnly: true },
];
const nameAt = (match: ReturnType<typeof matchName>) =>
  match.kind === 'found' ? CARD[match.index].names[0] : match.kind;

describe('reading what she says', () => {
  it('ignores case, punctuation, accents, apostrophes, and words in brackets', () => {
    expect(normalize('  Next.  ')).toBe('next');
    expect(normalize('Didn’t')).toBe('didnt');
    expect(normalize("didn't")).toBe('didnt');
    expect(normalize('Café')).toBe('cafe');
    expect(normalize('Proof you have (optional)')).toBe('proof you have');
  });

  it.each([
    ['help', 'help'],
    ['Help.', 'help'],
    ['what can I say', 'help'],
    ['um help', 'help'],
    ['hide help', 'hideHelp'],
    ['stop listening', 'stopListening'],
    ['Stop voice control.', 'stopListening'],
    ['show numbers', 'showNumbers'],
    ['hide numbers', 'hideNumbers'],
    ['cancel', 'hideNumbers'],
  ])('reads "%s" as %s', (phrase, kind) => {
    expect(readVoiceCommand(phrase)?.kind).toBe(kind);
  });

  it.each([
    ['scroll down', 'down'],
    ['page down', 'down'],
    ['down', 'down'],
    ['scroll up', 'up'],
    ['go to the top', 'top'],
    ['scroll to the bottom', 'bottom'],
  ])('reads "%s" as scrolling %s', (phrase, direction) => {
    expect(readVoiceCommand(phrase)).toEqual({ kind: 'scroll', direction });
  });

  it('leaves "move up" and "move down" as names, for the incident move buttons', () => {
    expect(readVoiceCommand('move up')?.kind).toBe('name');
    expect(readVoiceCommand('move down')?.kind).toBe('name');
  });

  it('hears nothing in silence or filler sounds', () => {
    expect(readVoiceCommand('')).toBeNull();
    expect(readVoiceCommand('  um uh ')).toBeNull();
  });

  it('reads numbers said as digits or words', () => {
    expect(readNumber('7', false)).toBe(7);
    expect(readNumber('seven', false)).toBe(7);
    expect(readNumber('Number 12.', false)).toBe(12);
    expect(readNumber('press 3', false)).toBe(3);
    expect(readNumber('twenty one', false)).toBe(21);
    expect(readNumber('one twenty', false)).toBeNull();
    expect(readNumber('next', false)).toBeNull();
    expect(readNumber('seven days', false)).toBeNull();
  });

  it('reads words that sound like a number as one only while numbers show', () => {
    expect(readNumber('to', true)).toBe(2);
    expect(readNumber('for', true)).toBe(4);
    expect(readNumber('to', false)).toBeNull();
    expect(readVoiceCommand('for', true)).toEqual({ kind: 'number', n: 4 });
    expect(readVoiceCommand('for', false)?.kind).toBe('name');
  });

  it('tries the whole phrase first, then without "click", "press", "check", and the like', () => {
    expect(said('Next')).toEqual([{ words: ['next'], action: 'press' }]);
    expect(said('click next button')).toEqual([
      { words: ['click', 'next', 'button'], action: 'press' },
      { words: ['next'], action: 'press' },
    ]);
    expect(said('check hurt me')).toEqual([
      { words: ['check', 'hurt', 'me'], action: 'press' },
      { words: ['hurt', 'me'], action: 'check' },
    ]);
    expect(said('uncheck the hurt me box')).toEqual([
      { words: ['uncheck', 'the', 'hurt', 'me', 'box'], action: 'press' },
      { words: ['hurt', 'me'], action: 'uncheck' },
    ]);
    expect(said('go to your story')[1]).toEqual({ words: ['your', 'story'], action: 'press' });
  });
});

describe('the same word, allowing for how speech is heard', () => {
  it.each([
    ['hurt', 'hurt'],
    ['hurts', 'hurt'],
    ['threatening', 'threatened'],
    ['stalkin', 'stalking'],
    ['harasment', 'harassment'],
  ])('"%s" matches "%s"', (a, b) => {
    expect(sameWord(a, b)).toBe(true);
  });

  it.each([
    ['hurt', 'hut'],
    ['me', 'my'],
    ['heart', 'hurt'],
    ['done', 'gone'],
  ])('"%s" does not match "%s"', (a, b) => {
    expect(sameWord(a, b)).toBe(false);
  });
});

describe('finding what she named', () => {
  it('scores an exact name highest, then a close one, then part of one', () => {
    expect(scoreName(words('hurt me'), 'Hurt me')).toBe(3);
    expect(scoreName(words('hurts me'), 'Hurt me')).toBe(2);
    expect(scoreName(words('threatened'), 'Threatened to hurt me')).toBe(0.5);
    expect(scoreName(words('afraid'), 'Made me afraid I would be hurt')).toBe(0);
  });

  it('finds the exact name, even when other names contain its words', () => {
    expect(nameAt(matchName(said('Hurt me'), CARD))).toBe('Hurt me');
    expect(nameAt(matchName(said('hurt'), CARD))).toBe('Hurt me');
    expect(nameAt(matchName(said('tried to hurt me'), CARD))).toBe('Tried to hurt me');
  });

  it('finds a name from most of its words, or with a word misheard', () => {
    expect(nameAt(matchName(said('next'), CARD))).toBe('Next: Your story');
    expect(nameAt(matchName(said('threatened to hurt'), CARD))).toBe('Threatened to hurt me');
    expect(nameAt(matchName(said('kept contacting or following me'), CARD))).toBe(
      "Kept contacting or following me when I didn't want it",
    );
    expect(nameAt(matchName(said('proof you have'), CARD))).toBe('Proof you have (optional)');
    expect(nameAt(matchName(said('who was there'), CARD))).toBe('Who was there?');
  });

  it('never matches a sentence that only contains a name', () => {
    // A wrong check mark on a sworn form is serious.
    expect(matchName(said('he hurt me'), CARD).kind).toBe('none');
    expect(matchName(said('I was not done yet'), CARD).kind).toBe('none');
    expect(matchName(said('he made me afraid'), CARD).kind).toBe('none');
    expect(matchName(said('what happened next was awful'), CARD).kind).toBe('none');
  });

  it('presses Quick exit only for its whole name', () => {
    expect(nameAt(matchName(said('Quick exit'), CARD))).toBe('Quick exit');
    expect(nameAt(matchName(said('quick exit.'), CARD))).toBe('Quick exit');
    expect(matchName(said('exit'), CARD).kind).toBe('none');
    expect(matchName(said('quick'), CARD).kind).toBe('none');
    expect(matchName(said('quick exits'), CARD).kind).toBe('none');
  });

  it('keeps what to do with it: check, uncheck, or press', () => {
    expect(matchName(said('check hurt me'), CARD)).toEqual({ kind: 'found', index: 2, action: 'check' });
    expect(matchName(said('uncheck hurt me'), CARD)).toEqual({ kind: 'found', index: 2, action: 'uncheck' });
    expect(matchName(said('press done'), CARD)).toEqual({ kind: 'found', index: 8, action: 'press' });
  });

  it('gives every match when several are equally good', () => {
    const twoDeletes: Candidate[] = [{ names: ['Delete'] }, { names: ['Done'] }, { names: ['Delete'] }];
    expect(matchName(said('delete'), twoDeletes)).toEqual({ kind: 'several', indexes: [0, 2], action: 'press' });
  });

  it('matches any name a control goes by, like a step button read as "Step 1: Start"', () => {
    const steps: Candidate[] = [{ names: ['Start', 'Step 1: Start'] }, { names: ['Incidents', 'Step 2: Incidents'] }];
    expect(matchName(said('step 2'), steps)).toEqual({ kind: 'found', index: 1, action: 'press' });
  });

  it('prefers the choices of the list she is in, and finds them by one telling word', () => {
    const page: Candidate[] = [
      { names: ['Not sure'] },
      { names: ['We are dating or used to date'], boost: 0.5, minCoverage: 0.01 },
      { names: ['Not sure, or I\'d rather not say'], boost: 0.5, minCoverage: 0.01 },
    ];
    expect(matchName(said('dating'), page)).toEqual({ kind: 'found', index: 1, action: 'press' });
    expect(matchName(said('not sure'), page)).toEqual({ kind: 'found', index: 0, action: 'press' });
    expect(matchName(said('rather not say'), page)).toEqual({ kind: 'found', index: 2, action: 'press' });
  });

  it('finds nothing for words that are not on the screen', () => {
    expect(matchName(said('banana'), CARD)).toEqual({ kind: 'none' });
  });
});

describe('guided mode words', () => {
  it.each([
    ['skip', 'skip'],
    ['Skip this question.', 'skip'],
    ['next question', 'skip'],
    ['go back', 'back'],
    ['previous question', 'back'],
    ['try again', 'repeat'],
    ['done', 'done'],
    ["that's all", 'done'],
    ['none', 'done'],
    ['yes', 'yes'],
    ['yeah', 'yes'],
    ['no', 'no'],
    ['not now', 'no'],
  ])('reads "%s" as %s', (phrase, command) => {
    expect(readGuideCommand(phrase)).toBe(command);
  });

  it('reads them only when that is all she said', () => {
    expect(readGuideCommand('he told me to skip work')).toBeNull();
    expect(readGuideCommand('yes he did')).toBeNull();
    expect(readGuideCommand('')).toBeNull();
  });

  it('in a box, treats only moving words as commands, never a short answer', () => {
    expect(isBoxCommand('skip')).toBe(true);
    expect(isBoxCommand('go back')).toBe(true);
    expect(isBoxCommand('try again')).toBe(true);
    expect(isBoxCommand('stop listening')).toBe(true);
    // Real answers to "Who was there?" or "Proof you have".
    expect(isBoxCommand('none')).toBe(false);
    expect(isBoxCommand('no')).toBe(false);
    expect(isBoxCommand('yes')).toBe(false);
    expect(isBoxCommand('my sister')).toBe(false);
  });

  it.each(['last week', 'two days ago', 'March 3', 'the night before Christmas', 'in the summer', '2025', 'on Friday'])(
    'hears "%s" as a time',
    (phrase) => {
      expect(soundsLikeWhen(phrase)).toBe(true);
    },
  );

  it.each(['he hurt me', 'turn the TV down', 'he told me about it', 'he made me fall', 'I may be wrong'])(
    'does not hear "%s" as a time',
    (phrase) => {
      expect(soundsLikeWhen(phrase)).toBe(false);
    },
  );
});

describe('answers in her own words (no AI)', () => {
  const ORDER = ['Stalking', 'Harassment', 'Domestic or family violence', 'Sexual assault', 'Not sure'];
  const KNOW = [
    'We are or were married',
    'We are dating or used to date',
    'We have a child together',
    'We are or were related by marriage, like a stepparent or in-law',
    "None of these, like a neighbor, coworker, or stranger",
    "Not sure, or I'd rather not say",
  ];
  const ACTS = ['Tried to hurt me', 'Threatened to hurt me', 'Hurt me', 'Made me afraid I would be hurt'];
  const pick = (phrase: string, names: string[]) => {
    const result = pickMentionedChoice(phrase, names);
    if (result.kind === 'one') return names[result.index];
    if (result.kind === 'several') return result.indexes.map((i) => names[i]);
    return null;
  };

  it.each([
    ["I'm seeking for stalking", 'Stalking'],
    ['I have a concern about stalking', 'Stalking'],
    ['he was stalking me', 'Stalking'],
    ['harassing', 'Harassment'],
    ['it is domestic violence', 'Domestic or family violence'],
    ["it's not stalking, it's harassment", 'Harassment'],
    ["I'm not sure", 'Not sure'],
  ])('"%s" picks %s', (phrase, choice) => {
    expect(pick(phrase, ORDER)).toBe(choice);
  });

  it('asks when two fit, and picks nothing from unrelated talk', () => {
    expect(pick("I'm not sure if it's stalking", ORDER)).toEqual(['Stalking', 'Not sure']);
    expect(pick('turn the TV down', ORDER)).toBeNull();
    // "Sure" without a "not" is not "Not sure".
    expect(pick("I'm sure it's harassment", ORDER)).toBe('Harassment');
  });

  it.each([
    ['we used to date', 'We are dating or used to date'],
    ["we're married", 'We are or were married'],
    ['he is a coworker', 'None of these, like a neighbor, coworker, or stranger'],
    ['we have a kid together, a child', 'We have a child together'],
  ])('"%s" picks "%s"', (phrase, choice) => {
    expect(pick(phrase, KNOW)).toBe(choice);
  });

  it('checks only the boxes named in full, and never after a "not"', () => {
    const named = (phrase: string) => namedInFull(phrase, ACTS).map((i) => ACTS[i]);
    expect(named('he hurt me')).toEqual(['Hurt me']);
    expect(named('he threatened to hurt me')).toEqual(['Threatened to hurt me']);
    expect(named('he tried to hurt me and he made me afraid I would be hurt')).toEqual([
      'Tried to hurt me',
      'Made me afraid I would be hurt',
    ]);
    expect(named("he didn't hurt me")).toEqual([]);
    expect(named('he never threatened to hurt me')).toEqual([]);
    expect(named('afraid')).toEqual([]);
    expect(named('he threatened me')).toEqual([]);
  });

  it.each([
    ['yes please', 'yes'],
    ["yeah let's add one", 'yes'],
    ['sure', 'yes'],
    ["no I'm done", 'no'],
    ["I don't want to", 'no'],
    ['not now', 'no'],
    ["that's all", 'no'],
    ['he said yes', null],
  ])('reads "%s" as %s', (phrase, answer) => {
    expect(readYesNoWithin(phrase)).toBe(answer);
  });

  it('hears skip and go back in a sentence', () => {
    expect(readMoveWithin('can we skip this one')).toBe('skip');
    expect(readMoveWithin("let's go back")).toBe('back');
    expect(readMoveWithin("don't skip it")).toBeNull();
    expect(readMoveWithin('he came back')).toBeNull();
  });

  it('keeps only the time from "it happened last week"', () => {
    expect(trimWhen('it happened last week')).toBe('last week');
    expect(trimWhen('I think it was two days ago.')).toBe('two days ago');
    expect(trimWhen('the week before Thanksgiving')).toBe('the week before Thanksgiving');
  });
});

describe('a "not" in a sentence about check boxes', () => {
  const ACTS = ['Threatened to hurt me', 'Hurt me', 'Made me afraid I would be hurt'];
  const named = (phrase: string) => namedInFull(phrase, ACTS).map((i) => ACTS[i]);

  it('reaches to the end of its part of the sentence, but not past "and" or "but"', () => {
    expect(named('he did not ever really hurt me')).toEqual([]);
    expect(named("he didn't threaten me but he hurt me")).toEqual(['Hurt me']);
    expect(named('he never threatened to hurt me and he made me afraid I would be hurt')).toEqual([
      'Made me afraid I would be hurt',
    ]);
  });
});
