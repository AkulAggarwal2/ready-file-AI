import { readFileSync } from 'node:fs';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { runChecks, type Rule } from '../src/checker';
import { missingRequired, questionnaires, visibleAnswers } from '../src/forms/questionnaire';
import { createIncident } from '../src/organizer';
import { buildPacket, pdfMap, type PacketText } from '../src/pdf/packet';
import { fieldText, withoutCourt, wrap, type MapField } from '../src/pdf/stamp';
import { attachmentCaption, genericValues, po0101Values, po0119Values, wvValues, type PacketInput } from '../src/pdf/values';
import { courtForms } from '../src/forms';
import { compareCatalog, parseCourtPage } from '../src/forms/courtPage';
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

  it('a 4th law enforcement agency on WV-0102, which has 3 lines, goes on an attachment', async () => {
    const input = {
      ...base('wv-new', { 'plaintiff.name': 'Example Bakery LLC', 'employee.name': 'Lena Example' }),
      answers: {
        'plaintiff.name': 'Example Bakery LLC',
        'employee.name': 'Lena Example',
        'respondent.first': 'Sam',
        'respondent.last': 'Sample',
        agencies: [1, 2, 3, 4].map((n) => ({ agency: `Agency ${n}`, address: `${n} Main St` })),
      },
    };
    const result = await buildPacket(input, fromDisk, TEXT);
    expect(result.forms.find((f) => f.form === 'WV-0101')?.attachmentPages).toBe(0);
    expect(result.forms.find((f) => f.form === 'WV-0102')?.attachmentPages).toBe(1);
  });

  it('a blank expense amount never unchecks a box', () => {
    const v = genericValues('PO-0115', base('modify', { 'q9.reimburse': true, 'q9.reimburse.medical.amount': '' })).values;
    expect(v['q9.reimburse.medical']).toBeUndefined();
    expect(v['q9.reimburse']).toBe(true);
  });

  it("switching from a child's petition to an adult's also drops the sex grooming act", () => {
    let state: AppState = { ...initialState, incidents: [createIncident({ acts: ['sex-grooming', 'stalking'] })] };
    for (const [node, option] of [['who', 'me'], ['meWhat', 'new'], ['meWhere', 'home']]) {
      state = reducer(state, { type: 'routeAnswer', answer: { node, option } });
    }
    expect(state.incidents[0].acts).toEqual(['stalking']);
  });

  it('the court page check ignores entities, quote styles, and attributes on table rows', () => {
    const page = readFileSync('tests/fixtures/po-forms-page.html', 'utf8')
      .replace(/<tr>/g, '<tr class="row">')
      .replace("Respondent's Verified", 'Respondent&rsquo;s Verified');
    expect(compareCatalog(parseCourtPage(page), courtForms)).toEqual([]);
  });
});

