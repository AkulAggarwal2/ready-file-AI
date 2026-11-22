import { readFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { runChecks, type Rule } from '../src/checker';
import { missingRequired, questionnaires, visibleAnswers } from '../src/forms/questionnaire';
import { createIncident } from '../src/organizer';
import { buildPacket, type PacketText } from '../src/pdf/packet';
import { wrap } from '../src/pdf/stamp';
import { attachmentCaption, po0101Values, type PacketInput } from '../src/pdf/values';
import { initialState, reducer, type AppState } from '../src/state/appState';

// Regression tests for the code review of the official forms work.
// All names are fictional.
const TEXT: PacketText = { confidentialTitle: 'C', confidentialInstructions: ['c'], confidentialBanner: 'C' };
const fromDisk = async (form: string) => Uint8Array.from(readFileSync(`src/pdf/templates/${form}.pdf`));
const base = (id: string, answers: PacketInput['answers'] = {}): PacketInput => ({
  questionnaire: questionnaires[id],
  answers: { 'petitioner.first': 'Lena', 'petitioner.last': 'Example', 'respondent.first': 'Sam', 'respondent.last': 'Sample', ...answers },
  grounds: ['stalking'],
  relationship: 'none',
  convicted: 'unknown',
  incidents: [],
});

describe('code review fixes', () => {
  it("a child's attachments cite PO-0101, not the adult petition", () => {
    const input = { ...base('petition-child'), incidents: [1, 2, 3, 4].map((n) => createIncident({ description: `Incident ${n}` })) };
    const { attachments } = po0101Values(input);
    expect(attachments.map((a) => [a.label, a.form])).toEqual([['8a', 'PO-0101']]);
  });

  it('attachment captions ignore answers left over from another questionnaire', () => {
    const leftover = base('petition-adult', { 'child.first': 'Mia', 'child.last': 'Example' });
    expect(attachmentCaption(leftover)).toBe('Lena Example v. Sam Sample');
  });

  it('a field that depends on a hidden field is hidden too, on screen and on the PDF', () => {
    const q = questionnaires['petition-adult'];
    const answers = { 'q2.offender.lifetime': 'yes', 'q9.indefinite': true };
    const asked = visibleAnswers(q, answers, { relationship: null, convicted: 'yes', grounds: [] });
    expect(asked['q9.indefinite']).toBe(true);
    // She changes the conviction answer: lifetime hides, and so does the relief that depends on it.
    const now = visibleAnswers(q, answers, { relationship: null, convicted: 'no', grounds: [] });
    expect(now['q2.offender.lifetime']).toBeUndefined();
    expect(now['q9.indefinite']).toBeUndefined();
    expect(missingRequired(q, answers, { relationship: null, convicted: 'no', grounds: [] }).map((m) => m.field.id)).not.toContain('q9.indefinite');
  });

  it('continued text keeps the form order, and text with no attachment of its own still moves', async () => {
    const long = 'He waited outside my building and followed me to the bus stop. '.repeat(6);
    const input = {
      ...base('petition-adult', { q3: 'Thirty-something, I am not completely sure of the exact age' }),
      incidents: [createIncident({ description: `One. ${long}` }), createIncident({ description: `Two. ${long}` })],
    };
    const result = await buildPacket(input, fromDisk, TEXT);
    // q3 has no attachment of its own; it now goes on "Attachment to PO-0100".
    expect(result.forms[0].attachmentPages).toBeGreaterThanOrEqual(2);
  });

  it('wrap never hangs on a line narrower than one letter', async () => {
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica);
    expect(wrap('WWW', font, 10, 2)).toEqual(['W', 'W', 'W']);
  });

  it('the same condition with a different setting still asks', () => {
    const rule = (id: string, value: number): Rule => ({
      id,
      grounds: ['stalking', 'harassment'],
      condition: { type: 'incidentCountBelow', value },
      questionText: id,
      sourceCitation: 'test',
      verified: true,
    });
    const asked = runChecks({ grounds: ['stalking', 'harassment'], incidents: [] }, [rule('two', 2), rule('also-two', 2), rule('three', 3)]);
    expect(asked.map((f) => f.ruleId)).toEqual(['two', 'three']);
  });

  it("switching from a child's petition to an adult's drops the child-only answers", () => {
    let state: AppState = { ...initialState, grounds: ['sex-grooming', 'stalking'], relationship: 'spouse-lived' };
    for (const [node, option] of [['who', 'me'], ['meWhat', 'new'], ['meWhere', 'home']]) {
      state = reducer(state, { type: 'routeAnswer', answer: { node, option } });
    }
    expect(state.grounds).toEqual(['stalking']);
    expect(state.relationship).toBeNull();
  });
});
