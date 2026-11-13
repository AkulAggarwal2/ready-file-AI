import { useEffect, useRef, useState, type ReactNode } from 'react';
import { deskCopy } from '../content';
import { formatShort } from '../format';
import type { LogEntry, Status } from '../state/deskState';
import { useView } from '../state/view';

export function cls(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

/** The page's h1. It takes focus after a screen change, for keyboard and screen reader users. */
export function PageTitle({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLHeadingElement>(null);
  const { navigated } = useView();
  useEffect(() => {
    if (navigated.current) ref.current?.focus();
  }, [navigated]);
  return (
    <h1 ref={ref} id="page-title" tabIndex={-1} className="page-title">
      {children}
    </h1>
  );
}

/**
 * Moves focus to an element after the next render, such as a panel title that
 * replaced the button that was just used.
 */
export function useFocusAfterRender(): (id: string) => void {
  const [target, setTarget] = useState<string | null>(null);
  useEffect(() => {
    if (!target) return;
    document.getElementById(target)?.focus();
    setTarget(null);
  }, [target]);
  return setTarget;
}

export function Breadcrumb({ parent, onParent, current }: { parent: string; onParent: () => void; current: string }) {
  return (
    <nav className="breadcrumb" aria-label={deskCopy.app.breadcrumbLabel}>
      <ol>
        <li>
          <button type="button" className="link-button" onClick={onParent}>
            {parent}
          </button>
        </li>
        <li aria-current="page" className="tnum">
          {current}
        </li>
      </ol>
    </nav>
  );
}

export function StatusChip({ status }: { status: Status }) {
  return (
    <span className={cls('chip', status.onHold && 'chip-hold')}>
      {status.onHold && <ClockIcon />}
      <span className="tnum">{status.text}</span>
    </span>
  );
}

export function QuestionIcon() {
  return (
    <svg className="icon icon-question" viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="7.25" fill="currentColor" />
      <path
        d="M6.1 6.2a1.95 1.95 0 1 1 2.7 1.8c-.55.24-.8.6-.8 1.15v.35"
        fill="none"
        stroke="#fff"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <circle cx="8" cy="11.6" r=".95" fill="#fff" />
    </svg>
  );
}

export function ClockIcon() {
  return (
    <svg className="icon icon-clock" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
      <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M8 4.5V8l2.4 1.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/** Time and event, oldest first. */
export function ActivityLog({ log }: { log: LogEntry[] }) {
  return (
    <ol className="activity">
      {log.map((entry, index) => (
        <li key={index}>
          <span className="activity-time tnum">{formatShort(entry.at)}</span>
          <span className="sr-only">: </span>
          <span>{entry.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** A label and value list, such as the petition fields. */
export function Facts({ items, className }: { items: [string, ReactNode][]; className?: string }) {
  return (
    <dl className={cls('facts', className)}>
      {items.map(([label, value]) => (
        <div key={label} className="fact">
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Wide tables scroll inside their own box on narrow screens, and the box can be scrolled by keyboard. */
export function ScrollBox({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="table-scroll" role="region" aria-label={label} tabIndex={0}>
      {children}
    </div>
  );
}
