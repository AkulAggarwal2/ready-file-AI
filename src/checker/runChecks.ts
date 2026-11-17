import type { CheckDate, CheckIncident, CheckInput, Finding, Rule } from './types';

function isDateMissing(incident: CheckIncident): boolean {
  const { date } = incident;
  if (date.kind === 'exact') return date.value.trim() === '';
  if (date.kind === 'approximate') return date.text.trim() === '';
  return true;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

const isBlank = (text: string | undefined) => !text || text.trim() === '';

/** Whether a full date is after today. Both are YYYY-MM-DD, so comparing the text compares the dates. */
export function isDateInFuture(date: CheckDate, today: string | undefined): boolean {
  return Boolean(today) && date.kind === 'exact' && date.value !== '' && date.value > today!;
}

// Checks that ask once per incident.
const PER_INCIDENT: Partial<Record<string, (incident: CheckIncident, input: CheckInput) => boolean>> = {
  incidentDateMissing: (incident) => isDateMissing(incident),
  incidentDateInFuture: (incident, input) => isDateInFuture(incident.date, input.today),
  incidentPlaceMissing: (incident) => isBlank(incident.place),
  incidentPeopleMissing: (incident) => isBlank(incident.present),
  incidentNotFirsthand: (incident) => incident.firsthand === 'no',
  incidentActsMissing: (incident) => !incident.acts || incident.acts.length === 0,
};

function finding(rule: Rule, incidentId?: string): Finding {
  return {
    key: `${rule.id}:${incidentId ?? 'all'}`,
    ruleId: rule.id,
    conditionType: rule.condition!.type,
    questionText: rule.questionText,
    sourceCitation: rule.sourceCitation,
    verified: rule.verified,
    incidentId,
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

    const perIncident = PER_INCIDENT[condition.type];
    if (perIncident) {
      for (const incident of input.incidents) {
        if (perIncident(incident, input)) findings.push(finding(rule, incident.id));
      }
      continue;
    }

    switch (condition.type) {
      case 'incidentCountBelow':
        if (input.incidents.length < condition.value) findings.push(finding(rule));
        break;
      case 'feelingMissing':
        // Asked once: only when she has incidents and none says how they made her feel.
        if (input.incidents.length > 0 && input.incidents.every((incident) => isBlank(incident.feeling))) {
          findings.push(finding(rule));
        }
        break;
      case 'relationshipNotHousehold':
        if (input.relationship === 'none') findings.push(finding(rule));
        break;
      // These two are about the person, not one incident, and are asked once she has incidents.
      case 'presentThreatMissing':
        if (input.incidents.length > 0 && isBlank(input.threat)) findings.push(finding(rule));
        break;
      case 'incidentsOutOfOrder': {
        // Only full dates can be compared. Asked once if any two are out of order.
        const dates = input.incidents
          .map((incident) => (incident.date.kind === 'exact' ? incident.date.value : ''))
          .filter(Boolean);
        if (dates.some((date, i) => i > 0 && date < dates[i - 1])) findings.push(finding(rule));
        break;
      }
      case 'convictionMissing':
        if (input.incidents.length > 0 && (input.convicted ?? 'unknown') === 'unknown') findings.push(finding(rule));
        break;
      case 'askedToStopMissing':
        if (input.incidents.length > 0 && (input.askedToStop ?? 'unknown') === 'unknown') {
          findings.push(finding(rule));
        }
        break;
      case 'incidentWordsBelow':
        for (const incident of input.incidents) {
          if (wordCount(incident.description) < condition.value) {
            findings.push(finding(rule, incident.id));
          }
        }
        break;
    }
  }

  return findings;
}
