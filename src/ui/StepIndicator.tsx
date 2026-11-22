import { copy, fill } from '../content';
import { routeState, routing } from '../forms/routing';
import { STEPS, type Step } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';

/**
 * The steps, shown at the top of every screen. Each one is a button, so she
 * can go back and forth between them in any order. Her answers stay. The
 * petition steps open once her situation leads to a petition. A form in a
 * case that already exists has only two steps: her situation and the form.
 */
export function StepIndicator({ current }: { current: Step }) {
  const { state, dispatch } = useAppState();
  const where = routeState(state.route);
  const flow = 'outcome' in where ? routing.outcomes[where.outcome].flow : null;
  const steps: Step[] = flow === 'form' ? ['route', 'forms'] : STEPS;
  const open = (step: Step) => step === 'route' || flow === 'petition' || flow === 'form';
  const currentIndex = steps.indexOf(current);

  return (
    <nav className="steps" aria-label={copy.app.stepsLabel}>
      <p className="sr-only">{fill(copy.app.progress, { current: currentIndex + 1, total: steps.length })}</p>
      <ol className="step-list">
        {steps.map((step, index) => (
          <li key={step} className="step" data-state={index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo'}>
            <button
              type="button"
              className="step-button"
              aria-current={index === currentIndex ? 'step' : undefined}
              // Screen readers hear "Step 1: Start", so this button is not confused with the Start button below.
              aria-label={`${fill(copy.app.stepNumber, { n: index + 1 })} ${copy.app.steps[step]}`}
              disabled={!open(step)}
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
