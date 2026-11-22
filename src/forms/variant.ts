import type { Variant } from '../content';
import { currentOutcome, type RouteAnswer } from './routing';

/** Whose petition her route leads to: her own (PO-0100) or a child's (PO-0101). */
export function petitionVariant(route: RouteAnswer[]): Variant {
  return currentOutcome(route)?.variant ?? 'adult';
}

/** For a child's petition: how the filer is related to the child (question 1 on PO-0101). */
export function childRole(route: RouteAnswer[]): string {
  return route.find((answer) => answer.node === 'childRole')?.option ?? '';
}
