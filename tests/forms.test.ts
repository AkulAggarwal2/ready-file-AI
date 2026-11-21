import { describe, expect, it } from 'vitest';
import { courtForm, courtForms } from '../src/forms';

// The forms on https://www.in.gov/courts/iocs/publications/po-forms/, checked 2026-11-21.
const OFFICIAL_IDS = [
  'COVER',
  'PNW-0100', 'PNW-0101', 'PNW-0102',
  'PO-0100', 'PO-0101', 'PO-0102', 'PO-0103', 'PO-0104', 'PO-0106', 'PO-0107', 'PO-0108',
  'PO-0111', 'PO-0115', 'PO-0116', 'PO-0119', 'PO-0126', 'PO-0128', 'PO-0137',
  'WV-0100', 'WV-0101', 'WV-0102', 'WV-0103', 'WV-0104', 'WV-0105', 'WV-0107',
];

describe('court form catalog (content/forms.json)', () => {
  it('lists every form on the court page, once, in page order', () => {
    expect(courtForms.map((form) => form.id)).toEqual(OFFICIAL_IDS);
  });

  it('gives every form a title, a PDF, and dates in YYYY-MM-DD', () => {
    for (const form of courtForms) {
      expect(form.title, form.id).not.toBe('');
      expect(form.pdfUrl, form.id).toMatch(/^https:\/\/www\.in\.gov\/dA\/\w+\/center-bb-po-form-[\w-]+\.pdf\?language_id=1$/);
      expect(form.created, form.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (form.revised) expect(form.revised, form.id).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('only the cover sheet has no Word version and no form number', () => {
    expect(courtForms.filter((form) => !form.wordUrl).map((form) => form.id)).toEqual(['COVER']);
    expect(courtForms.filter((form) => !form.number).map((form) => form.id)).toEqual(['COVER']);
  });

  it('never fills a court, clerk, or reference form in full', () => {
    for (const form of courtForms) {
      if (['court', 'clerk', 'reference'].includes(form.filler)) expect(form.generate, form.id).not.toBe('fill');
    }
  });

  it('looks forms up by id and rejects unknown ids', () => {
    expect(courtForm('PO-0104').title).toBe('Confidential Form (to accompany Petition for Order and Request)');
    expect(() => courtForm('PO-0120')).toThrow();
  });
});
