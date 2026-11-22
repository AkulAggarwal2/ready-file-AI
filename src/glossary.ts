// Plain-language definitions for legal words (content/glossary.json). The
// <Term> and <Glossed> components in src/ui/Term.tsx show them.
import glossaryJson from '../content/glossary.json';

export interface GlossaryEntry {
  id: string;
  // The word as shown at the top of the definition.
  term: string;
  // The words in the app's text that get underlined, in any capitalization.
  matches: string[];
  definition: string;
  source: string;
  verified: boolean;
}

export const glossary: GlossaryEntry[] = glossaryJson.terms;

const byId = new Map(glossary.map((entry) => [entry.id, entry]));
const byMatch = new Map(glossary.flatMap((entry) => entry.matches.map((m) => [m.toLowerCase(), entry.id] as const)));

/** The definition with this id. Throws on a typo, so a missing term fails loudly in tests. */
export function glossaryEntry(id: string): GlossaryEntry {
  const entry = byId.get(id);
  if (!entry) throw new Error(`No glossary term "${id}" in content/glossary.json`);
  return entry;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Longest first, so "domestic or family violence" wins over "family violence".
const pattern = new RegExp(
  `\\b(?:${[...byMatch.keys()].sort((a, b) => b.length - a.length).map(escape).join('|')})\\b`,
  'gi',
);

export type GlossedPart = string | { id: string; text: string };

/**
 * Splits text into plain strings and glossary terms. Only the first mention of
 * each term is marked, so a paragraph never turns into a row of underlines.
 * `skip` lists terms not to mark (for example, one the label already explains).
 */
export function splitTerms(text: string, skip: readonly string[] = []): GlossedPart[] {
  const parts: GlossedPart[] = [];
  const seen = new Set(skip);
  let last = 0;
  for (const match of text.matchAll(pattern)) {
    const id = byMatch.get(match[0].toLowerCase());
    if (!id || seen.has(id)) continue;
    seen.add(id);
    if (match.index > last) parts.push(text.slice(last, match.index));
    parts.push({ id, text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
