// The demo clock and how Desk writes times. Times are milliseconds, read and
// written in local time so "11:52 pm" in a content file means 11:52 pm.
import { deskCopy } from './content';

const t = deskCopy.time;
export const MINUTE = 60 * 1000;
export const HOUR = 60 * MINUTE;

/** Reads "2026-11-09T08:35" as a local time. */
export function parseTime(value: string): number {
  const [date, clock = '00:00'] = value.split('T');
  const [year, month, day] = date.split('-').map(Number);
  const [hour, minute] = clock.split(':').map(Number);
  return new Date(year, month - 1, day, hour, minute).getTime();
}

/** The same day at "HH:MM". "24:00" is midnight at the end of the day. */
export function atClock(time: number, clock: string): number {
  const [hour, minute] = clock.split(':').map(Number);
  const d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, minute).getTime();
}

export function startOfDay(time: number): number {
  return atClock(time, '00:00');
}

export function addDays(time: number, days: number): number {
  const d = new Date(time);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days, d.getHours(), d.getMinutes()).getTime();
}

/** "8 am", "7:30 pm", "Noon", "Midnight". */
export function formatClock(time: number): string {
  const d = new Date(time);
  const hour = d.getHours();
  const minute = d.getMinutes();
  if (minute === 0 && hour === 12) return t.noon;
  if (minute === 0 && hour === 0) return t.midnight;
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const m = minute === 0 ? '' : `:${String(minute).padStart(2, '0')}`;
  return `${h}${m} ${hour < 12 ? t.am : t.pm}`;
}

/** Like formatClock, but always with a number: "12 pm", "12 am". For times of day in sentences. */
export function formatTime(time: number): string {
  const d = new Date(time);
  const hour = d.getHours();
  const h = hour % 12 === 0 ? 12 : hour % 12;
  const m = d.getMinutes() === 0 ? '' : `:${String(d.getMinutes()).padStart(2, '0')}`;
  return `${h}${m} ${hour < 12 ? t.am : t.pm}`;
}

export const weekday = (time: number) => t.weekdays[new Date(time).getDay()];
export const weekdayShort = (time: number) => t.weekdaysShort[new Date(time).getDay()];
export const month = (time: number) => t.months[new Date(time).getMonth()];
export const day = (time: number) => new Date(time).getDate();

/** "Sun 11:52 pm". */
export function formatShort(time: number): string {
  return `${weekdayShort(time)} ${formatTime(time)}`;
}

/** "April 17, 1989" from "1989-04-17". */
export function formatBirthDate(value: string): string {
  const [year, m, d] = value.split('-').map(Number);
  return `${t.months[m - 1]} ${d}, ${year}`;
}
