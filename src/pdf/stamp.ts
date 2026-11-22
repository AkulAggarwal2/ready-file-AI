import { rgb, StandardFonts, type PDFDocument, type PDFFont, type PDFPage } from 'pdf-lib';
import { printable } from './printable';

const PAPER = rgb(1, 1, 1);

// Prints answers onto the court's own PDF pages, on the blanks a map names
// (content/pdfMaps/<FORM>.json, made by scripts/build-pdf-maps.mjs).

export interface MapBox {
  x: number;
  y: number;
  w: number;
}

export type MapField =
  | ({ key: string; page: number; kind: 'text'; size?: number } & MapBox)
  | { key: string; page: number; kind: 'check'; x: number; y: number }
  | { key: string; page: number; kind: 'replace'; x: number; y: number; w: number; h: number }
  | { key: string; page: number; kind: 'strike'; x: number; y: number; w: number }
  | { key: string; page: number; kind: 'lines'; lines: MapBox[]; size?: number; columns?: number[] };

export interface PdfMap {
  form: string;
  pages: number;
  revision: string;
  fields: MapField[];
}

// A text answer, a checked box, or table rows (for a "lines" field with columns).
export type StampValue = string | boolean | string[][];

export type StampValues = Record<string, StampValue | undefined>;

export const TEXT_SIZE = 10;
const MIN_SIZE = 7.5;
const INK = rgb(0, 0, 0.55);

export { printable } from './printable';

/**
 * Splits text into lines. Line i is no wider than widths[i] (the last width
 * repeats), since a blank that starts after a label is shorter than the
 * full lines under it. Words longer than a line are broken.
 */
export function wrap(text: string, font: PDFFont, size: number, widths: number | number[]): string[] {
  const all = Array.isArray(widths) ? widths : [widths];
  const widthAt = (i: number) => all[Math.min(i, all.length - 1)];
  const lines: string[] = [];
  for (const paragraph of printable(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= widthAt(lines.length)) {
        line = next;
        continue;
      }
      if (line) lines.push(line);
      line = word;
      while (font.widthOfTextAtSize(line, size) > widthAt(lines.length)) {
        // At least one character per line, even if it is wider than the line.
        let cut = Math.max(1, line.length - 1);
        while (cut > 1 && font.widthOfTextAtSize(line.slice(0, cut), size) > widthAt(lines.length)) cut--;
        lines.push(line.slice(0, cut));
        line = line.slice(cut);
      }
    }
    lines.push(line);
  }
  // Trailing empty lines from a final newline carry nothing.
  while (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/** Whether text fits in a field without being cut off. */
export function fits(field: MapField, text: string, font: PDFFont): boolean {
  if (field.kind === 'text') return font.widthOfTextAtSize(printable(text), MIN_SIZE) <= field.w;
  if (field.kind === 'lines') return wrap(text, font, field.size ?? TEXT_SIZE, widthsOf(field.lines)).length <= field.lines.length;
  return true;
}

const widthsOf = (boxes: MapBox[]) => boxes.map((b) => b.w);

// A party's name in a caption may shrink further, since it can't move to an attachment.
const CAPTION_MIN_SIZE = 5;

function drawFitted(page: PDFPage, font: PDFFont, text: string, box: MapBox, size = TEXT_SIZE, min = MIN_SIZE) {
  let s = size;
  const clean = printable(text);
  while (s > min && font.widthOfTextAtSize(clean, s) > box.w) s -= 0.5;
  page.drawText(clean, { x: box.x, y: box.y, size: s, font, color: INK });
}

/**
 * Prints every value whose key is in the map. Values for keys the map does
 * not have are ignored, so one set of values can serve several forms.
 * Returns the keys whose text did not fit, so the caller can move it to an
 * attachment instead.
 */
export async function stamp(doc: PDFDocument, map: PdfMap, values: StampValues, pageOffset = 0): Promise<string[]> {
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const overflow: string[] = [];

  for (const field of map.fields) {
    const value = values[field.key];
    if (value === undefined || value === false || value === '') continue;
    const page = doc.getPage(pageOffset + field.page - 1);

    if (field.kind === 'check') {
      if (value === true) page.drawText('X', { x: field.x, y: field.y, size: 11, font: bold, color: INK });
      continue;
    }

    if (field.kind === 'strike') {
      // Strikes through wording that does not apply, as the form asks.
      if (value === true) page.drawLine({ start: { x: field.x, y: field.y }, end: { x: field.x + field.w, y: field.y }, thickness: 1.2, color: INK });
      continue;
    }

    if (field.kind === 'replace') {
      // Covers the form's placeholder text, then prints the answer in its
      // place, in the form's own black so it reads as part of the sentence.
      const text = printable(String(value));
      let size = 11;
      while (size > MIN_SIZE && font.widthOfTextAtSize(text, size) > field.w) size -= 0.5;
      page.drawRectangle({ x: field.x - 1, y: field.y - 3, width: field.w + 2, height: field.h, color: PAPER });
      page.drawText(text, { x: field.x, y: field.y, size, font, color: rgb(0, 0, 0) });
      continue;
    }

    if (field.kind === 'text') {
      const text = String(value);
      if (!fits(field, text, font)) overflow.push(field.key);
      drawFitted(page, font, text, field, field.size, field.key.startsWith('caption.') ? CAPTION_MIN_SIZE : MIN_SIZE);
      continue;
    }

    // Lines: table rows go one per line, in columns; text wraps across the lines.
    if (Array.isArray(value)) {
      const columns = field.columns ?? [field.lines[0].x];
      value.slice(0, field.lines.length).forEach((row, i) => {
        const line = field.lines[i];
        row.forEach((cell, c) => {
          const x = Math.max(columns[c] ?? line.x, line.x);
          const right = c + 1 < columns.length ? columns[c + 1] - 6 : line.x + line.w;
          drawFitted(page, font, cell, { x, y: line.y, w: right - x }, field.size);
        });
      });
      if (value.length > field.lines.length) overflow.push(field.key);
      continue;
    }

    const size = field.size ?? TEXT_SIZE;
    const wrapped = wrap(String(value), font, size, widthsOf(field.lines));
    if (wrapped.length > field.lines.length) overflow.push(field.key);
    wrapped.slice(0, field.lines.length).forEach((text, i) => {
      const line = field.lines[i];
      page.drawText(text, { x: line.x, y: line.y, size, font, color: INK });
    });
  }

  return overflow;
}
