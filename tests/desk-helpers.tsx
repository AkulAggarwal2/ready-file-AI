import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DeskApp } from '../src/desk/DeskApp';
import { deskCopy } from '../src/desk/content';

export type User = ReturnType<typeof userEvent.setup>;

export const LENA = '02D01-2611-PO-000412';
export const KEISHA = '02D01-2611-PO-000409';
export const DANA = '02D01-2611-PO-000405';
export const MARCUS = '02D01-2611-PO-000407';
export const ANA = '02D01-2611-PO-000410';

export const d = deskCopy;

export function renderDesk() {
  const user = userEvent.setup();
  render(<DeskApp />);
  return user;
}

const openButton = (caseNumber: string) =>
  screen.getByRole('button', { name: new RegExp(`^${d.list.open} for case ${caseNumber}$`) });

/** The row for a petition on the Online petitions list. */
export function listRow(caseNumber: string): HTMLElement {
  return openButton(caseNumber).closest('li')!;
}

export async function showAll(user: User) {
  await user.click(screen.getByRole('button', { name: /^All \(/ }));
}

export async function openPetition(user: User, caseNumber: string) {
  await goToList(user);
  await showAll(user);
  await user.click(openButton(caseNumber));
}

const topNav = () => within(screen.getByRole('navigation', { name: d.app.navLabel }));

export async function goToList(user: User) {
  await user.click(topNav().getByRole('button', { name: d.app.nav.petitions }));
}

export async function goToReview(user: User) {
  await user.click(topNav().getByRole('button', { name: d.app.nav.review }));
}

export function reviewRow(caseNumber: string): HTMLElement | null {
  return screen.queryByRole('button', { name: new RegExp(`case ${caseNumber}$`) })?.closest('tr') ?? null;
}

export async function openBench(user: User, caseNumber: string) {
  await goToReview(user);
  const row = reviewRow(caseNumber);
  if (!row) throw new Error(`${caseNumber} is not in the review list.`);
  await user.click(within(row).getByRole('button', { name: /^Open/ }));
}

export const click = (user: User, name: string | RegExp) => user.click(screen.getByRole('button', { name }));

/** Lena's flow, up to the end of the hold (acceptance test 8). */
export async function lenaFlow(user: User) {
  await openPetition(user, LENA);
  await click(user, d.petition.hold.holdButton);
  await click(user, d.petition.contactPanel.textLink);
  await click(user, d.petition.demo.addIncidents);
  await click(user, d.petition.demo.jump);
}
