import { PDFDocument, rgb, StandardFonts, type PDFFont, type PDFPage } from 'pdf-lib';
import { courtForm } from '../forms';
import { ADULT_PACKET_FORMS } from '../forms/packets';
import { fits, printable, stamp, wrap, type PdfMap, type StampValues } from './stamp';
import { fullName, pnw0102Values, po0100Values, po0104Values, type Attachment, type FormValues, type PacketInput } from './values';

// Builds the filled court forms as one PDF, in filing order, entirely in the
// browser. Nothing is sent anywhere.

const maps = import.meta.glob<PdfMap>('../../content/pdfMaps/*.json', { eager: true, import: 'default' });

/** The map for a form, from content/pdfMaps. */
export function pdfMap(form: string): PdfMap {
  const map = maps[`../../content/pdfMaps/${form}.json`];
  if (!map) throw new Error(`No PDF map for ${form}`);
  return map;
}

/** Reads a court form's PDF. The app bundles them; tests read them from disk. */
export type TemplateLoader = (form: string) => Promise<Uint8Array>;

const BUILDERS: Record<string, (input: PacketInput) => FormValues> = {
  'PO-0100': po0100Values,
  'PO-0104': po0104Values,
  'PNW-0102': pnw0102Values,
};

// The adult packet's forms, in filing order, with what fills each one.
export const ADULT_PACKET = ADULT_PACKET_FORMS.map((entry) => ({ ...entry, build: BUILDERS[entry.form] }));

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
function moveOverflow(map: PdfMap, built: FormValues, font: PDFFont): { values: StampValues; attachments: Attachment[] } {
  const values = { ...built.values };
  const attachments = built.attachments.map((a) => ({ ...a, blocks: [...a.blocks] }));
  for (const field of map.fields) {
    const value = values[field.key];
    const cont = built.continuable[field.key];
    if (!cont || typeof value !== 'string' || value === '' || fits(field, value, font)) continue;
    values[field.key] = `See Attachment ${cont.label}.`;
    let attachment = attachments.find((a) => a.label === cont.label && a.form === map.form);
    if (!attachment) {
      attachment = { label: cont.label, form: map.form, blocks: [] };
      attachments.push(attachment);
    }
    attachment.blocks.unshift({ heading: cont.heading, text: value });
  }
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

/** The first page: how to use the packet. It is not filed. */
function drawInstructions(doc: PDFDocument, fonts: Fonts, lines: string[]) {
  const page = newPage(doc);
  const width = PAGE[0] - MARGIN * 2;
  let y = PAGE[1] - MARGIN;
  page.drawText('Before you file (do not file this page)', { x: MARGIN, y, size: 15, font: fonts.bold });
  y -= 28;
  for (const paragraph of lines) {
    for (const line of wrap(paragraph, fonts.regular, BODY, width)) {
      page.drawText(line, { x: MARGIN, y, size: BODY, font: fonts.regular });
      y -= LEADING;
    }
    y -= LEADING / 2;
  }
}

export interface PacketResult {
  bytes: Uint8Array;
  // The court forms in the file, and how many pages each one's attachments took.
  forms: { form: string; attachmentPages: number }[];
}

/**
 * Fills the adult petition packet. Signature and date lines, and anything the
 * clerk or court fills in, are left blank.
 */
export async function buildAdultPacket(input: PacketInput, load: TemplateLoader, instructions: string[]): Promise<PacketResult> {
  const out = await PDFDocument.create();
  out.setTitle('Protection order forms');
  out.setProducer('ReadyFile');
  out.setCreator('ReadyFile');
  const fonts: Fonts = { regular: await out.embedFont(StandardFonts.Helvetica), bold: await out.embedFont(StandardFonts.HelveticaBold) };
  drawInstructions(out, fonts, instructions);

  const captionLine = `${fullName(input.answers, 'petitioner') || 'Petitioner'} v. ${fullName(input.answers, 'respondent') || 'Respondent'}`;
  const affidavitPages = Number(input.answers.affidavitPages) || 0;
  const forms: PacketResult['forms'] = [];

  for (const { form, build } of ADULT_PACKET) {
    const map = pdfMap(form);
    const template = await PDFDocument.load(await load(form));
    const font = await template.embedFont(StandardFonts.Helvetica);
    const { values, attachments } = moveOverflow(map, build(input), font);

    // Lay out the attachments first, in a scratch file, to count their pages
    // for question 10 (pages attached).
    const scratch = await PDFDocument.create();
    const scratchFonts: Fonts = { regular: await scratch.embedFont(StandardFonts.Helvetica), bold: await scratch.embedFont(StandardFonts.HelveticaBold) };
    const attachmentPages = attachments.reduce((n, a) => n + drawAttachment(scratch, scratchFonts, a, captionLine), 0);
    if (form === 'PO-0100') values.q10 = String(attachmentPages + affidavitPages);

    await stamp(template, map, values);
    const pages = await out.copyPages(template, template.getPageIndices());
    pages.forEach((page) => out.addPage(page));
    for (const attachment of attachments) drawAttachment(out, fonts, attachment, captionLine);
    forms.push({ form, attachmentPages });
  }

  return { bytes: await out.save(), forms };
}
