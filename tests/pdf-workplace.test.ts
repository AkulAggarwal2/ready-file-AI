import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { questionnaires, type Answers } from '../src/forms/questionnaire';
import { buildPacket, packetFor, pdfMap, type PacketText } from '../src/pdf/packet';
import { pnw0102Values, po0104Values, wvValues, type PacketInput } from '../src/pdf/values';

// Workplace violence forms (WV-0101 to WV-0107). All names are fictional.
const TEXT: PacketText = { confidentialTitle: 'C', confidentialInstructions: ['c'], confidentialBanner: 'C' };
const fromDisk = async (form: string) => Uint8Array.from(readFileSync(`src/pdf/templates/${form}.pdf`));

const answers: Answers = {
  'court.county': 'Allen',
  'court.name': 'Allen Superior',
  'plaintiff.name': 'Example Bakery LLC',
  'plaintiff.type': 'other',
  'plaintiff.type.other.detail': 'Limited liability company',
  'employee.name': 'Lena Example',
  'employee.sex': 'female',
  'respondent.first': 'Sam',
  'respondent.last': 'Sample',
  venue: ['a'],
  conduct: ['threat', 'stalked'],
  workplace: '100 Example St, Fort Wayne, IN',
  'conduct.description': 'On March 2 the defendant waited by the back door and said he would hurt her.',
  tro: true,
  harm: true,
  'harm.text': 'He said he would come back Friday.',
  notice: ['notRequired'],
  'notice.notRequired.detail': 'Telling him would put her at risk.',
  restraining: true,
  'restraining.now': true,
  protectedHousehold: [{ name: 'Mia Example', sex: 'female', dob: '2019-04-05' }],
  prohibit: ['1', '4'],
  stayAway: true,
  'stayAway.yards': '100',
  'stayAway.places': ['others', 'work'],
  'stayAway.work.address': '100 Example St',
  agencies: [{ agency: 'Allen County Sheriff', address: '715 S Calhoun St' }],
  'def.sex': 'male',
  'def.dob': '1990-01-02',
  affirm: 'a',
  'signer.name': 'Pat Owner',
  'signer.title': 'Owner',
  'petitioner.homeAddress': '9 Hidden Ln',
};

const input = (id: string, extra: Answers = {}): PacketInput => ({
  questionnaire: questionnaires[id],
  answers: { ...answers, ...extra },
  grounds: [],
  relationship: null,
  convicted: 'unknown',
  incidents: [],
});

describe('workplace violence questionnaires', () => {
  it.each(['wv-new', 'wv-modify', 'wv-response'])('%s: every answer has a blank on its forms', (id) => {
    const q = questionnaires[id];
    const keys = new Set(packetFor(q).flatMap(({ form }) => pdfMap(form).fields.map((f) => f.key)));
    const missing = q.sections
      .flatMap((s) => s.fields)
      .filter((field) => !/^(court\.|case\.number|plaintiff\.name|employee\.name|respondent\.|petitioner\.|signer\.name|notify|protected$|household$)/.test(field.id))
      .filter((field) => {
        const prefix = field.mapAs ?? field.id;
        return ![...keys].some((k) => k === prefix || k.startsWith(`${prefix}.`) || k.startsWith(`${field.id}.`));
      })
      .map((field) => field.id);
    expect(missing).toEqual([]);
  });
});

describe('workplace violence values', () => {
  const v = wvValues('WV-0101', input('wv-new')).values;

  it('fills the caption with the employer, the defendant, and the employee', () => {
    expect([v['caption.plaintiff'], v['caption.defendant'], v['caption.employee']]).toEqual(['Example Bakery LLC', 'Sam Sample', 'Lena Example']);
    expect(v['def.name']).toBe('Sam Sample');
  });

  it('checks the boxes the answers imply', () => {
    expect(v['plaintiff.type.other']).toBe(true);
    expect([v['conduct.threat'], v['conduct.stalked'], v['conduct.battered']]).toEqual([true, true, undefined]);
    expect(v['notice.notRequired']).toBe(true);
    expect(v['notice.certify']).toBe(true);
    expect([v['prohibit.1'], v['prohibit.4'], v['prohibit.2']]).toEqual([true, true, undefined]);
    expect(v['stayAway.work']).toBe(true);
    expect(v['household.1.name']).toBe('Mia Example');
    expect(v['household.1.sex.female']).toBe(true);
    expect(v['household.1.dob']).toBe('04/05/2019');
    expect(v.fee).toBe(true);
    expect(v.printedName).toBe('Pat Owner');
    expect(v['signer.title']).toBe('Owner');
  });

  it('lists agencies as table rows and names the protected people on the Order to Show Cause', () => {
    expect(v.agencies).toEqual([['Allen County Sheriff', '715 S Calhoun St']]);
    expect(wvValues('WV-0102', input('wv-new')).values['stayAway.others.names']).toBe('Lena Example, Mia Example');
  });

  it('names the employer as plaintiff on the Confidential Form and the Notice of Exclusion', () => {
    const conf = po0104Values(input('wv-new')).values;
    expect(conf['caption.petitioner']).toBe('Example Bakery LLC');
    expect(conf['caption.employee']).toBe('Lena Example');
    const pnw = pnw0102Values(input('wv-new')).values;
    expect(pnw['text.partyName1']).toBe('Plaintiff');
    expect(pnw['text.insertName']).toBe('Pat Owner');
  });

  it('the defendant signs their own response', () => {
    const r = wvValues('WV-0104', input('wv-response', { agree: 'disagree', 'statement.text': 'I was not there.' })).values;
    expect(r['agree.disagree']).toBe(true);
    expect(r.statement).toBe(true);
    expect(r.printedName).toBe('Sam Sample');
  });
});

