import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import copyJson from '../content/copy.json';
import rulesJson from '../content/rules.json';
import resourcesJson from '../content/resources.json';
import safetyJson from '../content/safety-questions.json';
import deskCopyJson from '../content/desk-copy.json';
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
  const files = {
    'copy.json': copyJson,
    'rules.json': rulesJson,
    'resources.json': resourcesJson,
    'safety-questions.json': safetyJson,
  };

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

describe('ReadyFile Desk content (DESK_PROMPT.md sections 10 and 12)', () => {
  const normalize = (text: string) => text.toLowerCase().replace(/[‘’]/g, "'");
  const { adviceExamples, ...deskWithoutAdvice } = deskCopyJson;

  it('desk-copy.json has no banned phrases outside adviceExamples (acceptance test 14)', () => {
    const hits = allStrings(deskWithoutAdvice).flatMap(({ path, text }) =>
      BANNED_PHRASES.filter((phrase) => normalize(text).includes(phrase)).map((phrase) => `${path}: "${phrase}"`),
    );
    expect(hits).toEqual([]);
  });

  it('the advice examples do contain a banned phrase, on purpose', () => {
    expect(adviceExamples.some((text) => BANNED_PHRASES.some((phrase) => normalize(text).includes(phrase)))).toBe(true);
  });

  it('desk-copy.json and every staffText use no he, she, her, him, hers, or his (acceptance test 16)', () => {
    const pronoun = /\b(she|he|her|him|hers|his)\b/i;
    const staffTexts = rulesJson.rules.flatMap((rule) => ('staffText' in rule ? allStrings(rule.staffText, rule.id) : []));
    const hits = [...allStrings(deskCopyJson), ...staffTexts].filter(({ text }) => pronoun.test(text));
    expect(hits).toEqual([]);
  });

  it('ReadyFile never imports from src/desk (acceptance test 13)', () => {
    const offenders = filesUnder('src')
      .filter((file) => !file.startsWith(join('src', 'desk')))
      .filter((file) => /from ['"][./]*desk\//.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
