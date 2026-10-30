import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import copyJson from '../content/copy.json';
import rulesJson from '../content/rules.json';
import resourcesJson from '../content/resources.json';
import { validateRules } from '../src/checker';

// Section 10. Matched case-insensitively, with curly apostrophes treated as straight ones.
const BANNED_PHRASES = [
  'you should',
  'you must',
  'you need to',
  'you will be granted',
  'you qualify',
  'your case is strong',
  'your case is weak',
];

function allStrings(value: unknown, path = ''): { path: string; text: string }[] {
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((item, i) => allStrings(item, `${path}[${i}]`));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => allStrings(item, path ? `${path}.${key}` : key));
  }
  return [];
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe('banned phrases (acceptance test 7)', () => {
  const files = { 'copy.json': copyJson, 'rules.json': rulesJson, 'resources.json': resourcesJson };

  for (const [file, json] of Object.entries(files)) {
    it(`finds none in ${file}`, () => {
      const hits = allStrings(json).flatMap(({ path, text }) => {
        const normalized = text.toLowerCase().replace(/[‘’]/g, "'");
        return BANNED_PHRASES.filter((phrase) => normalized.includes(phrase)).map((phrase) => `${path}: "${phrase}"`);
      });
      expect(hits).toEqual([]);
    });
  }

  it('would catch a banned phrase', () => {
    const hits = allStrings({ a: 'Maybe You Should call.' }).filter(({ text }) =>
      BANNED_PHRASES.some((p) => text.toLowerCase().includes(p)),
    );
    expect(hits).toHaveLength(1);
  });
});

describe('rules.json', () => {
  it('is valid', () => {
    expect(() => validateRules(rulesJson.rules)).not.toThrow();
  });
});

describe('UI text lives in copy.json', () => {
  it('has no hardcoded phone numbers in the source code', () => {
    const phone = /\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b|\b911\b/;
    const offenders = filesUnder('src').filter((file) => phone.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('no storage or outside network calls in the source code (sections 8 and acceptance test 6)', () => {
  const forbidden = [
    /localStorage/,
    /sessionStorage/,
    /document\.cookie/,
    /indexedDB/,
    /\bfetch\(/,
    /XMLHttpRequest/,
    /WebSocket/,
    /sendBeacon/,
    /history\.(push|replace)State/,
  ];

  it('src uses none of these', () => {
    const offenders = filesUnder('src').flatMap((file) => {
      const source = readFileSync(file, 'utf8');
      return forbidden.filter((pattern) => pattern.test(source)).map((pattern) => `${file}: ${pattern}`);
    });
    expect(offenders).toEqual([]);
  });

  it('index.html loads nothing from another site', () => {
    const html = readFileSync('index.html', 'utf8');
    expect(html).not.toMatch(/(src|href)="(https?:)?\/\//);
  });
});
