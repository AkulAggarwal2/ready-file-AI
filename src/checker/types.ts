// The checker is self-contained: it has no React, no app state, and no UI text
// of its own. Other tools (such as a court e-filing site, an advocate tool, or
// ReadyFile Desk) can import it and pass in their own rules and incidents.

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
}

/** Details about the other person, when the tool collects them. */
export interface CheckRespondent {
  // Blank when the petition leaves it empty.
  dateOfBirth: string;
}

export interface CheckInput {
  caseType: CaseType;
  incidents: CheckIncident[];
  // Optional. ReadyFile doesn't collect respondent details yet, so it leaves
  // this out, and rules about the respondent never ask anything there.
  respondent?: CheckRespondent;
}

// Rules can only use these conditions. Rules contain no code, so every
// question traces back to one rule in a content file.
export type Condition =
  | { type: 'incidentCountBelow'; value: number }
  | { type: 'incidentDateMissing' }
  | { type: 'incidentWordsBelow'; value: number }
  | { type: 'respondentDobBlank' };

export type ConditionType = Condition['type'];

/**
 * Wording for court staff. Either one text, or plural forms chosen by one of
 * the finding's values (named by `count`), so "1 incident" and "2 incidents"
 * both read correctly. `zero` is used for 0 when given, otherwise `other`.
 */
export type StaffText = string | { count: string; zero?: string; one: string; other: string };

export interface Rule {
  id: string;
  caseTypes: CaseType[];
  // null means the rule is a placeholder and never asks anything.
  condition: Condition | null;
  questionText: string;
  // Optional: how the finding reads to court staff in ReadyFile Desk.
  // ReadyFile ignores it.
  staffText?: StaffText;
  sourceCitation: string;
  verified: boolean;
  todo?: string;
}

/**
 * Numbers a finding's wording can use:
 * n = how many incidents there are, i = the incident's number (from 1, in the
 * order given), words = how many words the incident's description has.
 */
export interface FindingValues {
  n: number;
  i?: number;
  words?: number;
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
  // The incident's place in the list, from 1. Set with incidentId.
  incidentNumber?: number;
  // The rule's staff wording, if it has any. Fill it in with `values`.
  staffText?: StaffText;
  values: FindingValues;
}
