// Turns spoken phrases into written text. Pure functions, no browser APIs.
import { DATE_PHRASES } from '../organizer/ManualExtractor';

const SENTENCE_END = /[.!?]["')\]]?$/;

// A date phrase, with a joining word before it if there is one ("and last week").
const CLAUSE_DATE = new RegExp(`\\b(?:(?:and|then|also|but|so|again)\\s+)?(?:${DATE_PHRASES})\\b`, 'gi');

// A date phrase starts a new incident only after this many words of the
// current sentence, so "Okay so in January he..." stays one sentence.
const MIN_WORDS_BEFORE_BREAK = 5;

const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Where the sentence that contains `index` starts. */
function sentenceStart(text: string, index: number): number {
  const lastEnd = text.slice(0, index).search(/[.!?\n][^.!?\n]*$/);
  return lastEnd === -1 ? 0 : lastEnd + 1;
}

/**
 * Speech recognition can return a whole story with no punctuation. The
 * incident splitter starts a new incident at a sentence that begins with a
 * date, so this ends the sentence before a date phrase that comes after
 * several words: "...away from him last week he sent..." becomes
 * "...away from him. Last week he sent...". Only a period and a capital are added.
 */
export function breakAtSpokenDates(text: string): string {
  let result = '';
  let copied = 0;
  let lastBreak = 0;

  for (const match of text.matchAll(CLAUSE_DATE)) {
    const at = match.index;
    const start = Math.max(lastBreak, sentenceStart(text, at));
    if (countWords(text.slice(start, at)) < MIN_WORDS_BEFORE_BREAK) continue;
    // The new sentence starts with a capital letter, like any other.
    result += `${text.slice(copied, at).trimEnd().replace(/[,;:]$/, '')}. ${text[at].toUpperCase()}`;
    copied = at + 1;
    lastBreak = at;
  }

  return result + text.slice(copied);
}

/**
 * Speech recognition often leaves out punctuation. The incident splitter finds
 * sentences by their ending marks, so a spoken phrase without one gets a
 * period. The words themselves are not changed.
 */
export function toSentence(phrase: string): string {
  const text = phrase.trim();
  if (!text) return '';
  return SENTENCE_END.test(text) ? text : `${text}.`;
}

/**
 * Adds a spoken phrase to the end of a text field. What is already there,
 * typed or spoken, is never changed.
 */
export function appendSpoken(existing: string, phrase: string): string {
  const sentence = toSentence(phrase);
  if (!sentence) return existing;
  if (!existing.trim()) return sentence;
  return /\s$/.test(existing) ? `${existing}${sentence}` : `${existing} ${sentence}`;
}

/** Adds spoken words to a one-line field, such as a place, without adding a period. */
export function appendWords(existing: string, phrase: string): string {
  const words = phrase.trim().replace(/[.!?]+$/, '');
  if (!words) return existing;
  return existing.trim() ? `${existing.trimEnd()} ${words}` : words;
}
