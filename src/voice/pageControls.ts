// Finds what she can press or fill in on the screen right now, by the words
// she sees, and does what she asked with it. Used by voice control, so
// someone who can't use a keyboard or mouse can use every part of the page.
// Nothing here is specific to one step: a new screen works with no changes.

import type { Candidate, VoiceAction } from './voiceCommands';

export type ControlKind = 'button' | 'checkbox' | 'radio' | 'textbox' | 'select' | 'option';

export interface PageControl {
  element: HTMLElement;
  kind: ControlKind;
  // The words she sees first, then any other name it has (for screen readers).
  names: string[];
  // Only the whole name, said exactly, presses it.
  exactOnly: boolean;
  // For kind 'option': the choice in the list.
  option?: HTMLOptionElement;
}

const SELECTOR = [
  'button',
  'a[href]',
  'input',
  'select',
  'textarea',
  'summary',
  '[role="button"]',
  '[role="link"]',
  '[role="switch"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="tab"]',
].join(', ');

// Marks a control that only its exact name presses, like Quick exit.
export const EXACT_NAME_ATTRIBUTE = 'data-voice-exact';
// Marks parts of the page voice control leaves alone (its own number badges).
export const SKIP_ATTRIBUTE = 'data-voice-skip';
// Marks what stays on top of the page as it scrolls (the header, the voice
// control bar). A control behind one can't be seen, so it gets no number.
export const COVER_ATTRIBUTE = 'data-voice-cover';

/** The words a sighted person sees in this element: not screen-reader-only text or icons. */
export function visibleText(element: Element): string {
  let text = '';
  for (const node of Array.from(element.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) text += node.textContent ?? '';
    else if (node instanceof Element) {
      if (node.matches('.sr-only, [aria-hidden="true"], svg, select, textarea, input, [hidden]')) continue;
      text += ` ${visibleText(node)} `;
    }
  }
  return text.replace(/\s+/g, ' ').trim();
}

function textOfIds(ids: string): string {
  return ids
    .split(/\s+/)
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ')
    .trim();
}

function kindOf(element: HTMLElement): ControlKind | null {
  const role = element.getAttribute('role');
  if (element instanceof HTMLSelectElement) return 'select';
  if (element instanceof HTMLTextAreaElement) return 'textbox';
  if (element instanceof HTMLInputElement) {
    if (element.type === 'hidden') return null;
    if (element.type === 'checkbox') return 'checkbox';
    if (element.type === 'radio') return 'radio';
    if (['button', 'submit', 'reset', 'image'].includes(element.type)) return 'button';
    return 'textbox';
  }
  if (role === 'checkbox' || role === 'switch') return 'checkbox';
  if (role === 'radio') return 'radio';
  return 'button';
}

function namesOf(element: HTMLElement, kind: ControlKind): string[] {
  const names: string[] = [];
  if (kind === 'button') names.push(visibleText(element));
  if ('labels' in element) {
    const labels = (element as HTMLInputElement).labels;
    for (const label of Array.from(labels ?? [])) names.push(visibleText(label));
  }
  const labelledBy = element.getAttribute('aria-labelledby');
  if (labelledBy) names.push(textOfIds(labelledBy));
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel) names.push(ariaLabel);
  if (element instanceof HTMLInputElement && kind === 'button') names.push(element.value);
  const title = element.getAttribute('title');
  if (title) names.push(title);
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}

function usable(element: HTMLElement): boolean {
  if (element.matches(':disabled')) return false;
  if (element.closest(`[hidden], [inert], [aria-hidden="true"], [${SKIP_ATTRIBUTE}]`)) return false;
  // Each field's own microphone is reached by saying the field's name.
  if (element.matches('.voice-field-mic')) return false;
  // Not in jsdom, so tests see every control that isn't hidden as above.
  if (typeof element.checkVisibility === 'function') {
    // A visually hidden radio or checkbox is still pressed through its label.
    const shown = element.matches('input[type="radio"], input[type="checkbox"]')
      ? ((element as HTMLInputElement).labels?.[0] ?? element)
      : element;
    return shown.checkVisibility({ visibilityProperty: true } as CheckVisibilityOptions);
  }
  return true;
}

