// Section 5 of DESK_PROMPT.md: staffText, the respondent-dob-missing rule, and
// the extra finding fields Desk needs. All data is fictional.
import { describe, expect, it } from 'vitest';
import rulesJson from '../content/rules.json';
import { runChecks, validateRules, type CheckIncident } from '../src/checker';
import { rules } from '../src/content';
import { staffText } from '../src/desk/content';

const longText = 'He came to my door at night and would not leave when I asked him to go away.';

function incident(id: string, fields: Partial<CheckIncident> = {}): CheckIncident {
  return { id, date: { kind: 'approximate', text: 'early March' }, description: longText, ...fields };
}

const rawRule = (id: string) => rulesJson.rules.find((rule) => rule.id === id)!;

describe('staffText in rules.json', () => {
  it('validation accepts text and plural forms, and keeps them', () => {
    const byId = Object.fromEntries(rules.map((rule) => [rule.id, rule]));
    expect(byId['incident-missing-date'].staffText).toBe('Incident {i} has no date');
    expect(byId['stalking-two-incidents'].staffText).toMatchObject({ count: 'n' });
    expect(byId['harassment-rule'].staffText).toBeUndefined();
  });

  it('validation rejects staffText that is not text or plural forms', () => {
    const valid = rawRule('incident-missing-date');
    expect(() => validateRules([{ ...valid, staffText: 42 }])).toThrow(/Rule "incident-missing-date".*staffText/);
    expect(() => validateRules([{ ...valid, staffText: { count: 'n', one: 'x' } }])).toThrow(/staffText/);
    expect(() => validateRules([{ ...valid, staffText: { count: 'days', one: 'x', other: 'y' } }])).toThrow(
      /"count" must be one of/,
    );
  });

  it('the stalking wording reads correctly for any count', () => {
    const say = (count: number) =>
      staffText(
        runChecks(
          { caseType: 'stalking', incidents: Array.from({ length: count }, (_, i) => incident(`x${i}`)) },
          // Raise the limit so the rule asks at every count in this test.
          validateRules([{ ...rawRule('stalking-two-incidents'), condition: { type: 'incidentCountBelow', value: 9 } }]),
        )[0],
      );
    expect(say(0)).toBe('Stalking is checked, and no incidents are described');
    expect(say(1)).toBe('Stalking is checked, and 1 incident is described');
    expect(say(2)).toBe('Stalking is checked, and 2 incidents are described');
  });

  it('per-incident wording names the incident and counts words', () => {
    const findings = runChecks(
      {
        caseType: 'harassment',
        incidents: [incident('a'), incident('b', { date: { kind: 'unknown' }, description: 'He yelled.' })],
      },
      rules,
    );
    expect(findings.map(staffText)).toEqual(['Incident 2 has no date', 'Incident 2 is very short (2 words)']);
    const one = runChecks({ caseType: 'harassment', incidents: [incident('a', { description: 'Again.' })] }, rules);
    expect(staffText(one[0])).toBe('Incident 1 is very short (1 word)');
  });

  it('falls back to "Question from rule {id}" when a rule has no staffText', () => {
    const [rule] = validateRules([{ ...rawRule('incident-missing-date'), staffText: undefined }]);
    const [finding] = runChecks({ caseType: 'stalking', incidents: [incident('a', { date: { kind: 'unknown' } })] }, [
      rule,
    ]);
    expect(staffText(finding)).toBe('Question from rule incident-missing-date');
  });
});

describe('respondent-dob-missing', () => {
  const rule = rules.find((r) => r.id === 'respondent-dob-missing')!;

  it('is in rules.json as the brief describes it', () => {
    expect(rule).toMatchObject({
      caseTypes: rules.find((r) => r.id === 'incident-missing-date')!.caseTypes,
      condition: { type: 'respondentDobBlank' },
      questionText:
        "Do you know the other person's date of birth? Without it, the order goes into Indiana's registry but not the national one.",
      staffText: "The respondent's date of birth is blank",
      sourceCitation: 'PO-0102 petition booklet (team source K2)',
      verified: false,
    });
  });

  it('asks when the input has respondent details and the date of birth is blank', () => {
    for (const dateOfBirth of ['', '   ']) {
      const findings = runChecks(
        { caseType: 'stalking', incidents: [incident('a'), incident('b')], respondent: { dateOfBirth } },
        rules,
      );
      expect(findings.map((f) => f.ruleId)).toEqual(['respondent-dob-missing']);
    }
  });

  it('does not ask when the date of birth is given', () => {
    const findings = runChecks(
      { caseType: 'stalking', incidents: [incident('a'), incident('b')], respondent: { dateOfBirth: '1989-04-17' } },
      rules,
    );
    expect(findings).toEqual([]);
  });

  it('never asks when the input has no respondent details, as in ReadyFile today', () => {
    for (const caseType of ['stalking', 'harassment', 'domestic-violence', 'sexual-assault', 'not-sure'] as const) {
      const findings = runChecks({ caseType, incidents: [incident('a')] }, rules);
      expect(findings.map((f) => f.ruleId)).not.toContain('respondent-dob-missing');
    }
  });
});

describe('findings carry what Desk needs (backward-compatible)', () => {
  it('keeps every field ReadyFile uses', () => {
    const [finding] = runChecks({ caseType: 'stalking', incidents: [incident('a')] }, rules);
    expect(finding).toMatchObject({
      key: 'stalking-two-incidents:all',
      ruleId: 'stalking-two-incidents',
      conditionType: 'incidentCountBelow',
      questionText: 'Stalking means two or more incidents. Are there other times?',
      sourceCitation: 'PO-0102 petition booklet (team source K2)',
      verified: false,
    });
    expect(finding.incidentId).toBeUndefined();
  });

  it('adds the incident number and values for per-incident findings', () => {
    const findings = runChecks(
      {
        caseType: 'stalking',
        incidents: [incident('a'), incident('b'), incident('c', { description: 'He was there again last night.' })],
      },
      rules,
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      ruleId: 'incident-too-short',
      incidentId: 'c',
      incidentNumber: 3,
      values: { n: 3, i: 3, words: 6 },
    });
  });

  it('gives the incident count for whole-list findings', () => {
    const findings = runChecks({ caseType: 'stalking', incidents: [], respondent: { dateOfBirth: '' } }, rules);
    expect(findings.map((f) => [f.ruleId, f.values])).toEqual([
      ['stalking-two-incidents', { n: 0 }],
      ['respondent-dob-missing', { n: 0 }],
    ]);
  });
});
