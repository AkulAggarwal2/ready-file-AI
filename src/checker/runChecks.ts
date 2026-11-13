import type { CheckIncident, CheckInput, Finding, FindingValues, Rule } from './types';

function isDateMissing(incident: CheckIncident): boolean {
  const { date } = incident;
  if (date.kind === 'exact') return date.value.trim() === '';
  if (date.kind === 'approximate') return date.text.trim() === '';
  return true;
}

export function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

function finding(rule: Rule, values: FindingValues, incident?: { id: string; number: number }): Finding {
  return {
    key: `${rule.id}:${incident?.id ?? 'all'}`,
    ruleId: rule.id,
    conditionType: rule.condition!.type,
    questionText: rule.questionText,
    sourceCitation: rule.sourceCitation,
    verified: rule.verified,
    incidentId: incident?.id,
    incidentNumber: incident?.number,
    staffText: rule.staffText,
    values,
  };
}

/**
 * Runs every rule that applies to the case type and returns the questions to
 * ask, in rule order. The result depends only on the input and the rules.
 */
export function runChecks(input: CheckInput, rules: Rule[]): Finding[] {
  const findings: Finding[] = [];
  const n = input.incidents.length;

  for (const rule of rules) {
    const { condition } = rule;
    if (!condition || !rule.caseTypes.includes(input.caseType)) continue;

    switch (condition.type) {
      case 'incidentCountBelow':
        if (n < condition.value) findings.push(finding(rule, { n }));
        break;
      case 'incidentDateMissing':
        input.incidents.forEach((incident, index) => {
          if (isDateMissing(incident)) {
            findings.push(finding(rule, { n, i: index + 1 }, { id: incident.id, number: index + 1 }));
          }
        });
        break;
      case 'incidentWordsBelow':
        input.incidents.forEach((incident, index) => {
          const words = wordCount(incident.description);
          if (words < condition.value) {
            findings.push(finding(rule, { n, i: index + 1, words }, { id: incident.id, number: index + 1 }));
          }
        });
        break;
      case 'respondentDobBlank':
        // Asks only when the input has respondent details at all.
        if (input.respondent && input.respondent.dateOfBirth.trim() === '') {
          findings.push(finding(rule, { n }));
        }
        break;
    }
  }

  return findings;
}
