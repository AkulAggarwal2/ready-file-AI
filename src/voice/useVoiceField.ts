import { useCallback, useEffect, useRef, useState } from 'react';
import { ON_DEVICE_AI_ENABLED, VOICE_PAUSE_MS } from '../config';
import { warmUpOnDeviceModel } from './onDeviceModel';
import { tidySpokenText } from './tidyText';
import { appendSpoken, appendWords } from './transcript';
import { useDictation, type Dictation } from './useDictation';

export interface VoiceFieldOptions {
  value: string;
  onChange: (value: string) => void;
  // The field's question, so the model can tell whether she answered it.
  question: string;
  // A short one-line field, such as a place: words are added without a
  // period, and are not tidied.
  oneLine?: boolean;
}

// What was just added to the field, so the status line can say so.
export type Added = 'tidied' | 'asSaid' | null;

export interface VoiceField {
  dictation: Dictation;
  // Everything heard since she pressed the microphone. Shown, not saved yet.
  heard: string;
  // The model is checking and tidying what she said.
  checking: boolean;
  added: Added;
  // What she said, when it didn't sound like an answer, so nothing was added.
  unrelated: string | null;
  // True while the tidied text is in the field and she hasn't changed it.
  canUseExactWords: boolean;
  // Why her words were not tidied. Demo note only.
  tidyReport: string;
  start: () => Promise<void>;
  // Puts exactly what she said in the field, in place of the tidied version.
  useExactWords: () => void;
  // Adds what she said even though it didn't sound like an answer.
  addAnyway: () => void;
}

// The field as it is with the tidied text, and as it would be with her exact words.
interface Versions {
  tidied: string;
  exact: string;
}

/**
 * Voice typing for one text field. She talks; when she pauses for
 * VOICE_PAUSE_MS, listening stops and what she said is added after what is
 * already in the field. When the on-device model is ready, it first checks
 * that she answered the field's question (if not, nothing is added), and
 * tidies her words; she can switch to her exact words with one click.
 */
export function useVoiceField({ value, onChange, question, oneLine = false }: VoiceFieldOptions): VoiceField {
  const [heard, setHeard] = useState('');
  const [checking, setChecking] = useState(false);
  const [added, setAdded] = useState<Added>(null);
  const [unrelated, setUnrelated] = useState<string | null>(null);
  const [versions, setVersions] = useState<Versions | null>(null);
  const [tidyReport, setTidyReport] = useState('');
  const latest = useRef({ value, onChange, question });
  const mounted = useRef(true);
  const append = oneLine ? appendWords : appendSpoken;

  useEffect(() => {
    latest.current = { value, onChange, question };
  });

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // Adds to what is in the field now, which she may have typed into meanwhile.
  // `exactWords` is what she said, when `text` is the tidied version of it.
  const insert = useCallback(
    (text: string, exactWords?: string) => {
      const before = latest.current.value;
      const withText = append(before, text);
      latest.current.onChange(withText);
      setAdded(exactWords ? 'tidied' : 'asSaid');
      setVersions(exactWords ? { tidied: withText, exact: append(before, exactWords) } : null);
    },
    [append],
  );

  const addPhrase = useCallback((phrase: string) => setHeard((text) => append(text, phrase)), [append]);
  const dictation = useDictation(addPhrase);
  const { status, pending, start: startDictation, stop } = dictation;
  const listening = status === 'listening';

  // She paused: stop listening. Counted from the browser's last finished
  // phrase, so a short breath mid-sentence doesn't cut her off.
  useEffect(() => {
    if (!listening || !heard || pending) return;
    const timer = setTimeout(stop, VOICE_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [listening, heard, pending, stop]);

  // When listening ends, the model checks and tidies what she said, if it can.
  // Without the model, her words are added as she said them.
  useEffect(() => {
    if (listening || !heard.trim()) return;
    const said = heard.trim();
    setHeard('');
    if (!ON_DEVICE_AI_ENABLED) {
      insert(said);
      return;
    }

    setChecking(true);
    tidySpokenText(latest.current.question, said).then((result) => {
      if (!mounted.current) return;
      setChecking(false);
      setTidyReport(result.kind === 'failed' ? result.reason : '');
      if (result.kind === 'unrelated') setUnrelated(said);
      // One-line fields, like a place, keep her words as she said them.
      else if (result.kind === 'tidied' && !oneLine && result.text !== said) insert(result.text, said);
      else insert(said);
    });
  }, [listening, heard, oneLine, insert]);

  const start = useCallback(async () => {
    setAdded(null);
    setVersions(null);
    setUnrelated(null);
    // Pressing the microphone is the moment the browser allows the model download.
    if (ON_DEVICE_AI_ENABLED) warmUpOnDeviceModel();
    await startDictation();
  }, [startDictation]);

  const useExactWords = useCallback(() => {
    if (!versions) return;
    latest.current.onChange(versions.exact);
    setVersions(null);
    setAdded('asSaid');
  }, [versions]);

  const addAnyway = useCallback(() => {
    if (unrelated === null) return;
    insert(unrelated);
    setUnrelated(null);
  }, [unrelated, insert]);

  return {
    dictation,
    heard,
    checking,
    added,
    unrelated,
    // Once she edits the field, her edits win and the switch goes away.
    canUseExactWords: versions !== null && value === versions.tidied,
    tidyReport,
    start,
    useExactWords,
    addAnyway,
  };
}
