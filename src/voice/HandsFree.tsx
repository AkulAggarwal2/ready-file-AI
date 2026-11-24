import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HANDS_FREE_RESTART_MS, ON_DEVICE_AI_ENABLED } from '../config';
import { copy, fill } from '../content';
import { useAppState } from '../state/AppStateProvider';
import { Tooltip } from '../ui/Tooltip';
import { findQuestions, questionFrom, readQuestion, type FormQuestion, type QuestionChoice } from './formQuestions';
import { HandsFreeContext, useHandsFree, type HandsFree } from './handsFreeContext';
import { readDateAnswer } from './incidentAnswers';
import { warmUpOnDeviceModel } from './onDeviceModel';
import { pickChoiceWithModel } from './pickChoice';
import {
  actOn,
  asCandidates,
  badgeAnchor,
  bringIntoView,
  choose,
  controlsOnScreen,
  fillIn,
  findControls,
  pickLikeliest,
  scrollIntoClearView,
  scrollPage,
  COVER_ATTRIBUTE,
  SKIP_ATTRIBUTE,
  type ActResult,
  type PageControl,
} from './pageControls';
import { useDictation, useMicrophoneOn } from './useDictation';
import { MicrophoneIcon } from './VoiceNotes';
import {
  isBoxCommand,
  matchName,
  namedInFull,
  pickMentionedChoice,
  readGuideCommand,
  readMoveWithin,
  readVoiceCommand,
  readYesNoWithin,
  soundsLikeWhen,
  trimWhen,
  type VoiceAction,
  type VoiceCommand,
} from './voiceCommands';

const h = copy.voice.handsFree;
const g = h.guide;

// If listening keeps ending right after it starts, with nothing heard, the
// microphone isn't working. Stop trying, and say so, instead of looping.
const QUICK_END_MS = 1000;
const MAX_QUICK_ENDS = 3;

// After an answer, the page updates (a card opens, a new step appears)
// before the next question is found.
const SETTLE_MS = 80;

function describe(result: ActResult): string {
  return fill(h[result.kind], { name: result.name });
}

/** Focus is in the step's content, not the header or the bar. */
function focusInPage(): Element | null {
  const active = document.activeElement;
  const main = document.querySelector('main');
  return active && active !== document.body && main?.contains(active) ? active : null;
}

/** The box she is answering by voice, and what was in it before. */
interface Answering {
  container: HTMLElement;
  field: HTMLInputElement | HTMLTextAreaElement;
  before: string;
}

/**
 * Voice control for the whole app. While it is on, it asks the questions on
 * the screen one at a time, in order, and shows what she can say: a choice
 * (or its number), her answer for a box (that box's own microphone listens),
 * "yes" to press a button like "Add an incident", "skip", or "back". When
 * she answers, it moves on, through every step. She can also say the words
 * on anything on the screen to press it, or "show numbers", "scroll down",
 * "help", and "stop listening". Speech stays on the device.
 */
