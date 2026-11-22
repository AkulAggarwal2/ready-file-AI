import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { courtForms } from '../src/forms';
import { compareCatalog, parseCourtPage } from '../src/forms/courtPage';

// Checks the court's live forms page against the app. It runs only when
// COURT_CHECK is set (npm run check:court-forms, and weekly in
// .github/workflows/court-forms.yml), so ordinary test runs stay offline.
//
// When it fails, a form changed on the court's page. Download the new PDF
// into src/pdf/templates/, update content/forms.json, check the anchors in
// content/pdfMaps/anchors/<FORM>.json against the new form, run
// node scripts/build-pdf-maps.mjs, and look at a filled sample.
const PAGE = 'https://www.in.gov/courts/iocs/publications/po-forms/';
const sha256 = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

async function get(url: string): Promise<Response> {
  const response = await fetch(url, { headers: { 'User-Agent': 'court-forms-check' } });
  if (!response.ok) throw new Error(`${url} returned ${response.status}`);
  return response;
}

describe.skipIf(!process.env.COURT_CHECK)('the court forms page, live', () => {
  it('lists the same forms, titles, revised dates and links as content/forms.json', async () => {
    const rows = parseCourtPage(await (await get(PAGE)).text());
    expect(rows.length, 'no forms found: the page layout may have changed').toBeGreaterThan(0);
    expect(compareCatalog(rows, courtForms)).toEqual([]);
  }, 60_000);

  it('has the same PDF as each blank form ReadyFile fills (src/pdf/templates)', async () => {
    const changed: string[] = [];
    for (const form of courtForms) {
      const path = `src/pdf/templates/${form.id}.pdf`;
      if (!existsSync(path)) continue;
      const live = new Uint8Array(await (await get(form.pdfUrl)).arrayBuffer());
      if (sha256(live) !== sha256(readFileSync(path))) changed.push(`${form.id}: the court's PDF differs from ${path}`);
    }
    expect(changed).toEqual([]);
  }, 120_000);
});
