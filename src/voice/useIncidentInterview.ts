import { useCallback, useEffect, useRef, useState } from 'react';
import { ANSWER_PAUSE_MS } from '../config';
import type { IncidentFields } from '../organizer';
import {
  GUIDED_FIELDS,
  isChoiceField,
  readChoiceAnswer,
  readCommand,
  type GuidedField,
  type TextField,
} from './incidentAnswers';
import { useDictation, type Dictation } from './useDictation';

export interface InterviewHandlers {
  // A choice question was answered: set these fields.
  onChoice: (changes: Partial<IncidentFields>) => void;
  // Words for a written answer: add them to the end of this field.
  onText: (field: TextField, phrase: string) => void;
}

export interface Interview {
  dictation: Dictation;
  // The question being asked, or null when the interview is not running.
  field: GuidedField | null;
  // 0-based position of that question in GUIDED_FIELDS.
  position: number | null;
  // The last answer to a choice question matched none of its options.
  notUnderstood: boolean;
  // She finished or stopped, so the app can say so.
  finished: boolean;
  // Starts at the first question, or picks up where it paused.
  begin: () => void;
  skip: () => void;
  stop: () => void;
}

/**
 * Asks an incident's questions by voice, one at a time. A choice answer moves
 * on as soon as it is understood. A written answer moves on after she pauses
 * for ANSWER_PAUSE_MS. Saying "skip" or "stop" works at any question.
 */
export function useIncidentInterview(handlers: InterviewHandlers): Interview {
  const [position, setPosition] = useState<number | null>(null);
  // Speech results arrive outside React's render, so they read the question from a ref.
  const positionRef = useRef<number | null>(null);
  const [heardAt, setHeardAt] = useState<number | null>(null);
  const [notUnderstood, setNotUnderstood] = useState(false);
  const [finished, setFinished] = useState(false);
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  const goTo = useCallback((next: number | null) => {
    positionRef.current = next;
    setPosition(next);
    setHeardAt(null);
    setNotUnderstood(false);
  }, []);

  const stop = useCallback(() => {
    goTo(null);
    setFinished(true);
  }, [goTo]);

  const skip = useCallback(() => {
    const current = positionRef.current;
    if (current === null) return;
    if (current + 1 < GUIDED_FIELDS.length) goTo(current + 1);
    else stop();
  }, [goTo, stop]);

  const onPhrase = useCallback(
    (phrase: string) => {
      const current = positionRef.current;
      if (current === null) return;

      const command = readCommand(phrase);
      if (command === 'skip') return skip();
      if (command === 'stop') return stop();

      const field = GUIDED_FIELDS[current];
      if (isChoiceField(field)) {
        const changes = readChoiceAnswer(field, phrase);
        if (!changes) {
          setNotUnderstood(true);
          return;
        }
        handlersRef.current.onChoice(changes);
        skip();
      } else {
        handlersRef.current.onText(field, phrase);
        setNotUnderstood(false);
        setHeardAt(Date.now());
      }
    },
    [skip, stop],
  );

  const dictation = useDictation(onPhrase);
  const { status, pending, start, stop: stopListening } = dictation;

  // The microphone is on only while a question is being asked.
  useEffect(() => {
    if (position === null) stopListening();
  }, [position, stopListening]);

  // A written answer is done once she has been quiet for a moment.
  useEffect(() => {
    if (heardAt === null || pending || status !== 'listening') return;
    const timer = setTimeout(skip, ANSWER_PAUSE_MS);
    return () => clearTimeout(timer);
  }, [heardAt, pending, status, skip]);

  const begin = useCallback(() => {
    setFinished(false);
    goTo(positionRef.current ?? 0);
    void start();
  }, [goTo, start]);

  return {
    dictation,
    field: position === null ? null : GUIDED_FIELDS[position],
    position,
    notUnderstood,
    finished,
    begin,
    skip,
    stop,
  };
}
