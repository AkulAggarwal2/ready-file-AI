import { copy, fill } from '../content';
import { PROGRESS_STEPS, type ProgressStep } from '../state/appState';

/** Where she is in the five steps. The steps are not links: she moves with the buttons on each screen. */
export function StepIndicator({ current }: { current: ProgressStep }) {
  const currentIndex = PROGRESS_STEPS.indexOf(current);

  return (
    <nav className="steps" aria-label={copy.app.stepsLabel}>
      <p className="sr-only">
        {fill(copy.app.progress, { current: currentIndex + 1, total: PROGRESS_STEPS.length })}
      </p>
      <ol className="step-list">
        {PROGRESS_STEPS.map((step, index) => (
          <li
            key={step}
            className="step"
            data-state={index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo'}
            aria-current={index === currentIndex ? 'step' : undefined}
          >
            <span className="step-label">{copy.app.steps[step]}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
