// The checker is self-contained: it has no React, no app state, and no UI text
// of its own. Other tools (such as a court e-filing site or an advocate tool)
// can import it and pass in their own rules and incidents.

// The grounds a petition can be based on: question 1 on the adult petition
// (PO-0100), where the petitioner checks every one that applies. Sex grooming
// is only a ground on the petition filed on behalf of a child (PO-0101).
// To add a ground: add it here, add its label under start.grounds in
// copy.json, and list it in the grounds of any rule that applies.
export const GROUNDS = ['domestic-violence', 'sex-offense', 'stalking', 'harassment', 'sex-grooming'] as const;

export type Ground = (typeof GROUNDS)[number];

// What rules list in "grounds". "not-sure" means the rule also applies when
// no ground is chosen.
export const RULE_GROUNDS = [...GROUNDS, 'not-sure'] as const;

export type RuleGround = (typeof RULE_GROUNDS)[number];

export type CheckDate =
  | { kind: 'exact'; value: string }
  | { kind: 'approximate'; text: string }
  | { kind: 'unknown' };

// How she knows the person: the lines of question 2 on the adult petition
// (PO-0100), in that order. 2a lists family or household members, which
// domestic or family violence orders need; "none" stands for 2b to 2d (no
// family or household relationship). "not-sure" means she did not say. The
// lifetime sex or violent offender line is asked separately (convicted).
export const RELATIONSHIPS = [
  'spouse',
  'former-spouse',
  'lived-together',
  'child-in-common',
  'dating',
  'sexual',
  'blood-adoption',
  'marriage',
  'guardian',
  'ward',
  'custodian',
  'foster-parent',
  'minor-child-of',
  'adopted-their-child',
  'none',
  'not-sure',
] as const;

// How the person knows the child: the lines of question 2 on the petition
// filed for a child (PO-0101), in that order.
export const CHILD_RELATIONSHIPS = [
  'spouse-lived',
  'lived-together',
  'parent',
  'dating',
  'sexual',
  'child-in-common',
  'blood-adoption',
  'marriage',
  'guardian',
  'custodian',
  'foster-parent',
  'minor-child-of',
  'none',
  'not-sure',
] as const;

export type Relationship = (typeof RELATIONSHIPS)[number] | (typeof CHILD_RELATIONSHIPS)[number];

// The acts listed in question 7 on the adult petition (PO-0100), in that
// order. The petition filed for a child (PO-0101) also lists sex grooming,
// between animal cruelty and harassment.
export const ACTS = [
  'attempted-harm',
  'threatened-harm',
  'caused-harm',
  'placed-in-fear',
  'forced-sexual',
  'stalking',
  'sex-offense',
  'animal-cruelty',
  'harassment',
] as const;

// The acts in question 7 of the petition filed for a child (PO-0101).
export const CHILD_ACTS = [
  'attempted-harm',
  'threatened-harm',
  'caused-harm',
  'placed-in-fear',
  'forced-sexual',
  'stalking',
  'sex-offense',
  'animal-cruelty',
  'sex-grooming',
  'harassment',
] as const;

export type Act = (typeof CHILD_ACTS)[number];

// In the order the answer lists show them: no answer yet first.
export const YES_NO_UNKNOWN = ['unknown', 'yes', 'no'] as const;

export type YesNoUnknown = (typeof YES_NO_UNKNOWN)[number];

// Whether she saw or heard the incident herself. If not, the court needs a
// sworn statement from someone who did (PO-0102).
export type Firsthand = YesNoUnknown;

export interface CheckIncident {
  id: string;
  date: CheckDate;
  description: string;
  // Question 8 on the petition asks for the place and everyone who was there.
  // Each field below is left out by tools that don't ask for it (such as
  // Desk), so the rules about it never ask them.
  place?: string;
  present?: string;
  firsthand?: Firsthand;
  feeling?: string;
  acts?: Act[];
  // Evidence or witnesses, in her words. Only checked for contact details.
  evidence?: string;
}

export interface CheckInput {
  // The grounds she chose (question 1). Empty means she is not sure.
  grounds: Ground[];
  incidents: CheckIncident[];
  // The fields below are left out by tools that don't ask for them, so the
  // rules about them never ask. Desk leaves out all but respondent.
  relationship?: Relationship | null;
  // Why she thinks the person could hurt her now. Every order needs a present,
  // credible threat (Ind. Code § 34-26-5-9(f); S.H. v. D.W., Ind. 2020).
  threat?: string;
  // Whether she told the person to stop contacting her (Maurer v. Cobb-Maurer).
  askedToStop?: YesNoUnknown;
  // Whether the person was convicted of a sex crime against her (PO-0100 question 2).
  convicted?: YesNoUnknown;
  // Today's date as YYYY-MM-DD. Without it, dates are not checked against today.
  today?: string;
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
  field: 'description' | 'place' | 'evidence';
  start: number;
  end: number;
}

// Conditions that need no "value" in rules.json.
export const SIMPLE_CONDITIONS = [
  'incidentDateMissing',
  'incidentDateInFuture',
  'incidentPlaceMissing',
  'incidentPeopleMissing',
  'incidentNotFirsthand',
  'incidentActsMissing',
  'feelingMissing',
  'relationshipNotHousehold',
  'presentThreatMissing',
  'askedToStopMissing',
  'incidentsOutOfOrder',
  'convictionMissing',
  'respondentDobBlank',
] as const;

export type SimpleConditionType = (typeof SIMPLE_CONDITIONS)[number];

// Rules can only use these conditions. Rules contain no code, so every
// question traces back to one rule in a content file. Built from
// SIMPLE_CONDITIONS, so the list and this type cannot drift apart.
export type Condition =
  | { type: 'incidentCountBelow'; value: number }
  | { type: 'incidentWordsBelow'; value: number }
  | { type: 'incidentContactInfo'; kinds: ContactKind[] }
  | { type: SimpleConditionType };

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
  grounds: RuleGround[];
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
