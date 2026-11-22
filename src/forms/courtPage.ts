import type { CourtForm } from './types';

// Reads the court's protection order forms page
// (https://www.in.gov/courts/iocs/publications/po-forms/) so a check can tell
// when the court adds, removes, or revises a form. The app itself never
// fetches the page; only the scheduled check does (tests/court-forms.live.test.ts).

export interface CourtPageRow {
  id: string;
  title: string;
  created: string | null;
  revised: string | null;
  wordUrl: string | null;
  pdfUrl: string;
}

const SITE = 'https://www.in.gov';

const NAMED: Record<string, string> = { amp: '&', nbsp: ' ', quot: '"', apos: "'", rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', sect: '§' };

const decode = (text: string) =>
  text
    .replace(/<[^>]+>/g, '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCodePoint(Number(n)))
    .replace(/&(\w+);/g, (m, name: string) => NAMED[name] ?? m)
    .replace(/\s+/g, ' ')
    .trim();

/** "07.01.26" (mm.dd.yy) as "2026-07-01". Blank or "- -" is null. */
export function pageDate(text: string): string | null {
  const m = /^(\d{2})\.(\d{2})\.(\d{2})$/.exec(text.trim());
  return m ? `20${m[3]}-${m[1]}-${m[2]}` : null;
}

/** The form id a PDF link names: "center-bb-po-form-po-0100.pdf" is PO-0100; the cover sheet is COVER. */
export function formIdFromUrl(url: string): string | null {
  const m = /center-bb-po-form-([\w-]+)\.pdf/.exec(url);
  if (!m) return null;
  return m[1] === 'coversheet' ? 'COVER' : m[1].toUpperCase();
}

/** Every form row on the page: its number, title, dates, and links. */
export function parseCourtPage(html: string): CourtPageRow[] {
  const rows: CourtPageRow[] = [];
  for (const tr of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/g)) {
    const cells = [...tr[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => m[1]);
    if (cells.length < 6) continue;
    const pdf = /href="([^"]*\.pdf[^"]*)"/.exec(cells[5])?.[1];
    if (!pdf) continue;
    const id = formIdFromUrl(pdf);
    if (!id) continue;
    const word = /href="([^"]*\.docx?[^"]*)"/.exec(cells[4])?.[1];
    const absolute = (href: string) => (href.startsWith('http') ? href : `${SITE}${href}`);
    rows.push({
      id,
      title: decode(cells[1]),
      created: pageDate(decode(cells[2])),
      revised: pageDate(decode(cells[3])),
      wordUrl: word ? absolute(word) : null,
      pdfUrl: absolute(pdf),
    });
  }
  return rows;
}

/** Titles compare the same whatever quotes, dashes or spacing the site's editor used. */
const sameText = (text: string) => text.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();

/** How the page differs from the app's catalog (content/forms.json), as sentences. Empty means they match. */
export function compareCatalog(page: CourtPageRow[], catalog: CourtForm[]): string[] {
  const differences: string[] = [];
  const known = new Map(catalog.map((form) => [form.id, form]));
  const listed = new Set(page.map((row) => row.id));
  for (const row of page) {
    const form = known.get(row.id);
    if (!form) {
      differences.push(`${row.id} is new on the court's page: "${row.title}".`);
      continue;
    }
    if (sameText(form.title) !== sameText(row.title)) differences.push(`${row.id} title changed: "${form.title}" is now "${row.title}".`);
    if (form.revised !== row.revised) differences.push(`${row.id} revised date changed: ${form.revised ?? 'none'} is now ${row.revised ?? 'none'}.`);
    if (form.pdfUrl !== row.pdfUrl) differences.push(`${row.id} PDF link changed (a new upload): ${row.pdfUrl}`);
    if (form.wordUrl !== row.wordUrl) differences.push(`${row.id} Word link changed: ${row.wordUrl ?? 'none'}`);
  }
  for (const form of catalog) if (!listed.has(form.id)) differences.push(`${form.id} is no longer on the court's page.`);
  return differences;
}
