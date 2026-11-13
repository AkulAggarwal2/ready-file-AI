// Turns Desk times into words, using the names in desk-copy.json.
import { deskCopy, fill } from './content';
import { minuteOfDay, parseDate, weekdayOf } from './time';

const t = deskCopy.time;

function clockParts(minutes: number) {
  const hour24 = Math.floor(minutes / 60) % 24;
  const minute = minutes % 60;
  return {
    hour: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute: String(minute).padStart(2, '0'),
    onTheHour: minute === 0,
    period: hour24 < 12 ? t.am : t.pm,
  };
}

/** Minutes after midnight → "8:35 am" or "4 pm". */
export function formatMinutes(minutes: number): string {
  const { hour, minute, period, onTheHour } = clockParts(minutes);
  return fill(onTheHour ? t.clockOnTheHour : t.clock, { hour, minute, period });
}

/** Without am or pm: "7:30" or "10". */
function formatMinutesBare(minutes: number): string {
  const p = clockParts(minutes);
  return p.onTheHour ? String(p.hour) : `${p.hour}:${p.minute}`;
}

/** "7:30 to 10 pm", or "8 am to 4 pm" when the periods differ. */
export function formatMinutesRange(start: number, end: number): string {
  const same = clockParts(start).period === clockParts(end).period;
  return fill(t.range, { start: same ? formatMinutesBare(start) : formatMinutes(start), end: formatMinutes(end) });
}

/** A Desk time → "8:35 am". */
export function formatClock(time: number): string {
  return formatMinutes(minuteOfDay(time));
}

export function weekdayName(time: number): string {
  return t.weekdays[weekdayOf(time)];
}

export function weekdayShort(time: number): string {
  return t.weekdaysShort[weekdayOf(time)];
}

/** "Mon 8:35 am" */
export function formatShort(time: number): string {
  return fill(t.short, { weekday: weekdayShort(time), time: formatClock(time) });
}

/** "Monday at 8:35 am" */
export function formatAt(time: number): string {
  return fill(t.at, { weekday: weekdayName(time), time: formatClock(time) });
}

/** "Sunday, November 8 at 11:52 pm" */
export function formatLong(time: number): string {
  const date = new Date(time);
  return fill(t.long, {
    weekday: weekdayName(time),
    month: t.months[date.getUTCMonth()],
    day: date.getUTCDate(),
    time: formatClock(time),
  });
}

/** Hour labels on the timeline: "8 am", "Noon", "Midnight". */
export function hourLabel(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  if (h === 0) return t.midnight;
  if (h === 12) return t.noon;
  return formatMinutes(h * 60);
}

/** "1989-04-17" → "April 17, 1989". Anything else is shown as written. */
export function formatBirthDate(text: string): string {
  const time = parseDate(text);
  if (time === null) return text;
  const date = new Date(time);
  return fill(t.birthDate, { month: t.months[date.getUTCMonth()], day: date.getUTCDate(), year: date.getUTCFullYear() });
}