describe('workplace violence: answers stay on their own forms', () => {
  // People the Confidential Form lists (household, protected) who are not on the petition.
  const confidentialPeople: Answers = {
    household: [{ name: 'Roommate Person', age: '30', sex: 'male', race: 'White' }],
    protected: Array.from({ length: 5 }, (_, i) => ({ name: `Hidden Person ${i + 1}`, age: '9', sex: 'female', dob: '2017-01-01', race: 'Black' })),
  };
  const many = (n: number) => Array.from({ length: n }, (_, i) => ({ name: `Kid Example ${i + 1}`, sex: 'female', dob: '2019-04-05' }));

  it('never prints a Confidential Form list on a public form, even one with a blank of the same name', () => {
    for (const form of ['WV-0101', 'WV-0102', 'WV-0103']) {
      const built = wvValues(form, input('wv-new', confidentialPeople));
      expect(JSON.stringify(built.values), form).not.toContain('Roommate Person');
      expect(JSON.stringify(built.attachments), form).not.toContain('Hidden Person');
    }
    expect(wvValues('WV-0101', input('wv-new', confidentialPeople)).values['household.1.name']).toBe('Mia Example');
  });

  it('keeps the Confidential Form lists in the confidential PDF only', async () => {
    const result = await buildPacket(input('wv-new', confidentialPeople), fromDisk, TEXT);
    for (const f of result.forms) if (!f.confidential) expect(f.attachmentPages, f.form).toBe(0);
  });

  it('puts a list on an attachment only to the forms that have lines for it, named as each form names it', () => {
    const extra = { protectedHousehold: many(4), agencies: Array.from({ length: 5 }, (_, i) => ({ agency: `Agency ${i + 1}`, address: 'x' })) };
    const label = (form: string) => wvValues(form, input('wv-new', extra)).attachments.map((a) => a.label);
    expect(label('WV-0101')).toContain('8a');
    expect(label('WV-0102')).toContain('5c');
    expect(label('WV-0103')).toEqual([]);
    expect(wvValues('WV-0101', input('wv-new', extra)).values['household.continued']).toBe(true);
    expect(wvValues('WV-0102', input('wv-new', extra)).values['household.continued']).toBe(true);
  });

  it('checks "Continued on Attachment 5b" when the conduct narrative runs long', async () => {
    const long = 'He waited by the back door and shouted threats at her. '.repeat(60);
    const built = wvValues('WV-0101', input('wv-new', { 'conduct.description': long }));
    expect(built.continuable['conduct.description']).toEqual(expect.objectContaining({ label: '5b', box: 'conduct.continued' }));
  });

  it('leaves the Response and its Proof of Service blank in the employer packet, except the case heading', () => {
    const entry = packetFor(questionnaires['wv-new']).find((p) => p.form === 'WV-0104')!;
    const v = entry.build(input('wv-new')).values;
    expect(v['caption.plaintiff']).toBe('Example Bakery LLC');
    expect(v.printedName).toBeUndefined();
    expect(v['filer.contact']).toBeUndefined();
    expect(Object.values(v).filter((x) => x === true)).toEqual([]);
  });
});

describe('workplace violence packets', () => {
  it('the employer packet: public forms in filing order, the Confidential Form separate', async () => {
    const result = await buildPacket(input('wv-new'), fromDisk, TEXT);
    expect(result.forms.map((f) => [f.form, f.confidential])).toEqual([
      ['WV-0101', false],
      ['WV-0102', false],
      ['WV-0104', false],
      ['WV-0105', false],
      ['WV-0103', false],
      ['PNW-0102', false],
      ['PO-0104', true],
    ]);
    expect(result.confidential).not.toBeNull();
    const pages = (await PDFDocument.load(result.public)).getPageCount();
    // Instructions + WV-0101 (5) + WV-0102 (6) + WV-0104 (2) + WV-0105 (2) + WV-0103 (2) + PNW-0102 (2).
    expect(pages).toBe(1 + 5 + 6 + 2 + 2 + 2 + 2 + result.forms.reduce((n, f) => n + (f.confidential ? 0 : f.attachmentPages), 0));
    if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}-wv.pdf`, result.public);
  });

  it.each(['wv-modify', 'wv-response'])('%s builds one PDF', async (id) => {
    const result = await buildPacket(input(id, { 'case.number': '02D01-2605-PO-000777' }), fromDisk, TEXT);
    expect(result.confidential).toBeNull();
  });
});

describe('workplace violence: more agencies than lines', () => {
  const agencies = Array.from({ length: 5 }, (_, i) => ({ agency: `Agency ${i + 1}`, address: `${i + 1} Main St` }));

  it('puts every agency past the form\'s lines on one attachment to that form', async () => {
    const result = await buildPacket(input('wv-new', { agencies, 'case.number': '' }), fromDisk, TEXT);
    const pages = Object.fromEntries(result.forms.map((f) => [f.form, f.attachmentPages]));
    // WV-0101 has lines for 4 agencies, WV-0102 for 3: one attachment page each, none elsewhere.
    expect(pages).toEqual(expect.objectContaining({ 'WV-0101': 1, 'WV-0102': 1, 'WV-0103': 0, 'WV-0104': 0, 'WV-0105': 0 }));
    expect(wvValues('WV-0102', input('wv-new', { agencies })).values.agencies).toHaveLength(5);
  });

  it('fits a full case number in paragraph 15', () => {
    const f = pdfMap('WV-0101').fields.find((x) => x.key === 'employeePO.number')!;
    expect(f.kind === 'text' && f.w).toBeGreaterThanOrEqual(100);
  });
});
