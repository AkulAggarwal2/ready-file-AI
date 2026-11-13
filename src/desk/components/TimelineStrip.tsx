// The 25-hour strip beside the hold text: counter hours, call times, texts,
// and the hold, with a "Now" line. The drawing is hidden from screen readers;
// a text alternative right after it states the same times.
import { deskConfig } from '../config';
import { deskCopy, fill } from '../content';
import { formatClock, formatMinutesRange, formatShort, hourLabel, weekdayShort } from '../format';
import type { Petition } from '../petitions';
import { callWindows, counterWindows, timelineRange } from '../schedule';
import { canHold, type PetitionRecord } from '../state/deskState';
import { HOUR, clipSpans, minuteOfDay, startOfDay, type Span } from '../time';
import { cls } from './common';

const tl = deskCopy.petition.timeline;
const alt = tl.alternative;

interface Bar extends Span {
  kind: 'counter' | 'calls' | 'texts' | 'hold' | 'preview';
  label?: string;
}

interface Lane {
  key: 'counter' | 'calls' | 'texts' | 'hold';
  label: string;
  bars: Bar[];
  // Shown in the empty track when there are no bars.
  empty?: string;
}

/** "Mon 8 am to 4 pm", or "Mon 8:37 am to Tue 8:37 am" across days. */
function spanText(span: Span): string {
  if (startOfDay(span.start) === startOfDay(span.end - 1)) {
    const end = minuteOfDay(span.end) === 0 ? 24 * 60 : minuteOfDay(span.end);
    return fill(deskCopy.time.short, {
      weekday: weekdayShort(span.start),
      time: formatMinutesRange(minuteOfDay(span.start), end),
    });
  }
  return fill(deskCopy.time.range, { start: formatShort(span.start), end: formatShort(span.end) });
}

function spansText(spans: Span[]): string {
  return spans.length > 0 ? spans.map(spanText).join(alt.join) : alt.none;
}

export function TimelineStrip({ petition, record, now }: { petition: Petition; record: PetitionRecord; now: number }) {
  const range = timelineRange(now);
  const pct = (time: number) => ((time - range.start) / (range.end - range.start)) * 100;
  const { contact } = petition;
  const holdEnd = now + deskConfig.holdHours * HOUR;

  const counter = counterWindows(range);
  const calls = callWindows(contact.calls, range);
  const holdBars: Bar[] = [
    ...record.pastHolds.flatMap((hold) =>
      clipSpans([hold], range).map((span): Bar => ({
        ...span,
        kind: 'hold',
        label: fill(tl.holdEnded, { time: formatShort(hold.end) }),
      })),
    ),
    ...(record.hold
      ? clipSpans([record.hold], range).map((span): Bar => ({
          ...span,
          kind: 'hold',
          label: fill(tl.held, { time: formatShort(record.hold!.end) }),
        }))
      : []),
  ];
  const preview = !record.hold && canHold(petition, record) ? clipSpans([{ start: now, end: holdEnd }], range) : [];

  const lanes: Lane[] = [
    {
      key: 'counter',
      label: tl.lanes.counter,
      bars: counter.map((s) => ({ ...s, kind: 'counter', label: formatMinutesRange(minuteOfDay(s.start), minuteOfDay(s.end)) })),
    },
    {
      key: 'calls',
      label: tl.lanes.calls,
      bars: calls.map((s) => ({
        ...s,
        kind: 'calls',
        label: contact.calls?.anyTime ? undefined : formatMinutesRange(minuteOfDay(s.start), minuteOfDay(s.end) || 24 * 60),
      })),
      empty: contact.calls ? undefined : tl.callsNone,
    },
    {
      key: 'texts',
      label: tl.lanes.texts,
      bars: contact.textsOk ? [{ ...range, kind: 'texts', label: tl.textsOk }] : [],
      empty: tl.textsNotOk,
    },
    {
      key: 'hold',
      label: tl.lanes.hold,
      bars: [
        ...holdBars,
        ...preview.map((s): Bar => ({ ...s, kind: 'preview', label: fill(tl.holdPreview, { time: formatShort(holdEnd) }) })),
      ],
      empty: tl.notHeld,
    },
  ];

  const startHour = deskConfig.counter.open / 60;
  const ticks = Array.from({ length: Math.floor(deskConfig.timelineHours / 4) + 1 }, (_, i) => i * 4);
  const nowAt = pct(now);

  // The text alternative.
  const holdAlt = record.hold
    ? fill(alt.hold, { times: spanText(record.hold) })
    : preview.length > 0
      ? fill(alt.holdPreview, { time: formatShort(holdEnd) })
      : holdBars.length > 0
        ? fill(alt.hold, { times: spansText(holdBars) })
        : alt.notHeld;

  return (
    <div className="timeline-wrap">
      <div className="timeline" aria-hidden="true">
        <div className="timeline-labels">
          {lanes.map((lane) => (
            <div key={lane.key} className="timeline-label">
              {lane.label}
            </div>
          ))}
        </div>
        <div className="timeline-body">
          <div className="timeline-now-label tnum" data-edge={nowAt > 80 ? 'end' : nowAt < 12 ? 'start' : undefined} style={{ left: `${nowAt}%` }}>
            {fill(tl.now, { time: formatClock(now) })}
          </div>
          {lanes.map((lane) => {
            // Only the widest bar in a lane gets a label, inside it when it fits.
            const widest = lane.bars.reduce<Bar | null>((w, b) => (!w || b.end - b.start > w.end - w.start ? b : w), null);
            return (
              <div key={lane.key} className={cls('timeline-track', `track-${lane.key}`)}>
                {lane.bars.map((bar, i) => {
                  const left = pct(bar.start);
                  const width = pct(bar.end) - left;
                  const showLabel = bar === widest && bar.label;
                  const inside = width >= 24;
                  return (
                    <div key={i}>
                      <div className={cls('bar', `bar-${bar.kind}`)} style={{ left: `${left}%`, width: `${width}%` }}>
                        {showLabel && inside && <span className="bar-label tnum">{bar.label}</span>}
                      </div>
                      {showLabel && !inside && (
                        <span
                          className="bar-label bar-label-outside tnum"
                          style={left + width < 70 ? { left: `calc(${left + width}% + 6px)` } : { right: `calc(${100 - left}% + 6px)` }}
                        >
                          {bar.label}
                        </span>
                      )}
                    </div>
                  );
                })}
                {lane.bars.length === 0 && lane.empty && <span className="track-empty">{lane.empty}</span>}
              </div>
            );
          })}
          <div className="timeline-axis">
            {ticks.map((h, i) => (
              <span
                key={h}
                className={cls('tick', i % 2 === 1 && 'tick-minor', i === 0 && 'tick-first')}
                style={{ left: `${pct(range.start + h * HOUR)}%` }}
              >
                {hourLabel(startHour + h)}
              </span>
            ))}
          </div>
          <div className="timeline-now" style={{ left: `${nowAt}%` }} />
        </div>
      </div>

      <div className="sr-only">
        <p>{alt.heading}</p>
        <ul>
          <li>{fill(alt.range, { start: formatShort(range.start), end: formatShort(range.end) })}</li>
          <li>{fill(alt.counter, { times: spansText(counter) })}</li>
          <li>{contact.calls ? fill(alt.calls, { times: spansText(calls) }) : alt.callsNone}</li>
          <li>{contact.textsOk ? alt.textsOk : alt.textsNotOk}</li>
          <li>{holdAlt}</li>
          <li>{fill(alt.now, { time: formatShort(now) })}</li>
        </ul>
      </div>
    </div>
  );
}
