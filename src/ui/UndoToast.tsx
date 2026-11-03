import { useEffect, useState } from 'react';
import { UNDO_MS } from '../config';
import { copy } from '../content';
import type { UndoEntry } from '../state/appState';

interface Props {
  entry: UndoEntry;
  onUndo: () => void;
  onExpire: () => void;
}

/**
 * "Incident deleted. Undo" for a few seconds. The countdown pauses while she
 * hovers or has focus here, so slow readers and keyboard users are not rushed.
 * Screen readers hear the change from the live region, not from this box.
 */
export function UndoToast({ entry, onUndo, onExpire }: Props) {
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setTimeout(onExpire, UNDO_MS);
    return () => clearTimeout(timer);
  }, [entry.id, paused, onExpire]);

  return (
    <div
      className="toast"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <span>{copy.toast[entry.kind]}</span>
      <button type="button" className="btn btn-toast" onClick={onUndo}>
        {copy.toast.undo}
      </button>
    </div>
  );
}
