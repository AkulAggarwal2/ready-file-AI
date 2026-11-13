import type { LineRange, NumberedLine } from '../lineWrap';
import { cls } from './common';

/**
 * Her words on numbered lines, in the serif face on paper. The text is shown
 * exactly as filed; Desk only adds the line numbers.
 */
export function NumberedText({
  lines,
  label,
  highlight = null,
}: {
  lines: NumberedLine[];
  label: string;
  highlight?: LineRange | null;
}) {
  return (
    <div className="paper numbered" role="group" aria-label={label}>
      {lines.map((line) => {
        const on = highlight !== null && line.number >= highlight.first && line.number <= highlight.last;
        return (
          <div
            key={line.number}
            className={cls('line', line.startsParagraph && 'line-paragraph', on && 'line-highlight')}
            data-line={line.number}
          >
            <span className="line-number">{line.number}</span>
            {on ? <mark className="line-text">{line.text}</mark> : <span className="line-text">{line.text}</span>}
          </div>
        );
      })}
    </div>
  );
}
