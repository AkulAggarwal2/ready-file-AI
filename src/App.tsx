import { useCallback } from 'react';
import { IDLE_TIMEOUT_MS, TIMEOUT_WARNING_SECONDS } from './config';
import { copy, fill } from './content';
import { QuickExit } from './safety/QuickExit';
import { Resources } from './safety/Resources';
import { TimeoutWarning } from './safety/TimeoutWarning';
import { useInactivityTimeout } from './safety/useInactivityTimeout';
import { STEPS } from './state/appState';
import { AppStateProvider, useAppState } from './state/AppStateProvider';
import { CheckStep } from './steps/CheckStep';
import { ReviewStep } from './steps/ReviewStep';
import { StartStep } from './steps/StartStep';
import { StoryStep } from './steps/StoryStep';

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

  // Steps are kept in memory, not in the address bar or browser history, so
  // the back button never leads back into the tool after Quick exit.
  return (
    <>
      <header className="site-header">
        <div className="header-row">
          <span className="brand">{copy.app.name}</span>
          <QuickExit />
        </div>
        <Resources />
      </header>

      <main className="content">
        <p className="progress">
          {fill(copy.app.progress, { current: STEPS.indexOf(state.step) + 1, total: STEPS.length })}
        </p>
        {state.step === 'start' && <StartStep />}
        {state.step === 'story' && <StoryStep />}
        {state.step === 'check' && <CheckStep />}
        {state.step === 'review' && <ReviewStep />}
      </main>

      {secondsLeft !== null && <TimeoutWarning secondsLeft={secondsLeft} onStay={stay} />}
    </>
  );
}
