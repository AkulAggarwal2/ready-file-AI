import {
  cloneElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type FocusEvent,
  type PointerEvent,
  type ReactElement,
} from 'react';

const SHOW_DELAY = 400;
const HIDE_DELAY = 150;
const GAP = 8;
const GUTTER = 16;

// Only one tooltip is open at a time. Opening one closes this one.
let closeOpen: (() => void) | null = null;

// Older browsers (Safari before 17, Firefox before 125) have no popover support.
// There the tooltip is left out, since a hint must never be the only explanation.
function popoverSupported(): boolean {
  return typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;
}

interface TriggerProps {
  disabled?: boolean;
  'aria-describedby'?: string;
  'aria-labelledby'?: string;
  'aria-label'?: string;
  onPointerEnter?: (event: PointerEvent<HTMLElement>) => void;
  onPointerLeave?: (event: PointerEvent<HTMLElement>) => void;
  onPointerDown?: (event: PointerEvent<HTMLElement>) => void;
  onFocus?: (event: FocusEvent<HTMLElement>) => void;
  onBlur?: (event: FocusEvent<HTMLElement>) => void;
}

interface Props {
  text: string;
  // True when the tooltip is the button's only visible name (an icon button).
  // It then names the button instead of describing it.
  labels?: boolean;
  children: ReactElement<TriggerProps>;
}

/**
 * A short hint shown when the mouse rests on a button or the keyboard reaches it.
 * Taps on a phone don't show it, so the hint must never be the only place
 * something is explained. A disabled button gets no hover or focus, so it is
 * shown without a tooltip; say why it is off in visible text instead.
 * Escape closes it, and the mouse can move onto it (WCAG 1.4.13).
 */
export function Tooltip({ text, labels = false, children }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const tip = useRef<HTMLSpanElement>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const close = useRef(() => setOpen(false));

  function later(action: () => void, delay: number) {
    clearTimeout(timer.current);
    timer.current = setTimeout(action, delay);
  }

  function show() {
    clearTimeout(timer.current);
    if (closeOpen && closeOpen !== close.current) closeOpen();
    closeOpen = close.current;
    setOpen(true);
  }

  function hide() {
    clearTimeout(timer.current);
    setOpen(false);
  }

  useEffect(() => () => clearTimeout(timer.current), []);

  // A button that turns off while its hint is showing drops the hint, so the
  // hint must start closed when the button turns on again.
  const disabled = Boolean(children.props.disabled);
  useEffect(() => {
    if (disabled) hide();
  }, [disabled]);

  useLayoutEffect(() => {
    const el = tip.current;
    if (!el || !open) return;
    el.showPopover();

    function place() {
      if (!el || !trigger.current) return;
      const anchor = trigger.current.getBoundingClientRect();
      const box = el.getBoundingClientRect();
      const above = anchor.top - box.height - GAP;
      const top = above < GUTTER ? anchor.bottom + GAP : above;
      const centered = anchor.left + anchor.width / 2 - box.width / 2;
      const left = Math.max(GUTTER, Math.min(centered, window.innerWidth - GUTTER - box.width));
      el.style.top = `${top}px`;
      el.style.left = `${left}px`;
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') hide();
    }

    place();
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', place, true);
    window.addEventListener('resize', place);
    return () => {
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', place, true);
      window.removeEventListener('resize', place);
      if (closeOpen === close.current) closeOpen = null;
      if (el.isConnected) el.hidePopover();
    };
  }, [open]);

  const props = children.props;
  if (disabled) return children;
  if (!popoverSupported()) {
    // An icon button still needs its name.
    return labels ? cloneElement(children, { 'aria-label': text } as TriggerProps) : children;
  }

  const attr = labels ? 'aria-labelledby' : 'aria-describedby';

  return (
    <>
      {cloneElement(children, {
        [attr]: [props[attr], id].filter(Boolean).join(' '),
        onPointerEnter(event: PointerEvent<HTMLElement>) {
          props.onPointerEnter?.(event);
          if (event.pointerType === 'touch') return;
          trigger.current = event.currentTarget;
          later(show, SHOW_DELAY);
        },
        onPointerLeave(event: PointerEvent<HTMLElement>) {
          props.onPointerLeave?.(event);
          later(hide, HIDE_DELAY);
        },
        // Pressing the button closes the hint, as on most sites.
        onPointerDown(event: PointerEvent<HTMLElement>) {
          props.onPointerDown?.(event);
          hide();
        },
        onFocus(event: FocusEvent<HTMLElement>) {
          props.onFocus?.(event);
          // Only keyboard focus opens it, not a click or a tap.
          if (!focusVisible(event.currentTarget)) return;
          trigger.current = event.currentTarget;
          show();
        },
        onBlur(event: FocusEvent<HTMLElement>) {
          props.onBlur?.(event);
          hide();
        },
      })}
      <span
        ref={tip}
        id={id}
        role="tooltip"
        popover="manual"
        className="tooltip"
        onPointerEnter={() => clearTimeout(timer.current)}
        onPointerLeave={() => later(hide, HIDE_DELAY)}
      >
        {text}
      </span>
    </>
  );
}

function focusVisible(el: HTMLElement): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return true;
  }
}
