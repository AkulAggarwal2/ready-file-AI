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

function contactMatches(incident: CheckIncident, kinds: ContactKind[]) {
  const fields = { description: incident.description, place: incident.place ?? '', evidence: incident.evidence ?? '' };
  const matches: ContactMatch[] = (Object.keys(fields) as ContactMatch['field'][]).flatMap((field) =>
    findContactDetails(fields[field], kinds).map((span) => ({ ...span, field })),
  );
  const matchedText = matches.map((m) => `${m.field}:${fields[m.field].slice(m.start, m.end)}`).join('|');
  return { matches, matchedText };
}

/** A short, id-safe fingerprint of the matched text. */
function fingerprint(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return hash.toString(36);
}

function finding(
  rule: Rule,
  values: Record<string, number>,
  incidentId?: string,
  matches?: ContactMatch[],
  matchedText?: string,
): Finding {
  // A contact-details key also names what was matched, so "Continue as is" on
  // one match doesn't cover details she adds to that incident later.
  const base = `${rule.id}:${incidentId ?? 'all'}`;
  return {
    key: matchedText === undefined ? base : `${base}:${fingerprint(matchedText)}`,
    ruleId: rule.id,
    conditionType: rule.condition!.type,
    questionText: rule.questionText,
    sourceCitation: rule.sourceCitation,
    verified: rule.verified,
    incidentId,
    ...(rule.staffText !== undefined && { staffText: rule.staffText }),
    values,
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
      case 'incidentCountBelow': {
        const n = input.incidents.length;
        if (n < condition.value) findings.push(finding(rule, { n }));
        break;
      }
      case 'incidentDateMissing':
        input.incidents.forEach((incident, index) => {
          if (isDateMissing(incident)) findings.push(finding(rule, { i: index + 1 }, incident.id));
        });
        break;
      case 'incidentWordsBelow':
        input.incidents.forEach((incident, index) => {
          const words = wordCount(incident.description);
          if (words < condition.value) findings.push(finding(rule, { i: index + 1, words }, incident.id));
        });
        break;
      case 'incidentPlaceMissing':
        input.incidents.forEach((incident, index) => {
          if (incident.place !== undefined && incident.place.trim() === '') {
            findings.push(finding(rule, { i: index + 1 }, incident.id));
          }
        });
        break;
      case 'incidentContactInfo':
        input.incidents.forEach((incident, index) => {
          const { matches, matchedText } = contactMatches(incident, condition.kinds);
          if (matches.length > 0) findings.push(finding(rule, { i: index + 1 }, incident.id, matches, matchedText));
        });
        break;
      case 'respondentDobBlank':
        if (input.respondent && !input.respondent.dateOfBirth?.trim()) findings.push(finding(rule, {}));
        break;
    }
  }

  return findings;
}
