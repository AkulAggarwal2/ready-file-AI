import { readFileSync, writeFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';
import { courtForms } from '../src/forms';
import { questionnaires, validateQuestionnaire, type Answers, type Questionnaire } from '../src/forms/questionnaire';
import { createIncident } from '../src/organizer';
import { buildPacket, packetFor, pdfMap, type PacketText } from '../src/pdf/packet';
import { printable } from '../src/pdf/stamp';
import { loadTemplate } from '../src/pdf/templates';
import { courtDate, pnw0102Values, po0100Values, po0101Values, po0104Values, type PacketInput } from '../src/pdf/values';
import { LENA_FOUR_INCIDENTS, LENA_FOUR_PLACES } from '../src/samples/lena';

// All names, numbers and addresses here are fictional.
const questionnaire = questionnaires['petition-adult'];

const answers: Answers = {
  'court.county': 'Allen',
  'court.name': 'Allen Superior',
  'petitioner.first': 'Lena',
  'petitioner.last': 'Example',
  'respondent.first': 'Sam',
  'respondent.middle': 'Q.',
  'respondent.last': 'Sample',
  q3: '34',
  'q4.cases': Array.from({ length: 6 }, (_, i) => ({ caseName: `Case ${i + 1}`, caseNumber: `02D01-2601-PO-00${i}`, countyState: 'Allen, IN' })),
  q5: ['a', 'c'],
  'q6.attorney': 'no',
  q6: 'PO Box 100, Fort Wayne, IN 46801',
  'q9.noContact': true,
  'q9.stayAway': true,
  'q9.stayAway.place': 'residence',
  'q9.stayAway.address': '100 Example Lane, Fort Wayne, IN',
  'q9.owners': 'Lena Example',
  'q9.animalsKeep': true,
  'q9.animalsKeep.animals': [{ name: 'Biscuit', ageType: '3 year old cat' }, { name: 'Pepper' }, { name: 'Clover', ageType: 'rabbit' }],
  'q9.reimburse': true,
  'q9.reimburse.medical.amount': '$250',
  // Hidden: the reimburse box is checked, but phones is not, so this never prints.
  'q9.phones.numbers': [{ numberUser: '260-555-0100, Lena' }],
  affirm: 'a',
  'restrained.dob': '1991-05-02',
  'restrained.sex': 'male',
  'restrained.phone.cell': '(260) 555-0142',
  'petitioner.homeAddress': '100 Example Lane, Fort Wayne, IN 46801',
  'petitioner.dob': '1993-08-09',
  notify: 'yes',
  'notify.method': 'text',
  protected: [1, 2, 3, 4].map((n) => ({ name: `Child ${n}`, age: `${n}`, sex: 'female' })),
};

function lenaIncidents() {
  return LENA_FOUR_INCIDENTS.split('\n\n').map((description, i) =>
    createIncident({
      description,
      place: LENA_FOUR_PLACES[i],
      present: 'Lena Example',
      acts: i === 3 ? ['caused-harm', 'placed-in-fear'] : ['stalking'],
      date: i === 3 ? { kind: 'exact', value: '2026-03-14' } : { kind: 'approximate', text: ['January 2026', 'February 2026', 'Early March 2026'][i] },
    }),
  );
}

const input: PacketInput = {
  questionnaire,
  answers,
  grounds: ['stalking', 'domestic-violence'],
  relationship: 'dating',
  convicted: 'unknown',
  incidents: lenaIncidents(),
};

const ADULT_PACKET = packetFor(questionnaires['petition-adult']);
const TEXT: PacketText = {
  confidentialTitle: 'CONFIDENTIAL',
  confidentialInstructions: ['Give only to the clerk.'],
  confidentialBanner: 'CONFIDENTIAL - DO NOT SERVE',
};
/** Every page content stream in a PDF, decompressed, upper-cased: text pdf-lib draws shows up as hex glyph codes. */
function pageText(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes);
  const parts: string[] = [];
  let at = 0;
  while ((at = raw.indexOf('stream', at)) !== -1) {
    let start = at + 6;
    if (raw[start] === 0x0d) start++;
    if (raw[start] === 0x0a) start++;
    const end = raw.indexOf('endstream', start);
    if (end === -1) break;
    const body = raw.subarray(start, end);
    try {
      parts.push(inflateSync(body).toString('latin1'));
    } catch {
      parts.push(body.toString('latin1'));
    }
    at = end + 9;
  }
  return parts.join('\n').toUpperCase();
}
const hex = (t: string) => [...t].map((ch) => ch.charCodeAt(0).toString(16).padStart(2, '0')).join('').toUpperCase();

