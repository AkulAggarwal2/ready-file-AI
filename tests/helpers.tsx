import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { copy, fill } from '../src/content';
import { STEPS, type Step } from '../src/state/appState';

export type User = ReturnType<typeof userEvent.setup>;

/**
 * Matches the element whose whole text is this sentence, even when glossary
 * terms (src/ui/Term.tsx) split it into several elements.
 */
export function sentence(text: string) {
  return (_content: string, element: Element | null) =>
    element?.textContent === text && ![...element.children].some((child) => child.textContent === text);
}

export function renderApp() {
  const user = userEvent.setup();
  render(<App />);
  return user;
}

/**
 * Route screen: "Me" > "Ask for a new protection order" > "At or near my home",
 * then on to the petition's Start screen. Does nothing if already past it.
 */
export async function toStart(user: User) {
  if (!screen.queryByRole('heading', { level: 1, name: copy.route.heading })) return;
  for (const option of ['Me', 'Ask for a new protection order', 'At or near my home']) {
    await user.click(screen.getByRole('radio', { name: option }));
    await user.click(screen.getByRole('button', { name: copy.route.continue }));
  }
  await user.click(screen.getByRole('button', { name: copy.route.toPetition }));
}

/** toStart without user-event, for tests on fake timers. */
export function toStartSync() {
  for (const option of ['Me', 'Ask for a new protection order', 'At or near my home']) {
    fireEvent.click(screen.getByRole('radio', { name: option }));
    fireEvent.click(screen.getByRole('button', { name: copy.route.continue }));
  }
  fireEvent.click(screen.getByRole('button', { name: copy.route.toPetition }));
}

/** Start screen: check one ground (or none, for "not sure") and press Start. */
export async function begin(user: User, ground?: 'Stalking' | 'Harassment' | 'Not sure') {
  await toStart(user);
  const label = ground === 'Stalking' ? copy.start.grounds.stalking : ground === 'Harassment' ? copy.start.grounds.harassment : null;
  if (label) await user.click(screen.getByRole('checkbox', { name: label }));
  await user.click(screen.getByRole('button', { name: copy.start.begin }));
}

/** Incidents screen, demo mode: load a fictional sample (1 or 4 incidents) and its story. */
export async function loadSample(user: User, which: 'one' | 'four' = 'one') {
  const name = which === 'one' ? copy.organize.sampleOne : copy.organize.sampleFour;
  await user.click(screen.getByRole('button', { name }));
  await screen.findAllByRole('heading', { level: 2, name: /^Incident \d$/ });
}

/** Incidents screen: add one incident with these details. */
export async function addIncident(user: User, details: string) {
  await user.click(screen.getByRole('button', { name: copy.organize.add }));
  const boxes = screen.getAllByRole('textbox', { name: copy.incident.descriptionLabel });
  await user.click(boxes[boxes.length - 1]);
  await user.paste(details);
}

/** Use the step bar at the top. */
/** The step bar button's name, as screen readers hear it: "Step 3: Your story". */
export function stepName(step: Step): string {
  return `${fill(copy.app.stepNumber, { n: STEPS.indexOf(step) + 1 })} ${copy.app.steps[step]}`;
}

export async function goToStep(user: User, step: Step) {
  await user.click(screen.getByRole('button', { name: stepName(step) }));
}

/** From the Incidents screen, continue through Your story to Questions. */
export async function toQuestions(user: User) {
  await user.click(screen.getByRole('button', { name: copy.organize.confirm }));
  await user.click(screen.getByRole('button', { name: copy.story.next }));
}

/** The closed question rows on the Questions screen, in order. */
export function questionToggles(): HTMLElement[] {
  return Array.from(document.querySelectorAll<HTMLElement>('.question-toggle'));
}

/** The closed question row whose label shows this badge. */
export function questionToggle(badge: string): HTMLElement {
  const toggle = questionToggles().find((el) => el.textContent?.includes(badge));
  if (!toggle) throw new Error(`No question with the label "${badge}"`);
  return toggle;
}

/** Text of the open question, without the demo-mode badge. */
export function openQuestionText(): string | null {
  return document.querySelector('.question-text')?.childNodes[0]?.textContent ?? null;
}

export const STALKING_QUESTION = 'Stalking means two or more incidents. Are there other times?';
