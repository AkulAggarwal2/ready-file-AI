import { describe, expect, it } from 'vitest';
import { findContactDetails, runChecks, validateRules, type CheckIncident, type Rule } from '../src/checker';
import { rules } from '../src/content';

const longText = 'He came to my door at night and would not leave when I asked him to go away.';

function incident(id: string, fields: Partial<CheckIncident> = {}): CheckIncident {
  return { id, date: { kind: 'approximate', text: 'early March' }, description: longText, ...fields };
}

const ruleIds = (findings: ReturnType<typeof runChecks>) => findings.map((f) => f.ruleId);

describe('runChecks with the seeded rules', () => {
  it('asks the two-or-more question for stalking with one incident', () => {
    const findings = runChecks({ caseType: 'stalking', incidents: [incident('a')] }, rules);
    expect(ruleIds(findings)).toEqual(['stalking-two-incidents']);
    expect(findings[0].questionText).toBe('Stalking means two or more incidents. Are there other times?');
  });

  it('does not ask it with two or more incidents', () => {
    const findings = runChecks({ caseType: 'stalking', incidents: [incident('a'), incident('b')] }, rules);
    expect(findings).toEqual([]);
  });

  it('does not ask the stalking question for harassment or not sure', () => {
    for (const caseType of ['harassment', 'not-sure'] as const) {
      expect(runChecks({ caseType, incidents: [incident('a')] }, rules)).toEqual([]);
    }
  });

  it('asks about each incident with no date, including blank exact or approximate dates', () => {
    const findings = runChecks(
      {
        caseType: 'not-sure',
        incidents: [
          incident('a', { date: { kind: 'unknown' } }),
          incident('b', { date: { kind: 'exact', value: '' } }),
          incident('c', { date: { kind: 'approximate', text: '  ' } }),
          incident('d', { date: { kind: 'exact', value: '2025-03-14' } }),
        ],
      },
      rules,
    );
    expect(findings.map((f) => [f.ruleId, f.incidentId])).toEqual([
      ['incident-missing-date', 'a'],
      ['incident-missing-date', 'b'],
      ['incident-missing-date', 'c'],
    ]);
  });

  it('asks for more detail when a description is under the word limit', () => {
    const findings = runChecks(
      { caseType: 'harassment', incidents: [incident('a', { description: 'He yelled at me.' })] },
      rules,
    );
    expect(findings.map((f) => [f.ruleId, f.incidentId])).toEqual([['incident-too-short', 'a']]);
  });

  it('never runs the harassment placeholder rule', () => {
    const findings = runChecks({ caseType: 'harassment', incidents: [] }, rules);
    expect(ruleIds(findings)).not.toContain('harassment-rule');
  });

  it('gives every finding a unique key and a rule it came from', () => {
    const findings = runChecks(
      { caseType: 'stalking', incidents: [incident('a', { description: 'Short.', date: { kind: 'unknown' } })] },
      rules,
    );
    const ids = new Set(rules.map((r) => r.id));
    expect(findings.every((f) => ids.has(f.ruleId))).toBe(true);
    expect(new Set(findings.map((f) => f.key)).size).toBe(findings.length);
  });
});

describe('validateRules', () => {
  const valid = {
    id: 'r',
    caseTypes: ['stalking'],
    condition: { type: 'incidentCountBelow', value: 2 },
    questionText: 'Q?',
    sourceCitation: 'S',
    verified: false,
  };

  it('accepts a valid rule', () => {
    const [rule] = validateRules([valid]);
    expect(rule).toMatchObject<Partial<Rule>>({ id: 'r', condition: { type: 'incidentCountBelow', value: 2 } });
  });

  it('names the rule when a condition type is unknown', () => {
    expect(() => validateRules([{ ...valid, condition: { type: 'askAnAI' } }])).toThrow(
      /Rule "r".*unknown condition type "askAnAI"/,
    );
  });

  it('accepts the place and contact conditions, and checks contact kinds', () => {
    expect(validateRules([{ ...valid, condition: { type: 'incidentPlaceMissing' } }])[0].condition).toEqual({
      type: 'incidentPlaceMissing',
    });
    const contact = { type: 'incidentContactInfo', kinds: ['phone', 'address'] };
    expect(validateRules([{ ...valid, condition: contact }])[0].condition).toEqual(contact);
    expect(() => validateRules([{ ...valid, condition: { type: 'incidentContactInfo', kinds: [] } }])).toThrow(/kinds/);
    expect(() => validateRules([{ ...valid, condition: { type: 'incidentContactInfo', kinds: ['email'] } }])).toThrow(
      /kinds/,
    );
  });

  it('rejects unknown case types, duplicate ids, and a missing verified flag', () => {
    expect(() => validateRules([{ ...valid, caseTypes: ['divorce'] }])).toThrow(/caseTypes/);
    expect(() => validateRules([valid, valid])).toThrow(/more than one rule/);
    expect(() => validateRules([{ ...valid, verified: undefined }])).toThrow(/verified/);
  });
});

// Petition Review Flags. All numbers and addresses are fictional (555-01xx).
describe('place and contact details', () => {
  it('asks about a missing place only when the input has a place field', () => {
    const withoutField = runChecks({ caseType: 'harassment', incidents: [incident('a')] }, rules);
    expect(ruleIds(withoutField)).not.toContain('incident-place-missing');

    const blank = runChecks({ caseType: 'harassment', incidents: [incident('a', { place: '  ' })] }, rules);
    expect(blank.map((f) => [f.ruleId, f.incidentId])).toEqual([['incident-place-missing', 'a']]);

    const given = runChecks({ caseType: 'harassment', incidents: [incident('a', { place: 'At work' })] }, rules);
    expect(given).toEqual([]);
  });

  it('finds a phone number in the description and reports where it is', () => {
    const description = `${longText} Call me at 260-555-0142 if needed.`;
    const [found] = runChecks(
      { caseType: 'harassment', incidents: [incident('a', { description, place: 'At work' })] },
      rules,
    );
    expect(found.ruleId).toBe('incident-contact-info');
    expect(found.matches).toHaveLength(1);
    const [match] = found.matches!;
    expect(match).toMatchObject({ kind: 'phone', field: 'description' });
    expect(description.slice(match.start, match.end)).toBe('260-555-0142');
  });

  it('finds a street address in the place field', () => {
    const [found] = runChecks(
      { caseType: 'stalking', incidents: [incident('a', { place: 'Apartment at 412 Oak Street' }), incident('b', { place: 'Park' })] },
      rules,
    );
    expect(found.ruleId).toBe('incident-contact-info');
    expect(found.incidentId).toBe('a');
    expect(found.matches).toEqual([{ kind: 'address', field: 'place', start: 13, end: 27 }]);
  });

  it('detects phone, SSN, and address formats without overlaps', () => {
    const text = 'Phone (260) 555-0187, SSN 000-55-0100, lives at 1200 North Main St. Waited 2 hours on Main Street.';
    const spans = findContactDetails(text, ['phone', 'ssn', 'address']);
    expect(spans.map((s) => [s.kind, text.slice(s.start, s.end)])).toEqual([
      ['phone', '(260) 555-0187'],
      ['ssn', '000-55-0100'],
      ['address', '1200 North Main St.'],
    ]);
  });

  it('only looks for the kinds the rule names', () => {
    expect(findContactDetails('Call 260-555-0141', ['address'])).toEqual([]);
  });
});
