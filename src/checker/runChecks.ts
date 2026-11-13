import { findContactDetails } from './detectors';
import type { CheckIncident, CheckInput, ContactKind, ContactMatch, Finding, Rule } from './types';

function isDateMissing(incident: CheckIncident): boolean {
  const { date } = incident;
  if (date.kind === 'exact') return date.value.trim() === '';
  if (date.kind === 'approximate') return date.text.trim() === '';
  return true;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function contactMatches(incident: CheckIncident, kinds: ContactKind[]): ContactMatch[] {
  const fields = { description: incident.description, place: incident.place ?? '' };
  return (Object.keys(fields) as ContactMatch['field'][]).flatMap((field) =>
    findContactDetails(fields[field], kinds).map((span) => ({ ...span, field })),
  );
}

function finding(rule: Rule, incidentId?: string, matches?: ContactMatch[]): Finding {
  return {
    key: `${rule.id}:${incidentId ?? 'all'}`,
    ruleId: rule.id,
    conditionType: rule.condition!.type,
    questionText: rule.questionText,
    sourceCitation: rule.sourceCitation,
    verified: rule.verified,
    incidentId,
    ...(matches && { matches }),
  };
}

/**
 * Runs every rule that applies to the case type and returns the questions to
 * ask, in rule order. The result depends only on the input and the rules.
 */
export function runChecks(input: CheckInput, rules: Rule[]): Finding[] {
  const findings: Finding[] = [];

  for (const rule of rules) {
    const { condition } = rule;
    if (!condition || !rule.caseTypes.includes(input.caseType)) continue;

    switch (condition.type) {
      case 'incidentCountBelow':
        if (input.incidents.length < condition.value) findings.push(finding(rule));
        break;
      case 'incidentDateMissing':
        for (const incident of input.incidents) {
          if (isDateMissing(incident)) findings.push(finding(rule, incident.id));
        }
        break;
      case 'incidentWordsBelow':
        for (const incident of input.incidents) {
          if (wordCount(incident.description) < condition.value) {
            findings.push(finding(rule, incident.id));
          }
        }
        break;
      case 'incidentPlaceMissing':
        for (const incident of input.incidents) {
          if (incident.place !== undefined && incident.place.trim() === '') findings.push(finding(rule, incident.id));
        }
        break;
      case 'incidentContactInfo':
        for (const incident of input.incidents) {
          const matches = contactMatches(incident, condition.kinds);
          if (matches.length > 0) findings.push(finding(rule, incident.id, matches));
        }
        break;
    }
  }

  return findings;
}
