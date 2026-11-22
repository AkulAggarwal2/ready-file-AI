import { readFileSync, writeFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { questionnaires, type Answers } from '../src/forms/questionnaire';
import { buildPacket, packetFor, pdfMap, type PacketText } from '../src/pdf/packet';
import { po0107Values, po0116Values, po0119Values, po0128Values, genericValues, type PacketInput } from '../src/pdf/values';

// Forms filed in a case that already exists. All data is fictional.
const EXISTING = ['hearing-petitioner', 'hearing-respondent', 'withdraw', 'end-order', 'reinstate', 'modify', 'extend', 'contempt', 'foreign-register', 'foreign-update'];

const TEXT: PacketText = { confidentialTitle: 'C', confidentialInstructions: ['c'], confidentialBanner: 'C' };
const fromDisk = async (form: string) => Uint8Array.from(readFileSync(`src/pdf/templates/${form}.pdf`));

const caseAnswers: Answers = {
  'court.county': 'Allen',
  'court.name': 'Allen Superior',
  'court.division': 'Civil',
  'court.room': '7',
  'case.number': '02D07-2604-PO-000123',
  'petitioner.first': 'Lena',
  'petitioner.last': 'Example',
  'respondent.first': 'Sam',
  'respondent.last': 'Sample',
};

const inputFor = (id: string, answers: Answers = {}): PacketInput => ({
  questionnaire: questionnaires[id],
  answers: { ...caseAnswers, ...answers },
  grounds: [],
  relationship: null,
  convicted: 'unknown',
  incidents: [],
});

describe('questionnaires for forms in an existing case', () => {
  it.each(EXISTING)('%s: every answer has a blank on its form', (id) => {
    const q = questionnaires[id];
    const keys = new Set(packetFor(q).flatMap(({ form }) => pdfMap(form).fields.map((f) => f.key)));
    const missing: string[] = [];
    for (const field of q.sections.flatMap((s) => s.fields)) {
      if (/^(court\.name|court\.county|court\.division|court\.room|case\.number|petitioner\.|respondent\.(first|middle|last))/.test(field.id)) continue;
      if (field.type === 'group') {
        const prefix = field.mapAs ?? field.id;
        if (![...keys].some((k) => k === prefix || k.startsWith(`${prefix}.`))) missing.push(field.id);
      } else if (field.id === 'order.type') {
        // PO-0107 strikes through the order type that does not apply.
        if (!keys.has('strike.exParte')) missing.push(field.id);
      } else if (field.type === 'choice' || field.type === 'yesno') {
        const values = field.type === 'yesno' ? ['yes', 'no'] : field.options!.map((o) => o.value);
        if (!values.some((v) => keys.has(`${field.id}.${v}`)) && !keys.has(field.id)) missing.push(field.id);
      } else if (field.id.endsWith('.amount') ? !keys.has(field.id) : !keys.has(field.id)) {
        // PO-0116 writes its dates in parts.
        if (!['issued', 'violated.date'].includes(field.id)) missing.push(field.id);
      }
    }
    expect(missing).toEqual([]);
  });

  it.each(EXISTING)('%s: builds one public PDF with no confidential file', async (id) => {
    const result = await buildPacket(inputFor(id), fromDisk, TEXT);
    expect(result.confidential).toBeNull();
    const doc = await PDFDocument.load(result.public);
    const formPages = await Promise.all(questionnaires[id].packet.map(async ({ form }) => (await PDFDocument.load(await fromDisk(form))).getPageCount()));
    expect(doc.getPageCount()).toBe(1 + formPages.reduce((a, b) => a + b, 0));
  });
});

describe('per-form rules', () => {
  it('fills the case heading, case number included', () => {
    const { values } = genericValues('PO-0111', inputFor('reinstate', { reason: 'I was in the hospital.' }));
    expect(values['caption.caseNumber']).toBe('02D07-2604-PO-000123');
    expect(values['caption.room']).toBe('7');
    expect(values.reason).toBe('I was in the hospital.');
    expect(values.printedName).toBe('Lena Example');
  });

  it('PO-0107 strikes the order type and the filer that do not apply', () => {
    const p = po0107Values(inputFor('hearing-petitioner', { 'order.type': 'exParte', 'order.date': '2026-04-02' })).values;
    expect([p['strike.exParte'], p['strike.modification.1'], p['strike.respondent'], p['strike.petitioner']]).toEqual([false, true, true, false]);
    expect(p['order.date']).toBe('04/02/2026');
    const r = po0107Values(inputFor('hearing-respondent', { 'order.type': 'modification' })).values;
    expect([r['strike.exParte'], r['strike.modification.1'], r['strike.respondent'], r['strike.petitioner']]).toEqual([true, false, false, true]);
    // The respondent signs their own request.
    expect(r.printedName).toBe('Sam Sample');
  });

  it('PO-0108 checks the box the route decided: withdraw a petition, or end an order', () => {
    expect(genericValues('PO-0108', inputFor('withdraw')).values['dismiss.pending']).toBe(true);
    const end = genericValues('PO-0108', inputFor('end-order', { 'terminate.orderDate': '2026-01-05' })).values;
    expect(end['dismiss.terminate']).toBe(true);
    expect(end['dismiss.pending']).toBeUndefined();
    expect(end['terminate.orderDate']).toBe('01/05/2026');
  });

  it('PO-0115 checks expense boxes from amounts and keeps the phone and animal lists on the form', () => {
    const v = genericValues('PO-0115', inputFor('modify', {
      existing: 'afterHearing',
      'existing.afterHearing.date': '2026-02-01',
      'q9.reimburse': true,
      'q9.reimburse.counseling.amount': '$90',
      'q9.animalsKeep': true,
      'q9.animalsKeep.animals': [{ name: 'Biscuit' }],
      'q9.surrender': true,
      'q9.surrender.items': [{ item: 'Shotgun' }, { item: 'Handgun' }],
    })).values;
    expect(v['existing.afterHearing']).toBe(true);
    expect(v['existing.afterHearing.date']).toBe('02/01/2026');
    expect(v['q9.reimburse.counseling']).toBe(true);
    expect(v['q9.reimburse.counseling.amount']).toBe('90');
    expect(v['q9.animalsKeep.1.name']).toBe('Biscuit');
    expect(v['q9.surrender.items']).toBe('Shotgun\nHandgun');
  });

  it('PO-0116 writes dates as "the ___ day of ______, 20__"', () => {
    const v = po0116Values(inputFor('extend', { issued: '2025-06-09', 'threat.violated': true, 'violated.date': '2026-03-14' })).values;
    expect([v['issued.day'], v['issued.month'], v['issued.year']]).toEqual(['9', 'June', '25']);
    expect([v['violated.day'], v['violated.month'], v['violated.year']]).toEqual(['14', 'March', '26']);
  });

  it('PO-0119 fills only the section for the route, and leaves a new registration\'s case number to the clerk', () => {
    const a = po0119Values(inputFor('foreign-register', { 'a.exParte': 'no', 'a.type': 'civil', 'a.custody': 'yes', 'a.children': [{ name: 'Mia', age: '6', dob: '2020-01-02' }] })).values;
    expect(a['a.name']).toBe('Lena Example');
    expect(a['b.name']).toBeUndefined();
    expect(a['a.exParte.no']).toBe(true);
    expect(a['a.type.civil']).toBe(true);
    expect(a['a.children']).toBe('Mia, 6, 01/02/2020');
    expect(a['caption.caseNumber']).toBe('');
    const b = po0119Values(inputFor('foreign-update', { 'b.extended': '2027-01-01' })).values;
    expect(b['b.name']).toBe('Lena Example');
    expect(b['b.extended']).toBe('01/01/2027');
    expect(b['caption.caseNumber']).toBe('02D07-2604-PO-000123');
  });

  it('PO-0128, the court\'s order, gets only its heading and the respondent\'s address', () => {
    const v = po0128Values(inputFor('contempt', { 'respondent.address': '1 Sample Rd', violation: 'He came to my work.' })).values;
    expect(v['respondent.address']).toBe('1 Sample Rd');
    expect(v.violation).toBeUndefined();
    expect(v.printedName).toBeUndefined();
  });

  it('builds a full sample for review', async () => {
    const result = await buildPacket(inputFor('hearing-respondent', { 'order.type': 'exParte', 'order.date': '2026-04-02', contact: 'PO Box 9, Fort Wayne, IN. 260-555-0100' }), fromDisk, TEXT);
    if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}-po0107.pdf`, result.public);
    expect(result.forms).toEqual([{ form: 'PO-0107', confidential: false, attachmentPages: 0 }]);
  });
});
