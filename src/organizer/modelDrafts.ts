// What ReadyFile asks the on-device model, and how its answer becomes
// incidents. Pure functions, no browser APIs.
//
// Her words are never rewritten. The model only says where each incident
// starts (its first words) and which of her phrases answer each question.
// The app cuts her own text at those points, and keeps a phrase only if it
// really is in that incident's text. Anything the model made up is dropped.
import { createIncident, HOW_OPTIONS, type HowItHappened, type Incident, type IncidentFields } from './incident';
import { findDate } from './ManualExtractor';

/** One incident as the model describes it. Every text value is meant to be copied from her words. */
export interface ModelDraft {
  firstWords: string;
  when: string;
  place: string;
  how: string;
  othersPresent: string;
  feeling: string;
  proof: string;
}

const DRAFT_FIELDS: (keyof ModelDraft)[] = ['firstWords', 'when', 'place', 'how', 'othersPresent', 'feeling', 'proof'];

/** The JSON shape the model must answer in (the Prompt API's responseConstraint). */
export const DRAFTS_SCHEMA = {
  type: 'object',
  properties: {
    incidents: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          firstWords: { type: 'string' },
          when: { type: 'string' },
          place: { type: 'string' },
          how: { type: 'string', enum: HOW_OPTIONS },
          othersPresent: { type: 'string' },
          feeling: { type: 'string' },
          proof: { type: 'string' },
        },
        required: DRAFT_FIELDS,
        additionalProperties: false,
      },
    },
  },
  required: ['incidents'],
  additionalProperties: false,
};

const INSTRUCTIONS = `You read a spoken account of someone being stalked or harassed. Split it into incidents. An incident is one time something happened. Keep the incidents in the order they were told, and never combine two different times into one.

For each incident, return:
- firstWords: the first 6 words of the incident, copied exactly from the text.
- when: when it happened, copied exactly from the text, or "".
- place: where it happened, copied exactly from the text, or "".
- how: "in-person", "online", "phone-or-text", "other", or "unknown".
- othersPresent: other people who were there, copied exactly from the text, or "". Not the speaker and not the person who did it.
- feeling: how it made the speaker feel, copied exactly from the text, or "".
- proof: screenshots, photos, videos, reports, or witnesses mentioned, copied exactly from the text, or "".

Copy words exactly. Never add, guess, or reword anything.`;

// One worked example (fictional) helps a small model follow the format.
const EXAMPLE_STORY =
  'okay so in March she kept calling me at work like ten times a day and my boss heard it. then on April 2 she showed up at my apartment and banged on the door I was terrified. I have a video from my doorbell. another time she left notes on my car';

const EXAMPLE_ANSWER: { incidents: ModelDraft[] } = {
  incidents: [
    { firstWords: 'in March she kept calling me', when: 'in March', place: 'at work', how: 'phone-or-text', othersPresent: 'my boss', feeling: '', proof: '' },
    { firstWords: 'then on April 2 she showed', when: 'April 2', place: 'my apartment', how: 'in-person', othersPresent: '', feeling: 'I was terrified', proof: 'a video from my doorbell' },
    { firstWords: 'another time she left notes on', when: '', place: 'on my car', how: 'in-person', othersPresent: '', feeling: '', proof: '' },
  ],
};

/** The conversation the model starts from: the instructions and the example. */
export const MODEL_PROMPTS = [
  { role: 'system' as const, content: INSTRUCTIONS },
  { role: 'user' as const, content: EXAMPLE_STORY },
  { role: 'assistant' as const, content: JSON.stringify(EXAMPLE_ANSWER) },
];

/** Reads the model's answer. Null if it is not the expected shape. */
export function parseDrafts(answer: string): ModelDraft[] | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(answer);
  } catch {
    return null;
  }
  const incidents = (parsed as { incidents?: unknown })?.incidents;
  if (!Array.isArray(incidents) || incidents.length === 0) return null;

  return incidents.map((item) => {
    const values = (item ?? {}) as Record<string, unknown>;
    const draft = {} as ModelDraft;
    for (const field of DRAFT_FIELDS) {
      draft[field] = typeof values[field] === 'string' ? (values[field] as string).trim() : '';
    }
    return draft;
  });
}

const WORD = /[\p{L}\p{N}']+/gu;
const BETWEEN_WORDS = "[^\\p{L}\\p{N}']+";
// Enough words to find where an incident starts, without depending on a long exact copy.
const START_WORDS = 6;

/**
 * Finds a phrase in the text, ignoring case and punctuation, so "at work" is
 * found in "At work," too. Returns where it is in the original text.
 */
export function findPhrase(text: string, phrase: string, from = 0): { index: number; length: number } | null {
  const words = phrase.match(WORD);
  if (!words) return null;
  const escaped = words.map((word) => word.replace(/'/g, "['’]"));
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}])${escaped.join(BETWEEN_WORDS)}(?![\\p{L}\\p{N}])`, 'giu');
  pattern.lastIndex = from;
  const match = pattern.exec(text);
  return match ? { index: match.index, length: match[0].length } : null;
}

/** The phrase exactly as she said it in this text, or '' if she didn't say it. */
function quoted(text: string, phrase: string): string {
  if (!phrase) return '';
  const found = findPhrase(text, phrase);
  return found ? text.slice(found.index, found.index + found.length) : '';
}

function leadingWords(phrase: string): string {
  return (phrase.match(WORD) ?? []).slice(0, START_WORDS).join(' ');
}

function fieldsFor(description: string, draft: ModelDraft): Partial<IncidentFields> {
  // The date reader tidies phrases it knows ("in January" becomes "January").
  // Others, like "the week before Thanksgiving", keep her words.
  const when = quoted(description, draft.when);
  const found = findDate(when || description);
  const date = when && found.kind === 'unknown' ? { kind: 'approximate' as const, text: when } : found;
  const how = HOW_OPTIONS.includes(draft.how as HowItHappened) ? (draft.how as HowItHappened) : 'unknown';

  return {
    description,
    date,
    how,
    place: quoted(description, draft.place),
    present: quoted(description, draft.othersPresent),
    feeling: quoted(description, draft.feeling),
    evidence: quoted(description, draft.proof),
  };
}

/**
 * Cuts her story into incidents where the model says each one starts. Text
 * before the first incident stays with it, so nothing she said is lost.
 * Null if none of the starting points are in her story.
 */
export function draftsToIncidents(story: string, drafts: ModelDraft[]): Incident[] | null {
  const starts: { at: number; draft: ModelDraft }[] = [];
  let searchFrom = 0;
  for (const draft of drafts) {
    const found = findPhrase(story, leadingWords(draft.firstWords), searchFrom);
    if (!found) continue;
    starts.push({ at: found.index, draft });
    searchFrom = found.index + found.length;
  }
  if (starts.length === 0) return null;

  return starts
    .map(({ draft }, i) => {
      const from = i === 0 ? 0 : starts[i].at;
      const to = starts[i + 1]?.at ?? story.length;
      return { description: story.slice(from, to).trim(), draft };
    })
    .filter(({ description }) => description !== '')
    .map(({ description, draft }) => createIncident(fieldsFor(description, draft)));
}
