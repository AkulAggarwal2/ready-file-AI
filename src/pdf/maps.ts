import type { PdfMap } from './stamp';

// Where each answer is printed on each court form (content/pdfMaps, built by
// scripts/build-pdf-maps.mjs).
const maps = import.meta.glob<PdfMap>('../../content/pdfMaps/*.json', { eager: true, import: 'default' });

/** The map for a form, from content/pdfMaps. */
export function pdfMap(form: string): PdfMap {
  const map = maps[`../../content/pdfMaps/${form}.json`];
  if (!map) throw new Error(`No PDF map for ${form}`);
  return map;
}

/** Whether the form has a blank for this key, or for anything under "key.". */
export function hasKey(form: string, key: string): boolean {
  return pdfMap(form).fields.some((field) => field.key === key || field.key.startsWith(`${key}.`));
}
