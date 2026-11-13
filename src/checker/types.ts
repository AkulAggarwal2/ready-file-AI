// The checker is self-contained: it has no React, no app state, and no UI text
// of its own. Other tools (such as a court e-filing site or an advocate tool)
// can import it and pass in their own rules and incidents.

// To add a type of protection order: add it here, add its label under
// start.caseTypes in copy.json, and list it in the caseTypes of any rule that
// applies. The order here is the order on the Start screen.
export const CASE_TYPES = ['stalking', 'harassment', 'domestic-violence', 'sexual-assault', 'not-sure'] as const;

export type CaseType = (typeof CASE_TYPES)[number];

export type CheckDate =
  | { kind: 'exact'; value: string }
  | { kind: 'approximate'; text: string }
  | { kind: 'unknown' };

export interface CheckIncident {
  id: string;
  date: CheckDate;
  description: string;
  // Where it happened. Left out by tools that don't ask, so the place rule
  // never asks them about it.
  place?: string;
}

export interface CheckInput {
  caseType: CaseType;
  incidents: CheckIncident[];
  // Left out by tools that don't collect respondent details, such as
  // ReadyFile today, so respondent rules never ask them.
  respondent?: { dateOfBirth?: string };
}

// Kinds of contact details the incidentContactInfo condition looks for. The
// patterns are in detectors.ts, so rules pick them by name and hold no code.
export const CONTACT_KINDS = ['phone', 'ssn', 'address'] as const;

export type ContactKind = (typeof CONTACT_KINDS)[number];

/** Where in an incident's text a possible contact detail was found. */
export interface ContactMatch {
  kind: ContactKind;
  field: 'description' | 'place';
  start: number;
  end: number;
}

// Rules can only use these conditions. Rules contain no code, so every
// question traces back to one rule in a content file.
export type Condition =
  | { type: 'incidentCountBelow'; value: number }
  | { type: 'incidentDateMissing' }
  | { type: 'incidentWordsBelow'; value: number }
  | { type: 'incidentPlaceMissing' }
  | { type: 'incidentContactInfo'; kinds: ContactKind[] }
  | { type: 'respondentDobBlank' };

export type ConditionType = Condition['type'];

/**
 * Text with a count in it. The number named by `by` picks the form: `zero`
 * for 0 (or `other` if there is no `zero`), `one` for 1, `other` otherwise.
 */
export interface PluralText {
  by: string;
  zero?: string;
  one: string;
  other: string;
}

export interface Rule {
  id: string;
  caseTypes: CaseType[];
  // null means the rule is a placeholder and never asks anything.
  condition: Condition | null;
  questionText: string;
  sourceCitation: string;
  verified: boolean;
  // How the finding reads to court staff in Desk. ReadyFile ignores it.
  staffText?: string | PluralText;
  todo?: string;
}

export interface Finding {
  key: string;
  ruleId: string;
  conditionType: ConditionType;
  questionText: string;
  sourceCitation: string;
  verified: boolean;
  // Set when the question is about one incident rather than the whole list.
  incidentId?: string;
  staffText?: string | PluralText;
  // The numbers staffText needs, so no one recomputes them: n (incident
  // count), i (the incident's 1-based place in the input), words (word count).
  values?: Record<string, number>;
  // For incidentContactInfo: where the possible contact details are, so the
  // UI can point them out without checking again.
  matches?: ContactMatch[];
}
