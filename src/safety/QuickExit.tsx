import { useEffect } from 'react';
import { copy } from '../content';
import { useAppState } from '../state/AppStateProvider';
import { useHandsFree } from '../voice/handsFreeContext';
import { EXACT_NAME_ATTRIBUTE } from '../voice/pageControls';
import { leaveSite } from './leaveSite';

// Two presses of Escape this close together also leave the site.
export const DOUBLE_ESCAPE_MS = 800;

export function QuickExit() {
  const { dispatch } = useAppState();
  const turnOffVoiceControl = useHandsFree()?.turnOff;

  useEffect(() => {
    let lastEscape = 0;

    function exit() {
      // Clear everything and turn the microphone off first, then leave.
      // location.replace keeps the tool out of the Back button's history.
      turnOffVoiceControl?.();
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
  }, [dispatch, turnOffVoiceControl]);

  function exit() {
    turnOffVoiceControl?.();
    dispatch({ type: 'reset' });
    leaveSite(copy.quickExit.url);
  }

  return (
    <>
      {/* By voice, only "Quick exit" said in full leaves, so it never happens by mistake. */}
      <button
        type="button"
        className="quick-exit"
        aria-describedby="quick-exit-hint"
        onClick={exit}
        {...{ [EXACT_NAME_ATTRIBUTE]: '' }}
      >
        {copy.quickExit.label}
      </button>
      <span id="quick-exit-hint" className="sr-only">
        {copy.quickExit.hint}
      </span>
    </>
  );
}
