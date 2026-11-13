// Desk times are wall-clock times at the court, such as "Monday 8:35 am".
// They are stored as numbers in UTC with no time zone offset, so the demo reads
// the same on every computer and never shifts for daylight saving time.

export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** "2026-11-09T08:35" → a Desk time. */
export function parseDateTime(text: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(text);
  if (!m) throw new Error(`"${text}" must be a date and time like 2026-11-09T08:35.`);
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]);
}

/** "1989-04-17" → a Desk time at midnight, or null if it isn't a real date. */
export function parseDate(text: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!m) return null;
  const time = Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const date = new Date(time);
  return date.getUTCMonth() === +m[2] - 1 && date.getUTCDate() === +m[3] ? time : null;
}

/** "19:30" → minutes after midnight (1170). */
export function parseClockTime(text: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(text);
  if (!m || +m[1] > 24 || +m[2] > 59) throw new Error(`"${text}" must be a time like 19:30.`);
  return +m[1] * 60 + +m[2];
}

export function startOfDay(time: number): number {
  return Math.floor(time / DAY) * DAY;
}

/** 0 is Sunday. */
export function weekdayOf(time: number): number {
  return new Date(time).getUTCDay();
}

export function minuteOfDay(time: number): number {
  return Math.round((time - startOfDay(time)) / MINUTE);
}

export interface Span {
  start: number;
  end: number;
}

/** The parts of two lists of spans that overlap. */
export function overlapSpans(a: Span[], b: Span[]): Span[] {
  const result: Span[] = [];
  for (const x of a) {
    for (const y of b) {
      const start = Math.max(x.start, y.start);
      const end = Math.min(x.end, y.end);
      if (start < end) result.push({ start, end });
    }
  }
  return result.sort((p, q) => p.start - q.start);
}

/** Cuts spans down to the part inside a range. */
export function clipSpans(spans: Span[], range: Span): Span[] {
  return overlapSpans(spans, [range]);
}
