import { useCallback, useEffect, useRef, useState } from 'react';
import { VOICE_LANGUAGE } from '../config';
import {
  canAskForOnDeviceSpeech,
  checkOnDeviceSpeech,
  createOnDeviceRecognition,
  installOnDeviceSpeech,
  missingSpeechDetail,
  type Recognition,
  type RecognitionResultEvent,
} from './speechRecognition';

export type DictationStatus =
  // Asking the browser whether it can recognize speech on this device.
  | 'checking'
  // It can't, so voice typing is not offered.
  | 'unavailable'
  | 'ready'
  // Downloading the on-device speech model, the first time only.
  | 'preparing'
  | 'listening';

export type DictationError = 'blocked' | 'noSpeech' | 'install' | 'other';

export interface Dictation {
  status: DictationStatus;
  error: DictationError | null;
  // Words heard so far in the current phrase, not final yet. Shown, never saved.
  pending: string;
  // What the browser said when asked about on-device speech. Demo note only.
  detail: string;
  start: () => Promise<void>;
  stop: () => void;
}

function toDictationError(browserError: string): DictationError | null {
  switch (browserError) {
    case 'aborted':
      return null;
    case 'not-allowed':
    case 'service-not-allowed':
      return 'blocked';
    case 'no-speech':
      return 'noSpeech';
    default:
      return 'other';
  }
}

// The browser has one microphone. Starting voice typing in one place turns it
// off anywhere else, so two fields never hear the same words.
let activeListener: Recognition | null = null;

/**
 * Voice typing for one field. onPhrase gets each finished phrase (usually
 * what she said before a pause). The microphone turns off when the component
 * using this hook goes away: after a step change, a timeout, or Quick exit.
 */
export function useDictation(onPhrase: (phrase: string) => void): Dictation {
  const [status, setStatus] = useState<DictationStatus>(() =>
    canAskForOnDeviceSpeech() ? 'checking' : 'unavailable',
  );
  const [error, setError] = useState<DictationError | null>(null);
  const [pending, setPending] = useState('');
  const [detail, setDetail] = useState(() => (canAskForOnDeviceSpeech() ? '' : missingSpeechDetail()));
  const needsDownload = useRef(false);
  const recognition = useRef<Recognition | null>(null);
  const mounted = useRef(true);
  const onPhraseRef = useRef(onPhrase);

  useEffect(() => {
    onPhraseRef.current = onPhrase;
  }, [onPhrase]);

  useEffect(() => {
    mounted.current = true;
    if (canAskForOnDeviceSpeech()) {
      checkOnDeviceSpeech(VOICE_LANGUAGE).then((check) => {
        if (!mounted.current) return;
        needsDownload.current = check.status === 'downloadable';
        setDetail(check.detail);
        setStatus(check.status === 'unavailable' ? 'unavailable' : 'ready');
      });
    }
    return () => {
      mounted.current = false;
      recognition.current?.abort();
      recognition.current = null;
    };
  }, []);

  const handleResult = useCallback((event: RecognitionResultEvent) => {
    let notFinal = '';
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      const text = result[0].transcript;
      if (result.isFinal) onPhraseRef.current(text);
      else notFinal += text;
    }
    setPending(notFinal.trim());
  }, []);

  const start = useCallback(async () => {
    if (recognition.current) return;
    setError(null);

    if (needsDownload.current) {
      setStatus('preparing');
      const installed = await installOnDeviceSpeech(VOICE_LANGUAGE);
      if (!mounted.current) return;
      if (!installed) {
        setStatus('ready');
        setError('install');
        return;
      }
      needsDownload.current = false;
    }

    const listener = createOnDeviceRecognition(VOICE_LANGUAGE);
    if (!listener) {
      setStatus('unavailable');
      return;
    }
    listener.onresult = handleResult;
    listener.onerror = (event) => setError(toDictationError(event.error));
    listener.onend = () => {
      recognition.current = null;
      if (activeListener === listener) activeListener = null;
      if (!mounted.current) return;
      setPending('');
      setStatus('ready');
    };

    activeListener?.abort();
    activeListener = listener;
    recognition.current = listener;
    try {
      listener.start();
      setStatus('listening');
    } catch {
      recognition.current = null;
      activeListener = null;
      setStatus('ready');
      setError('other');
    }
  }, [handleResult]);

  // stop() lets the browser finish the last phrase; onend then sets 'ready'.
  const stop = useCallback(() => recognition.current?.stop(), []);

  return { status, error, pending, detail, start, stop };
}
