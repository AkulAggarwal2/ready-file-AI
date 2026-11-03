import { useEffect } from 'react';
import { copy } from '../content';
import { useAppState } from '../state/AppStateProvider';
import { leaveSite } from './leaveSite';

// Two presses of Escape this close together also leave the site.
export const DOUBLE_ESCAPE_MS = 800;

export function QuickExit() {
  const { dispatch } = useAppState();

  useEffect(() => {
    let lastEscape = 0;

    function exit() {
      // Clear everything first, then leave. location.replace keeps the tool out of the Back button's history.
      dispatch({ type: 'reset' });
      leaveSite(copy.quickExit.url);
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Escape' || event.repeat) return;
      const now = Date.now();
      if (now - lastEscape <= DOUBLE_ESCAPE_MS) exit();
      lastEscape = now;
    }

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dispatch]);

  function exit() {
    dispatch({ type: 'reset' });
    leaveSite(copy.quickExit.url);
  }

  return (
    <>
      <button type="button" className="quick-exit" aria-describedby="quick-exit-hint" onClick={exit}>
        {copy.quickExit.label}
      </button>
      <span id="quick-exit-hint" className="sr-only">
        {copy.quickExit.hint}
      </span>
    </>
  );
}