const fromDisk = async (form: string) => Uint8Array.from(readFileSync(`src/pdf/templates/${form}.pdf`));

describe('questionnaire content', () => {
  it.each(['petition-adult', 'petition-child'])('%s is valid, and every section belongs to a form the app fills', (id) => {
    const q = questionnaires[id];
    expect(() => validateQuestionnaire(JSON.parse(JSON.stringify(q)))).not.toThrow();
    const filled = courtForms.filter((f) => f.generate === 'fill').map((f) => f.id);
    for (const section of q.sections) expect(filled).toContain(section.form);
  });

  it('the child questionnaire drops support for the filer, which PO-0101 does not have', () => {
    const ids = questionnaires['petition-child'].sections.flatMap((s) => s.fields.map((f) => f.id));
    expect(ids).not.toContain('q9.maintenance');
    expect(ids).toEqual(expect.arrayContaining(['child.first', 'child.last', 'q1.other.detail']));
  });

  it('rejects a condition on an unknown field', () => {
    const broken: Questionnaire = JSON.parse(JSON.stringify(questionnaire));
    broken.sections[0].fields[0].showIf = { field: 'nope', equals: true };
    expect(() => validateQuestionnaire(broken)).toThrow(/unknown field/);
  });

  it.each(['adult', 'child'] as const)('%s: only uses field ids the PDF maps know, so every answer lands on the form', (variant) => {
    const questionnaire = questionnaires[`petition-${variant}`];
    const keys = new Set(packetFor(questionnaire).flatMap(({ form }) => pdfMap(form).fields.map((f) => f.key)));
    // Fields that feed a value under another name: names, groups, phones, choices and helpers.
    const indirect = /^(child\.(first|middle|last)|petitioner\.(first|middle|last)|respondent\.(first|middle|last)|court\.|q2\.nonFamily|q2\.offender\.lifetime|q4\.cases|q5|q6\.attorney|q9\.(animals\w+\.animals|surrender\.items|phones\.numbers|reimburse\.\w+\.amount)|affirm|affidavitPages|household|protected|notify|.*\.phone\.|.*\.sex|restrained\.scars$)/;
    const unmapped = questionnaire.sections.flatMap((s) => s.fields.map((f) => f.id)).filter((id) => !keys.has(id) && !indirect.test(id));
    expect(unmapped).toEqual([]);
  });
});

describe('PDF maps', () => {
  it('exist for every form in both packets and match its page count', async () => {
    for (const { form } of [...ADULT_PACKET, ...packetFor(questionnaires['petition-child'])]) {
      const map = pdfMap(form);
      const doc = await PDFDocument.load(await fromDisk(form));
      expect(doc.getPageCount(), form).toBe(map.pages);
      expect(map.revision, form).not.toBe('');
      for (const field of map.fields) expect(field.page, field.key).toBeLessThanOrEqual(map.pages);
    }
  });

  it('keep the court’s revision footer, so a new version of a form is caught', async () => {
    // The footer text is in each template; a court update changes it.
    for (const { form } of ADULT_PACKET) {
      const raw = new TextDecoder('latin1').decode(await fromDisk(form));
      expect(raw.startsWith('%PDF-'), form).toBe(true);
    }
    expect(pdfMap('PO-0100').revision).toBe('Rev. by OJA. 07/2026');
    expect(courtForms.find((f) => f.id === 'PO-0100')?.revised).toBe('2026-07-01');
  });
});

