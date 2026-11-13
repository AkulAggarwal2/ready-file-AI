import { createContext, useContext, useReducer, type Dispatch, type ReactNode } from 'react';
import { createInitialState, deskReducer, type DeskAction, type DeskState } from './deskState';

interface DeskContextValue {
  state: DeskState;
  dispatch: Dispatch<DeskAction>;
}

const DeskContext = createContext<DeskContextValue | null>(null);

export function DeskStateProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(deskReducer, undefined, createInitialState);
  return <DeskContext.Provider value={{ state, dispatch }}>{children}</DeskContext.Provider>;
}

export function useDesk(): DeskContextValue {
  const value = useContext(DeskContext);
  if (!value) throw new Error('useDesk must be used inside DeskStateProvider.');
  return value;
}
