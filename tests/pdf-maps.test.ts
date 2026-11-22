import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { MapField, PdfMap } from '../src/pdf/stamp';

// Every generated map, checked for mistakes a changed form or anchor could
// cause: a field off the page, or two fields printed on the same spot. (A
// person still compares a filled sample with the blank form after any change.)
const maps: PdfMap[] = readdirSync('content/pdfMaps')
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(`content/pdfMaps/${f}`, 'utf8')));

type Box = { key: string; page: number; x: number; y: number; w: number; h: number };

/** The spots a field prints on: one per line for a multi-line field. */
function boxes(field: MapField): Box[] {
  if (field.kind === 'check') return [{ key: field.key, page: field.page, x: field.x, y: field.y, w: 8, h: 9 }];
  if (field.kind === 'lines') return field.lines.map((l, i) => ({ key: `${field.key}#${i + 1}`, page: field.page, x: l.x, y: l.y, w: l.w, h: 9 }));
  return [{ key: field.key, page: field.page, x: field.x, y: field.y, w: field.w, h: field.kind === 'replace' ? field.h : 9 }];
}

const overlap = (a: Box, b: Box) =>
  a.page === b.page && a.x < b.x + b.w - 1 && b.x < a.x + a.w - 1 && a.y < b.y + b.h - 2 && b.y < a.y + a.h - 2;

describe.each(maps.map((m) => [m.form, m] as const))('%s map', (_, map) => {
  const all = map.fields.flatMap(boxes);

  it('keeps every field on a page of the form', () => {
    for (const box of all) {
      expect(box.page, box.key).toBeGreaterThanOrEqual(1);
      expect(box.page, box.key).toBeLessThanOrEqual(map.pages);
      expect(box.x, box.key).toBeGreaterThan(0);
      expect(box.x + box.w, box.key).toBeLessThanOrEqual(612);
      expect(box.y, box.key).toBeGreaterThan(0);
      expect(box.y, box.key).toBeLessThan(792);
      expect(box.w, box.key).toBeGreaterThan(0);
    }
  });

  it('never prints two fields on the same spot', () => {
    const clashes: string[] = [];
    for (let i = 0; i < all.length; i++) {
      for (let j = i + 1; j < all.length; j++) if (overlap(all[i], all[j])) clashes.push(`${all[i].key} and ${all[j].key}`);
    }
    expect(clashes).toEqual([]);
  });
});
