// Which screen is showing. It's kept in memory, not in the address bar, so
// switching screens never adds browser history.
import { createContext, useContext, type MutableRefObject } from 'react';

export type View =
  | { screen: 'petitions' }
  | { screen: 'petition'; id: string }
  | { screen: 'review' }
  | { screen: 'bench'; id: string; preview: boolean };

export interface ViewContextValue {
  view: View;
  go: (view: View) => void;
  // Spoken by the live region, for screen reader users.
  announce: (text: string) => void;
  // True once staff have moved between screens, so the new page title takes focus.
  navigated: MutableRefObject<boolean>;
}

export const ViewContext = createContext<ViewContextValue | null>(null);

export function useView(): ViewContextValue {
  const value = useContext(ViewContext);
  if (!value) throw new Error('useView must be used inside DeskApp.');
  return value;
}

/** Specialist screens and magistrate screens show different users in the top bar. */
export function sectionOf(view: View): 'petitions' | 'review' {
  if (view.screen === 'review') return 'review';
  if (view.screen === 'bench' && !view.preview) return 'review';
  return 'petitions';
}
