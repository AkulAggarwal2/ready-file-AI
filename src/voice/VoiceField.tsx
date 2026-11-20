import type { ReactNode } from 'react';
import { DEMO_MODE } from '../config';
import { copy, fill } from '../content';
import { MicrophoneIcon } from './VoiceNotes';
import { useVoiceField, type VoiceField as VoiceFieldState, type VoiceFieldOptions } from './useVoiceField';

interface Props extends Omit<VoiceFieldOptions, 'question'> {
  // The id of the input or textarea, to move focus back to it.
  fieldId: string;
  // The field's label, so the microphone button can say which field it is for.
  label: string;
  // The hint under the label, which helps the model tell whether she answered.
  hint?: string;
  // The input or textarea itself.
  children: ReactNode;
}

/**
 * A text field with a small microphone button in its corner. She talks, and
 * when she pauses, what she said is added after what is already in the field,
 * tidied up when the on-device model can do it. If it clearly doesn't answer
 * the field's question, it isn't added. Where the browser can't turn speech
 * into text on this device, the field is shown without the button.
 */
export function VoiceField({ fieldId, label, hint, children, ...options }: Props) {
  const voice = useVoiceField({ ...options, question: hint ? `${label} (${hint})` : label });
  const { dictation, heard, checking, unrelated, canUseExactWords, tidyReport } = voice;
  const f = copy.voice.field;

  // The field stays in the same place in the page whether or not voice
  // typing is offered, so it isn't rebuilt (losing focus) once the browser answers.
  const offered = dictation.status !== 'checking' && dictation.status !== 'unavailable';
  const listening = dictation.status === 'listening';
  const statusId = `${fieldId}-voice-status`;
  const preview = [heard, dictation.pending].filter(Boolean).join(' ');
  const micLabel = fill(listening ? f.stop : f.speak, { field: label });

  // These links go away once used, so focus goes to the field.
  const thenFocusField = (action: () => void) => () => {
    action();
    document.getElementById(fieldId)?.focus();
  };

  return (
    <div className="voice-field">
      <div className={offered ? 'voice-field-box has-mic' : 'voice-field-box'}>
        {children}
        {offered && (
          <button
            type="button"
            className={listening ? 'voice-field-mic is-listening' : 'voice-field-mic'}
            aria-label={micLabel}
            title={micLabel}
            aria-describedby={statusId}
            disabled={dictation.status === 'preparing' || checking}
            onClick={listening ? dictation.stop : voice.start}
          >
            <MicrophoneIcon />
          </button>
        )}
      </div>

      <p id={statusId} className="dictation-status" role="status">
        {statusMessage(voice, label)}
      </p>

      {/* Hidden from screen readers: it changes with every word. */}
      {listening && preview && (
        <p className="dictation-pending" aria-hidden="true">
          {preview}
        </p>
      )}

      {canUseExactWords && (
        <button type="button" className="link-button voice-field-link" onClick={thenFocusField(voice.useExactWords)}>
          {f.useExactWords}
        </button>
      )}

      {unrelated !== null && (
        <button type="button" className="link-button voice-field-link" onClick={thenFocusField(voice.addAnyway)}>
          {f.addAnyway}
        </button>
      )}

      {DEMO_MODE && tidyReport && <p className="hint dev-only-inline">{fill(f.demoReport, { reason: tidyReport })}</p>}
    </div>
  );
}

/** What the status line says, for screen readers too. */
function statusMessage({ dictation, checking, added, unrelated }: VoiceFieldState, label: string): string {
  const c = copy.voice;
  if (dictation.error) return c.errors[dictation.error];
  if (dictation.status === 'listening') return c.field.listening;
  if (dictation.status === 'preparing') return c.preparing;
  if (checking) return c.field.checking;
  if (unrelated !== null) return fill(c.field.unrelated, { field: label });
  if (added === 'tidied') return fill(c.field.addedTidied, { field: label });
  if (added === 'asSaid') return fill(c.field.added, { field: label });
  return '';
}
