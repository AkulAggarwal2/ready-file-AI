// Numbers the lines of a filed narrative, so staff and the magistrate can point
// to "lines 3 to 5". The text itself is never changed: each line is an exact
// slice of what was filed.

export interface NumberedLine {
  number: number;
  text: string;
  // Where the line is in the narrative (character offsets).
  start: number;
  end: number;
  paragraph: number;
  // True for the first line of every paragraph after the first.
  startsParagraph: boolean;
}

export interface TextRange {
  start: number;
  end: number;
}

export interface LineRange {
  first: number;
  last: number;
}

/**
 * Wraps a narrative at `width` characters per line, breaking only at spaces and
 * keeping paragraph breaks. Lines are numbered from 1. The blank line between
 * paragraphs gets no number. A word longer than a line gets a line of its own.
 */
export function wrapNarrative(text: string, width: number): NumberedLine[] {
  const lines: NumberedLine[] = [];
  let paragraph = 0;
  let lineStart = -1;
  let lineEnd = -1;
  let startsParagraph = false;

  const push = () => {
    lines.push({
      number: lines.length + 1,
      text: text.slice(lineStart, lineEnd),
      start: lineStart,
      end: lineEnd,
      paragraph,
      startsParagraph,
    });
  };

  for (const match of text.matchAll(/\S+/g)) {
    const start = match.index;
    const end = start + match[0].length;

    if (lineStart === -1) {
      lineStart = start;
      lineEnd = end;
      continue;
    }

    const gap = text.slice(lineEnd, start);
    if (/\n[^\S\n]*\n/.test(gap)) {
      push();
      paragraph += 1;
      startsParagraph = true;
      lineStart = start;
    } else if (gap.includes('\n') || end - lineStart > width) {
      push();
      startsParagraph = false;
      lineStart = start;
    }
    lineEnd = end;
  }

  if (lineStart !== -1) push();
  return lines;
}

/** The lines that a part of the narrative appears on. */
export function linesFor(lines: NumberedLine[], range: TextRange): LineRange {
  const covered = lines.filter((line) => line.end > range.start && line.start < range.end);
  if (covered.length === 0) throw new Error('That text is not in the narrative.');
  return { first: covered[0].number, last: covered[covered.length - 1].number };
}

/**
 * Finds each piece of text in the narrative, in order, word for word. Returns
 * null for a piece that isn't there.
 */
export function locateAll(narrative: string, pieces: string[]): (TextRange | null)[] {
  let from = 0;
  return pieces.map((piece) => {
    const at = piece.trim() === '' ? -1 : narrative.indexOf(piece, from);
    if (at === -1) return null;
    from = at + piece.length;
    return { start: at, end: at + piece.length };
  });
}

/**
 * The parts of each paragraph that no incident covers, such as "I am scared to
 * be at home." Whitespace around them is left out.
 */
export function uncoveredParts(narrative: string, lines: NumberedLine[], covered: TextRange[]): TextRange[] {
  const paragraphs = new Map<number, TextRange>();
  for (const line of lines) {
    const p = paragraphs.get(line.paragraph);
    paragraphs.set(line.paragraph, p ? { start: p.start, end: line.end } : { start: line.start, end: line.end });
  }

  const sorted = [...covered].sort((a, b) => a.start - b.start);
  const parts: TextRange[] = [];
  const keep = (start: number, end: number) => {
    const text = narrative.slice(start, end);
    const lead = text.length - text.trimStart().length;
    const trail = text.length - text.trimEnd().length;
    if (/[\p{L}\p{N}]/u.test(text)) parts.push({ start: start + lead, end: end - trail });
  };

  for (const p of paragraphs.values()) {
    let cursor = p.start;
    for (const range of sorted) {
      if (range.end <= p.start || range.start >= p.end) continue;
      if (range.start > cursor) keep(cursor, range.start);
      cursor = Math.max(cursor, range.end);
    }
    if (cursor < p.end) keep(cursor, p.end);
  }
  return parts;
}