export function HandsFreeProvider({ children }: { children: ReactNode }) {
  const { state } = useAppState();
  const [on, setOn] = useState(false);
  const [heard, setHeard] = useState('');
  const [message, setMessage] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [numbered, setNumbered] = useState<PageControl[] | null>(null);
  // Why voice control turned itself off, until she closes the note.
  const [stopped, setStopped] = useState<string | null>(null);
  // The question being asked: its fieldset, list, box, or ask.
  const [questionElement, setQuestionElement] = useState<HTMLElement | null>(null);
  // Bumped when the page changes, so the question and its choices are read again.
  const [pageVersion, setPageVersion] = useState(0);
  const onNow = useRef(false);
  const numberedNow = useRef<PageControl[] | null>(null);
  const questionNow = useRef<HTMLElement | null>(null);
  const answering = useRef<Answering | null>(null);
  const lastAsked = useRef<{ element: HTMLElement | null; at: number }>({ element: null, at: 0 });
  const quickEnds = useRef(0);
  const startedAt = useRef(0);
  const heardSinceStart = useRef(false);

  const showNumbers = useCallback((controls: PageControl[] | null) => {
    numberedNow.current = controls;
    setNumbered(controls);
  }, []);

  const setQuestion = useCallback((element: HTMLElement | null) => {
    questionNow.current = element;
    setQuestionElement(element);
  }, []);

  /** Starts the box's own microphone for her answer. */
  const listenInBox = useCallback((question: FormQuestion) => {
    const field = question.field as HTMLInputElement | HTMLTextAreaElement;
    const microphone = field.closest('.voice-field-box')?.querySelector<HTMLButtonElement>('.voice-field-mic');
    if (!microphone || microphone.disabled) return;
    if (microphone.classList.contains('is-listening')) return;
    answering.current = { container: question.container, field, before: field.value };
    microphone.click();
  }, []);

  /** Asks a question: moves to it and, for a box, starts listening for the answer. */
  const ask = useCallback(
    (question: FormQuestion | null) => {
      if (!onNow.current) return;
      // The same question, asked twice in a moment (the page changed, and an answer moved on).
      const now = Date.now();
      if (question && lastAsked.current.element === question.container && now - lastAsked.current.at < 400) return;
      lastAsked.current = { element: question?.container ?? null, at: now };

      answering.current = null;
      setQuestion(question?.container ?? null);
      if (!question) return;

      // A closed question card: open it, then ask what is inside.
      if (question.opener) {
        question.opener.click();
        setTimeout(() => {
          const opened = onNow.current && question.container.isConnected ? readQuestion(question.container) : null;
          const first = opened?.choices[0]?.element;
          if (first) bringIntoView(first);
          setPageVersion((version) => version + 1);
        }, SETTLE_MS);
        return;
      }

      const target =
        question.field ??
        question.choices.find((choice) => choice.checked)?.element ??
        question.choices[0]?.element ??
        question.container;
      bringIntoView(target);
      if (question.kind === 'text') listenInBox(question);
    },
    [listenInBox, setQuestion],
  );

  /** Turns off a box's microphone that is still listening. */
  const stopBox = useCallback(() => {
    answering.current = null;
    document.querySelector<HTMLButtonElement>('.voice-field-mic.is-listening')?.click();
  }, []);

  /** The next (1) or previous (-1) question on this step. */
  const move = useCallback(
    (step: 1 | -1): string => {
      stopBox();
      const questions = findQuestions();
      const index = questions.findIndex((question) => question.container === questionNow.current);
      if (index === -1) {
        ask(questionFrom(questions, focusInPage()));
        return '';
      }
      const next = questions[index + step];
      if (!next) return step === 1 ? g.last : g.first;
      lastAsked.current = { element: null, at: 0 };
      ask(next);
      return '';
    },
    [ask, stopBox],
  );

  /**
   * After an answer: once the page has updated, asks the next question. If
   * focus moved somewhere new (a new incident, a new step), that is where
   * the next question is.
   */
  const continueAfter = useCallback(
    (container: HTMLElement) => {
      setTimeout(() => {
        if (!onNow.current) return;
        const questions = findQuestions();
        const focus = focusInPage();
        const movedAway = !container.isConnected || (focus !== null && !container.contains(focus));
        if (movedAway) {
          ask(questionFrom(questions, focus));
          return;
        }
        const index = questions.findIndex((question) => question.container === container);
        const next = index === -1 ? questionFrom(questions, container) : questions[index + 1];
        if (!next) {
          setQuestion(null);
          setMessage(g.last);
          return;
        }
        ask(next);
      }, SETTLE_MS);
    },
    [ask, setQuestion],
  );

  /** She said something to press on the page: the question follows where focus went. */
  const followFocus = useCallback(() => {
    setTimeout(() => {
      if (!onNow.current) return;
      const focus = focusInPage();
      if (!focus) return;
      const question = questionFrom(findQuestions(), focus);
      if (question && question.container.contains(focus)) setQuestion(question.container);
    }, SETTLE_MS);
  }, [setQuestion]);

  const press = useCallback(
    (control: PageControl, action: VoiceAction) => {
      showNumbers(null);
      // Taken before acting: a box's microphone starts listening right away.
      const before = control.kind === 'textbox' ? (control.element as HTMLTextAreaElement).value : '';
      const result = actOn(control, action);
      followFocus();
      // She named a box and is answering in it: move on once she has.
      if (result.kind === 'dictating') {
        const field = control.element as HTMLInputElement | HTMLTextAreaElement;
        answering.current = { container: field, field, before };
      }
      return describe(result);
    },
    [showNumbers, followFocus],
  );

  /** Answers the question with one of its choices. */
  const answerWith = useCallback(
    (question: FormQuestion, choice: QuestionChoice, action: VoiceAction = 'press'): string => {
      showNumbers(null);
      if (question.kind === 'checks') {
        const result = actOn({ element: choice.element, kind: 'checkbox', names: [choice.name], exactOnly: false }, action);
        setPageVersion((version) => version + 1);
        return describe(result);
      }
      if (choice.option) {
        const list = choice.element as HTMLSelectElement;
        bringIntoView(list);
        choose(list, choice.option);
      } else {
        bringIntoView(choice.element);
        choice.element.click();
      }
      continueAfter(question.container);
      return fill(question.kind === 'ask' ? h.pressed : h.chosen, { name: choice.name });
    },
    [continueAfter, showNumbers],
  );

  /** "When did it happen?": a spoken date goes into the date box or the "about when" box. */
  const answerWhen = useCallback(
    (question: FormQuestion, said: string): string | null => {
      const date = readDateAnswer(said);
      const when = question.when;
      const list = question.field as HTMLSelectElement;
      if (!date || !when) return null;
      if (date.kind === 'approximate' && !soundsLikeWhen(date.text)) return null;
      const option = Array.from(list.options).find((item) => item.value === date.kind);
      if (!option) return null;
      choose(list, option);
      if (date.kind === 'unknown') {
        continueAfter(question.container);
        return fill(h.chosen, { name: option.text });
      }
      const value = date.kind === 'exact' ? date.value : trimWhen(date.text);
      setTimeout(() => {
        const box = document.getElementById(date.kind === 'exact' ? when.exact : when.approx);
        if (!(box instanceof HTMLInputElement)) return;
        bringIntoView(box);
        fillIn(box, value);
        continueAfter(box);
      }, SETTLE_MS);
      return fill(g.dateSet, { date: date.kind === 'exact' ? said.trim().replace(/[.!?]+$/, '') : value });
    },
    [continueAfter],
  );

  const respondToCommand = useCallback(
    (command: VoiceCommand, said: string): string | null => {
      switch (command.kind) {
        case 'help':
          setHelpOpen(true);
          return '';
        case 'hideHelp':
          setHelpOpen(false);
          return '';
        case 'stopListening':
          return '';
        case 'scroll':
          showNumbers(null);
          scrollPage(command.direction);
          return '';
        case 'showNumbers':
          showNumbers(controlsOnScreen(findControls()));
          return h.sayNumber;
        case 'hideNumbers':
          showNumbers(null);
          return '';
        case 'number': {
          const list = numberedNow.current;
          if (!list) return h.numbersFirst;
          const control = list[command.n - 1];
          if (!control || !control.element.isConnected) return fill(h.noNumber, { n: command.n });
          return press(control, 'press');
        }
        case 'name': {
          const controls = findControls();
          const match = matchName(command.attempts, asCandidates(controls));
          if (match.kind === 'none') return null;
          if (match.kind === 'found') return press(controls[match.index], match.action);
          const tied = match.indexes.map((index) => controls[index]);
          const likeliest = pickLikeliest(tied);
          if (likeliest) return press(likeliest, match.action);
          showNumbers(tied.filter((control) => control.kind !== 'option'));
          return fill(h.several, { said });
        }
      }
    },
    [press, showNumbers],
  );

  /** What she said, as an answer to the question being asked. Null if it isn't one. */
  const answerQuestion = useCallback(
    (question: FormQuestion, command: VoiceCommand | null): string | null => {
      const guide = readGuideCommand(command?.kind === 'name' ? command.attempts[0].words.join(' ') : '');
      if (guide === 'skip') return move(1);
      if (guide === 'back') return move(-1);
      if (guide === 'repeat') {
        lastAsked.current = { element: null, at: 0 };
        ask(question);
        return '';
      }
      if (guide === 'done' && question.kind === 'checks') return move(1);
      if (question.kind === 'ask' && question.choices.length === 1) {
        if (guide === 'yes') return answerWith(question, question.choices[0]);
        if (guide === 'no') return move(1);
      }
      // A choice's number, from the numbered list in the bar.
      if (command?.kind === 'number' && !numberedNow.current && question.kind !== 'ask') {
        const choice = question.choices[command.n - 1];
        return choice ? answerWith(question, choice) : fill(h.noNumber, { n: command.n });
      }
      if (command?.kind === 'name' && question.choices.length > 0) {
        // Picking one from a list: one telling word is enough. Check boxes
        // and buttons need more of their name.
        const lenient = question.kind === 'choice';
        const candidates = question.choices.map((choice) => ({ names: [choice.name], minCoverage: lenient ? 0.01 : undefined }));
        const match = matchName(command.attempts, candidates);
        if (match.kind === 'found') return answerWith(question, question.choices[match.index], match.action);
      }
      return null;
    },
    [answerWith, ask, move],
  );

  /**
   * What she said as an answer in her own words, without AI: "I'm here about
   * stalking", "yeah, let's add one", "he threatened to hurt me". Null if it
   * isn't one.
   */
  const answerInWords = useCallback(
    (question: FormQuestion, said: string): string | null => {
      const moveTo = readMoveWithin(said);
      if (moveTo) return move(moveTo === 'skip' ? 1 : -1);
      const names = question.choices.map((choice) => choice.name);

      if (question.kind === 'ask' && question.choices.length === 1) {
        const answer = readYesNoWithin(said);
        if (answer === 'yes') return answerWith(question, question.choices[0]);
        if (answer === 'no') return move(1);
      }
      if (question.kind === 'checks') {
        const named = namedInFull(said, names);
        if (named.length === 0) return null;
        for (const index of named) {
          const choice = question.choices[index];
          actOn({ element: choice.element, kind: 'checkbox', names: [choice.name], exactOnly: false }, 'check');
        }
        setPageVersion((version) => version + 1);
        return fill(g.checkedSome, { names: quoteList(named.map((index) => names[index]), g.and) });
      }
      // "When did it happen?" takes a date instead (see answerWhen).
      if (question.kind === 'choice' && !question.when) {
        const pick = pickMentionedChoice(said, names);
        if (pick.kind === 'one') {
          answerWith(question, question.choices[pick.index]);
          return fill(g.understood, { name: names[pick.index] });
        }
        if (pick.kind === 'several') {
          return fill(g.whichOne, { names: quoteList(pick.indexes.map((index) => names[index]), g.or) });
        }
      }
      return null;
    },
    [answerWith, move],
  );

  /**
   * Her own words named no choice: with on-device AI on, the model picks the
   * one she means, or none. The question must still be the same when it answers.
   */
  const askModelForChoice = useCallback(
    (question: FormQuestion, said: string) => {
      const asked = question.container;
      const names = question.choices.map((choice) => choice.name);
      void pickChoiceWithModel(question.prompt, names, said).then((index) => {
        if (!onNow.current || questionNow.current !== asked || !asked.isConnected) return;
        const now = readQuestion(asked);
        const choice = index === null ? undefined : now?.choices[index];
        if (!now || !choice || choice.name !== names[index!]) {
          setMessage(g.notUnderstood);
          return;
        }
        answerWith(now, choice);
        setMessage(fill(g.understood, { name: choice.name }));
      });
    },
    [answerWith],
  );

  const dictationStop = useRef<() => void>(() => {});

  // `reason` is set when it turns itself off, so the bar can say why.
  const turnOff = useCallback(
    (reason: string | null = null) => {
      onNow.current = false;
      answering.current = null;
      setOn(false);
      setHelpOpen(false);
      setMessage('');
      setStopped(reason);
      setQuestion(null);
      showNumbers(null);
      dictationStop.current();
    },
    [setQuestion, showNumbers],
  );

  const handlePhrase = useCallback(
    (phrase: string) => {
      if (!onNow.current) return;
      const said = phrase.trim();
      const command = readVoiceCommand(said, numberedNow.current !== null);
      if (!command) return;
      heardSinceStart.current = true;
      quickEnds.current = 0;
      setHeard(said);
      if (command.kind === 'stopListening') {
        turnOff();
        return;
      }

      const current = questionNow.current;
      const question = current?.isConnected ? readQuestion(current) : null;
      // The question first, then the fixed words, then anything on the screen by name.
      const answer = question ? (answerQuestion(question, command) ?? answerInWords(question, said)) : null;
      if (answer !== null) {
        setMessage(answer);
        return;
      }
      if (command.kind !== 'name') {
        setMessage(respondToCommand(command, said) ?? '');
        return;
      }
      const pressed = respondToCommand(command, said);
      if (pressed !== null) {
        setMessage(pressed);
        return;
      }
      if (question?.when || question?.kind === 'date') {
        const date = question.when ? answerWhen(question, said) : null;
        if (date !== null) {
          setMessage(date);
          return;
        }
        const exact = readDateAnswer(said);
        if (question.kind === 'date' && exact?.kind === 'exact' && question.field instanceof HTMLInputElement) {
          fillIn(question.field, exact.value);
          continueAfter(question.container);
          setMessage(fill(g.dateSet, { date: said }));
          return;
        }
        if (question.kind === 'date') {
          setMessage(g.notADate);
          return;
        }
      }
      if (question?.kind === 'choice' && !question.when && ON_DEVICE_AI_ENABLED) {
        setMessage(g.thinking);
        askModelForChoice(question, said);
        return;
      }
      if (question?.kind === 'checks') {
        setMessage(g.notChecked);
        return;
      }
      setMessage(question ? g.notUnderstood : fill(h.notFound, { said }));
    },
    [answerQuestion, answerInWords, answerWhen, askModelForChoice, continueAfter, respondToCommand, turnOff],
  );

  const dictation = useDictation(handlePhrase);
  const { status, error, start, stop } = dictation;
  useEffect(() => {
    dictationStop.current = stop;
  }, [stop]);
  const microphoneOn = useMicrophoneOn();
  const ownMicrophone = status === 'listening' || status === 'preparing';
  const paused = on && microphoneOn && !ownMicrophone;

  const turnOn = useCallback(() => {
    onNow.current = true;
    quickEnds.current = 0;
    lastAsked.current = { element: null, at: 0 };
    setOn(true);
    setHelpOpen(false);
    setHeard('');
    setMessage('');
    setStopped(null);
    // Started right away, inside the click: the first time, the browser
    // allows the speech download only then. The model too, if it is used.
    void start();
    if (ON_DEVICE_AI_ENABLED) warmUpOnDeviceModel();
    // The first question: where she is, or the first one on this step.
    ask(questionFrom(findQuestions(), focusInPage()));
  }, [ask, start]);

  // A box she named, or a box being asked, said into by voice.
  const takeSpokenCommand = useCallback(
    (said: string): boolean => {
      if (!onNow.current || !isBoxCommand(said)) return false;
      answering.current = null;
      setHeard(said);
      setTimeout(() => {
        if (!onNow.current) return;
        if (readVoiceCommand(said)?.kind === 'stopListening') {
          turnOff();
          return;
        }
        const guide = readGuideCommand(said);
        if (guide === 'repeat') {
          const current = questionNow.current;
          const question = current?.isConnected ? readQuestion(current) : null;
          lastAsked.current = { element: null, at: 0 };
          ask(question);
          return;
        }
        setMessage(move(guide === 'back' ? -1 : 1));
      }, 0);
      return true;
    },
    [ask, move, turnOff],
  );

  // Keep listening while it is on, whenever no other microphone is.
  useEffect(() => {
    if (!on || status !== 'ready' || microphoneOn) return;
    const timer = setTimeout(() => void start(), HANDS_FREE_RESTART_MS);
    return () => clearTimeout(timer);
  }, [on, status, microphoneOn, start]);

  // Notice listening that ends as soon as it starts.
  const lastStatus = useRef(status);
  useEffect(() => {
    const before = lastStatus.current;
    lastStatus.current = status;
    if (status === 'listening' && before !== 'listening') {
      startedAt.current = Date.now();
      heardSinceStart.current = false;
    }
    if (!onNow.current || before !== 'listening' || status !== 'ready') return;
    const quick = Date.now() - startedAt.current < QUICK_END_MS && !heardSinceStart.current;
    quickEnds.current = quick ? quickEnds.current + 1 : 0;
    if (quickEnds.current >= MAX_QUICK_ENDS) turnOff(h.stoppedWorking);
  }, [status, turnOff]);

  // A blocked microphone or a failed download won't fix itself.
  useEffect(() => {
    if (!onNow.current || (error !== 'blocked' && error !== 'install')) return;
    turnOff(copy.voice.errors[error]);
  }, [error, turnOff]);

  // Back from a box's microphone (and its tidying): if her answer went in,
  // the next question. If not, she can try again or skip. Checked a moment
  // later, since tidying starts just after listening stops.
  const wasPaused = useRef(false);
  useEffect(() => {
    const resumed = wasPaused.current && !paused;
    wasPaused.current = paused;
    if (!resumed || !on) return;
    const timer = setTimeout(() => {
      const box = answering.current;
      answering.current = null;
      setHeard('');
      if (!box || !box.field.isConnected) return;
      if (box.field.value !== box.before) {
        setMessage('');
        continueAfter(box.container);
      } else if (box.container === questionNow.current) {
        setMessage(g.noAnswer);
      }
    }, SETTLE_MS);
    return () => clearTimeout(timer);
  }, [paused, on, continueAfter]);

  // A new step: start with the question where focus is, or its first one.
  useEffect(() => {
    if (!onNow.current) return;
    const timer = setTimeout(() => {
      if (questionNow.current?.isConnected) return;
      ask(questionFrom(findQuestions(), focusInPage()));
    }, SETTLE_MS * 2);
    return () => clearTimeout(timer);
  }, [state.step, ask]);

  // When the page changes (a card opens or closes, a choice is made), read
  // the question again. If it is gone, go on from where focus is.
  useEffect(() => {
    const main = document.querySelector('main');
    if (!on || !main || typeof MutationObserver === 'undefined') return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const observer = new MutationObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        setPageVersion((version) => version + 1);
        const current = questionNow.current;
        if (current && !current.isConnected && !answering.current) {
          ask(questionFrom(findQuestions(), focusInPage()));
        }
      }, SETTLE_MS * 2);
    });
    observer.observe(main, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-expanded', 'hidden'] });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [on, ask]);

  // The question as it is on the page now, and where it is among this step's questions.
  const { question, questionNumber, questionCount } = useMemo(() => {
    void pageVersion;
    if (!on || !questionElement?.isConnected) return { question: null, questionNumber: 0, questionCount: 0 };
    const questions = findQuestions();
    return {
      question: readQuestion(questionElement),
      questionNumber: questions.findIndex((item) => item.container === questionElement),
      questionCount: questions.length,
    };
    // `message` and `heard` change after each answer, when choices may have changed.
  }, [on, questionElement, pageVersion, message, heard]);

  const value = useMemo<HandsFree>(
    () => ({
      available: status !== 'checking' && status !== 'unavailable',
      checking: status === 'checking',
      on,
      paused,
      preparing: status === 'preparing',
      pending: dictation.pending,
      heard,
      message,
      helpOpen,
      numbered,
      stopped,
      question,
      questionNumber,
      questionCount,
      turnOn,
      turnOff: () => turnOff(),
      toggleHelp: () => setHelpOpen((open) => !open),
      dismissStopped: () => setStopped(null),
      skipQuestion: () => setMessage(move(1)),
      previousQuestion: () => setMessage(move(-1)),
      takeSpokenCommand,
    }),
    [
      status,
      on,
      paused,
      dictation.pending,
      heard,
      message,
      helpOpen,
      numbered,
      stopped,
      question,
      questionNumber,
      questionCount,
      turnOn,
      turnOff,
      move,
      takeSpokenCommand,
    ],
  );

  return <HandsFreeContext.Provider value={value}>{children}</HandsFreeContext.Provider>;
}

