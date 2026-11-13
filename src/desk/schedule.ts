// When the counter is open, when the petitioner can take calls, and how those
// line up. Used by the timeline strip and the sentence under it.
import { deskConfig } from './config';
import { deskCopy, fill } from './content';
import { formatClock, formatMinutesRange } from './format';
import type { CallTimes, Contact } from './petitions';
import { DAY, HOUR, MINUTE, clipSpans, overlapSpans, startOfDay, weekdayOf, type Span } from './time';

/**
 * The timeline runs from when the counter opens on the current day, for
 * timelineHours (25 hours: 8 am to 9 am the next day).
 */
export function timelineRange(now: number): Span {
  let start = startOfDay(now) + deskConfig.counter.open * MINUTE;
  if (now < start) start -= DAY;
  return { start, end: start + deskConfig.timelineHours * HOUR };
}

/** Daily windows (minutes after midnight) on the given weekdays, inside a range. */
function dailyWindows(range: Span, days: number[], from: number, to: number): Span[] {
  const spans: Span[] = [];
  // Start a day early so a window that crosses midnight is included.
  for (let day = startOfDay(range.start) - DAY; day < range.end; day += DAY) {
    if (!days.includes(weekdayOf(day))) continue;
    const start = day + from * MINUTE;
    const end = day + (to > from ? to : to + 24 * 60) * MINUTE;
    spans.push({ start, end });
  }
  return clipSpans(spans, range);
}

export function counterWindows(range: Span): Span[] {
  const { open, close, days } = deskConfig.counter;
  return dailyWindows(range, days, open, close);
}

export function callWindows(calls: CallTimes | null, range: Span): Span[] {
  if (!calls) return [];
  if (calls.anyTime) return [range];
  return dailyWindows(range, deskConfig.callDays[calls.days] ?? [], calls.from, calls.to);
}

/** Is this moment inside the call times given? With no call times, it isn't. */
export function insideCallTimes(calls: CallTimes | null, time: number): boolean {
  return callWindows(calls, { start: time - DAY, end: time + DAY }).some((s) => s.start <= time && time < s.end);
}

/** The sentence under the timeline. */
export function overlapSentence(contact: Contact, now: number): string {
  const s = deskCopy.petition.timeline.sentence;
  if (!contact.calls) return s.noCallTimes;
  const range = timelineRange(now);
  const [first] = overlapSpans(callWindows(contact.calls, range), counterWindows(range));
  if (first) return fill(s.overlap, { start: formatClock(first.start), end: formatClock(first.end) });
  return contact.textsOk ? s.noOverlapTexts : s.noOverlapNoTexts;
}

/** "Texts OK. Calls weeknights, 7:30 to 10 pm." */
export function contactSummary(contact: Contact): string {
  const c = deskCopy.contact;
  return [contact.textsOk ? c.textsOk : c.textsNotOk, callsSentence(contact.calls)].join(' ');
}

function callsSentence(calls: CallTimes | null): string {
  const c = deskCopy.contact;
  if (!calls) return c.callsNone;
  if (calls.anyTime) return c.callsAnyTime;
  return fill(c.callsWindow, { days: callDaysLabel(calls.days), range: formatMinutesRange(calls.from, calls.to) });
}

export function callDaysLabel(days: string): string {
  return (deskCopy.contact.callDays as Record<string, string>)[days] ?? days;
}
