import { useEffect, useRef, useState } from 'react';
import { copy } from '../content';

interface Props {
  label: string;
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
}

/** A button that asks "Are you sure?" in place before doing something that cannot be undone. */
export function ConfirmButton({ label, question, confirmLabel, onConfirm }: Props) {
  const [asking, setAsking] = useState(false);
  const questionRef = useRef<HTMLParagraphElement>(null);
  const openButton = useRef<HTMLButtonElement>(null);
  const wasAsking = useRef(false);

  useEffect(() => {
    if (asking) questionRef.current?.focus();
    else if (wasAsking.current) openButton.current?.focus();
    wasAsking.current = asking;
  }, [asking]);

  if (!asking) {
    return (
      <button ref={openButton} type="button" className="btn" onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }

  return (
    <div className="confirm">
      <p ref={questionRef} tabIndex={-1}>
        {question}
      </p>
      <div className="button-row">
        <button type="button" className="btn" onClick={onConfirm}>
          {confirmLabel}
        </button>
        <button type="button" className="btn" onClick={() => setAsking(false)}>
          {copy.common.confirmNo}
        </button>
      </div>
    </div>
  );
}
