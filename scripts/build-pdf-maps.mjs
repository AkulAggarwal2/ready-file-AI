#!/usr/bin/env node
// Dev tool: turns the readable anchors in content/pdfMaps/anchors/<FORM>.json
// into exact positions on the court's PDF, written to content/pdfMaps/<FORM>.json.
//
// The court's forms have no fillable fields, so each answer is printed on the
// blank line it belongs to. An anchor names a line by its text ("^COUNTY OF")
// and which blank on it to use, so a reviewer can check a map against the
// form without measuring anything.
//
// Needs pdftotext (poppler). Only the team runs this, when a form or its
// anchors change; the app and the tests read the generated maps.
//
//   node scripts/build-pdf-maps.mjs            # every form with anchors
//   node scripts/build-pdf-maps.mjs PO-0100    # one form
//   node scripts/build-pdf-maps.mjs --lines PO-0100 3   # print page 3's lines, to write anchors

import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const TEMPLATES = join(ROOT, 'src/pdf/templates');
const ANCHORS = join(ROOT, 'content/pdfMaps/anchors');
const OUT = join(ROOT, 'content/pdfMaps');

const decode = (text) =>
  text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

/** Every page's lines: words grouped by their top edge, left to right. */
function readPages(form) {
  const html = execFileSync('pdftotext', ['-bbox', join(TEMPLATES, `${form}.pdf`), '-'], { encoding: 'utf8' });
  const pages = [];
  for (const pageMatch of html.matchAll(/<page width="([\d.]+)" height="([\d.]+)">([\s\S]*?)<\/page>/g)) {
    const height = Number(pageMatch[2]);
    const words = [...pageMatch[3].matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)" xMax="([\d.]+)" yMax="([\d.]+)">([^<]*)<\/word>/g)].map(
      (m) => ({ x0: +m[1], y0: +m[2], x1: +m[3], y1: +m[4], text: decode(m[5]) }),
    );
    words.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
    const lines = [];
    for (const word of words) {
      const line = lines.find((l) => Math.abs(l.y0 - word.y0) < 3);
      if (line) line.words.push(word);
      else lines.push({ y0: word.y0, words: [word] });
    }
    for (const line of lines) {
      line.words.sort((a, b) => a.x0 - b.x0);
      line.text = line.words.map((w) => w.text).join(' ');
      line.y1 = Math.max(...line.words.map((w) => w.y1));
      line.blanks = blanksIn(line);
    }
    lines.sort((a, b) => a.y0 - b.y0);
    pages.push({ width: Number(pageMatch[1]), height, lines });
  }
  return pages;
}

/** Runs of 3 or more underscores in a line, with their x range (split by character within a word). */
function blanksIn(line) {
  const blanks = [];
  for (const word of line.words) {
    const perChar = (word.x1 - word.x0) / word.text.length;
    for (const m of word.text.matchAll(/_{3,}/g)) {
      blanks.push({ x0: word.x0 + m.index * perChar, x1: word.x0 + (m.index + m[0].length) * perChar });
    }
  }
  return blanks;
}

/** The nth line on the page whose text matches. */
function findLine(page, find, nth, where) {
  const re = new RegExp(find);
  const matches = page.lines.filter((l) => re.test(l.text));
  if (!matches[nth]) throw new Error(`${where}: no line ${nth} matching /${find}/ (found ${matches.length})`);
  return matches[nth];
}

const round = (n) => Math.round(n * 10) / 10;

/** A box on a blank, in PDF points from the bottom left; y is the text baseline. */
function box(page, line, blank, padLeft = 2) {
  return {
    x: round(blank.x0 + padLeft),
    y: round(page.height - line.y1 + 2),
    w: round(blank.x1 - blank.x0 - padLeft),
  };
}

