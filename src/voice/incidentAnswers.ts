// Reads spoken answers to the questions on an incident card. Pure functions,
// no browser APIs. Text answers keep her words; only the choice questions
// (when, how, and whether she saw it) are matched to an option.
import type { YesNoUnknown } from '../checker';
import type { HowItHappened, IncidentDate, IncidentFields } from '../organizer';
import { findDate } from '../organizer/ManualExtractor';

/** The questions asked by voice, in the order they appear on the card. */
export const GUIDED_FIELDS = [
  'date',
  'place',
  'how',
  'description',
  'present',
  'firsthand',
  'feeling',
  'evidence',
] as const;

export type GuidedField = (typeof GUIDED_FIELDS)[number];

// Question 7 on the court's form ("What did the person do?") is left out on
// purpose. A wrong check mark on a sworn form is serious, so she checks those herself.

export type TextField = Extract<GuidedField, 'place' | 'description' | 'present' | 'feeling' | 'evidence'>;
export type ChoiceField = Exclude<GuidedField, TextField>;

export const isChoiceField = (field: GuidedField): field is ChoiceField =>
  field === 'date' || field === 'how' || field === 'firsthand';

export type VoiceCommand = 'skip' | 'stop';

/** Lowercase words only, so "Skip." and "skip" read the same. */
function normalize(phrase: string): string {
  return phrase
    .toLowerCase()
    .replace(/[’]/g, "'")
    .replace(/[^a-z0-9' ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const NOT_SURE = /\b(not sure|unsure|don't know|do not know|don't remember|do not remember|can't remember|no idea)\b/;

const COMMANDS: Record<string, VoiceCommand> = {
  skip: 'skip',
  'skip it': 'skip',
  'skip this': 'skip',
  'skip this one': 'skip',
  next: 'skip',
  'next question': 'skip',
  stop: 'stop',
  'stop listening': 'stop',
  done: 'stop',
  "i'm done": 'stop',
  finish: 'stop',
};

/** A phrase that is only "skip" or "stop" (and a few ways to say them). */
export function readCommand(phrase: string): VoiceCommand | null {
  return COMMANDS[normalize(phrase)] ?? null;
}

/**
 * A date from a spoken answer. A full date with a year becomes an exact date.
 * Anything else keeps her words as "about when", such as "the week before
 * Thanksgiving".
 */
export function readDateAnswer(phrase: string): IncidentDate | null {
  const words = phrase.trim().replace(/[.!?]+$/, '');
  if (!words) return null;
  if (NOT_SURE.test(normalize(words))) return { kind: 'unknown' };
  const found = findDate(words);
  return found.kind === 'exact' ? found : { kind: 'approximate', text: words };
}

// Most specific first: "he called me after he showed up" is a phone call
// only if nothing more specific matched before it. She can always change it.
const HOW_PATTERNS: [HowItHappened, RegExp][] = [
  ['phone-or-text', /\b(phone|call|called|calling|calls|text|texted|texts|texting|voicemail|message|messaged|messages)\b/],
  ['online', /\b(online|internet|instagram|facebook|snapchat|tiktok|twitter|email|emailed|emails|e mail|social media|dm|dms|website)\b/],
  ['in-person', /\b(in person|face to face|showed up|came to|came over|came up|followed me|in front of)\b/],
  ['other', /^(other|something else)\b/],
];

/** How it happened, from a spoken answer. Null when no option matches. */
export function readHowAnswer(phrase: string): HowItHappened | null {
  const words = normalize(phrase);
  for (const [how, pattern] of HOW_PATTERNS) {
    if (pattern.test(words)) return how;
  }
  return NOT_SURE.test(words) ? 'unknown' : null;
}

const YES = /^(yes|yeah|yep|yup|i did|i saw|i heard|i was there|correct)\b/;
const NO = /^(no|nope|i didn't|i did not)\b|\b(someone|somebody) told me\b/;

/** Yes, no, or not sure, from a spoken answer. Null when it is none of these. */
export function readYesNoAnswer(phrase: string): YesNoUnknown | null {
  const words = normalize(phrase);
  if (NOT_SURE.test(words)) return 'unknown';
  if (YES.test(words)) return 'yes';
  if (NO.test(words)) return 'no';
  return null;
}

/** The change a choice answer makes. Null when the answer doesn't match an option. */
export function readChoiceAnswer(field: ChoiceField, phrase: string): Partial<IncidentFields> | null {
  switch (field) {
    case 'date': {
      const date = readDateAnswer(phrase);
      return date ? { date } : null;
    }
    case 'how': {
      const how = readHowAnswer(phrase);
      return how ? { how } : null;
    }
    case 'firsthand': {
      const firsthand = readYesNoAnswer(phrase);
      return firsthand ? { firsthand } : null;
    }
  }
}
