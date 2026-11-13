// The hold timeline strip on the petition screen. Pure functions, so the
// times it shows can be tested without a screen.
import { deskConfig, deskCopy, plural, type TimeWindow } from './content';
import { hasPhone, holdEndFrom, nextActionTime, wasHeld, type Petition } from './model';
import { HOUR, addDays, atClock, formatClock, formatShort, formatTime, startOfDay } from './time';

export interface Span {
  start: number;
  end: number;
}

export interface Strip {
  start: number;
  end: number;
  counter: Span[];
  calls: Span[] | null;
  texts: boolean;
  hold: Span | null;
  // Before any hold: the hold that would start now.
  ifHeld: Span | null;
  now: number;
  ticks: number[];
  sentence: string;
  alt: string;
}

/** Each day's window between `start` and `end`, clipped to them. */
function windowSpans(windows: TimeWindow[], start: number, end: number): Span[] {
  const spans: Span[] = [];
  for (let dayStart = startOfDay(addDays(start, -1)); dayStart < end; dayStart = addDays(dayStart, 1)) {
    const weekday = new Date(dayStart).getDay();
    for (const w of windows) {
      if (!w.days.includes(weekday)) continue;
      const from = Math.max(atClock(dayStart, w.start), start);
      const to = Math.min(w.end === '24:00' ? addDays(dayStart, 1) : atClock(dayStart, w.end), end);
      if (from < to) spans.push({ start: from, end: to });
    }
  }
  // Joins spans that touch, such as "any time" across midnight.
  spans.sort((a, b) => a.start - b.start);
  return spans.reduce<Span[]>((joined, span) => {
    const last = joined[joined.length - 1];
    if (last && span.start <= last.end) last.end = Math.max(last.end, span.end);
    else joined.push({ ...span });
    return joined;
  }, []);
}

const counterWindows = (): TimeWindow[] => [
  { days: deskConfig.counter.days, start: deskConfig.counter.opens, end: deskConfig.counter.closes },
];

/** The latest counter opening at or before `time` (any day of the week). */
function openingAtOrBefore(time: number): number {
  const today = atClock(time, deskConfig.counter.opens);
  return today <= time ? today : addDays(today, -1);
}

function overlap(a: Span[], b: Span[]): Span | null {
  for (const x of a) {
    for (const y of b) {
      const start = Math.max(x.start, y.start);
      const end = Math.min(x.end, y.end);
      if (start < end) return { start, end };
    }
  }
  return null;
}

export function buildStrip(p: Petition, now: number): Strip {
  const t = deskCopy.timeline;
  const hold = p.followUp.hold;
  const start = openingAtOrBefore(hold ? hold.start : now);
  const rawEnd = Math.max(start + 25 * HOUR, hold?.end ?? 0, now);
  const end = Math.ceil((rawEnd - start) / HOUR) * HOUR + start;

  const counter = windowSpans(counterWindows(), start, end);
  const callWindows = p.sample.contact.calls?.windows;
  const calls = hasPhone(p) && callWindows ? windowSpans(callWindows, start, end) : null;
  const texts = hasPhone(p) && p.sample.contact.texts;
  const holdSpan = hold ? { start: hold.start, end: hold.endedAt ?? hold.end } : null;
  const ifHeld =
    !wasHeld(p) && hasPhone(p) ? { start: nextActionTime(now), end: holdEndFrom(nextActionTime(now)) } : null;

  const ticks: number[] = [];
  for (let tick = start; tick <= end; tick += 4 * HOUR) ticks.push(tick);

  let sentence: string;
  if (!calls) sentence = t.sentences.noCallTimes;
  else {
    const both = overlap(calls, counter);
    if (both) sentence = plural(t.sentences.overlap, { start: formatTime(both.start), end: formatTime(both.end) });
    else sentence = texts ? t.sentences.noOverlapTexts : t.sentences.noOverlapNoTexts;
  }

  const ranges = (spans: Span[]) =>
    spans.map((s) => plural(t.alt.span, { start: formatShort(s.start), end: formatShort(s.end) })).join(t.alt.join);
  const alt = [
    plural(t.alt.range, { start: formatShort(start), end: formatShort(end) }),
    plural(t.alt.counter, { ranges: ranges(counter) }),
    calls && calls.length > 0 ? plural(t.alt.calls, { ranges: ranges(calls) }) : t.alt.callsNone,
    plural(t.alt.texts, { texts: texts ? t.textsOk : t.textsNotOk }),
    holdSpan && plural(t.alt.hold, { start: formatShort(holdSpan.start), end: formatShort(holdSpan.end) }),
    ifHeld && plural(t.alt.ifHeld, { time: formatShort(ifHeld.end) }),
    plural(t.alt.now, { time: formatShort(now) }),
  ]
    .filter(Boolean)
    .join(' ');

  return { start, end, counter, calls, texts, hold: holdSpan, ifHeld, now, ticks, sentence, alt };
}

export const tickLabel = (time: number) => formatClock(time);