/**
 * Everything she can press or fill in on the screen. While a dialog is open,
 * only the dialog and the header (with Quick exit) count, like for a mouse.
 * The choices of a list count only while she is in that list.
 */
export function findControls(doc: Document = document): PageControl[] {
  const dialog = doc.querySelector<HTMLElement>('[aria-modal="true"]');
  const roots = dialog ? [dialog, doc.querySelector('header')].filter((root): root is HTMLElement => !!root) : [doc.body];
  const controls: PageControl[] = [];

  for (const root of roots) {
    for (const element of Array.from(root.querySelectorAll<HTMLElement>(SELECTOR))) {
      const kind = kindOf(element);
      if (!kind || !usable(element)) continue;
      const names = namesOf(element, kind);
      if (names.length === 0) continue;
      const exactOnly = element.closest(`[${EXACT_NAME_ATTRIBUTE}]`) !== null;
      controls.push({ element, kind, names, exactOnly });

      if (element instanceof HTMLSelectElement && element === doc.activeElement) {
        for (const option of Array.from(element.options)) {
          if (option.disabled || !option.text.trim()) continue;
          controls.push({ element, kind: 'option', names: [option.text.trim()], exactOnly, option });
        }
      }
    }
  }
  return controls;
}

/** The controls as the matcher sees them. The choices of the list she is in come first. */
export function asCandidates(controls: PageControl[]): Candidate[] {
  return controls.map(({ names, exactOnly, kind }) =>
    kind === 'option' ? { names, exactOnly, boost: 0.5, minCoverage: 0.01 } : { names, exactOnly },
  );
}

function depthOfSharedParent(a: Node, b: Node | null): number {
  if (!b) return 0;
  const parents = new Set<Node>();
  for (let node: Node | null = b; node; node = node.parentNode) parents.add(node);
  let depth = 0;
  let shared: Node | null = a;
  while (shared && !parents.has(shared)) shared = shared.parentNode;
  for (let node = shared; node; node = node.parentNode) depth++;
  return depth;
}

/**
 * When several controls have the same name, the one she most likely means:
 * one in the page rather than the step bar or header, then the one nearest
 * to where she is. Null when they are still equally likely.
 */
export function pickLikeliest(controls: PageControl[], doc: Document = document): PageControl | null {
  if (controls.length === 1) return controls[0];
  const inPage = controls.filter((control) => !control.element.closest('nav, header'));
  let left = inPage.length > 0 ? inPage : controls;
  if (left.length > 1) {
    const depths = left.map((control) => depthOfSharedParent(control.element, doc.activeElement));
    const deepest = Math.max(...depths);
    left = left.filter((_, i) => depths[i] === deepest);
  }
  return left.length === 1 ? left[0] : null;
}

export type ActResult =
  | { kind: 'pressed' | 'chosen' | 'checked' | 'unchecked' | 'alreadyChecked' | 'alreadyUnchecked'; name: string }
  // She moved to a text box, and its microphone is listening.
  | { kind: 'dictating'; name: string }
  // She moved to a text box that has no microphone.
  | { kind: 'focused'; name: string }
  // She moved to a list. These are its choices.
  | { kind: 'choose'; name: string; options: string[] };

function isChecked(element: HTMLElement): boolean {
  if (element instanceof HTMLInputElement) return element.checked;
  return element.getAttribute('aria-checked') === 'true';
}

/**
 * Moves focus to the control and scrolls it to the middle of the part of the
 * screen she can see: between the header and the voice control bar, so
 * neither covers it.
 */
function bringIntoView(element: HTMLElement) {
  element.focus({ preventScroll: true });
  scrollIntoClearView(element);
}

