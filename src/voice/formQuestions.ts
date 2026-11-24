// The questions on the screen, in order, for voice control's guided mode:
// it asks one at a time, shows what she can say, and moves on when she answers.
//
// Form fields are found on their own: a group of radio buttons or check boxes
// (a fieldset), a list (select), a text box, or a date. Questions that are
// answered with buttons, like "Add an incident" or "Continue as is", are
// marked in the step's code with the attributes below.

import { isUsable, visibleText } from './pageControls';

// A question answered by pressing a button. On a container, its buttons are
// the choices; on a button, that button is the only choice. The value, if
// any, is the question to show.
export const ASK_ATTRIBUTE = 'data-voice-ask';
// Inside an ask: the button that opens it (like a closed question card).
export const OPEN_ATTRIBUTE = 'data-voice-open';
// Inside an ask: the text of the question, once it is open.
export const PROMPT_ATTRIBUTE = 'data-voice-prompt';
// On the "When did it happen?" list: the ids of the exact date box and the
// "about when" box, so a spoken date can go straight into the right one.
export const WHEN_EXACT_ATTRIBUTE = 'data-voice-when-exact';
export const WHEN_APPROX_ATTRIBUTE = 'data-voice-when-approx';
// Parts of the page that hold no questions (like voice control's own offer).
export const NO_QUESTIONS_ATTRIBUTE = 'data-voice-no-questions';

export type QuestionKind =
  // Pick one: radio buttons or a list.
  | 'choice'
  // Check all that fit.
  | 'checks'
  // A text box: her spoken answer goes in it.
  | 'text'
  // A date box.
  | 'date'
  // Press a button.
  | 'ask';

export interface QuestionChoice {
  name: string;
  // The radio button, check box, button, or list.
  element: HTMLElement;
  // For a list: the choice in it.
  option?: HTMLOptionElement;
  checked: boolean;
}

export interface FormQuestion {
  kind: QuestionKind;
  // The fieldset, list, box, or ask. Its place in the page is the question's place.
  container: HTMLElement;
  // The list, box, or date box she answers in. Null for radio buttons, check boxes, and asks.
  field: HTMLElement | null;
  prompt: string;
  hint: string;
  choices: QuestionChoice[];
  // For an ask that is closed: the button that opens it.
  opener: HTMLElement | null;
  // For "When did it happen?": where a spoken date goes.
  when: { exact: string; approx: string } | null;
}

const QUESTION_SELECTOR = `fieldset, select, textarea, input, [${ASK_ATTRIBUTE}]`;
const TEXT_INPUT_TYPES = ['text', 'search', 'email', 'tel', 'url', 'number', ''];

function describedBy(element: Element): string {
  const ids = element.getAttribute('aria-describedby');
  if (!ids) return '';
  return ids
    .split(/\s+/)
    .map((id) => {
      const described = document.getElementById(id);
      return described ? visibleText(described) : '';
    })
    .filter(Boolean)
    .join(' ');
}

function labelOf(element: HTMLElement): string {
  const labels = (element as HTMLInputElement).labels;
  const fromLabels = Array.from(labels ?? [])
    .map((label) => visibleText(label))
    .filter(Boolean)
    .join(' ');
  return fromLabels || element.getAttribute('aria-label') || '';
}

function inputChoice(input: HTMLInputElement): QuestionChoice {
  return { name: labelOf(input), element: input, checked: input.checked };
}

function readFieldset(fieldset: HTMLFieldSetElement): FormQuestion | null {
  const inputs = Array.from(fieldset.querySelectorAll<HTMLInputElement>('input[type="radio"], input[type="checkbox"]'));
  const usable = inputs.filter((input) => isUsable(input));
  if (usable.length === 0) return null;
  const legend = fieldset.querySelector('legend');
  return {
    kind: usable[0].type === 'radio' ? 'choice' : 'checks',
    container: fieldset,
    field: null,
    prompt: legend ? visibleText(legend) : '',
    hint: describedBy(fieldset),
    choices: usable.map(inputChoice).filter((choice) => choice.name),
    opener: null,
    when: null,
  };
}

