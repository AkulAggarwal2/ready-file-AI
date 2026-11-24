// Reads what she says while voice control is on, and finds the button, choice,
// or box she named. Pure functions, no browser APIs.
//
// She says the words she sees on the screen. Speech recognition mishears
// some words, more often for some accents, so a name can match with a word
// slightly off or a few words left out. A longer sentence that only contains
// a button's words (like "he hurt me" next to a "Hurt me" box) never matches.

export type VoiceAction = 'press' | 'check' | 'uncheck';

/** One way to read what she said, as the name of something on the page. */
export interface NameAttempt {
  words: string[];
  action: VoiceAction;
}

export type ScrollDirection = 'down' | 'up' | 'top' | 'bottom';

export type VoiceCommand =
  | { kind: 'help' }
  | { kind: 'hideHelp' }
  | { kind: 'stopListening' }
  | { kind: 'scroll'; direction: ScrollDirection }
  | { kind: 'showNumbers' }
  | { kind: 'hideNumbers' }
  | { kind: 'number'; n: number }
  // The name of something on the page, read the ways it could be meant, best first.
  | { kind: 'name'; attempts: NameAttempt[] };

/** Lowercase words without punctuation or accents, so "Next." and "next" read the same. */
export function normalize(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(/['’‘`]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const words = (text: string): string[] => {
  const normalized = normalize(text);
  return normalized ? normalized.split(' ') : [];
};

// Sounds she may make while thinking, which are never part of a name.
const FILLER = new Set(['um', 'umm', 'uh', 'uhh', 'er', 'erm', 'hmm', 'please', 'okay', 'ok']);

// Fixed phrases, matched in full after filler words are dropped.
const PHRASES: [string[], VoiceCommand][] = [
  [['help', 'help me', 'what can i say', 'show help', 'show commands'], { kind: 'help' }],
  [['hide help', 'close help'], { kind: 'hideHelp' }],
  [
    ['stop listening', 'stop voice control', 'turn off voice control', 'turn voice control off', 'stop using voice'],
    { kind: 'stopListening' },
  ],
  [['scroll down', 'page down', 'go down', 'down'], { kind: 'scroll', direction: 'down' }],
  [['scroll up', 'page up', 'go up', 'up'], { kind: 'scroll', direction: 'up' }],
  [['scroll to the top', 'scroll to top', 'go to the top', 'go to top', 'top of the page', 'top'], { kind: 'scroll', direction: 'top' }],
  [
    ['scroll to the bottom', 'scroll to bottom', 'go to the bottom', 'go to bottom', 'bottom of the page', 'bottom'],
    { kind: 'scroll', direction: 'bottom' },
  ],
  [['show numbers', 'show the numbers', 'numbers', 'show number'], { kind: 'showNumbers' }],
  [['hide numbers', 'hide the numbers', 'cancel'], { kind: 'hideNumbers' }],
];

const NUMBER_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50,
};

// Words that sound like a number and are heard in its place, used only while numbers show.
const SOUNDS_LIKE_NUMBER: Record<string, number> = { won: 1, to: 2, too: 2, for: 4, ate: 8 };

/** "7", "seven", "twenty one", or "number 7". Null if it isn't a number. */
export function readNumber(phrase: string, numbersShowing: boolean): number | null {
  let list = words(phrase).filter((word) => !FILLER.has(word));
  if (['number', 'press', 'click', 'choose', 'tap', 'pick'].includes(list[0])) list = list.slice(1);
  if (list[0] === 'number') list = list.slice(1);
  if (list.length === 1 && /^\d{1,3}$/.test(list[0])) return Number(list[0]);
  if (list.length === 1 && numbersShowing && list[0] in SOUNDS_LIKE_NUMBER) return SOUNDS_LIKE_NUMBER[list[0]];
  if (list.length === 0 || list.length > 2 || !list.every((word) => word in NUMBER_WORDS)) return null;
  const [first, second] = list.map((word) => NUMBER_WORDS[word]);
  if (second === undefined) return first;
  // "twenty one", not "one twenty".
  return first >= 20 && first % 10 === 0 && second < 10 ? first + second : null;
}

// Words that say what to do with the thing she names, said before its name.
const PRESS_WORDS = ['click on', 'click', 'press', 'tap on', 'tap', 'push', 'choose', 'pick', 'select', 'open', 'go to', 'go'];
const CHECK_WORDS = ['check', 'tick', 'mark'];
const UNCHECK_WORDS = ['uncheck', 'untick', 'unmark', 'clear'];
// Said after a name, like "Next button".
const AFTER_WORDS = ['button', 'box', 'option', 'link', 'checkbox'];

function startsWith(list: string[], phrase: string): number {
  const lead = phrase.split(' ');
  return lead.every((word, i) => list[i] === word) ? lead.length : 0;
}

/** What she said, as a command or as the name of something on the page. */
export function readVoiceCommand(phrase: string, numbersShowing = false): VoiceCommand | null {
  const list = words(phrase).filter((word) => !FILLER.has(word));
  if (list.length === 0) return null;
  const joined = list.join(' ');

  for (const [phrases, command] of PHRASES) {
    if (phrases.includes(joined)) return command;
  }

  const n = readNumber(phrase, numbersShowing);
  if (n !== null) return { kind: 'number', n };

  // The whole phrase first, in case it is a name that starts with "check" or "open".
  const attempts: NameAttempt[] = [{ words: list, action: 'press' }];
  let rest = list;
  let action: VoiceAction = 'press';
  for (const [lead, leadAction] of [
    ...UNCHECK_WORDS.map((w) => [w, 'uncheck'] as const),
    ...CHECK_WORDS.map((w) => [w, 'check'] as const),
    ...PRESS_WORDS.map((w) => [w, 'press'] as const),
  ]) {
    const length = startsWith(rest, lead);
    if (length) {
      rest = rest.slice(length);
      action = leadAction;
      break;
    }
  }
  if (rest[0] === 'the') rest = rest.slice(1);
  if (rest.length > 1 && AFTER_WORDS.includes(rest[rest.length - 1])) rest = rest.slice(0, -1);
  if (rest.length > 0 && (rest.length !== list.length || action !== 'press')) attempts.push({ words: rest, action });
  return { kind: 'name', attempts };
}

// Small words that don't tell two names apart. A name is matched by its other words.
const SMALL_WORDS = new Set([
  'a', 'an', 'the', 'i', 'me', 'my', 'to', 'of', 'and', 'or', 'it', 'is', 'was', 'be', 'you', 'your',
  'this', 'that', 'in', 'on', 'at', 'for', 'with', 'did', 'do', 'does', 'how', 'what', 'who', 'when',
  'where', 'why', 'so', 'if', 'am', 'are', 'were', 'have', 'has', 'had', 'by', 'from', 'as', 'can',
  'could', 'would', 'will', 'about', 'we', 'us', 'our', 'they', 'them', 'not',
]);

function stem(word: string): string {
  if (word.length > 4 && word.endsWith('ing')) return word.slice(0, -3);
  if (word.length > 3 && word.endsWith('ed')) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/** True if the two strings are at most one letter apart (added, dropped, or changed). */
function oneLetterApart(a: string, b: string): boolean {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i++;
      j++;
      continue;
    }
    if (++edits > 1) return false;
    if (a.length > b.length) i++;
    else if (b.length > a.length) j++;
    else {
      i++;
      j++;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
}

/** The same word, allowing for an ending ("hurts") or one letter misheard in a longer word. */
export function sameWord(said: string, name: string): boolean {
  if (said === name || stem(said) === stem(name)) return true;
  return Math.min(said.length, name.length) >= 5 && oneLetterApart(said, name);
}

/** Something on the page she could mean, by every name it goes by. */
export interface Candidate {
  names: string[];
  // Only the whole name, said exactly, presses it (Quick exit).
  exactOnly?: boolean;
  // Added to its score, for the choices in the list she just moved to.
  boost?: number;
  // How much of a name she must say for part of it to count. Defaults to half
  // of the words that tell it apart. Lower for the choices in the list she is in.
  minCoverage?: number;
}

/** How well what she said matches one name: 0 for no match, higher for closer. */
export function scoreName(said: string[], name: string, minCoverage = 0.5): number {
  const nameWords = words(name);
  if (nameWords.length === 0 || said.length === 0) return 0;
  if (said.join(' ') === nameWords.join(' ')) return 3;
  if (said.length === nameWords.length && said.every((word, i) => sameWord(word, nameWords[i]))) return 2;

  // Some of the name: every word she said is in it, in any order, and she
  // said at least half of the words that tell it apart.
  if (!said.every((word) => nameWords.some((nameWord) => sameWord(word, nameWord)))) return 0;
  const telling = nameWords.filter((word) => !SMALL_WORDS.has(word));
  if (telling.length === 0) return 0;
  const covered = telling.filter((nameWord) => said.some((word) => sameWord(word, nameWord))).length;
  const coverage = covered / telling.length;
  return covered > 0 && coverage >= minCoverage ? coverage : 0;
}

export type Match =
  | { kind: 'found'; index: number; action: VoiceAction }
  // Several match equally well. The indexes, in page order.
  | { kind: 'several'; indexes: number[]; action: VoiceAction }
  | { kind: 'none' };

/** The candidate she named. Each way of reading what she said is tried in turn. */
export function matchName(attempts: NameAttempt[], candidates: Candidate[]): Match {
  for (const { words: said, action } of attempts) {
    let best = 0;
    let indexes: number[] = [];
    candidates.forEach((candidate, index) => {
      const raw = Math.max(
        0,
        ...candidate.names.map((name) => {
          const score = scoreName(said, name, candidate.minCoverage);
          return candidate.exactOnly && score < 3 ? 0 : score;
        }),
      );
      if (raw === 0) return;
      const score = raw + (candidate.boost ?? 0);
      if (score > best + 1e-9) {
        best = score;
        indexes = [index];
      } else if (Math.abs(score - best) <= 1e-9) {
        indexes.push(index);
      }
    });
    if (indexes.length === 1) return { kind: 'found', index: indexes[0], action };
    if (indexes.length > 1) return { kind: 'several', indexes, action };
  }
  return { kind: 'none' };
}

export type GuideCommand = 'skip' | 'back' | 'repeat' | 'done' | 'yes' | 'no';

// Words for moving between questions in guided mode, matched in full.
const GUIDE_PHRASES: [string[], GuideCommand][] = [
  [['skip', 'skip it', 'skip this', 'skip this one', 'skip question', 'skip this question', 'next question', 'pass'], 'skip'],
  [['back', 'go back', 'previous', 'previous question', 'last question', 'question before', 'the question before'], 'back'],
  [['repeat', 'again', 'try again', 'say again', 'say that again', 'repeat that', 'repeat the question', 'what was the question'], 'repeat'],
  [['done', 'im done', 'i am done', 'finished', 'im finished', 'thats all', 'that is all', 'thats it', 'none', 'none of these', 'no more', 'nothing else', 'next'], 'done'],
  [['yes', 'yeah', 'yep', 'yes please', 'sure', 'ok', 'okay'], 'yes'],
  [['no', 'nope', 'no thanks', 'no thank you', 'not now'], 'no'],
];

/** A word for moving between questions, if that is all she said. */
export function readGuideCommand(phrase: string): GuideCommand | null {
  const joined = words(phrase).join(' ');
  if (!joined) return null;
  for (const [phrases, command] of GUIDE_PHRASES) {
    if (phrases.includes(joined)) return command;
  }
  return null;
}

/**
 * Whether a phrase said into a box is only a command, not an answer. Only
 * "skip", "go back", "try again", and "stop listening": a one-word answer
 * like "none" or "no" is a real answer in a box.
 */
export function isBoxCommand(phrase: string): boolean {
  const command = readGuideCommand(phrase);
  if (command === 'skip' || command === 'back' || command === 'repeat') return true;
  return readVoiceCommand(phrase)?.kind === 'stopListening';
}

// Words that say when something happened.
const TIME_WORDS =
  /\b(\d+|today|yesterday|tonight|ago|recently|day|days|week|weeks|weekend|month|months|year|years|morning|afternoon|evening|night|nights|monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|march|april|june|july|august|september|october|november|december|spring|summer|autumn|winter|christmas|thanksgiving|easter|halloween|holiday|holidays|birthday)\b/;

/**
 * Whether a phrase sounds like a time, like "last week" or "the night before
 * Christmas". Other talk (someone else in the room) never goes into the
 * "about when" box.
 */
export function soundsLikeWhen(phrase: string): boolean {
  return TIME_WORDS.test(normalize(phrase));
}

// ---------------------------------------------------------------------------
// Answers said in a sentence, in guided mode: "I'm here about stalking",
// "it's not stalking, it's harassment", "yeah, let's add one".

const NEGATIONS = new Set([
  'not', 'no', 'never', 'dont', 'didnt', 'doesnt', 'isnt', 'wasnt', 'arent', 'werent', 'cant', 'wont', 'nobody', 'nothing',
]);

// Words that say little about which choice she means, on top of SMALL_WORDS.
const VAGUE_WORDS = new Set(['like', 'these', 'one', 'or', 'some', 'something', 'thing', 'things', 'just', 'really', 'very']);

/** Same word, also allowing a shared start ("harass" and "harassment"). For picking among a few choices. */
function looselySameWord(said: string, name: string): boolean {
  return sameWord(said, name) || (Math.min(said.length, name.length) >= 5 && said.slice(0, 5) === name.slice(0, 5));
}

/** True if a "not" (or the like) comes just before this word. */
function negatedAt(list: string[], index: number): boolean {
  return NEGATIONS.has(list[index - 1]) || NEGATIONS.has(list[index - 2]);
}

export type ChoicePick =
  | { kind: 'one'; index: number }
  // More than one choice fits about as well: ask which one she means.
  | { kind: 'several'; indexes: number[] }
  | { kind: 'none' };

/**
 * The choice a sentence mentions, for picking one from a list: "I'm seeking
 * stalking" is "Stalking". A choice counts by its telling words, so "domestic
 * violence" is "Domestic or family violence". A word after "not" doesn't
 * count, unless the choice says "not" too ("I'm not sure" is "Not sure").
 */
export function pickMentionedChoice(phrase: string, names: string[]): ChoicePick {
  const said = words(phrase).filter((word) => !FILLER.has(word));
  if (said.length === 0) return { kind: 'none' };

  const scored = names.map((name, index) => {
    const nameWords = words(name);
    const telling = nameWords
      .map((word, at) => ({ word, negated: negatedAt(nameWords, at) }))
      .filter(({ word }) => !SMALL_WORDS.has(word) && !VAGUE_WORDS.has(word) && !NEGATIONS.has(word));
    const matched = telling.filter(({ word, negated }) =>
      said.some((saidWord, at) => looselySameWord(saidWord, word) && negatedAt(said, at) === negated),
    ).length;
    return { index, matched, coverage: telling.length ? matched / telling.length : 0 };
  });

  const found = scored.filter((choice) => choice.matched > 0).sort((a, b) => b.coverage - a.coverage);
  if (found.length === 0) return { kind: 'none' };
  if (found.length === 1) return { kind: 'one', index: found[0].index };
  const [best, next] = found;
  if (best.coverage >= 0.5 && best.coverage - next.coverage >= 0.15) return { kind: 'one', index: best.index };
  return { kind: 'several', indexes: found.slice(0, 3).map((choice) => choice.index) };
}

/**
 * The check boxes a sentence names in full, for "What did the person do?":
 * "he threatened to hurt me" is only "Threatened to hurt me", not also "Hurt
 * me", and "he didn't hurt me" is none. Stricter than picking from a list,
 * since a wrong check mark on a sworn form is serious.
 */
export function namedInFull(phrase: string, names: string[]): number[] {
  const said = words(phrase).filter((word) => !FILLER.has(word));
  const spans: { index: number; start: number; end: number; negated: boolean }[] = [];
  names.forEach((name, index) => {
    const nameWords = words(name);
    if (nameWords.length === 0) return;
    for (let start = 0; start + nameWords.length <= said.length; start++) {
      if (nameWords.every((word, i) => sameWord(said[start + i], word))) {
        spans.push({ index, start, end: start + nameWords.length, negated: negatedInClause(said, start) });
        break;
      }
    }
  });
  // A name inside a longer one she said ("hurt me" in "threatened to hurt
  // me") is part of that one, even when that one has a "not".
  return spans
    .filter(
      (span) =>
        !spans.some(
          (other) => other !== span && other.start <= span.start && other.end >= span.end && other.end - other.start > span.end - span.start,
        ),
    )
    .filter((span) => !span.negated)
    .map((span) => span.index);
}

// Words that start a new part of a sentence, so a "not" before them doesn't reach past.
const CLAUSE_BREAKS = new Set(['and', 'but', 'then', 'so', 'because', 'also', 'after', 'before', 'when']);

/** True if a "not" comes earlier in the same part of the sentence. */
function negatedInClause(list: string[], index: number): boolean {
  for (let i = index - 1; i >= 0; i--) {
    if (CLAUSE_BREAKS.has(list[i])) return false;
    if (NEGATIONS.has(list[i])) return true;
  }
  return false;
}

const YES_STARTS = ['yes', 'yeah', 'yep', 'yup', 'sure', 'of course', 'i do', 'i would', 'lets', 'please do', 'go ahead'];
const NO_STARTS = ['no', 'nope', 'not now', 'not yet', 'i dont', 'i do not', 'im done', 'that is all', 'thats all', 'nothing else'];

/** Yes or no at the start of a sentence: "yeah, let's add one", "no, I'm done". */
export function readYesNoWithin(phrase: string): 'yes' | 'no' | null {
  const joined = words(phrase).filter((word) => !FILLER.has(word)).join(' ');
  if (!joined) return null;
  const startsWith = (lead: string) => joined === lead || joined.startsWith(`${lead} `);
  // "No" first: "I don't" starts with "I do".
  if (NO_STARTS.some(startsWith)) return 'no';
  if (YES_STARTS.some(startsWith)) return 'yes';
  return null;
}

/** "Can we skip this one?" or "go back to the last one", said in a sentence. Never in a box. */
export function readMoveWithin(phrase: string): 'skip' | 'back' | null {
  const joined = ` ${words(phrase).join(' ')} `;
  if (/ (skip|pass on) /.test(joined) && !/ (dont|do not|not) skip /.test(joined)) return 'skip';
  if (/ (go back|previous question|last question|question before) /.test(joined)) return 'back';
  return null;
}

// Words that often come before a time but aren't part of it.
const WHEN_LEAD_INS = /^(?:(?:i think|i believe|maybe|probably|so|well)\s+)*(?:it|this|that)\s+(?:happened|was)\s+/i;

/** "It happened last week" is "last week", for the "about when" box. */
export function trimWhen(text: string): string {
  return text.trim().replace(WHEN_LEAD_INS, '').replace(/[.!?]+$/, '');
}
