import { useCallback, useEffect, useRef } from 'react';
import { IDLE_TIMEOUT_MS, TIMEOUT_WARNING_SECONDS } from './config';
import { copy } from './content';
import { QuickExit } from './safety/QuickExit';
import { Resources } from './safety/Resources';
import { TimeoutWarning } from './safety/TimeoutWarning';
import { useInactivityTimeout } from './safety/useInactivityTimeout';
import { AppStateProvider, useAppState } from './state/AppStateProvider';
import { CheckStep } from './steps/CheckStep';
import { ReviewStep } from './steps/ReviewStep';
import { StartStep } from './steps/StartStep';
import { IncidentsStep } from './steps/IncidentsStep';
import { StoryStep } from './steps/StoryStep';
import { StepIndicator } from './ui/StepIndicator';
import { ThemeToggle } from './ui/ThemeToggle';

export function App() {
  return (
    <AppStateProvider>
      <Shell />
    </AppStateProvider>
  );
}

function Shell() {
  const { state, dispatch } = useAppState();
  const clearAll = useCallback(() => dispatch({ type: 'reset' }), [dispatch]);
  const { secondsLeft, stay } = useInactivityTimeout(IDLE_TIMEOUT_MS, TIMEOUT_WARNING_SECONDS, clearAll);
  const warningShowing = secondsLeft !== null;
  const header = useRef<HTMLElement>(null);

  // WCAG 2.4.11: share the sticky header's height with CSS (scroll-padding-top),
  // so a field that gets keyboard focus never scrolls in behind the header.
  useEffect(() => {
    const element = header.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty('--header-height', `${element.offsetHeight}px`);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Steps are kept in memory, not in the address bar or browser history, so
  // the back button never leads back into the tool after Quick exit.
  return (
    <>
      <header ref={header} className="site-header">
        <div className="header-row">
          <span className="brand">{copy.app.name}</span>
          <ThemeToggle />
          <QuickExit />
        </div>
        <Resources />
      </header>

      {/* Announces organizing, merging, deleting, moving, and undoing to screen readers. */}
      <div className="sr-only" role="status" aria-live="polite" aria-label={copy.common.liveRegionLabel}>
        {state.announcement}
      </div>

      {/* While the timeout warning shows, the page behind it cannot take focus.
          The header stays usable, so Quick exit always works. */}
      <main className="content" inert={warningShowing}>
        <StepIndicator current={state.step} />
        {state.step === 'start' && <StartStep />}
        {state.step === 'incidents' && <IncidentsStep />}
        {state.step === 'story' && <StoryStep />}
        {state.step === 'questions' && <CheckStep />}
        {state.step === 'review' && <ReviewStep />}
      </main>

      {warningShowing && <TimeoutWarning secondsLeft={secondsLeft} onStay={stay} />}
    </>
  );
}
