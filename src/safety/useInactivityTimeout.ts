import { useCallback, useEffect, useRef, useState } from 'react';

// Voice typing changes fields without a key press, so it sends this event to
// count as activity. Someone who can't use a keyboard or mouse is never timed
// out while she is talking.
export const VOICE_ACTIVITY_EVENT = 'readyfile:voice-activity';

/** Counts what she just said as activity, like a key press. */
export function noteVoiceActivity(): void {
  window.dispatchEvent(new Event(VOICE_ACTIVITY_EVENT));
}

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'input', 'scroll', 'touchstart', VOICE_ACTIVITY_EVENT] as const;

/**
 * Calls onTimeout after idleMs with no activity. For the last warningSeconds,
 * secondsLeft counts down so the app can show a warning. While the warning is
 * showing, only stay() keeps her session; other activity does not.
 */
export function useInactivityTimeout(idleMs: number, warningSeconds: number, onTimeout: () => void) {
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const warningShowing = useRef(false);
  const timers = useRef<{ warn?: ReturnType<typeof setTimeout>; tick?: ReturnType<typeof setInterval> }>({});
  const onTimeoutRef = useRef(onTimeout);

  useEffect(() => {
    onTimeoutRef.current = onTimeout;
  }, [onTimeout]);

  const stop = useCallback(() => {
    clearTimeout(timers.current.warn);
    clearInterval(timers.current.tick);
  }, []);

  const restart = useCallback(() => {
    stop();
    warningShowing.current = false;
    setSecondsLeft(null);

    timers.current.warn = setTimeout(() => {
      let left = warningSeconds;
      warningShowing.current = true;
      setSecondsLeft(left);

      timers.current.tick = setInterval(() => {
        left -= 1;
        if (left > 0) {
          setSecondsLeft(left);
          return;
        }
        onTimeoutRef.current();
        restart();
      }, 1000);
    }, idleMs - warningSeconds * 1000);
  }, [idleMs, warningSeconds, stop]);

  useEffect(() => {
    const onActivity = () => {
      if (!warningShowing.current) restart();
    };
    restart();
    for (const event of ACTIVITY_EVENTS) window.addEventListener(event, onActivity, true);
    return () => {
      stop();
      for (const event of ACTIVITY_EVENTS) window.removeEventListener(event, onActivity, true);
    };
  }, [restart, stop]);

  return { secondsLeft, stay: restart };
}
