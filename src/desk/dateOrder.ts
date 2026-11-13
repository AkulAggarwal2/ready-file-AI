// Puts incidents in date order for the bench summary. Most dates on a petition
// are rough ("Mid-August", "Last night"), so each one gets a sort date worked
// out from its date phrase and the filing date. The sort date is only for
// ordering. Desk always shows the date as the petitioner wrote it.
import type { CheckDate } from '../checker';
import { DAY, parseDate, startOfDay, weekdayOf } from './time';

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december',
];
const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  'a few': 3, several: 3,
};
const UNIT_DAYS: Record<string, number> = { day: 1, week: 7, month: 30, year: 365 };

// Where in a month a rough date sorts: "early March" before "March" before "late March".
const PART_OF_MONTH: Record<string, number> = { early: 5, beginning: 5, mid: 15, middle: 15, late: 25, end: 25 };
const DEFAULT_DAY = 15;

const MONTH_PHRASE = new RegExp(
  `\\b(?:(early|beginning of|mid|middle of|late|end of)[\\s-]+)?(${MONTHS.join('|')})\\b` +
    `(?:\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b)?(?:,?\\s+(\\d{4})\\b)?`,
  'i',
);

function utcDate(year: number, monthIndex: number, day: number): number {
  return Date.UTC(year, monthIndex, day);
}

/** A month and day with no year: the latest one on or before the filing date. */
function latestOnOrBefore(monthIndex: number, day: number, filedDay: number): number {
  const year = new Date(filedDay).getUTCFullYear();
  const candidate = utcDate(year, monthIndex, day);
  return candidate <= filedDay ? candidate : utcDate(year - 1, monthIndex, day);
}

function fromPhrase(phrase: string, filedAt: number): number | null {
  const text = phrase.toLowerCase().replace(/[‘’]/g, "'").trim();
  const filedDay = startOfDay(filedAt);

  const exact = parseDate(text);
  if (exact !== null) return exact;

  const numeric = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/.exec(text);
  if (numeric) {
    const [month, day] = [+numeric[1] - 1, +numeric[2]];
    if (!numeric[3]) return latestOnOrBefore(month, day, filedDay);
    const year = +numeric[3] < 100 ? 2000 + +numeric[3] : +numeric[3];
    return utcDate(year, month, day);
  }

  const month = MONTH_PHRASE.exec(text);
  if (month) {
    const part = month[1]?.split(/\s/)[0];
    const monthIndex = MONTHS.indexOf(month[2].toLowerCase());
    const day = month[3] ? +month[3] : part ? PART_OF_MONTH[part] : DEFAULT_DAY;
    return month[4] ? utcDate(+month[4], monthIndex, day) : latestOnOrBefore(monthIndex, day, filedDay);
  }

  if (/\b(last night|yesterday)\b/.test(text)) return filedDay - DAY;
  if (/\b(today|tonight|this morning|this afternoon|this evening)\b/.test(text)) return filedDay;

  const ago = new RegExp(`\\b(\\d+|${Object.keys(NUMBER_WORDS).join('|')})\\s+(day|week|month|year)s?\\s+ago\\b`).exec(
    text,
  );
  if (ago) {
    const count = /^\d+$/.test(ago[1]) ? +ago[1] : NUMBER_WORDS[ago[1]];
    return filedDay - count * UNIT_DAYS[ago[2]] * DAY;
  }

  const last = /\blast\s+(week|weekend|month|year)\b/.exec(text);
  if (last) return filedDay - UNIT_DAYS[last[1] === 'weekend' ? 'week' : last[1]] * DAY;

  const weekday = new RegExp(`\\b(last\\s+|this past\\s+)?(${WEEKDAYS.join('|')})\\b`).exec(text);
  if (weekday) {
    // The most recent such day: on or before the filing day, or before it for "last Friday".
    const back = (weekdayOf(filedDay) - WEEKDAYS.indexOf(weekday[2]) + 7) % 7;
    return filedDay - (back === 0 && weekday[1] ? 7 : back) * DAY;
  }

  return null;
}

/** The date an incident sorts by, or null if it has no date Desk can place. */
export function sortDate(date: CheckDate, filedAt: number): number | null {
  if (date.kind === 'exact') return date.value.trim() ? parseDate(date.value.trim()) : null;
  if (date.kind === 'approximate') return date.text.trim() ? fromPhrase(date.text, filedAt) : null;
  return null;
}

/**
 * Oldest first. Incidents with no date Desk can place go last. Ties, and the
 * undated ones, keep the order they were filed in.
 */
export function inDateOrder<T extends { date: CheckDate }>(items: T[], filedAt: number): T[] {
  const keyed = items.map((item, index) => ({ item, index, key: sortDate(item.date, filedAt) }));
  keyed.sort((a, b) => {
    if (a.key === null && b.key === null) return a.index - b.index;
    if (a.key === null) return 1;
    if (b.key === null) return -1;
    return a.key - b.key || a.index - b.index;
  });
  return keyed.map(({ item }) => item);
}
