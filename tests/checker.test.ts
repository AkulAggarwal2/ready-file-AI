import { describe, expect, it } from 'vitest';
import { runChecks, validateRules, type CheckIncident, type Rule } from '../src/checker';
import { rules } from '../src/content';

const longText = 'He came to my door at night and would not leave when I asked him to go away.';

// A complete incident, so each test only sees the question it is about.
function incident(id: string, fields: Partial<CheckIncident> = {}): CheckIncident {
  return {
    id,
    date: { kind: 'approximate', text: 'early March' },
    description: longText,
    place: 'My apartment',
    present: 'Me',
    firsthand: 'yes',
    feeling: 'Scared',
    acts: ['placed-in-fear'],
    ...fields,
  };
}

// Answers to the questions about the person, so tests only see what they are about.
const answered = { threat: 'He said he would come back and hurt me.', askedToStop: 'yes' as const };

const ruleIds = (findings: ReturnType<typeof runChecks>) => findings.map((f) => f.ruleId);

describe('runChecks with the seeded rules', () => {
  it('asks the two-or-more question for stalking with one incident', () => {
    const findings = runChecks({ ...answered, caseType: 'stalking', incidents: [incident('a')] }, rules);
    expect(ruleIds(findings)).toEqual(['stalking-two-incidents']);
    expect(findings[0].questionText).toBe('Stalking means two or more incidents. Are there other times?');
  });

  it('does not ask it with two or more incidents', () => {
    const findings = runChecks({ ...answered, caseType: 'stalking', incidents: [incident('a'), incident('b')] }, rules);
    expect(findings).toEqual([]);
  });

  it('does not ask the stalking question for harassment or not sure', () => {
    expect(runChecks({ ...answered, caseType: 'not-sure', incidents: [incident('a')] }, rules)).toEqual([]);
    expect(ruleIds(runChecks({ ...answered, caseType: 'harassment', incidents: [incident('a')] }, rules))).toEqual([
      'harassment-repeated',
    ]);
  });

  it('asks about each incident with no date, including blank exact or approximate dates', () => {
    const findings = runChecks(
      {
        ...answered,
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
      { ...answered, caseType: 'not-sure', incidents: [incident('a', { description: 'He yelled at me.' })] },
      rules,
    );
    expect(findings.map((f) => [f.ruleId, f.incidentId])).toEqual([['incident-too-short', 'a']]);
  });

  it('never runs a placeholder rule', () => {
    const findings = runChecks({ ...answered, caseType: 'sexual-assault', incidents: [] }, rules);
    expect(ruleIds(findings)).not.toContain('sexual-assault-rule');
  });

  it('gives every finding a unique key and a rule it came from', () => {
    const findings = runChecks(
      { ...answered, caseType: 'stalking', incidents: [incident('a', { description: 'Short.', date: { kind: 'unknown' } })] },
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

describe('questions that follow the petition (PO-0100)', () => {
  const ask = (input: Partial<Parameters<typeof runChecks>[0]>) =>
    runChecks({ ...answered, caseType: 'not-sure', incidents: [], ...input }, rules).map((f) => [f.ruleId, f.incidentId]);

  it('asks for the place and the people present in each incident (question 8)', () => {
    expect(ask({ incidents: [incident('a', { place: ' ' }), incident('b', { present: '' })] })).toEqual([
      ['incident-missing-place', 'a'],
      ['incident-missing-people', 'b'],
    ]);
  });

  it('flags a date after today, but only when it knows today', () => {
    const future = incident('a', { date: { kind: 'exact', value: '2027-03-01' } });
    expect(ask({ incidents: [future], today: '2026-11-17' })).toEqual([['incident-future-date', 'a']]);
    expect(ask({ incidents: [future] })).toEqual([]);
    expect(ask({ incidents: [incident('b', { date: { kind: 'exact', value: '2026-11-17' } })], today: '2026-11-17' })).toEqual([]);
  });

  it('asks for a signed statement when she did not see it herself', () => {
    expect(ask({ incidents: [incident('a', { firsthand: 'no' })] })).toEqual([['incident-not-firsthand', 'a']]);
    expect(ask({ incidents: [incident('a', { firsthand: 'unknown' })] })).toEqual([]);
  });

  it('asks once how the incidents made her feel, for stalking and harassment', () => {
    const incidents = [incident('a', { feeling: '' }), incident('b', { feeling: '' })];
    expect(ask({ caseType: 'stalking', incidents })).toEqual([['feeling-stalking', undefined]]);
    expect(ask({ caseType: 'harassment', incidents })).toEqual([['feeling-harassment', undefined]]);
    expect(ask({ caseType: 'stalking', incidents: [incidents[0], incident('c')] })).toEqual([]);
    expect(ask({ caseType: 'stalking', incidents: [] })).toEqual([['stalking-two-incidents', undefined]]);
  });

  it('for domestic violence, asks about the relationship and what the person did', () => {
    expect(ask({ caseType: 'domestic-violence', relationship: 'none', incidents: [incident('a', { acts: [] })] })).toEqual([
      ['dv-relationship', undefined],
      ['dv-acts', 'a'],
    ]);
    expect(ask({ caseType: 'domestic-violence', relationship: 'dating', incidents: [incident('a')] })).toEqual([]);
    expect(ask({ caseType: 'stalking', relationship: 'none', incidents: [incident('a'), incident('b')] })).toEqual([]);
  });

  it('accepts the new condition types in rules.json', () => {
    const raw = ['incidentPlaceMissing', 'feelingMissing', 'relationshipNotHousehold'].map((type) => ({
      id: type,
      caseTypes: ['stalking'],
      condition: { type },
      questionText: 'Q',
      sourceCitation: 'S',
      verified: false,
    }));
    expect(validateRules(raw).map((rule) => rule.condition?.type)).toEqual([
      'incidentPlaceMissing',
      'feelingMissing',
      'relationshipNotHousehold',
    ]);
  });
});

describe('questions about the person (Westlaw research)', () => {
  const ask = (input: Partial<Parameters<typeof runChecks>[0]>) =>
    runChecks({ caseType: 'stalking', incidents: [incident('a'), incident('b')], ...input }, rules).map((f) => f.ruleId);

  it('asks once about a present threat, for every order type, once she has incidents', () => {
    expect(ask({ askedToStop: 'no' })).toEqual(['present-threat']);
    expect(ask({ caseType: 'domestic-violence', relationship: 'dating', askedToStop: 'no' })).toEqual(['present-threat']);
    expect(ask({ threat: 'He has a gun and said he would use it.', askedToStop: 'no' })).toEqual([]);
    expect(ask({ incidents: [], askedToStop: 'no' })).toEqual(['stalking-two-incidents']);
  });

  it('asks whether she told them to stop, only for stalking and harassment, until she answers', () => {
    const threat = 'He keeps showing up.';
    expect(ask({ threat })).toEqual(['asked-to-stop']);
    expect(ask({ threat, caseType: 'harassment' })).toEqual(['asked-to-stop']);
    expect(ask({ threat, askedToStop: 'no' })).toEqual([]);
    expect(ask({ threat, caseType: 'not-sure' })).toEqual([]);
  });
});
