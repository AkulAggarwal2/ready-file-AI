import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { HANDS_FREE_RESTART_MS } from '../config';
import { copy, fill } from '../content';
import { Tooltip } from '../ui/Tooltip';
import { HandsFreeContext, useHandsFree, type HandsFree } from './handsFreeContext';
import {
  actOn,
  asCandidates,
  badgeAnchor,
  controlsOnScreen,
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
import { matchName, readVoiceCommand, type VoiceCommand } from './voiceCommands';

const h = copy.voice.handsFree;

// If listening keeps ending right after it starts, with nothing heard, the
// microphone isn't working. Stop trying, and say so, instead of looping.
const QUICK_END_MS = 1000;
const MAX_QUICK_ENDS = 3;

function describe(result: ActResult): string {
  return fill(h[result.kind], { name: result.name });
}

/**
 * Voice control for the whole app. While it is on, one microphone listens for
 * what she says: the words on a button or choice press it, the name of a box
 * starts that box's own microphone, and a few fixed words scroll, show help,
 * or turn it off. It steps aside while a field's microphone or "Answer by
 * voice" is listening, then listens again. Speech stays on the device.
 */
export function HandsFreeProvider({ children }: { children: ReactNode }) {
  const [on, setOn] = useState(false);
  const [heard, setHeard] = useState('');
  const [message, setMessage] = useState('');
  const [helpOpen, setHelpOpen] = useState(false);
  const [numbered, setNumbered] = useState<PageControl[] | null>(null);
  // The choices of the list she just moved to, shown as a list in the bar.
  const [choices, setChoices] = useState<string[] | null>(null);
  // Why voice control turned itself off, until she closes the note.
  const [stopped, setStopped] = useState<string | null>(null);
  const onNow = useRef(false);
  const numberedNow = useRef<PageControl[] | null>(null);
  const quickEnds = useRef(0);
  const startedAt = useRef(0);
  const heardSinceStart = useRef(false);

  useEffect(() => {
    numberedNow.current = numbered;
  }, [numbered]);

  const showNumbers = useCallback((controls: PageControl[] | null) => {
    numberedNow.current = controls;
    setNumbered(controls);
  }, []);

  const press = useCallback(
    (control: PageControl, action: Parameters<typeof actOn>[1]) => {
      showNumbers(null);
      const result = actOn(control, action);
      if (result.kind === 'choose') setChoices(result.options);
      return describe(result);
    },
    [showNumbers],
  );

  const respond = useCallback(
    (command: VoiceCommand, said: string): string => {
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
          if (match.kind === 'none') return fill(h.notFound, { said });
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

  const dictationStop = useRef<() => void>(() => {});

  // `reason` is set when it turns itself off, so the bar can say why.
  const turnOff = useCallback(
    (reason: string | null = null) => {
      onNow.current = false;
      setOn(false);
      setHelpOpen(false);
      setMessage('');
      setChoices(null);
      setStopped(reason);
      showNumbers(null);
      dictationStop.current();
    },
    [showNumbers],
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
      setChoices(null);
      if (command.kind === 'stopListening') {
        turnOff();
        return;
      }
      setMessage(respond(command, said));
    },
    [respond, turnOff],
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
    setOn(true);
    setHelpOpen(false);
    setHeard('');
    setMessage('');
    setStopped(null);
    // Started right away, inside the click: the first time, the browser
    // allows the speech download only then.
    void start();
  }, [start]);

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

  // Back from a field's microphone: what was said before is done with.
  const wasPaused = useRef(false);
  useEffect(() => {
    if (wasPaused.current && !paused) {
      setMessage('');
      setHeard('');
    }
    wasPaused.current = paused;
  }, [paused]);

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
      choices,
      helpOpen,
      numbered,
      stopped,
      turnOn,
      turnOff: () => turnOff(),
      toggleHelp: () => setHelpOpen((open) => !open),
      dismissStopped: () => setStopped(null),
    }),
    [status, on, paused, dictation.pending, heard, message, choices, helpOpen, numbered, stopped, turnOn, turnOff],
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
    <section className="callout hands-free-offer" aria-labelledby="hands-free-heading">
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

/**
 * Stays at the bottom of the screen while voice control is on: that it is
 * listening, what it heard, what it did, and help. Hidden while a field's
 * microphone has taken over, since that field shows its own status.
 */
export function HandsFreeBar() {
  const handsFree = useHandsFree();
  const bar = useRef<HTMLElement>(null);
  const listening = !!handsFree?.on && !handsFree.paused;
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

  const { preparing, pending, heard, message, choices, helpOpen, numbered } = handsFree;
  const words = pending || heard;

  return (
    <>
      <section ref={bar} className="hands-free-bar" aria-label={h.barLabel} {...{ [COVER_ATTRIBUTE]: '' }}>
        <div className="hands-free-row">
          <span className={preparing ? 'hands-free-dot' : 'hands-free-dot is-listening'} aria-hidden="true">
            <MicrophoneIcon />
          </span>
          <div className="hands-free-text">
            <p className="hands-free-state">{preparing ? copy.voice.preparing : h.listening}</p>
            {/* Hidden from screen readers: it changes with every word. */}
            {words && (
              <p className="hands-free-heard" aria-hidden="true">
                {fill(h.heard, { said: words })}
              </p>
            )}
            {/* The choices are inside the status, so screen readers hear them too. */}
            <div className="dictation-status" role="status">
              {message}
              {choices && (
                <ul className="hands-free-choices">
                  {choices.map((choice) => (
                    <li key={choice}>{choice}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="hands-free-actions">
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
