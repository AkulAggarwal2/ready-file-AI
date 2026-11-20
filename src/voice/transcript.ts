// Turns spoken phrases into written text. Pure functions, no browser APIs.

const SENTENCE_END = /[.!?]["')\]]?$/;

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
