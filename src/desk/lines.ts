// Line numbers for filed narratives. Desk wraps each narrative at a fixed width,
// breaking at spaces and keeping paragraph breaks, and numbers the lines from 1.
// The words are never changed.

export interface NumberedLine {
  n: number;
  text: string;
  // Character offsets in the narrative.
  start: number;
  end: number;
  // The first line of a paragraph after the first one.
  newParagraph: boolean;
}

export function wrapNarrative(narrative: string, width: number): NumberedLine[] {
  const lines: NumberedLine[] = [];
  const paragraphs = Array.from(narrative.matchAll(/[^\n]+(?:\n(?!\s*\n)[^\n]+)*/g));

  paragraphs.forEach((paragraph, p) => {
    const offset = paragraph.index;
    const words = Array.from(paragraph[0].matchAll(/\S+/g));
    let first = true;
    let lineStart = -1;
    let lineEnd = -1;

    const push = () => {
      lines.push({
        n: lines.length + 1,
        text: narrative.slice(lineStart, lineEnd),
        start: lineStart,
        end: lineEnd,
        newParagraph: first && p > 0,
      });
      first = false;
    };

    for (const word of words) {
      const start = offset + word.index;
      const end = start + word[0].length;
      if (lineStart === -1) {
        lineStart = start;
        lineEnd = end;
      } else if (end - lineStart <= width) {
        lineEnd = end;
      } else {
        push();
        lineStart = start;
        lineEnd = end;
      }
    }
    if (lineStart !== -1) push();
  });

  return lines;
}

export interface LineRange {
  a: number;
  b: number;
}

/** The lines where `text` appears in the narrative, or null if it isn't there word for word. */
export function findLines(lines: NumberedLine[], narrative: string, text: string): LineRange | null {
  const start = narrative.indexOf(text.trim());
  if (start === -1 || text.trim() === '') return null;
  const end = start + text.trim().length;
  const inside = lines.filter((line) => line.end > start && line.start < end);
  return { a: inside[0].n, b: inside[inside.length - 1].n };
}

/** Paragraphs of the narrative, trimmed. */
export function paragraphsOf(narrative: string): string[] {
  return narrative
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
}
