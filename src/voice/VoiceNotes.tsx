import { DEMO_MODE } from '../config';
import { copy, fill } from '../content';
import { useDictation } from './useDictation';

export function MicrophoneIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
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

const listenForNothing = () => {};

/**
 * One note at the top of a page whose fields have microphone buttons: how
 * voice typing works and that it stays on this device. Where it isn't
 * available, says so instead.
 */
export function VoiceTypingNote() {
  // Used only to ask the browser whether voice typing works here. It never listens.
  const { status, detail } = useDictation(listenForNothing);
  if (status === 'checking') return null;
  if (status === 'unavailable') return <VoiceUnavailableNote detail={detail} />;
  return <p className="hint voice-note">{copy.voice.field.note}</p>;
}
