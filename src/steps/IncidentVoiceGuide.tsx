import { useEffect, type ReactNode } from 'react';
import { copy, fill } from '../content';
import type { Incident } from '../organizer';
import { useAppState } from '../state/AppStateProvider';
import { MicrophoneIcon } from '../voice/DictationControls';
import { GUIDED_FIELDS, isChoiceField, type GuidedField } from '../voice/incidentAnswers';
import { useIncidentInterview, type Interview } from '../voice/useIncidentInterview';
import {
  dateKindId,
  descriptionId,
  evidenceId,
  feelingId,
  firsthandId,
  howId,
  placeId,
  presentId,
} from './IncidentEditor';

// The form field each question fills, so focus can move to it.
const FIELD_ELEMENT_ID: Record<GuidedField, (incidentId: string) => string> = {
  date: dateKindId,
  place: placeId,
  how: howId,
  description: descriptionId,
  present: presentId,
  firsthand: firsthandId,
  feeling: feelingId,
  evidence: evidenceId,
};

// Each question reads exactly like its label on the card.
const QUESTION: Record<GuidedField, string> = {
  date: copy.incident.dateLabel,
  place: copy.incident.placeLabel,
  how: copy.incident.howLabel,
  description: copy.incident.descriptionLabel,
  present: copy.incident.presentLabel,
  firsthand: copy.incident.firsthandLabel,
  feeling: copy.incident.feelingLabel,
  evidence: copy.incident.evidenceLabel,
};

interface Props {
  incident: Incident;
  // The incident's form fields. The guide goes around them.
  children: ReactNode;
}

/**
 * "Answer by voice" for one incident. It asks the card's questions one at a
 * time and fills in each field from what she says. Without on-device speech
 * recognition, only the fields are shown.
 */
export function IncidentVoiceGuide({ incident, children }: Props) {
  const { dispatch } = useAppState();
  const { id } = incident;
  const g = copy.voice.guide;

  const interview = useIncidentInterview({
    onChoice: (changes) => dispatch({ type: 'updateIncident', id, changes }),
    onText: (field, phrase) => dispatch({ type: 'appendToIncident', id, field, phrase }),
  });
  const { dictation, field } = interview;

  // Focus follows the question, so she and her screen reader know where the
  // answer goes. The field is scrolled to the middle of the screen, so the
  // panel at the bottom never covers it.
  useEffect(() => {
    if (!field) return;
    const element = document.getElementById(FIELD_ELEMENT_ID[field](id));
    element?.focus({ preventScroll: true });
    element?.scrollIntoView?.({ block: 'center' });
  }, [id, field]);

  if (dictation.status === 'checking' || dictation.status === 'unavailable') return <>{children}</>;

  return (
    <>
      <div className="voice-guide-start">
        {!field && (
          <button type="button" className="btn btn-voice" onClick={interview.begin}>
            <MicrophoneIcon />
            {g.start}
          </button>
        )}
        <p className="hint">{g.intro}</p>
        <p className="hint">{copy.voice.privacy}</p>
        <p className="dictation-status" role="status">
          {interview.finished ? g.finished : ''}
        </p>
      </div>

      {children}

      {field && <GuidePanel interview={interview} field={field} />}
    </>
  );
}

/** Stays at the bottom of the screen while the questions are asked: the question, what was heard, Skip, Stop. */
function GuidePanel({ interview, field }: { interview: Interview; field: GuidedField }) {
  const { dictation, position, notUnderstood } = interview;
  const g = copy.voice.guide;
  const listening = dictation.status === 'listening';
  const preparing = dictation.status === 'preparing';

  const message = dictation.error
    ? copy.voice.errors[dictation.error]
    : notUnderstood
      ? g.notUnderstood
      : preparing
        ? copy.voice.preparing
        : listening
          ? copy.voice.listening
          : g.paused;

  return (
    <div className="voice-guide-panel" role="group" aria-label={g.panelLabel}>
      <p className="voice-guide-progress">{fill(g.progress, { n: (position ?? 0) + 1, total: GUIDED_FIELDS.length })}</p>
      <p className="voice-guide-question">{QUESTION[field]}</p>
      <p className="hint">{isChoiceField(field) ? g.say[field] : g.textSay}</p>
      {/* Hidden from screen readers: it changes with every word. */}
      {dictation.pending && (
        <p className="dictation-pending" aria-hidden="true">
          {dictation.pending}
        </p>
      )}
      <p className="dictation-status" role="status">
        {message}
      </p>
      <div className="button-row">
        {listening || preparing ? (
          <button type="button" className="btn" onClick={interview.skip}>
            {g.skip}
          </button>
        ) : (
          <button type="button" className="btn btn-voice" onClick={interview.begin}>
            <MicrophoneIcon />
            {g.resume}
          </button>
        )}
        <button type="button" className="btn" onClick={interview.stop}>
          {g.stop}
        </button>
      </div>
    </div>
  );
}
