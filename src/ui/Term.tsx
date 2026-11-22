import { Fragment, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { copy, fill } from '../content';
import { glossaryEntry, splitTerms } from '../glossary';

const SHOW_DELAY = 300;
const HIDE_DELAY = 150;
const GAP = 8;
const GUTTER = 16;

// Only one definition is open at a time. Opening one closes this one.
let closeOpen: (() => void) | null = null;

// Older browsers (Safari before 17, Firefox before 125) have no popover
// support. There the definition is a fixed box shown with the hidden attribute.
function popoverSupported(): boolean {
  return typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;
}

interface TermProps {
  // The term's id in content/glossary.json. A "?" button can explain several.
  id: string | readonly string[];
  // The words to underline. Leave out for the small "?" button.
  children?: ReactNode;
}

/**
 * A word with a plain-language definition (content/glossary.json). Unlike
 * Tooltip, which only hints at what a button does, this opens on a tap too, so
 * it works on phones: tap, click, or press Enter to open it, and tap anywhere
 * else or press Escape to close it. A mouse resting on the word also opens it.
 * Screen readers hear the definition as the button's description.
 *
 * With no children it is a small "?" button, for a label (like a checkbox)
 * where the words themselves can't be a button.
 */
export function Term({ id, children }: TermProps) {
  const entries = (typeof id === 'string' ? [id] : id).map(glossaryEntry);
  const tipId = useId();
  const supported = popoverSupported();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const tip = useRef<HTMLSpanElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Opened by a click or tap: it stays until she closes it, not just until the mouse leaves.
  const pinned = useRef(false);
  const close = useRef(() => {
    pinned.current = false;
    setOpen(false);
  });

  function later(action: () => void, delay: number) {
    clearTimeout(timer.current);
    timer.current = setTimeout(action, delay);
  }

  function show(pin: boolean) {
    clearTimeout(timer.current);
    if (pin) pinned.current = true;
    if (closeOpen && closeOpen !== close.current) closeOpen();
    closeOpen = close.current;
    setOpen(true);
  }

  function hide() {
    clearTimeout(timer.current);
    close.current();
  }

  function hideUnlessPinned() {
    if (!pinned.current) later(hide, HIDE_DELAY);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  useLayoutEffect(() => {
    const el = tip.current;
    if (!el || !open) return;
    if (supported) el.showPopover();

    function place() {
      if (!el || !button.current) return;
      const anchor = button.current.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      const above = anchor.top - box.height - GAP;
      const top = above < GUTTER ? anchor.bottom + GAP : above;
      const centered = anchor.left + anchor.width / 2 - box.width / 2;
      const left = Math.max(GUTTER, Math.min(centered, window.innerWidth - GUTTER - box.width));
      el.style.top = `${top}px`;
      el.style.left = `${left}px`;
    }

    const inside = (target: EventTarget | null) =>
      target instanceof Node && (button.current?.contains(target) || el.contains(target));

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') hide();
    }
    // A tap or click anywhere else closes it, and so does moving focus away.
    function onOutside(event: Event) {
      if (!inside(event.target)) hide();
    }

    place();
    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onOutside);
    document.addEventListener('focusin', onOutside);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onOutside);
      document.removeEventListener('focusin', onOutside);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      if (closeOpen === close.current) closeOpen = null;
      if (supported && el.isConnected) el.hidePopover();
    };
  }, [open, supported]);

  const icon = children === undefined;

  return (
    <>
      <button
        ref={button}
        type="button"
        className={icon ? 'term-icon' : 'term'}
        aria-expanded={open}
        aria-describedby={tipId}
        aria-label={icon ? iconLabel(entries.map((e) => e.term)) : undefined}
        onClick={() => (open && pinned.current ? hide() : show(true))}
        onPointerEnter={(event) => {
          if (event.pointerType === 'mouse') later(() => show(false), SHOW_DELAY);
        }}
        onPointerLeave={(event) => {
          if (event.pointerType === 'mouse') hideUnlessPinned();
        }}
      >
        {icon ? <span aria-hidden="true">?</span> : children}
      </button>
      {/* In <body>, so the definition is never part of the paragraph's own text
          (what is copied, printed, or read as the paragraph). */}
      {createPortal(
        <span
          ref={tip}
          id={tipId}
          role="tooltip"
          className="term-tip"
          popover={supported ? 'manual' : undefined}
          hidden={!supported && !open}
          onPointerEnter={() => clearTimeout(timer.current)}
          onPointerLeave={(event) => {
            if (event.pointerType === 'mouse') hideUnlessPinned();
          }}
        >
          {entries.map((entry) => (
            <span key={entry.id} className="term-tip-entry">
              <strong className="term-tip-title">{entry.term}</strong> {entry.definition}
            </span>
          ))}
        </span>,
        document.body,
      )}
    </>
  );
}

function iconLabel(terms: string[]): string {
  const g = copy.glossary;
  if (terms.length === 1) return fill(g.iconLabel, { term: terms[0] });
  const quoted = terms.map((t) => `"${t}"`);
  return fill(g.iconLabelMany, { terms: `${quoted.slice(0, -1).join(', ')} ${g.and} ${quoted[quoted.length - 1]}` });
}

/**
 * A "?" button that explains the glossary terms in a label, or nothing if the
 * label has none. For radio buttons, checkboxes and field labels, whose words
 * can't be buttons themselves.
 */
export function TermHelp({ text }: { text: string }) {
  const ids = useMemo(
    () => splitTerms(text).flatMap((part) => (typeof part === 'string' ? [] : [part.id])),
    [text],
  );
  return ids.length > 0 ? <Term id={ids} /> : null;
}

/**
 * A radio button or checkbox (a .choice label) with a "?" beside it when its
 * words include glossary terms. The "?" sits outside the label, so tapping it
 * doesn't pick the option.
 */
export function ChoiceHelp({ text, children }: { text: string; children: ReactNode }) {
  if (!splitTerms(text).some((part) => typeof part !== 'string')) return <>{children}</>;
  return (
    <div className="choice-wrap">
      {children}
      <TermHelp text={text} />
    </div>
  );
}

/**
 * A field's label with a "?" beside it when it names glossary terms.
 */
export function LabelHelp({ text, children }: { text: string; children: ReactNode }) {
  if (!splitTerms(text).some((part) => typeof part !== 'string')) return <>{children}</>;
  return (
    <div className="label-help">
      {children}
      <TermHelp text={text} />
    </div>
  );
}

/**
 * Text with its glossary terms underlined. Only the first mention of each term
 * is marked. Use it for intros, hints and notes, not for headings, buttons,
 * or the words inside a label.
 */
export function Glossed({ text, skip }: { text: string; skip?: readonly string[] }) {
  const parts = useMemo(() => splitTerms(text, skip), [text, skip]);
  return (
    <>
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          <Fragment key={i}>{part}</Fragment>
        ) : (
          <Term key={i} id={part.id}>
            {part.text}
          </Term>
        ),
      )}
    </>
  );
}