/** The switch in the header that turns voice control on and off. Shown only where it works. */
export function HandsFreeSwitch() {
  const handsFree = useHandsFree();
  if (!handsFree?.available) return null;
  const { on } = handsFree;
  return (
    <Tooltip text={h.switchLabel} labels>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        className={on ? 'hands-free-switch is-on' : 'hands-free-switch'}
        onClick={on ? handsFree.turnOff : handsFree.turnOn}
      >
        <span className="hands-free-switch-icon" aria-hidden="true">
          <MicrophoneIcon />
        </span>
      </button>
    </Tooltip>
  );
}

/** On the Start step: tells her the whole form can be used by voice, and turns it on. */
export function HandsFreeOffer() {
  const handsFree = useHandsFree();
  if (!handsFree || handsFree.checking) return null;

  return (
    <section
      className="callout hands-free-offer"
      aria-labelledby="hands-free-heading"
      {...{ 'data-voice-no-questions': '' }}
    >
      <h2 id="hands-free-heading">{h.offerHeading}</h2>
      {!handsFree.available ? (
        <p>{h.offerUnavailable}</p>
      ) : handsFree.on ? (
        <>
          <p className="dictation-status">{h.isOn}</p>
          <div className="button-row">
            <button type="button" className="btn" onClick={handsFree.turnOff}>
              {h.turnOff}
            </button>
          </div>
        </>
      ) : (
        <>
          <p>{h.offerBody}</p>
          <div className="button-row">
            <button type="button" className="btn btn-voice" onClick={handsFree.turnOn}>
              <MicrophoneIcon />
              {h.turnOn}
            </button>
          </div>
          <p className="hint">{copy.voice.privacy}</p>
        </>
      )}
    </section>
  );
}

