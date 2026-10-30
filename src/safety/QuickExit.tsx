import { copy } from '../content';
import { useAppState } from '../state/AppStateProvider';
import { leaveSite } from './leaveSite';

export function QuickExit() {
  const { dispatch } = useAppState();

  function exit() {
    dispatch({ type: 'reset' });
    leaveSite(copy.quickExit.url);
  }

  return (
    <button type="button" className="quick-exit" onClick={exit}>
      {copy.quickExit.label}
    </button>
  );
}
