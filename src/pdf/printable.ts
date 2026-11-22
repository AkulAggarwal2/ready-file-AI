// What the court PDFs can print. The standard PDF fonts (Helvetica) only have
// the Windows-1252 letters: English plus common Western European accents.
// Kept apart from the PDF code, so screens can warn without loading pdf-lib.

// Windows-1252 characters outside Latin-1 that the standard fonts also have.
const EXTRA = 'ŠšŽžŒœŸƒ€‹›•ˆ˜™†‡‰';

const fits = (ch: string) => ch === '\n' || (ch >= ' ' && ch <= '~') || (ch >= '¡' && ch <= 'ÿ') || EXTRA.includes(ch);

// Punctuation with a plain look-alike.
const LOOK_ALIKES: Record<string, string> = {
  '‘': "'", '’': "'", '‚': "'", '′': "'",
  '“': '"', '”': '"', '„': '"', '″': '"',
  '–': '-', '—': '-', '−': '-', '…': '...',
  ' ': ' ', ' ': ' ', ' ': ' ', '\t': ' ',
};

/**
 * The closest letter the fonts have: drop accent marks one at a time until
 * the letter can print, so "ễ" prints as "ê" and "ł" stays "?". Anything
 * with no close letter becomes "?".
 */
function nearest(ch: string): string {
  if (fits(ch)) return ch;
  if (LOOK_ALIKES[ch]) return LOOK_ALIKES[ch];
  const [base, ...marks] = [...ch.normalize('NFD')];
  for (let keep = marks.length - 1; keep >= 0; keep--) {
    const candidate = (base + marks.slice(0, keep).join('')).normalize('NFC');
    if ([...candidate].length === 1 && fits(candidate)) return candidate;
  }
  return '?';
}

/** Text as the court PDF will print it. */
export function printable(text: string): string {
  return [...text.normalize('NFC')].map(nearest).join('');
}

/**
 * Letters in the text that will not print as typed (look-alike punctuation
 * is fine), so the screen can warn her to correct them by hand.
 */
export function unprintable(text: string): string[] {
  const letters = new Set<string>();
  for (const ch of text.normalize('NFC')) if (!fits(ch) && !LOOK_ALIKES[ch]) letters.add(ch);
  return [...letters];
}