describe('values for PO-0100', () => {
  const { values, attachments } = po0100Values(input);

  it('checks every ground (question 1), the relationship (question 2), and the acts (question 7)', () => {
    expect([values['q1.a'], values['q1.b'], values['q1.c'], values['q1.d']]).toEqual([true, false, true, false]);
    expect(values['q2.dating']).toBe(true);
    expect(values['q7.stalking']).toBe(true);
    expect(values['q7.caused-harm']).toBe(true);
    expect(values['q7.harassment']).toBe(false);
  });

  it('puts 3 incidents on the form and the 4th on Attachment 8a', () => {
    expect(values['q8.1.date']).toBe('January 2026');
    expect(values['q8.3.place']).toBe('My new apartment');
    expect(values['q8.continued']).toBe(true);
    const a8 = attachments.find((a) => a.label === '8a')!;
    expect(a8.blocks.map((b) => b.heading)).toEqual(['Incident #4']);
    expect(a8.blocks[0].text).toContain('Date of Incident #4: 03/14/2026');
  });

  it('puts 5 cases on the form and the rest on Attachment 4a, and extra animals on 9(a)', () => {
    expect((values['q4.rows'] as string[][]).length).toBe(5);
    expect(values['q4.continued']).toBe(true);
    expect(attachments.find((a) => a.label === '4a')!.blocks).toHaveLength(1);
    expect(values['q9.animalsKeep.2.name']).toBe('Pepper');
    expect(attachments.find((a) => a.label === '9(a)')!.blocks[0].text).toContain('Clover');
  });

  it('never prints an answer to a field that is hidden', () => {
    expect(values['q9.phones.1.numberUser']).toBeUndefined();
    expect(values['q9.phones']).toBe('');
  });

  it('fills reimbursement amounts and checks their boxes', () => {
    expect(values['q9.reimburse.medical']).toBe(true);
    expect(values['q9.reimburse.medical.amount']).toBe('250');
    expect(values['q9.reimburse.shelter']).toBe(false);
  });

  it('leaves the signature date blank and prints the name', () => {
    expect(values.printedName).toBe('Lena Example');
    expect(values['affirm.a']).toBe(true);
    expect(Object.keys(values).some((k) => /date$/i.test(k) && k.startsWith('sign'))).toBe(false);
  });

  it('uses question 2b to 2d only when the person is not family or household', () => {
    const v = po0100Values({ ...input, relationship: 'none', answers: { ...answers, 'q2.nonFamily': 'harassment' } }).values;
    expect([v['q2.b'], v['q2.c'], v['q2.d']]).toEqual([false, false, true]);
    expect(v['q2.dating']).toBeUndefined();
  });
});

describe('values for PO-0101 (filed on behalf of a child)', () => {
  const childInput: PacketInput = {
    ...input,
    questionnaire: questionnaires['petition-child'],
    answers: {
      ...answers,
      'child.first': 'Mia',
      'child.last': 'Example',
      'q1.other.detail': 'Aunt with temporary custody',
      q5: ['c', 'd'],
      'q9.maintenance': true,
    },
    grounds: ['sex-grooming'],
    relationship: 'none',
    childRole: 'other',
    incidents: [createIncident({ description: 'He messaged her every night.', acts: ['sex-grooming', 'harassment'] })],
  };
  const { values } = po0101Values({ ...childInput, answers: { ...childInput.answers, 'q2.nonFamily': 'sex-grooming' } });

  it('names the child as Petitioner and the filer as next friend', () => {
    expect(values['caption.child']).toBe('Mia Example');
    expect(values['caption.nextFriend']).toBe('Lena Example');
    expect(values['caption.petitioner']).toBeUndefined();
    expect(values.printedName).toBe('Mia Example');
  });

  it('checks the filer\'s role (question 1) and describes "other"', () => {
    expect([values['q1.parent'], values['q1.guardian'], values['q1.other']]).toEqual([false, false, true]);
    expect(values['q1.other.detail']).toBe('Aunt with temporary custody');
    expect(values['q1.a']).toBeUndefined();
  });

  it('uses the child form\'s lines for question 2, 5 and 7', () => {
    expect(values['q2.nf.sex-grooming']).toBe(true);
    expect(values['q2.nf.stalking']).toBe(false);
    expect(values['q2.d']).toBeUndefined();
    expect([values['q5.a'], values['q5.c'], values['q5.d']]).toEqual([false, true, true]);
    expect(values['q7.sex-grooming']).toBe(true);
    expect(values['q7.harassment']).toBe(true);
  });

  it('never prints support for the filer, which PO-0101 does not have', () => {
    expect(values['q9.maintenance'] || undefined).toBeUndefined();
    expect(pdfMap('PO-0101').fields.some((f) => f.key === 'q9.maintenance')).toBe(false);
  });

  it('names the child "by next friend" on the Confidential Form and the Notice of Exclusion', () => {
    expect(po0104Values(childInput).values['caption.petitioner']).toBe('Mia Example, by next friend Lena Example');
    const pnw = pnw0102Values(childInput).values;
    expect(pnw['caption.petitioner']).toBe('Mia Example, by next friend Lena Example');
    expect(pnw['text.insertName']).toBe('Lena Example');
  });

  it('builds the child packet: PO-0101 and PNW-0102 public, PO-0104 separate', async () => {
    const result = await buildPacket(childInput, fromDisk, TEXT);
    expect(result.forms.map((f) => [f.form, f.confidential])).toEqual([
      ['PO-0101', false],
      ['PNW-0102', false],
      ['PO-0104', true],
    ]);
    expect((await PDFDocument.load(result.public)).getPageCount()).toBe(1 + 8 + result.forms[0].attachmentPages + 2);
    if (process.env.PDF_OUT) writeFileSync(`${process.env.PDF_OUT}-child.pdf`, result.public);
  });
});

