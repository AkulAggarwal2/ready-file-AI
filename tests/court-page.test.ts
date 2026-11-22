import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { courtForms } from '../src/forms';
import { compareCatalog, formIdFromUrl, pageDate, parseCourtPage } from '../src/forms/courtPage';

// A saved copy of https://www.in.gov/courts/iocs/publications/po-forms/
// (2026-11-21). The scheduled check (tests/court-forms.live.test.ts) compares
// the live page; this keeps content/forms.json in step with the copy.
const snapshot = readFileSync('tests/fixtures/po-forms-page.html', 'utf8');

describe('reading the court forms page', () => {
  const rows = parseCourtPage(snapshot);

  it('finds every form on the page', () => {
    expect(rows).toHaveLength(26);
    expect(rows.find((r) => r.id === 'PO-0100')).toMatchObject({
      revised: '2026-07-01',
      pdfUrl: 'https://www.in.gov/dA/4871ef7848/center-bb-po-form-po-0100.pdf?language_id=1',
    });
    expect(rows.find((r) => r.id === 'COVER')?.wordUrl).toBeNull();
  });

  it('matches the app\'s catalog (content/forms.json) exactly', () => {
    expect(compareCatalog(rows, courtForms)).toEqual([]);
  });

  it('reports a revised form, a new form, and a removed form', () => {
    const changed = rows.map((r) => (r.id === 'PO-0104' ? { ...r, revised: '2027-01-15' } : r)).filter((r) => r.id !== 'PO-0137');
    changed.push({ ...changed[0], id: 'PO-0140', title: 'A new form' });
    expect(compareCatalog(changed, courtForms)).toEqual([
      'PO-0104 revised date changed: 2019-07-01 is now 2027-01-15.',
      'PO-0140 is new on the court\'s page: "A new form".',
      'PO-0137 is no longer on the court\'s page.',
    ]);
  });

  it('reads the page\'s dates and links', () => {
    expect(pageDate('05.14.25')).toBe('2025-05-14');
    expect(pageDate('- -')).toBeNull();
    expect(formIdFromUrl('/dA/x/center-bb-po-form-wv-0101.pdf?language_id=1')).toBe('WV-0101');
    expect(formIdFromUrl('/dA/x/center-bb-po-form-coversheet.pdf')).toBe('COVER');
  });
});
