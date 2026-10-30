import { describe, expect, it } from 'vitest';
import { runChecks, validateRules, type CheckIncident, type Rule } from '../src/checker';
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

  it('rejects unknown case types, duplicate ids, and a missing verified flag', () => {
    expect(() => validateRules([{ ...valid, caseTypes: ['divorce'] }])).toThrow(/caseTypes/);
    expect(() => validateRules([valid, valid])).toThrow(/more than one rule/);
    expect(() => validateRules([{ ...valid, verified: undefined }])).toThrow(/verified/);
  });
});
