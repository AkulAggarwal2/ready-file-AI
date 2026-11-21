import { describe, expect, it } from 'vitest';
import { findContactDetails, runChecks, validateRules, type CheckIncident, type Rule } from '../src/checker';
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
// What ReadyFile sends before she answers them.
const unanswered = { threat: '', askedToStop: 'unknown' as const, convicted: 'unknown' as const };

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

  it('never runs a placeholder rule (condition null)', () => {
    const placeholder = validateRules([
      { id: 'p', caseTypes: ['stalking'], condition: null, questionText: 'TODO', sourceCitation: 'TODO', verified: false },
    ]);
    expect(runChecks({ ...answered, caseType: 'stalking', incidents: [incident('a')] }, placeholder)).toEqual([]);
  });

  it('for sexual assault, asks about a conviction once and what the person did per incident', () => {
    const ask = (input: Partial<Parameters<typeof runChecks>[0]>) =>
      runChecks({ ...answered, convicted: 'unknown', caseType: 'sexual-assault', incidents: [incident('a', { acts: [] })], ...input }, rules).map(
        (f) => [f.ruleId, f.incidentId],
      );
    expect(ask({})).toEqual([
      ['sexual-assault-conviction', undefined],
      ['sexual-assault-acts', 'a'],
    ]);
    expect(ask({ convicted: 'no', incidents: [incident('a')] })).toEqual([]);
    expect(ask({ incidents: [] })).toEqual([]);
  });

  // Rules still waiting for the team to supply a source. Remove an id once its
  // rule is verified. See "Still unverified" in the README.
  const KNOWN_UNVERIFIED = ['incident-contact-info'];

  it('marks every other seeded rule verified, with a source', () => {
    const unverified = rules.filter((rule) => !rule.verified || /TODO/.test(rule.sourceCitation)).map((r) => r.id);
    expect(unverified.filter((id) => !KNOWN_UNVERIFIED.includes(id))).toEqual([]);
  });

  it('allows only the one known unverified rule', () => {
    expect(KNOWN_UNVERIFIED).toEqual(['incident-contact-info']);
    expect(KNOWN_UNVERIFIED.filter((id) => !rules.some((rule) => rule.id === id))).toEqual([]);
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
    const withoutField = runChecks({ ...answered, caseType: 'not-sure', incidents: [incident('a', { place: undefined })] }, rules);
    expect(ruleIds(withoutField)).not.toContain('incident-missing-place');

    const blank = runChecks({ ...answered, caseType: 'not-sure', incidents: [incident('a', { place: '  ' })] }, rules);
    expect(blank.map((f) => [f.ruleId, f.incidentId])).toEqual([['incident-missing-place', 'a']]);

    const given = runChecks({ ...answered, caseType: 'not-sure', incidents: [incident('a', { place: 'At work' })] }, rules);
    expect(given).toEqual([]);
  });

  it('finds a phone number in the description and reports where it is', () => {
    const description = `${longText} Call me at 260-555-0142 if needed.`;
    const [found] = runChecks(
      { ...answered, caseType: 'not-sure', incidents: [incident('a', { description, place: 'At work' })] },
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
      { ...answered, caseType: 'stalking', incidents: [incident('a', { place: 'Apartment at 412 Oak Street' }), incident('b', { place: 'Park' })] },
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

  it('does not take everyday phrases for street addresses', () => {
    const text = 'He showed up at 9 at my place. He grabbed me 2 times in court. 3 more days this way.';
    expect(findContactDetails(text, ['address'])).toEqual([]);
    expect(findContactDetails('She lives at 88 5th Avenue now, or 412 Oak street.', ['address'])).toHaveLength(2);
  });

  it('finds contact details in the evidence field', () => {
    const [found] = runChecks(
      { ...answered, caseType: 'not-sure', incidents: [incident('a', { place: 'At work', evidence: 'Witness: my sister, (260) 555-0199' })] },
      rules,
    );
    expect(found.ruleId).toBe('incident-contact-info');
    expect(found.matches).toEqual([{ kind: 'phone', field: 'evidence', start: 20, end: 34 }]);
  });

  it('gives a new key when the contact details in an incident change', () => {
    const keyFor = (description: string) =>
      runChecks({ ...answered, caseType: 'not-sure', incidents: [incident('a', { description, place: 'At work' })] }, rules)[0].key;
    const first = keyFor(`${longText} Call 260-555-0142.`);
    expect(keyFor(`${longText} Call 260-555-0142. Really.`)).toBe(first);
    expect(keyFor(`${longText} Call 260-555-0142 or 260-555-0143.`)).not.toBe(first);
  });

  it('only looks for the kinds the rule names', () => {
    expect(findContactDetails('Call 260-555-0141', ['address'])).toEqual([]);
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
    runChecks({ ...unanswered, caseType: 'stalking', incidents: [incident('a'), incident('b')], ...input }, rules).map((f) => f.ruleId);

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

describe('dates out of order', () => {
  const exact = (id: string, value: string) => incident(id, { date: { kind: 'exact', value } });
  const ask = (incidents: CheckIncident[]) =>
    runChecks({ ...answered, caseType: 'not-sure', incidents }, rules).map((f) => f.ruleId);

  it('asks once when two full dates are out of order, ignoring dates that are not full', () => {
    expect(ask([exact('a', '2026-10-02'), exact('b', '2026-09-14'), exact('c', '2026-01-01')])).toEqual([
      'incidents-out-of-order',
    ]);
    expect(ask([exact('a', '2026-09-14'), incident('b'), exact('c', '2026-10-02')])).toEqual([]);
    expect(ask([incident('a', { date: { kind: 'approximate', text: 'January' } }), exact('b', '2026-03-14')])).toEqual([]);
  });
});
