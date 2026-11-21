import { copy, fill } from '../content';
import { routeState, routing } from '../forms/routing';
import { STEPS, type Step } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';

/**
 * The steps, shown at the top of every screen. Each one is a button, so she
 * can go back and forth between them in any order. Her answers stay. The
 * petition steps open once her situation leads to a petition.
 */
export function StepIndicator({ current }: { current: Step }) {
  const { state, dispatch } = useAppState();
  const currentIndex = STEPS.indexOf(current);
  const where = routeState(state.route);
  const petition = 'outcome' in where && routing.outcomes[where.outcome].flow === 'petition';

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
              // Screen readers hear "Step 1: Start", so this button is not confused with the Start button below.
              aria-label={`${fill(copy.app.stepNumber, { n: index + 1 })} ${copy.app.steps[step]}`}
              disabled={step !== 'route' && !petition}
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
