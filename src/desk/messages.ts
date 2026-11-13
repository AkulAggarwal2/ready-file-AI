// The text message staff can send during a hold, and other petition wording
// shared by several screens.
import type { CheckDate } from '../checker';
import { deskConfig } from './config';
import { deskCopy, fill } from './content';
import { formatBirthDate, formatClock, weekdayName } from './format';
import type { HowItHappened } from '../organizer/incident';
import type { Petition } from './petitions';
import type { PetitionRecord } from './state/deskState';
import { HOUR } from './time';

/**
 * The text the petitioner gets. It names only the day she filed and when the
 * hold ends: never the case type or the other person (section 8). Before a
 * hold, it shows the end time a hold would have if started now.
 */
export function textMessage(petition: Petition, record: PetitionRecord, now: number): string {
  const end = record.hold?.end ?? now + deskConfig.holdHours * HOUR;
  return fill(deskCopy.petition.contactPanel.message, {
    filedDay: weekdayName(petition.original.filedAt),
    endDay: weekdayName(end),
    endTime: formatClock(end),
  });
}

/** An incident's date as she wrote it, or "No date". */
export function dateText(date: CheckDate): string {
  if (date.kind === 'exact' && date.value.trim()) return formatBirthDate(date.value.trim());
  if (date.kind === 'approximate' && date.text.trim()) return date.text.trim();
  return deskCopy.dates.none;
}

export function howText(how: HowItHappened): string {
  return deskCopy.how[how];
}

export function caseTypeLabel(petition: Petition): string {
  return deskCopy.caseTypes[petition.caseType];
}

/** "Line 4" or "Lines 1 to 8". */
export function linesText(first: number, last: number): string {
  const p = deskCopy.petition.filedPetition;
  return first === last ? fill(p.line, { a: first }) : fill(p.lines, { a: first, b: last });
}
