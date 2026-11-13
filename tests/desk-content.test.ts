// Content and source checks for ReadyFile Desk (DESK_PROMPT.md sections 4, 8, 9, and 10).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import deskConfigJson from '../content/desk-config.json';
import deskCopyJson from '../content/desk-copy.json';
import deskSampleJson from '../content/desk-sample.json';
import rulesJson from '../content/rules.json';
import { petitions } from '../src/desk/petitions';

// PROMPT.md section 10, plus what Desk's ground rule 2 adds: never say what
// someone "should" do, and never predict an outcome.
const BANNED_PHRASES = [
  'you should',
  'you must',
  'you need to',
  'you will be granted',
  'you qualify',
  'your case is strong',
  'your case is weak',
  'should',
  'will be denied',
  'will be granted',
];

function bannedIn(text: string): string[] {
  const normalized = text.toLowerCase().replace(/[‘’]/g, "'");
  return BANNED_PHRASES.filter((phrase) => new RegExp(`\\b${phrase}\\b`).test(normalized));
}

function allStrings(value: unknown, path = '', skip: string[] = []): { path: string; text: string }[] {
  if (skip.includes(path)) return [];
  if (typeof value === 'string') return [{ path, text: value }];
  if (Array.isArray(value)) return value.flatMap((item, i) => allStrings(item, `${path}[${i}]`, skip));
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, item]) => allStrings(item, path ? `${path}.${key}` : key, skip));
  }
  return [];
}

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [path];
  });
}

describe('banned phrases (acceptance test 14)', () => {
  it('finds none in desk-copy.json, except the advice examples', () => {
    const hits = allStrings(deskCopyJson, '', ['adviceExamples']).flatMap(({ path, text }) =>
      bannedIn(text).map((phrase) => `${path}: "${phrase}"`),
    );
    expect(hits).toEqual([]);
  });

  it('finds none in desk-config.json or rules.json', () => {
    const hits = [...allStrings(deskConfigJson), ...allStrings(rulesJson)].flatMap(({ path, text }) =>
      bannedIn(text).map((phrase) => `${path}: "${phrase}"`),
    );
    expect(hits).toEqual([]);
  });

  it('each advice example does contain a banned phrase, on purpose', () => {
    expect(deskCopyJson.adviceExamples.advice.length).toBeGreaterThan(0);
    for (const example of deskCopyJson.adviceExamples.advice) expect(bannedIn(example)).not.toEqual([]);
    expect(bannedIn(deskCopyJson.adviceExamples.test)).toContain('you should');
  });
});

describe('Desk text style', () => {
  it('matches copy.json punctuation: straight quotes and apostrophes, no double spaces', () => {
    const offenders = allStrings(deskCopyJson).filter(({ text }) => /[‘’“”]| {2}/.test(text));
    expect(offenders).toEqual([]);
  });

  it('uses no she/her for the petitioner (the filing form does not ask pronouns)', () => {
    const offenders = allStrings(deskCopyJson, '', ['adviceExamples']).filter(({ text }) =>
      /\b(she|her|hers|herself)\b/i.test(text),
    );
    expect(offenders).toEqual([]);
  });
});

describe('fictional sample data (section 7)', () => {
  it('uses only 555-01xx phone numbers', () => {
    const phones = deskSampleJson.petitions.map((p) => p.contact.phone).filter((p) => p !== null);
    expect(phones.length).toBeGreaterThan(0);
    for (const phone of phones) expect(phone).toMatch(/^\(\d{3}\) 555-01\d\d$/);
  });

  it('keeps phone numbers out of src/ and the other Desk content files', () => {
    const phone = /\(?\b\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}\b/;
    const files = [...filesUnder('src'), 'content/desk-copy.json', 'content/desk-config.json', 'desk.html'];
    expect(files.filter((file) => phone.test(readFileSync(file, 'utf8')))).toEqual([]);
  });

  it('every incident is the petitioner\'s words, word for word in the narrative', () => {
    for (const petition of petitions) {
      for (const version of [petition.original, petition.amendment]) {
        if (!version) continue;
        for (const incident of version.incidents) expect(version.narrative).toContain(incident.description);
      }
    }
  });
});

describe('where Desk lives (section 4)', () => {
  it('ReadyFile never imports from src/desk/', () => {
    const offenders = filesUnder('src')
      .filter((file) => !file.replace(/\\/g, '/').startsWith('src/desk/'))
      .filter((file) => /from\s+['"][^'"]*\/desk(\/|['"])/.test(readFileSync(file, 'utf8')));
    expect(offenders).toEqual([]);
  });

  it('Desk imports the checker instead of copying it', () => {
    const deskFiles = filesUnder('src/desk');
    expect(deskFiles.some((file) => /from '\.\.\/(\.\.\/)?checker'/.test(readFileSync(file, 'utf8')))).toBe(true);
    for (const file of deskFiles) expect(readFileSync(file, 'utf8')).not.toMatch(/function runChecks/);
  });

  it('desk.html loads nothing from another site, and opens the Desk entry point', () => {
    const html = readFileSync('desk.html', 'utf8');
    expect(html).not.toMatch(/(src|href)="(https?:)?\/\//);
    expect(html).toContain('src="/src/desk/main.tsx"');
    expect(html).toContain('<meta charset="UTF-8" />');
  });

  it('desk.html gets the same Content Security Policy as index.html, with self-hosted fonts allowed', () => {
    const config = readFileSync('vite.config.ts', 'utf8');
    expect(config).toContain("page === 'desk' ? \"font-src 'self'\" : \"font-src 'none'\"");
    expect(config).toMatch(/desk:\s*fileURLToPath\(new URL\('\.\/desk\.html'/);
  });

  it('Desk loads fonts only from @fontsource packages', () => {
    const source = filesUnder('src/desk')
      .map((file) => readFileSync(file, 'utf8'))
      .join('\n');
    expect(source).not.toMatch(/https?:\/\//);
    expect(source).toContain("import '@fontsource/public-sans/latin-400.css'");
    expect(source).toContain("import '@fontsource/literata/latin-400.css'");
  });
});

describe('design (section 9)', () => {
  // Every color in desk.css comes from the section 9 table: no red or green.
  const PALETTE = [
    '#f2f4f6', '#ffffff', '#fff', '#15212e', '#2b3846', '#4a5868', '#66727f', '#d5dce3', '#e1e6eb',
    '#c3cdd8', '#1e3a5f', '#2e5281', '#c9d6e6', '#1d4f91', '#e6eef9', '#e3b341', '#8a5a00', '#3d2a00',
    '#7a4e00', '#fbf1dc', '#fbebc4', '#fbf8f1', '#e8e1d2', '#5b6876', '#4a6a8f', '#dce7f5', '#a9c0e0',
    '#eef1f4', '#b07a12',
  ];

  it('uses only the palette colors', () => {
    const css = readFileSync('src/desk/desk.css', 'utf8')
      .toLowerCase()
      .replace(/\/\*[\s\S]*?\*\//g, '');
    const colors = [...new Set(css.match(/#[0-9a-f]{3,8}\b/g) ?? [])];
    expect(colors.filter((c) => !PALETTE.includes(c))).toEqual([]);
    expect(css).not.toMatch(/\b(red|green|rgb\(|hsl\()/);
  });

  it('has no shadows, and buttons are at least 44 px tall', () => {
    const css = readFileSync('src/desk/desk.css', 'utf8');
    expect(css).not.toMatch(/box-shadow|text-shadow|drop-shadow/);
    expect(css).toMatch(/\.btn \{[^}]*min-height: 44px;/);
  });
});