/** “A” or “B.” with the period inside the last quote. */
function quoteAll(names: string[]): string {
  return names.map((name, i) => (i === names.length - 1 ? `“${name}.”` : `“${name}”`)).join(g.or);
}

/** “A,” “B,” and “C” — for a question that ends after the list. */
function quoteList(names: string[], joiner: string): string {
  return names.map((name) => `“${name}”`).join(joiner);
}

/** What she can say to answer this question, shown under it. */
function sayLine(question: FormQuestion, boxListening: boolean): string {
  switch (question.kind) {
    case 'choice':
      return question.when ? g.sayWhen : g.sayChoice;
    case 'checks':
      return g.sayChecks;
    case 'text':
      return boxListening ? g.listeningText : g.sayTextAgain;
    case 'date':
      return g.sayDate;
    case 'ask':
      if (question.opener) return '';
      if (question.choices.length === 1) return fill(g.sayYes, { name: question.choices[0].name });
      return fill(g.sayButtons, { names: quoteAll(question.choices.map((choice) => choice.name)) });
  }
}

/**
 * Stays at the bottom of the screen while voice control is on: the question
 * being asked and what she can say, what it heard, what it did, and help.
 * While a box's microphone listens for her answer, the question stays.
 */
export function HandsFreeBar() {
  const handsFree = useHandsFree();
  const bar = useRef<HTMLElement>(null);
  const question = handsFree?.question ?? null;
  const answeringInBox = !!handsFree?.paused && question?.kind === 'text';
  const listening = !!handsFree?.on && (!handsFree.paused || answeringInBox);
  const showing = listening || !!handsFree?.stopped;

  // Shares the bar's height with CSS, so focused fields and the other bars at
  // the bottom of the screen are never hidden behind it (WCAG 2.4.11).
  useLayoutEffect(() => {
    const root = document.documentElement;
    const element = bar.current;
    if (!showing || !element) return;
    const update = () => {
      root.style.setProperty('--hands-free-height', `${element.offsetHeight}px`);
      // When the bar grows (a list's choices, help), the control she is on
      // may now be behind it. Bring it back into view.
      const active = document.activeElement;
      if (!(active instanceof HTMLElement) || active === document.body || element.contains(active)) return;
      if (active.getBoundingClientRect().bottom > element.getBoundingClientRect().top) scrollIntoClearView(active);
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(update);
    observer?.observe(element);
    return () => {
      observer?.disconnect();
      root.style.removeProperty('--hands-free-height');
    };
  }, [showing]);

  if (!handsFree || !showing) return null;

  if (!listening) {
    return (
      <section ref={bar} className="hands-free-bar" aria-label={h.barLabel}>
        <p className="dictation-status" role="status">
          {handsFree.stopped}
        </p>
        <div className="button-row">
          <button type="button" className="btn btn-voice" onClick={handsFree.turnOn}>
            <MicrophoneIcon />
            {h.turnOnAgain}
          </button>
          <button type="button" className="btn" onClick={handsFree.dismissStopped}>
            {h.close}
          </button>
        </div>
      </section>
    );
  }

  const { preparing, pending, heard, message, helpOpen, numbered, questionNumber, questionCount } = handsFree;
  const words = answeringInBox ? '' : pending || heard;
  const showChoices = question && question.kind !== 'ask' && question.choices.length > 0;

  return (
    <>
      <section ref={bar} className="hands-free-bar" aria-label={h.barLabel} {...{ [COVER_ATTRIBUTE]: '' }}>
        <div className="hands-free-row">
          <span className={preparing ? 'hands-free-dot' : 'hands-free-dot is-listening'} aria-hidden="true">
            <MicrophoneIcon />
          </span>
          <div className="hands-free-text">
            {question ? (
              <>
                {questionNumber >= 0 && (
                  <p className="hands-free-progress">{fill(g.progress, { n: questionNumber + 1, total: questionCount })}</p>
                )}
                <p className="hands-free-question">{question.prompt}</p>
                {question.hint && <p className="hands-free-hint">{question.hint}</p>}
                <p className="hands-free-say">{preparing ? copy.voice.preparing : sayLine(question, answeringInBox)}</p>
                {showChoices && (
                  <ol className="hands-free-choices">
                    {question.choices.map((choice, index) => (
                      <li key={`${index}-${choice.name}`} className={choice.checked ? 'is-chosen' : undefined}>
                        {choice.name}
                        {choice.checked && <span className="hands-free-chosen"> {g.chosenMark}</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </>
            ) : (
              <p className="hands-free-state">{preparing ? copy.voice.preparing : h.listening}</p>
            )}
            {/* Hidden from screen readers: it changes with every word. */}
            {words && (
              <p className="hands-free-heard" aria-hidden="true">
                {fill(h.heard, { said: words })}
              </p>
            )}
            <p className="dictation-status" role="status">
              {message}
            </p>
            {question && <p className="hands-free-moves">{g.moves}</p>}
          </div>
          <div className="hands-free-actions">
            {question && (
              <>
                <button type="button" className="btn" onClick={handsFree.previousQuestion}>
                  {g.previous}
                </button>
                <button type="button" className="btn" onClick={handsFree.skipQuestion}>
                  {g.skip}
                </button>
              </>
            )}
            <button type="button" className="btn" aria-expanded={helpOpen} onClick={handsFree.toggleHelp}>
              {helpOpen ? h.hideHelp : h.help}
            </button>
            <button type="button" className="btn" onClick={handsFree.turnOff}>
              {h.stop}
            </button>
          </div>
        </div>
        {helpOpen && (
          <div className="hands-free-help">
            <h2>{h.helpHeading}</h2>
            <ul>
              {h.helpItems.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
      </section>
      {numbered && <NumberBadges controls={numbered} />}
    </>
  );
}

/**
 * A number beside each control on the screen, for "show numbers". She says a
 * number to press it. For people whose speech the browser finds hard to
 * understand, and for names that are long or the same as another.
 */
function NumberBadges({ controls }: { controls: PageControl[] }) {
  const [, redraw] = useState(0);

  useEffect(() => {
    let frame = 0;
    const onMove = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => redraw((n) => n + 1));
    };
    window.addEventListener('scroll', onMove, true);
    window.addEventListener('resize', onMove);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('scroll', onMove, true);
      window.removeEventListener('resize', onMove);
    };
  }, []);

  return (
    <div className="voice-numbers" aria-hidden="true" {...{ [SKIP_ATTRIBUTE]: '' }}>
      {controls.map((control, index) => {
        const rect = badgeAnchor(control).getBoundingClientRect();
        return (
          <span
            key={index}
            className="voice-number"
            data-number={index + 1}
            style={{ top: Math.max(4, rect.top - 10), left: Math.max(4, rect.left - 10) }}
          >
            {index + 1}
          </span>
        );
      })}
    </div>
  );
}
