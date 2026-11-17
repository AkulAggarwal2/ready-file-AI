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

// How she knows the person, in the words of question 2 on the petition
// (PO-0100). Domestic or family violence orders need one of these, except
// "none". "not-sure" means she did not say.
export const RELATIONSHIPS = [
  'spouse',
  'dating',
  'sexual',
  'child-in-common',
  'family',
  'marriage',
  'guardian',
  'none',
  'not-sure',
] as const;

export type Relationship = (typeof RELATIONSHIPS)[number];

// The acts listed in question 7 on the petition (PO-0100), in that order.
export const ACTS = [
  'attempted-harm',
  'threatened-harm',
  'caused-harm',
  'placed-in-fear',
  'forced-sexual',
  'animal-cruelty',
  'unwanted-contact',
] as const;

export type Act = (typeof ACTS)[number];

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
  place?: string;
  present?: string;
  firsthand?: Firsthand;
  feeling?: string;
  acts?: Act[];
}

export interface CheckInput {
  caseType: CaseType;
  incidents: CheckIncident[];
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
] as const;

export type SimpleConditionType = (typeof SIMPLE_CONDITIONS)[number];

// Rules can only use these conditions. Rules contain no code, so every
// question traces back to one rule in a content file. Built from
// SIMPLE_CONDITIONS, so the list and this type cannot drift apart.
export type Condition =
  | { type: 'incidentCountBelow'; value: number }
  | { type: 'incidentWordsBelow'; value: number }
  | { type: SimpleConditionType };

export type ConditionType = Condition['type'];

export interface Rule {
  id: string;
  caseTypes: CaseType[];
  // null means the rule is a placeholder and never asks anything.
  condition: Condition | null;
  questionText: string;
  sourceCitation: string;
  verified: boolean;
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
}
