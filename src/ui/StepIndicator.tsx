import { copy, fill } from '../content';
import { STEPS, type Step } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';

/**
 * The five steps, shown at the top of every screen. Each one is a button, so
 * she can go back and forth between them in any order. Her answers stay.
 */
export function StepIndicator({ current }: { current: Step }) {
  const { dispatch } = useAppState();
  const currentIndex = STEPS.indexOf(current);

  return (
    <nav className="steps" aria-label={copy.app.stepsLabel}>
      <p className="sr-only">{fill(copy.app.progress, { current: currentIndex + 1, total: STEPS.length })}</p>
      <ol className="step-list">
        {STEPS.map((step, index) => (
          <li key={step} className="step" data-state={index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo'}>
            <button
              type="button"
              className="step-button"
              aria-current={index === currentIndex ? 'step' : undefined}
              onClick={() => dispatch({ type: 'goTo', step })}
            >
              {copy.app.steps[step]}
            </button>
          </li>
        ))}
      </ol>
    </nav>
  );
}
