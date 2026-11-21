import { findContactDetails } from './detectors';
import type { CheckDate, CheckIncident, CheckInput, ContactKind, ContactMatch, Finding, Rule } from './types';

function isDateMissing(incident: CheckIncident): boolean {
  const { date } = incident;
  if (date.kind === 'exact') return date.value.trim() === '';
  if (date.kind === 'approximate') return date.text.trim() === '';
  return true;
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

// Blank, but not left out. A tool that doesn't ask for a field leaves it out,
// so the rule about that field never asks them.
const isAnsweredBlank = (text: string | undefined) => text !== undefined && text.trim() === '';

/** Whether a full date is after today. Both are YYYY-MM-DD, so comparing the text compares the dates. */
export function isDateInFuture(date: CheckDate, today: string | undefined): boolean {
  return Boolean(today) && date.kind === 'exact' && date.value !== '' && date.value > today!;
}

// Checks that ask once per incident.
const PER_INCIDENT: Partial<Record<string, (incident: CheckIncident, input: CheckInput) => boolean>> = {
  incidentDateMissing: (incident) => isDateMissing(incident),
  incidentDateInFuture: (incident, input) => isDateInFuture(incident.date, input.today),
  incidentPlaceMissing: (incident) => isAnsweredBlank(incident.place),
  incidentPeopleMissing: (incident) => isAnsweredBlank(incident.present),
  incidentNotFirsthand: (incident) => incident.firsthand === 'no',
  incidentActsMissing: (incident) => incident.acts !== undefined && incident.acts.length === 0,
};

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

/** Whether a rule applies to the grounds she chose. No grounds means "not sure". */
function appliesTo(rule: Rule, grounds: CheckInput['grounds']): boolean {
  return grounds.length === 0 ? rule.grounds.includes('not-sure') : grounds.some((g) => rule.grounds.includes(g));
}

/**
 * Runs every rule that applies to the chosen grounds and returns the questions
 * to ask, in rule order. The result depends only on the input and the rules.
 *
 * With more than one ground, two rules can ask the same thing (such as
 * "stalking-two-incidents" and "harassment-repeated"). Only the first rule
 * with a given condition asks, once overall or once per incident.
 */
export function runChecks(input: CheckInput, rules: Rule[]): Finding[] {
  const all = collectFindings(input, rules);
  const seen = new Set<string>();
  return all.filter((f) => {
    const asks = `${f.conditionType}:${f.incidentId ?? 'all'}`;
    if (seen.has(asks)) return false;
    seen.add(asks);
    return true;
  });
}

function collectFindings(input: CheckInput, rules: Rule[]): Finding[] {
  const findings: Finding[] = [];

  for (const rule of rules) {
    const { condition } = rule;
    if (!condition || !appliesTo(rule, input.grounds)) continue;

    const perIncident = PER_INCIDENT[condition.type];
    if (perIncident) {
      input.incidents.forEach((incident, index) => {
        if (perIncident(incident, input)) findings.push(finding(rule, { i: index + 1 }, incident.id));
      });
      continue;
    }

    switch (condition.type) {
      case 'incidentCountBelow': {
        const n = input.incidents.length;
        if (n < condition.value) findings.push(finding(rule, { n }));
        break;
      }
      case 'feelingMissing':
        // Asked once: only when she has incidents and none says how they made her feel.
        if (input.incidents.length > 0 && input.incidents.every((incident) => isAnsweredBlank(incident.feeling))) {
          findings.push(finding(rule, {}));
        }
        break;
      case 'relationshipNotHousehold':
        if (input.relationship === 'none') findings.push(finding(rule, {}));
        break;
      // These two are about the person, not one incident, and are asked once she has incidents.
      case 'presentThreatMissing':
        if (input.incidents.length > 0 && isAnsweredBlank(input.threat)) findings.push(finding(rule, {}));
        break;
      case 'incidentsOutOfOrder': {
        // Only full dates can be compared. Asked once if any two are out of order.
        const dates = input.incidents
          .map((incident) => (incident.date.kind === 'exact' ? incident.date.value : ''))
          .filter(Boolean);
        if (dates.some((date, i) => i > 0 && date < dates[i - 1])) findings.push(finding(rule, {}));
        break;
      }
      case 'convictionMissing':
        if (input.incidents.length > 0 && input.convicted === 'unknown') findings.push(finding(rule, {}));
        break;
      case 'askedToStopMissing':
        if (input.incidents.length > 0 && input.askedToStop === 'unknown') findings.push(finding(rule, {}));
        break;
      case 'incidentWordsBelow':
        input.incidents.forEach((incident, index) => {
          const words = wordCount(incident.description);
          if (words < condition.value) findings.push(finding(rule, { i: index + 1, words }, incident.id));
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
