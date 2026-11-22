import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { courtForm } from '../forms';
import type { Questionnaire } from '../forms/questionnaire';
import { fits, printable, stamp, wrap, type PdfMap, type StampValues } from './stamp';
import {
  attachmentCaption,
  genericValues,
  pnw0102Values,
  po0100Values,
  po0101Values,
  po0104Values,
  po0107Values,
  po0116Values,
  po0119Values,
  po0128Values, type Attachment, type FormValues, type PacketInput } from './values';

// Builds the filled court forms entirely in the browser; nothing is sent
// anywhere. Public forms and confidential forms are separate PDFs, so the
// Confidential Form can never be printed into the copy served on the other
// person.

const maps = import.meta.glob<PdfMap>('../../content/pdfMaps/*.json', { eager: true, import: 'default' });

/** The map for a form, from content/pdfMaps. */
export function pdfMap(form: string): PdfMap {
  const map = maps[`../../content/pdfMaps/${form}.json`];
  if (!map) throw new Error(`No PDF map for ${form}`);
  return map;
}

/** Reads a court form's PDF. The app bundles them; tests read them from disk. */
export type TemplateLoader = (form: string) => Promise<Uint8Array>;

// Forms with their own builder; any other form is filled by genericValues.
const BUILDERS: Record<string, (input: PacketInput) => FormValues> = {
  'PO-0100': po0100Values,
  'PO-0101': po0101Values,
  'PO-0104': po0104Values,
  'PNW-0102': pnw0102Values,
  'PO-0107': po0107Values,
  'PO-0116': po0116Values,
  'PO-0119': po0119Values,
  'PO-0128': po0128Values,
};

/** A questionnaire's forms, in filing order, with what fills each one. */
export function packetFor(questionnaire: Questionnaire) {
  return questionnaire.packet.map((entry) => ({
    ...entry,
    build: BUILDERS[entry.form] ?? ((input: PacketInput) => genericValues(entry.form, input)),
  }));
}

const PAGE: [number, number] = [612, 792];
const MARGIN = 72;
const BODY = 11;
const LEADING = 15;

interface Fonts {
  regular: PDFFont;
  bold: PDFFont;
}

/**
 * Text that doesn't fit its blank is replaced by "See Attachment <label>",
 * and the full text goes on that attachment, so nothing is cut off.
 */
function moveOverflow(map: PdfMap, built: FormValues, font: PDFFont, labels: Map<string, string>): { values: StampValues; attachments: Attachment[] } {
  const values = { ...built.values };
  const attachments = built.attachments.map((a) => ({ ...a, blocks: [...a.blocks] }));
  // Continued text goes before the attachment's own items, in the form's order.
  const moved = new Map<Attachment, Attachment['blocks']>();
  for (const field of map.fields) {
    const value = values[field.key];
    if (typeof value !== 'string' || value === '' || fits(field, value, font)) continue;
    // A party's name in a caption shrinks to fit rather than saying "see attached".
    if (field.key.startsWith('caption.')) continue;
    // Text with no attachment of its own goes on a general one for the form,
    // so nothing is ever cut off or printed over the form's words.
    const cont = built.continuable[field.key] ?? { label: `to ${map.form}`, heading: `${labels.get(field.key) ?? field.key} (continued)` };
    values[field.key] = field.kind === 'text' && field.w < 120 ? '(see attached)' : `See Attachment ${cont.label}.`;
    let attachment = attachments.find((a) => a.label === cont.label && a.form === map.form);
    if (!attachment) {
      attachment = { label: cont.label, form: map.form, blocks: [] };
      attachments.push(attachment);
    }
    moved.set(attachment, [...(moved.get(attachment) ?? []), { heading: cont.heading, text: value }]);
  }
  for (const [attachment, blocks] of moved) attachment.blocks.unshift(...blocks);
  return { values, attachments };
}

function newPage(doc: PDFDocument): PDFPage {
  return doc.addPage(PAGE);
}

/** Lays out one attachment on as many pages as it needs. Returns how many. */
function drawAttachment(doc: PDFDocument, fonts: Fonts, attachment: Attachment, captionLine: string): number {
  const title = courtForm(attachment.form);
  const heading = `Attachment ${attachment.label}`;
  const subheading = `${title.number}, ${title.title}`;
  const width = PAGE[0] - MARGIN * 2;
  let page = newPage(doc);
  let pages = 1;
  let y = PAGE[1] - MARGIN;

  const header = () => {
    page.drawText(printable(heading), { x: MARGIN, y, size: 13, font: fonts.bold });
    y -= 18;
    for (const line of wrap(subheading, fonts.regular, 10, width)) {
      page.drawText(line, { x: MARGIN, y, size: 10, font: fonts.regular });
      y -= 13;
    }
    page.drawText(printable(captionLine), { x: MARGIN, y, size: 10, font: fonts.regular });
    y -= 26;
  };
  const ensure = (needed: number) => {
    if (y - needed >= MARGIN) return;
    page = newPage(doc);
    pages++;
    y = PAGE[1] - MARGIN;
    header();
  };

  header();
  for (const block of attachment.blocks) {
    ensure(LEADING * 2);
    page.drawText(printable(block.heading), { x: MARGIN, y, size: BODY, font: fonts.bold });
    y -= LEADING;
    for (const line of wrap(block.text, fonts.regular, BODY, width)) {
      ensure(LEADING);
      page.drawText(line, { x: MARGIN, y, size: BODY, font: fonts.regular, color: rgb(0, 0, 0.55) });
      y -= LEADING;
    }
    y -= LEADING / 2;
  }
  return pages;
}

