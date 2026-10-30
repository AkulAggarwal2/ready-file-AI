import { useEffect, useRef } from 'react';
import { copy, fill } from '../content';

export function TimeoutWarning({ secondsLeft, onStay }: { secondsLeft: number; onStay: () => void }) {
  const stayButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    stayButton.current?.focus();
  }, []);

  return (
    <div className="overlay">
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="timeout-heading"
        aria-describedby="timeout-body"
        className="dialog"
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
