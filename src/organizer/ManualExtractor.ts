import { createIncident, type Incident, type IncidentDate } from './incident';
import type { IncidentExtractor } from './IncidentExtractor';

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const MONTHS = MONTH_NAMES.join('|');
const WEEKDAYS = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';
const UNITS = 'days?|weeks?|months?|years?';
const NUMBER_WORDS = 'a|an|one|two|three|four|five|six|seven|eight|nine|ten|a few|several|\\d+';

// Date phrases, most specific first. A bare month needs a word like "in" or a
// day number after it, so "he may come back" is not read as a date.
const DATE_PHRASES = [
  `(?:${MONTHS})\\s+\\d{1,2}(?:st|nd|rd|th)?(?:,?\\s+\\d{4})?`,
  `(?:in|on|during|around|by|since|early|mid|late)\\s+(?:early\\s+|mid\\s+|late\\s+)?(?:${MONTHS})(?:\\s+\\d{1,2}(?:st|nd|rd|th)?)?(?:,?\\s+\\d{4})?`,
  `\\d{1,2}/\\d{1,2}/\\d{2,4}`,
  `\\d{4}-\\d{2}-\\d{2}`,
  `(?:last|this past|on)\\s+(?:week|weekend|month|year|night|${WEEKDAYS})`,
  `(?:${NUMBER_WORDS})\\s+(?:${UNITS})\\s+(?:ago|later)`,
  `the\\s+(?:next|following)\\s+(?:day|week|month|morning|night|${WEEKDAYS})`,
  `yesterday|today|tonight`,
].join('|');

const FIND_DATE = new RegExp(`\\b(?:${DATE_PHRASES})\\b`, 'i');
const STARTS_WITH_DATE = new RegExp(
  `^(?:(?:and|then|also|but|so|again)\\s*,?\\s+)?(?:${DATE_PHRASES})\\b`,
  'i',
);
const LEADING_WORD = /^(?:in|on|during|around|by|since)\s+/i;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function toIsoDate(year: number, month: number, day: number): string | null {
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** Reads an exact date when the phrase has a full year; otherwise null. */
function parseExactDate(phrase: string): string | null {
  let m = phrase.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) return toIsoDate(+m[1], +m[2], +m[3]);

  m = phrase.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return toIsoDate(+m[3], +m[1], +m[2]);

  m = phrase.match(new RegExp(`^(${MONTHS})\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})$`, 'i'));
  if (m) return toIsoDate(+m[3], MONTH_NAMES.indexOf(m[1].toLowerCase()) + 1, +m[2]);

  return null;
}

export function findDate(text: string): IncidentDate {
  const match = text.match(FIND_DATE);
  if (!match) return { kind: 'unknown' };

  const phrase = match[0].replace(LEADING_WORD, '');
  const exact = parseExactDate(phrase);
  return exact ? { kind: 'exact', value: exact } : { kind: 'approximate', text: phrase };
}

function splitSentences(paragraph: string): string[] {
  return paragraph.split(/(?<=[.!?])\s+/).filter((s) => s.trim() !== '');
}

/**
 * Splits a story into chunks: one per paragraph, and a new chunk inside a
 * paragraph whenever a sentence starts with a date phrase ("Last week...").
 */
export function splitStory(story: string): string[] {
  const chunks: string[] = [];

  for (const paragraph of story.split(/\n\s*\n/)) {
    let current: string[] = [];
    for (const sentence of splitSentences(paragraph.trim())) {
      if (current.length > 0 && STARTS_WITH_DATE.test(sentence)) {
        chunks.push(current.join(' '));
        current = [];
      }
      current.push(sentence);
    }
    if (current.length > 0) chunks.push(current.join(' '));
  }

  return chunks;
}

/** Default splitter: simple rules, no AI, nothing leaves the device. */
export class ManualExtractor implements IncidentExtractor {
  readonly name = 'manual';

  async extract(story: string): Promise<Incident[]> {
    return splitStory(story).map((description) =>
      createIncident({ description, date: findDate(description) }),
    );
  }
}
