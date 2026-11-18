import { DEMO_MODE } from '../config';
import { copy, fill } from '../content';
import type { Dictation } from './useDictation';

interface Props {
  dictation: Dictation;
  // The start button's text, such as "Speak your story".
  startLabel: string;
  // Id for the status line, so a field can point to it with aria-describedby.
  statusId: string;
}

export function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The start and stop button for voice typing, a status line for screen
 * readers, and a preview of the words being heard. The field the words go
 * into belongs to the parent.
 */
export function DictationControls({ dictation, startLabel, statusId }: Props) {
  const c = copy.voice;
  const { status, error, pending, start, stop } = dictation;
  const listening = status === 'listening';
  const preparing = status === 'preparing';

  const message = error ? c.errors[error] : listening ? c.listening : preparing ? c.preparing : '';

  return (
    <div className="dictation">
      <button
        type="button"
        className={listening ? 'btn btn-voice is-listening' : 'btn btn-voice'}
        disabled={preparing}
        onClick={listening ? stop : start}
      >
        <MicrophoneIcon />
        {listening ? c.stop : startLabel}
      </button>
      <p className="hint">{c.privacy}</p>
      <p id={statusId} className="dictation-status" role="status">
        {message}
      </p>
      {/* Hidden from screen readers: it changes with every word. */}
      {pending && (
        <p className="dictation-pending" aria-hidden="true">
          {pending}
        </p>
      )}
    </div>
  );
}

/**
 * Shown in place of voice typing when this browser can't turn speech into
 * text on the device, so she knows it exists and where it works. In demo
 * mode, it also shows what the browser said.
 */
export function VoiceUnavailableNote({ detail }: { detail: string }) {
  return (
    <p className="hint voice-unavailable">
      {copy.voice.unavailable}
      {DEMO_MODE && detail && <span className="dev-only-inline"> {fill(copy.voice.unavailableDemo, { detail })}</span>}
    </p>
  );
}
