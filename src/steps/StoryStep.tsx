import { useEffect } from 'react';
import { YES_NO_UNKNOWN, type YesNoUnknown } from '../checker';
import { copy } from '../content';
import type { PersonDetails } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';
import { StepHeading } from '../ui/StepHeading';
import { VoiceTypingNote } from '../voice/VoiceNotes';
import { ASK_ATTRIBUTE } from '../voice/formQuestions';
import { VoiceField } from '../voice/VoiceField';

export const THREAT_ID = 'threat';
export const ASKED_TO_STOP_ID = 'asked-to-stop';
export const CONVICTED_ID = 'convicted';
const FOCUS_IDS = [THREAT_ID, ASKED_TO_STOP_ID, CONVICTED_ID];

/**
 * Her account in her own words, plus two questions about the person as a whole:
 * whether they could hurt her now, and whether she told them to stop. All optional.
 */
export function StoryStep() {
  const { state, dispatch } = useAppState();
  const c = copy.story;
  const setDetails = (changes: PersonDetails) => dispatch({ type: 'setPersonDetails', changes });

  // After "Add more" on one of these questions, focus its field.
  useEffect(() => {
    if (!state.focusTarget || !FOCUS_IDS.includes(state.focusTarget)) return;
    document.getElementById(state.focusTarget)?.focus();
    dispatch({ type: 'focusHandled' });
  }, [state.focusTarget, dispatch]);

  return (
    <div>
      <StepHeading>{c.heading}</StepHeading>
      <p>{c.intro}</p>
      <VoiceTypingNote />

      <label htmlFor="story">{c.label}</label>
      <p id="story-hint" className="hint">
        {c.hint}
      </p>
      <VoiceField
        fieldId="story"
        label={c.label}
        hint={c.hint}
        value={state.story}
        onChange={(story) => dispatch({ type: 'setStory', story })}
      >
        <textarea
          id="story"
          rows={12}
          aria-describedby="story-hint"
          value={state.story}
          onChange={(e) => dispatch({ type: 'setStory', story: e.target.value })}
        />
      </VoiceField>

      <h2>{c.personHeading}</h2>

      <label htmlFor={THREAT_ID}>{c.threatLabel}</label>
      <p id="threat-hint" className="hint">
        {c.threatHint}
      </p>
      <VoiceField
        fieldId={THREAT_ID}
        label={c.threatLabel}
        hint={c.threatHint}
        value={state.threat}
        onChange={(threat) => setDetails({ threat })}
      >
        <textarea
          id={THREAT_ID}
          rows={4}
          aria-describedby="threat-hint"
          value={state.threat}
          onChange={(e) => setDetails({ threat: e.target.value })}
        />
      </VoiceField>

      <label htmlFor={ASKED_TO_STOP_ID}>{c.askedToStopLabel}</label>
      <select
        id={ASKED_TO_STOP_ID}
        value={state.askedToStop}
        onChange={(e) => setDetails({ askedToStop: e.target.value as YesNoUnknown })}
      >
        {YES_NO_UNKNOWN.map((value) => (
          <option key={value} value={value}>
            {c.askedToStopOptions[value]}
          </option>
        ))}
      </select>

      {state.askedToStop === 'yes' && (
        <>
          <label htmlFor="asked-to-stop-detail">{c.askedToStopDetailLabel}</label>
          <p id="asked-to-stop-detail-hint" className="hint">
            {c.askedToStopDetailHint}
          </p>
          <VoiceField
            fieldId="asked-to-stop-detail"
            label={c.askedToStopDetailLabel}
            hint={c.askedToStopDetailHint}
            value={state.askedToStopDetail}
            onChange={(askedToStopDetail) => setDetails({ askedToStopDetail })}
          >
            <textarea
              id="asked-to-stop-detail"
              rows={2}
              aria-describedby="asked-to-stop-detail-hint"
              value={state.askedToStopDetail}
              onChange={(e) => setDetails({ askedToStopDetail: e.target.value })}
            />
          </VoiceField>
        </>
      )}

      {state.caseType === 'sexual-assault' && (
        <>
          <label htmlFor={CONVICTED_ID}>{c.convictedLabel}</label>
          <p id="convicted-hint" className="hint">
            {c.convictedHint}
          </p>
          <select
            id={CONVICTED_ID}
            aria-describedby="convicted-hint"
            value={state.convicted}
            onChange={(e) => setDetails({ convicted: e.target.value as YesNoUnknown })}
          >
            {YES_NO_UNKNOWN.map((value) => (
              <option key={value} value={value}>
                {c.convictedOptions[value]}
              </option>
            ))}
          </select>
        </>
      )}

      <div className="button-row">
        <button type="button" className="btn" onClick={() => dispatch({ type: 'goTo', step: 'incidents' })}>
          {c.back}
        </button>
        {/* After "Add more", this takes her back to the question she came from, open. */}
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => dispatch(state.returnQuestion ? { type: 'backToQuestion' } : { type: 'goTo', step: 'questions' })}
          {...{ [ASK_ATTRIBUTE]: copy.voice.handsFree.ask.storyDone }}
        >
          {state.returnQuestion ? copy.check.backToQuestion : c.next}
        </button>
      </div>
    </div>
  );
}
