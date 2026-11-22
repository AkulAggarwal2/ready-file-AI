import { copy, fill } from '../content';
import { currentOutcome } from '../forms/routing';
import { STEPS, type Step } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';

/**
 * The steps, shown at the top of every screen once her situation leads
 * somewhere. Each one is a button, so she can go back and forth between them
 * in any order. Her answers stay. A petition has every step; a form in a case
 * that already exists has two: her situation and the form. While she is still
 * answering the situation questions, there is no step bar, since what comes
 * next depends on her answers ("Question n" shows where she is).
 */
export function StepIndicator({ current }: { current: Step }) {
  const { state, dispatch } = useAppState();
  const flow = currentOutcome(state.route)?.flow ?? null;
  if (flow !== 'petition' && flow !== 'form') return null;
  const steps: Step[] = flow === 'form' ? ['route', 'forms'] : STEPS;
  const currentIndex = steps.indexOf(current);

  return (
    <nav className="steps" aria-label={copy.app.stepsLabel}>
      <p className="sr-only">{fill(copy.app.progress, { current: currentIndex + 1, total: steps.length })}</p>
      <ol className={steps.length > 5 ? 'step-list many' : 'step-list'}>
        {steps.map((step, index) => (
          <li key={step} className="step" data-state={index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo'}>
            <button
              type="button"
              className="step-button"
              aria-current={index === currentIndex ? 'step' : undefined}
              // Screen readers hear "Step 1: Start", so this button is not confused with the Start button below.
              aria-label={`${fill(copy.app.stepNumber, { n: index + 1 })} ${copy.app.steps[step]}`}
              onClick={() => dispatch({ type: 'goTo', step })}
            >
              {copy.app.steps[step]}
            </button>
          </li>
        ))}
      </ol>
      {/* On a phone, seven step names don't fit; the bars stay, and this names the current step. */}
      <p className="step-now" aria-hidden="true">
        {fill(copy.app.stepNow, { current: currentIndex + 1, total: steps.length, step: copy.app.steps[current] })}
      </p>
    </nav>
  );
}