describe('values for PO-0104 and PNW-0102', () => {
  it('splits phone numbers, checks boxes, and moves a 4th protected person to an attachment', () => {
    const { values, attachments } = po0104Values(input);
    expect(values['restrained.phone.cell.area']).toBe('260');
    expect(values['restrained.phone.cell.number']).toBe('555-0142');
    expect(values['restrained.name']).toBe('Sam Q. Sample');
    expect(values['restrained.sex.male']).toBe(true);
    expect(values['restrained.dob']).toBe('05/02/1991');
    expect(values['notify.text']).toBe(true);
    expect(values['protected.3.name']).toBe('Child 3');
    expect(attachments[0].form).toBe('PO-0104');
    expect(attachments[0].blocks[0].text).toContain('Child 4');
  });

  it('fills the Notice of Exclusion from the caption', () => {
    const { values } = pnw0102Values(input);
    expect(values['caption.county']).toBe('Allen');
    expect(values['text.insertName']).toBe('Lena Example');
    expect(values.filedWithClerk).toBe(true);
  });

  it('writes dates the way the court does', () => {
    expect(courtDate('2026-03-14')).toBe('03/14/2026');
    expect(courtDate('Early March')).toBe('Early March');
  });

  it('prints characters the standard fonts lack as look-alikes or "?"', () => {
    expect(printable('“José” — O’Neil 你')).toBe('"José" - O\'Neil ?');
  });
});

describe('the packet PDFs', () => {
  it('puts the public forms in one file and the Confidential Form alone in another', async () => {
    const result = await buildPacket(input, fromDisk, TEXT);
    const pub = await PDFDocument.load(result.public);
    const conf = await PDFDocument.load(result.confidential!);
    expect(result.forms.map((f) => [f.form, f.confidential])).toEqual([
      ['PO-0100', false],
      ['PNW-0102', false],
      ['PO-0104', true],
    ]);
    // PO-0100 has attachments 4a, 8a and 9(a); PO-0104 has one for the 4th protected person.
    expect(result.forms[0].attachmentPages).toBe(3);
    expect(result.forms[2].attachmentPages).toBe(1);
    // Instructions page + PO-0100 (8) + its 3 attachment pages + PNW-0102 (2).
    expect(pub.getPageCount()).toBe(1 + 8 + 3 + 2);
    // Instructions page + PO-0104 (2) + its attachment page.
    expect(conf.getPageCount()).toBe(1 + 2 + 1);
    expect(conf.getTitle()).toBe('CONFIDENTIAL');
    if (process.env.PDF_OUT) {
      writeFileSync(`${process.env.PDF_OUT}-public.pdf`, result.public);
      writeFileSync(`${process.env.PDF_OUT}-confidential.pdf`, result.confidential!);
    }
  });

  it('never puts confidential details in the public file', async () => {
    const secret = { ...input, answers: { ...answers, 'petitioner.homeAddress': '777 Hidden Way', 'restrained.ssn': '000-12-3456' } };
    const result = await buildPacket(secret, fromDisk, TEXT);
    const pub = pageText(result.public);
    for (const value of ['777 Hidden Way', '000-12-3456']) expect(pub.includes(hex(value))).toBe(false);
    expect(pageText(result.confidential!).includes(hex('777 Hidden Way'))).toBe(true);
    // The petitioner's name is public, so the check itself can find text.
    expect(pub.includes(hex('Lena Example'))).toBe(true);
  });

  it('moves text too long for its blank to an attachment instead of cutting it off', async () => {
    const long = { ...input, answers: { ...answers, q6: 'A very long public mailing address. '.repeat(12) } };
    const result = await buildPacket(long, fromDisk, TEXT);
    expect(result.forms[0].attachmentPages).toBe(4);
  });

  it('loads the bundled templates in the app without a network request', async () => {
    const bytes = await loadTemplate('PO-0104');
    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
  });
});