function resolve(form, pages, anchor) {
  const where = `${form} ${anchor.key}`;
  const page = pages[anchor.page - 1];
  if (!page) throw new Error(`${where}: no page ${anchor.page}`);
  const line = findLine(page, anchor.find, anchor.nth ?? 0, where);
  const kind = anchor.kind ?? 'text';

  if (kind === 'lines') {
    // The blank-only lines that follow the found line (or the found line's
    // own blank first, when "includeFound" is set).
    const start = page.lines.indexOf(line);
    const boxes = [];
    if (anchor.includeFound) boxes.push(box(page, line, line.blanks[anchor.blank ?? line.blanks.length - 1], anchor.padLeft));
    for (const next of page.lines.slice(start + 1 + (anchor.skip ?? 0))) {
      if (boxes.length >= anchor.count) break;
      if (next.blanks.length === 0 || next.text.replace(/[_\s.,;()]/g, '').length > 0) break;
      boxes.push(box(page, next, next.blanks[0]));
    }
    if (boxes.length !== anchor.count) throw new Error(`${where}: wanted ${anchor.count} lines, found ${boxes.length}`);
    return { key: anchor.key, page: anchor.page, kind, lines: boxes, size: anchor.size, columns: anchor.columns };
  }

  // Boxed forms (like PO-0104) have labels in boxes instead of blank lines.
  if (kind === 'after' || kind === 'below' || kind === 'checkWord') {
    const re = new RegExp(anchor.word);
    const words = line.words.filter((w) => re.test(w.text));
    const word = words[anchor.wordNth ?? 0];
    if (!word) throw new Error(`${where}: line "${line.text}" has no word /${anchor.word}/`);
    const baseline = page.height - line.y1 + 2;
    if (kind === 'checkWord') {
      // The checkbox sits just left of its word.
      return { key: anchor.key, page: anchor.page, kind: 'check', x: round(word.x0 - 11.5), y: round(baseline + 0.5) };
    }
    if (kind === 'after') {
      return { key: anchor.key, page: anchor.page, kind: 'text', x: round(word.x1 + (anchor.dx ?? 4)), y: round(baseline), w: anchor.w, size: anchor.size };
    }
    const step = anchor.lineHeight ?? 12;
    const lines = Array.from({ length: anchor.count ?? 1 }, (_, i) => ({
      x: round(word.x0 + (anchor.dx ?? 0)),
      y: round(baseline - step * (i + 1)),
      w: anchor.w,
    }));
    return { key: anchor.key, page: anchor.page, kind: 'lines', lines, size: anchor.size };
  }

  if (kind === 'replace') {
    // Covers a bracketed placeholder in the form's text, like "[party name]"
    // on PNW-0102, so the answer can be printed in its place.
    const words = line.words.filter((w) => new RegExp(anchor.word).test(w.text));
    const first = words[anchor.wordNth ?? 0];
    if (!first) throw new Error(`${where}: line "${line.text}" has no word /${anchor.word}/`);
    const from = line.words.indexOf(first);
    const endRe = new RegExp(anchor.toWord ?? anchor.word);
    const toIndex = line.words.findIndex((w, i) => i >= from && endRe.test(w.text));
    const last = line.words[toIndex];
    return {
      key: anchor.key,
      page: anchor.page,
      kind: 'replace',
      x: round(first.x0),
      // pdftotext's box includes the descent; the baseline is about a fifth up.
      y: round(page.height - line.y1 + (line.y1 - line.y0) * 0.22),
      w: round(last.x1 - first.x0),
      h: round(line.y1 - line.y0),
    };
  }

  if (kind === 'mark') {
    // An X just left of a choice that has no blank to check, like the
    // affirmation's "a." and "b." on PO-0100.
    return { key: anchor.key, page: anchor.page, kind: 'check', x: round(line.words[0].x0 - 14), y: round(page.height - line.y1 + 2) };
  }
  const blank = line.blanks[anchor.blank ?? 0];
  if (!blank) throw new Error(`${where}: line "${line.text}" has no blank ${anchor.blank ?? 0}`);
  if (kind === 'check') {
    // An X in the middle of the blank before the choice.
    return { key: anchor.key, page: anchor.page, kind, x: round((blank.x0 + blank.x1) / 2 - 3), y: round(page.height - line.y1 + 2) };
  }
  return { key: anchor.key, page: anchor.page, kind, ...box(page, line, blank, anchor.padLeft), size: anchor.size };
}

function build(form) {
  const spec = JSON.parse(readFileSync(join(ANCHORS, `${form}.json`), 'utf8'));
  const pages = readPages(form);
  const fields = spec.anchors.map((anchor) => resolve(form, pages, anchor));
  const keys = new Set();
  for (const f of fields) {
    if (keys.has(f.key)) throw new Error(`${form}: key ${f.key} is used twice`);
    keys.add(f.key);
  }
  const out = {
    _about: `Generated by scripts/build-pdf-maps.mjs from content/pdfMaps/anchors/${form}.json. Do not edit by hand.`,
    form,
    pages: pages.length,
    revision: spec.revision,
    fields,
  };
  writeFileSync(join(OUT, `${form}.json`), `${JSON.stringify(out, null, 2)}\n`);
  console.log(`${form}: ${fields.length} fields`);
}

const args = process.argv.slice(2);
if (args[0] === '--lines') {
  const pages = readPages(args[1]);
  const page = pages[Number(args[2]) - 1];
  page.lines.forEach((l, i) => console.log(`${String(i).padStart(3)} y=${l.y0.toFixed(0).padStart(3)} b=${l.blanks.length} ${l.text}`));
} else {
  const forms = args.length ? args : readdirSync(ANCHORS).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
  for (const form of forms) build(form);
}
