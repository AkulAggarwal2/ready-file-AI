import { useCallback } from 'react';
import { copy } from '../content';
import { useAppState } from '../state/AppStateProvider';
import { DictationControls, VoiceUnavailableNote } from '../voice/DictationControls';
import { useDictation } from '../voice/useDictation';

const STATUS_ID = 'story-dictation-status';

/** Voice typing for "Your story". Each phrase she says is added to the end of the story. */
export function StoryDictation() {
  const { dispatch } = useAppState();
  const addPhrase = useCallback((phrase: string) => dispatch({ type: 'appendStory', phrase }), [dispatch]);
  const dictation = useDictation(addPhrase);

  if (dictation.status === 'checking') return null;
  if (dictation.status === 'unavailable') return <VoiceUnavailableNote detail={dictation.detail} />;

  return (
    <DictationControls dictation={dictation} startLabel={copy.voice.storyStart} statusId={STATUS_ID} />
  );
}
