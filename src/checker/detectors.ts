import type { ContactKind } from './types';

// Simple patterns for contact details a petitioner may have typed into an
// incident. They only point out what might be one. They never change the text.
const PATTERNS: Record<ContactKind, RegExp> = {
  // Ten digits, with or without an area code in parentheses and separators.
  phone: /\(?\b\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g,
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  // A house number, up to two words, then a street word.
  address:
    /\b\d{1,5}\s+(?:[A-Za-z][\w.'-]*\s+){0,2}(?:St|Street|Ave|Avenue|Rd|Road|Dr|Drive|Ln|Lane|Blvd|Boulevard|Ct|Court|Way|Pl|Place)\b\.?/gi,
};

export interface ContactSpan {
  kind: ContactKind;
  start: number;
  end: number;
}

/** Finds possible contact details of the given kinds, in text order, without overlaps. */
export function findContactDetails(text: string, kinds: readonly ContactKind[]): ContactSpan[] {
  const spans = kinds.flatMap((kind) =>
    Array.from(text.matchAll(PATTERNS[kind]), (match) => ({
      kind,
      start: match.index,
      end: match.index + match[0].length,
    })),
  );
  spans.sort((a, b) => a.start - b.start || b.end - a.end);
  const kept: ContactSpan[] = [];
  for (const span of spans) {
    if (kept.length === 0 || span.start >= kept[kept.length - 1].end) kept.push(span);
  }
  return kept;
}