function readSelect(select: HTMLSelectElement): FormQuestion {
  const exact = select.getAttribute(WHEN_EXACT_ATTRIBUTE);
  const approx = select.getAttribute(WHEN_APPROX_ATTRIBUTE);
  return {
    kind: 'choice',
    container: select,
    field: select,
    prompt: labelOf(select),
    hint: describedBy(select),
    // Not the empty "Choose one" choice: it isn't an answer.
    choices: Array.from(select.options)
      .filter((option) => option.value !== '' && !option.disabled && option.text.trim())
      .map((option) => ({ name: option.text.trim(), element: select, option, checked: option.selected })),
    opener: null,
    when: exact && approx ? { exact, approx } : null,
  };
}

function readAsk(container: HTMLElement): FormQuestion {
  const opener = container.querySelector<HTMLElement>(`[${OPEN_ATTRIBUTE}][aria-expanded="false"]`);
  const buttons =
    container instanceof HTMLButtonElement
      ? [container]
      : Array.from(container.querySelectorAll<HTMLElement>('button')).filter(
          (button) => !button.hasAttribute(OPEN_ATTRIBUTE) && !button.matches('.voice-field-mic') && isUsable(button),
        );
  const promptElement = container.querySelector(`[${PROMPT_ATTRIBUTE}]`);
  const heading = container.querySelector('h1, h2, h3, legend');
  const prompt =
    container.getAttribute(ASK_ATTRIBUTE) ||
    (promptElement && visibleText(promptElement)) ||
    (opener && visibleText(opener)) ||
    (heading && visibleText(heading)) ||
    '';
  return {
    kind: 'ask',
    container,
    field: null,
    prompt,
    hint: '',
    choices: opener ? [] : buttons.map((button) => ({ name: visibleText(button), element: button, checked: false })),
    opener,
    when: null,
  };
}

/** The question this element is, or null if it isn't one. */
export function readQuestion(element: HTMLElement): FormQuestion | null {
  if (element.hasAttribute(ASK_ATTRIBUTE)) return readAsk(element);
  if (element instanceof HTMLFieldSetElement) return readFieldset(element);
  if (element instanceof HTMLSelectElement) return readSelect(element);
  if (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement) {
    const isDate = element instanceof HTMLInputElement && element.type === 'date';
    const isText = element instanceof HTMLTextAreaElement || TEXT_INPUT_TYPES.includes(element.type);
    if (!isDate && !isText) return null;
    const prompt = labelOf(element);
    if (!prompt) return null;
    return {
      kind: isDate ? 'date' : 'text',
      container: element,
      field: element,
      prompt,
      hint: describedBy(element),
      choices: [],
      opener: null,
      when: null,
    };
  }
  return null;
}

/** The questions on the screen, in the order they appear. */
export function findQuestions(root: Element | null = document.querySelector('main')): FormQuestion[] {
  if (!root) return [];
  const questions: FormQuestion[] = [];
  for (const element of Array.from(root.querySelectorAll<HTMLElement>(QUESTION_SELECTOR))) {
    // A radio button inside a question already found is part of that question.
    if (questions.some((question) => question.container.contains(element))) continue;
    if (element.closest(`nav, .dev-only, [${NO_QUESTIONS_ATTRIBUTE}]`)) continue;
    if (!element.hasAttribute(ASK_ATTRIBUTE) && !(element instanceof HTMLFieldSetElement) && !isUsable(element)) continue;
    if (element.closest('[hidden], [inert], [aria-hidden="true"]')) continue;
    const question = readQuestion(element);
    if (!question) continue;
    if (question.kind === 'ask' && question.choices.length === 0 && !question.opener) continue;
    questions.push(question);
  }
  return questions;
}

/** The question an element is in, or the first one after it. */
export function questionFrom(questions: FormQuestion[], element: Element | null): FormQuestion | null {
  if (!element) return questions[0] ?? null;
  const inside = questions.find((question) => question.container.contains(element));
  if (inside) return inside;
  return (
    questions.find(
      (question) => element.compareDocumentPosition(question.container) & Node.DOCUMENT_POSITION_FOLLOWING,
    ) ?? null
  );
}