/** Scrolls a control to the middle of the screen between the header and the voice control bar. */
export function scrollIntoClearView(element: HTMLElement) {
  // A visually hidden radio or checkbox is shown through its label.
  const shown = element instanceof HTMLInputElement ? (element.labels?.[0] ?? element) : element;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth';

  const covers = Array.from(document.querySelectorAll<HTMLElement>(`[${COVER_ATTRIBUTE}]`));
  // The header and the bar don't scroll, so what is in them is already in view.
  if (covers.some((cover) => cover.contains(shown))) return;
  const rect = shown.getBoundingClientRect();
  // jsdom has no layout.
  if (rect.width === 0 && rect.height === 0) {
    shown.scrollIntoView?.({ block: 'center', behavior });
    return;
  }
  let top = 0;
  let bottom = window.innerHeight;
  for (const cover of covers) {
    const box = cover.getBoundingClientRect();
    if (box.height === 0) continue;
    if (box.top < window.innerHeight / 2) top = Math.max(top, box.bottom);
    else bottom = Math.min(bottom, box.top);
  }
  const target = top + Math.max(0, (bottom - top - rect.height) / 2);
  window.scrollBy?.({ top: rect.top - target, behavior });
}

/** Sets a list's choice the way picking it with the mouse would, so the app hears it. */
function choose(select: HTMLSelectElement, option: HTMLOptionElement) {
  const setValue = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
  setValue?.call(select, option.value);
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

/** Does what she asked with one control, the way a click or key press would. */
export function actOn(control: PageControl, action: VoiceAction): ActResult {
  const { element, kind } = control;
  const name = control.names[0];
  bringIntoView(element);

  switch (kind) {
    case 'textbox': {
      const microphone = element
        .closest('.voice-field-box')
        ?.querySelector<HTMLButtonElement>('.voice-field-mic:not(:disabled)');
      if (!microphone) return { kind: 'focused', name };
      microphone.click();
      return { kind: 'dictating', name };
    }
    case 'select': {
      // Not the empty "Choose one" choice: it isn't an answer.
      const options = Array.from((element as HTMLSelectElement).options)
        .filter((option) => option.value !== '' && !option.disabled)
        .map((option) => option.text.trim())
        .filter(Boolean);
      return { kind: 'choose', name, options };
    }
    case 'option': {
      choose(element as HTMLSelectElement, control.option!);
      return { kind: 'chosen', name };
    }
    case 'radio':
      element.click();
      return { kind: 'chosen', name };
    case 'checkbox': {
      const wasChecked = isChecked(element);
      if (action === 'check' && wasChecked) return { kind: 'alreadyChecked', name };
      if (action === 'uncheck' && !wasChecked) return { kind: 'alreadyUnchecked', name };
      element.click();
      return { kind: wasChecked ? 'unchecked' : 'checked', name };
    }
    default:
      element.click();
      return { kind: 'pressed', name };
  }
}

/** Scrolls the page the way "scroll down" means to a person. */
export function scrollPage(direction: 'down' | 'up' | 'top' | 'bottom') {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const behavior: ScrollBehavior = reduceMotion ? 'auto' : 'smooth';
  const step = Math.round(window.innerHeight * 0.7);
  if (direction === 'top') window.scrollTo?.({ top: 0, behavior });
  else if (direction === 'bottom') window.scrollTo?.({ top: document.documentElement.scrollHeight, behavior });
  else window.scrollBy?.({ top: direction === 'down' ? step : -step, behavior });
}

/** Where to put a control's number badge: its label, for a visually hidden radio or checkbox. */
export function badgeAnchor(control: PageControl): HTMLElement {
  const { element } = control;
  if (element instanceof HTMLInputElement && (element.type === 'radio' || element.type === 'checkbox')) {
    return element.labels?.[0] ?? element;
  }
  return element;
}

/**
 * The controls she can see now, for numbering: on the screen, and not behind
 * the header or the voice control bar. Choices inside a list are left out.
 */
export function controlsOnScreen(controls: PageControl[], doc: Document = document): PageControl[] {
  const covers = Array.from(doc.querySelectorAll<HTMLElement>(`[${COVER_ATTRIBUTE}]`));
  return controls.filter((control) => {
    if (control.kind === 'option') return false;
    const anchor = badgeAnchor(control);
    const rect = anchor.getBoundingClientRect();
    // jsdom has no layout: every box is empty, so every control counts.
    if (rect.width === 0 && rect.height === 0) return true;
    const x = rect.left + rect.width / 2;
    const y = rect.top + rect.height / 2;
    if (y < 0 || y > window.innerHeight || x < 0 || x > window.innerWidth) return false;
    return !covers.some((cover) => {
      if (cover.contains(anchor)) return false;
      const box = cover.getBoundingClientRect();
      return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
    });
  });
}