// Regression tests for the printed-packet review: small layout problems on
// the filled forms. All names are fictional.
describe('printed packet review fixes', () => {
  const field = (form: string, key: string) => pdfMap(form).fields.find((f) => f.key === key) as MapField & { x: number; y: number; w: number };

  it('strips a trailing "Court" from a court name the form follows with COURT', () => {
    expect(withoutCourt('Allen Superior Court')).toBe('Allen Superior');
    expect(withoutCourt('  allen circuit COURT ')).toBe('allen circuit');
    expect(withoutCourt('Allen Superior')).toBe('Allen Superior');
    expect(withoutCourt('Court of Common Pleas')).toBe('Court of Common Pleas');
    expect(withoutCourt('Court')).toBe('Court');
    // Only on blanks followed by the word COURT, which the map builder marks.
    expect(fieldText(field('WV-0104', 'caption.court'), 'Allen Superior Court')).toBe('Allen Superior');
    expect(fieldText(field('WV-0104', 'caption.division'), 'Small Claims Court')).toBe('Small Claims Court');
  });

  it('marks every caption court blank as followed by COURT', () => {
    const forms = ['PNW-0102', 'PO-0100', 'PO-0101', 'PO-0107', 'PO-0108', 'PO-0111', 'PO-0115', 'PO-0116', 'PO-0119', 'PO-0126', 'PO-0128', 'WV-0101', 'WV-0102', 'WV-0103', 'WV-0104', 'WV-0105', 'WV-0107'];
    for (const form of forms) expect(field(form, 'caption.court'), form).toEqual(expect.objectContaining({ trimCourt: true }));
    // "the _____ Court of that State" on PO-0119 too.
    expect(field('PO-0119', 'a.court')).toEqual(expect.objectContaining({ trimCourt: true }));
  });

  it('starts a blank inside a word after the word\'s letters, measured by letter widths', () => {
    // "ROOM___)" on the workplace violence captions: the M ends near x=495.
    for (const form of ['WV-0101', 'WV-0102', 'WV-0103', 'WV-0104', 'WV-0105', 'WV-0107']) expect(field(form, 'caption.room').x, form).toBeGreaterThan(496);
    // "COUNTY OF________" on PNW-0102: the F ends near x=310.
    expect(field('PNW-0102', 'caption.county').x).toBeGreaterThan(311);
  });

  it('puts the cell phone on PO-0104 on its own line, not lowered by the bigger "Home address:" label', () => {
    const y = (kind: string) => field('PO-0104', `restrained.phone.${kind}.area`).y;
    const step = y('home') - y('work');
    expect(y('work') - y('cell')).toBeCloseTo(step, 0);
    expect(field('PO-0104', 'restrained.phone.cell.number').y).toBe(y('cell'));
  });

  it('PO-0115: extra animals say which list they belong to, and share one attachment with the weapons', () => {
    const animal = (name: string) => ({ name, ageType: 'rabbit', sizeBreed: 'small', description: 'gray' });
    const built = genericValues('PO-0115', base('modify', {
      'q9.animalsProtect': true,
      'q9.animalsProtect.animals': [animal('A'), animal('B'), animal('C')],
      'q9.animalsKeep': true,
      'q9.animalsKeep.animals': [animal('D'), animal('E'), animal('F')],
      'q9.surrender': true,
      'q9.surrender.items': Array.from({ length: 7 }, (_, i) => ({ item: `Item ${i + 1}` })),
      'q9.phones': true,
      'q9.phones.numbers': Array.from({ length: 3 }, (_, i) => ({ numberUser: `Phone ${i + 1}`, provider: 'x', holder: 'y' })),
    }));
    expect(built.attachments.map((a) => a.label)).toEqual(['to PO-0115', '9(c)']);
    expect(built.attachments[0].blocks.map((b) => b.heading)).toEqual([
      'Animals the Respondent must not take, harm, or dispose of: Animal 3',
      'Animals in my care and custody: Animal 3',
      'The weapons: Weapon 7',
    ]);
    // A long answer in one item's blank continues under a heading that names it.
    expect(built.continuable['q9.phones.1.numberUser']).toEqual(expect.objectContaining({ label: '9(c)', heading: 'The phone numbers: Phone 1, Phone number and who uses it (continued)' }));
  });

  it('PO-0115: phone answers start on the form\'s solid line', () => {
    for (const n of [1, 2]) for (const part of ['numberUser', 'provider', 'holder']) expect(field('PO-0115', `q9.phones.${n}.${part}`).x).toBe(408);
  });

  it('PO-0119: a 4th child is noted at question 11, and a long issuing court still moves to the attachment', async () => {
    const children = Array.from({ length: 4 }, (_, i) => ({ name: `Kid ${i + 1}`, age: '5', dob: '2021-01-01' }));
    const v = po0119Values(base('foreign-register', { 'a.custody': 'yes', 'a.children': children })).values;
    expect(v['a.children.continued']).toBe('(more listed on Attachment to PO-0119)');
    expect(po0119Values(base('foreign-register', { 'a.custody': 'yes', 'a.children': children.slice(0, 3) })).values['a.children.continued']).toBeUndefined();
    const result = await buildPacket(base('foreign-register', { 'a.court': 'Franklin County Court of Common Pleas, Domestic Relations Division' }), fromDisk, TEXT);
    expect(result.forms[0].attachmentPages).toBe(1);
  });

  it("WV-0104: the defendant's own Response names the defendant above the address", () => {
    const v = wvValues('WV-0104', base('wv-response', { 'filer.contact': 'PO Box 9\nFort Wayne, IN 46802' })).values;
    expect(v['filer.contact']).toBe('Sam Sample\nPO Box 9\nFort Wayne, IN 46802');
  });
});