/** The first page of a file: how to use it. It is not filed. */
function drawInstructions(doc: PDFDocument, fonts: Fonts, title: string, lines: string[]) {
  const page = newPage(doc);
  const width = PAGE[0] - MARGIN * 2;
  let y = PAGE[1] - MARGIN;
  for (const line of wrap(title, fonts.bold, 15, width)) {
    page.drawText(line, { x: MARGIN, y, size: 15, font: fonts.bold });
    y -= 20;
  }
  y -= 8;
  for (const paragraph of lines) {
    for (const line of wrap(paragraph, fonts.regular, BODY, width)) {
      page.drawText(line, { x: MARGIN, y, size: BODY, font: fonts.regular });
      y -= LEADING;
    }
    y -= LEADING / 2;
  }
}

const WARNING = rgb(0.7, 0, 0);

/** Marks every page of a confidential file, at the top and bottom edges the forms leave free. */
function markConfidential(doc: PDFDocument, fonts: Fonts, banner: string) {
  for (const page of doc.getPages()) {
    const text = printable(banner);
    const size = 8;
    const x = (page.getWidth() - fonts.bold.widthOfTextAtSize(text, size)) / 2;
    page.drawText(text, { x, y: page.getHeight() - 9, size, font: fonts.bold, color: WARNING });
    page.drawText(text, { x, y: 8, size, font: fonts.bold, color: WARNING });
  }
}

export interface PacketText {
  confidentialTitle: string;
  confidentialInstructions: string[];
  confidentialBanner: string;
}

export interface PacketResult {
  // The petition and the other public forms.
  public: Uint8Array;
  // The Confidential Form, on its own, when the packet has one.
  confidential: Uint8Array | null;
  // The court forms, and how many pages each one's attachments took.
  forms: { form: string; confidential: boolean; attachmentPages: number }[];
}

async function newFile(title: string): Promise<{ doc: PDFDocument; fonts: Fonts }> {
  const doc = await PDFDocument.create();
  doc.setTitle(title);
  doc.setProducer('ReadyFile');
  doc.setCreator('ReadyFile');
  return { doc, fonts: { regular: await doc.embedFont(StandardFonts.Helvetica), bold: await doc.embedFont(StandardFonts.HelveticaBold) } };
}

/**
 * Fills a petition packet. Signature and date lines, and anything the clerk
 * or court fills in, are left blank.
 */
export async function buildPacket(input: PacketInput, load: TemplateLoader, text: PacketText): Promise<PacketResult> {
  const { instructions } = input.questionnaire;
  const pub = await newFile(instructions.title);
  const conf = await newFile(text.confidentialTitle);
  drawInstructions(pub.doc, pub.fonts, instructions.title, instructions.lines);
  drawInstructions(conf.doc, conf.fonts, text.confidentialTitle, text.confidentialInstructions);

  const captionLine = attachmentCaption(input);
  const labels = new Map(input.questionnaire.sections.flatMap((section) => section.fields.map((field) => [field.id, field.label] as [string, string])));
  const affidavitPages = Number(input.answers.affidavitPages) || 0;
  const forms: PacketResult['forms'] = [];

  const packet = packetFor(input.questionnaire);
  for (const { form, build, confidential = false } of packet) {
    const { doc: out, fonts } = confidential ? conf : pub;
    const map = pdfMap(form);
    const template = await PDFDocument.load(await load(form));
    const font = await template.embedFont(StandardFonts.Helvetica);
    const { values, attachments } = moveOverflow(map, build(input), font, labels);

    // Lay out the attachments first, in a scratch file, to count their pages
    // for question 10 (pages attached).
    const scratch = await PDFDocument.create();
    const scratchFonts: Fonts = { regular: await scratch.embedFont(StandardFonts.Helvetica), bold: await scratch.embedFont(StandardFonts.HelveticaBold) };
    const attachmentPages = attachments.reduce((n, a) => n + drawAttachment(scratch, scratchFonts, a, captionLine), 0);
    if (map.fields.some((f) => f.key === 'q10')) values.q10 = String(attachmentPages + affidavitPages);

    await stamp(template, map, values);
    const pages = await out.copyPages(template, template.getPageIndices());
    pages.forEach((page) => out.addPage(page));
    for (const attachment of attachments) drawAttachment(out, fonts, attachment, captionLine);
    forms.push({ form, confidential, attachmentPages });
  }

  const hasConfidential = packet.some((p) => p.confidential);
  if (hasConfidential) markConfidential(conf.doc, conf.fonts, text.confidentialBanner);
  return { public: await pub.doc.save(), confidential: hasConfidential ? await conf.doc.save() : null, forms };
}
