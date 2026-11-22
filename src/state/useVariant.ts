import type { Variant } from '../content';
import { petitionVariant } from '../forms/variant';
import { useAppState } from './AppStateProvider';

/** Whose petition this is, from her answers on the route step. */
export function useVariant(): Variant {
  return petitionVariant(useAppState().state.route);
}
