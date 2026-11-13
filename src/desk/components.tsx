import { useEffect, useRef, type ReactNode } from 'react';
import { deskCopy, plural } from './content';
import type { LineRange, NumberedLine } from './lines';
import type { LogEntry, Status } from './model';
import { formatShort } from './time';

/** The page title. It takes focus when the screen opens, for keyboard and screen reader users. */
export function ScreenTitle({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return (
    <h1 ref={ref} tabIndex={-1} className="desk-title">
      {children}
    </h1>
  );
}

export function Breadcrumb({ parent, current, onParent }: { parent: string; current: string; onParent: () => void }) {
  return (
    <nav aria-label={deskCopy.petition.breadcrumbLabel} className="breadcrumb">
      <button type="button" className="link-button" onClick={onParent}>
        {parent}
      </button>
      <span aria-hidden="true"> / </span>
      <span aria-current="page" className="tabular">
        {current}
      </span>
    </nav>
  );
}

/** A question mark in a circle, marking a question the counter would ask. */
export function QuestionIcon() {
  return (
    <svg className="question-icon" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6 6.2a2 2 0 1 1 2.8 1.8c-.5.3-.8.6-.8 1.2v.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="8" cy="11.8" r=".9" fill="currentColor" />
    </svg>
  );
}

export function statusText(status: Status): string {
  const s = deskCopy.list.status;
  switch (status.kind) {
    case 'notHeld':
      return s.notHeld;
    case 'inQueue':
      return s.inQueue;
    case 'held':
      return plural(s.held, { time: formatShort(status.until) });
    case 'asked':
      return s.asked;
    case 'sent':
      return plural(s.sent, { time: formatShort(status.at) });
  }
}

export function StatusChip({ status }: { status: Status }) {
  const timed = status.kind === 'held' || status.kind === 'asked';
  return <span className={`status-chip${timed ? ' status-chip-hold' : ''}`}>{statusText(status)}</span>;
}

/** The petitioner's words on numbered lines, in the serif face. */
export function NumberedText({
  lines,
  highlight,
  label,
  highlightRef,
}: {
  lines: NumberedLine[];
  highlight?: LineRange | null;
  label: string;
  highlightRef?: React.Ref<HTMLLIElement>;
}) {
  return (
    // Focusable so keyboard users can scroll it sideways on narrow screens.
    <ol className="numbered" aria-label={label} tabIndex={0}>
      {lines.map((line) => {
        const lit = highlight && line.n >= highlight.a && line.n <= highlight.b;
        return (
          <li
            key={line.n}
            value={line.n}
            ref={lit && line.n === highlight!.a ? highlightRef : undefined}
            tabIndex={lit && line.n === highlight!.a ? -1 : undefined}
            className={`${line.newParagraph ? 'new-paragraph' : ''}${lit ? ' lit' : ''}`.trim() || undefined}
          >
            <span className="line-number" aria-hidden="true">
              {line.n}
            </span>
            <span className="line-text">{line.text}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function ActivityLog({ entries, title }: { entries: LogEntry[]; title: string }) {
  return (
    <section className="panel" aria-labelledby="activity-title">
      <h2 id="activity-title" className="panel-title">
        {title}
      </h2>
      <ol className="activity">
        {entries.map((entry, i) => (
          <li key={i}>
            <span className="activity-time tabular">{formatShort(entry.at)}</span>
            <span>{entry.text}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
