import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { App } from '../src/App';
import { copy } from '../src/content';

export type User = ReturnType<typeof userEvent.setup>;

export function renderApp() {
  const user = userEvent.setup();
  render(<App />);
  return user;
}

/** Start screen: pick a case type (or none) and press Start. */
export async function begin(user: User, caseType?: 'Stalking' | 'Harassment' | 'Not sure') {
  if (caseType) await user.click(screen.getByRole('radio', { name: caseType }));
  await user.click(screen.getByRole('button', { name: copy.start.begin }));
}

/** Story screen: write the story and organize it into incidents. */
export async function tellStory(user: User, story: string) {
  await user.click(screen.getByRole('textbox', { name: copy.story.label }));
  await user.paste(story);
  await user.click(screen.getByRole('button', { name: copy.story.organize }));
  await screen.findByRole('heading', { level: 1, name: copy.organize.heading });
}

export async function confirmIncidents(user: User) {
  await user.click(screen.getByRole('button', { name: copy.organize.confirm }));
}

/** Text of the question on the Check screen, without the dev-mode badge. */
export function currentQuestion(): string | null {
  return document.getElementById('question-text')?.childNodes[0]?.textContent ?? null;
}

export const STALKING_QUESTION = 'Stalking means two or more incidents. Are there other times?';
