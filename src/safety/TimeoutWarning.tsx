import { useEffect, useRef, type KeyboardEvent } from 'react';
import { copy, fill } from '../content';

export function TimeoutWarning({ secondsLeft, onStay }: { secondsLeft: number; onStay: () => void }) {
  const stayButton = useRef<HTMLButtonElement>(null);

  // Move focus into the warning, and put it back where it was when the
  // warning closes.
  useEffect(() => {
    const previous = document.activeElement;
    stayButton.current?.focus();
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus();
    };
  }, []);

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') onStay();
  }

  return (
    <div className="overlay">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="timeout-heading"
        aria-describedby="timeout-body"
        className="dialog"
        onKeyDown={onKeyDown}
      >
        <h2 id="timeout-heading">{copy.timeout.heading}</h2>
        <p id="timeout-body">{fill(copy.timeout.body, { seconds: secondsLeft })}</p>
        <button ref={stayButton} type="button" className="btn btn-primary" onClick={onStay}>
          {copy.timeout.stay}
        </button>
      </div>
    </div>
  );
}
