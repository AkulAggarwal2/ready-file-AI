// The checker is self-contained: it has no React, no app state, and no UI text
// of its own. Other tools (such as a court e-filing site or an advocate tool)
// can import it and pass in their own rules and incidents.

export type CaseType = 'stalking' | 'harassment' | 'not-sure';

export type CheckDate =
  | { kind: 'exact'; value: string }
  | { kind: 'approximate'; text: string }
  | { kind: 'unknown' };

export interface CheckIncident {
  id: string;
  date: CheckDate;
  description: string;
}

export interface CheckInput {
  caseType: CaseType;
  incidents: CheckIncident[];
}

// Rules can only use these conditions. Rules contain no code, so every
// question traces back to one rule in a content file.
export type Condition =
  | { type: 'incidentCountBelow'; value: number }
  | { type: 'incidentDateMissing' }
  | { type: 'incidentWordsBelow'; value: number };

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
