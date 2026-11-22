import { useState, type FormEvent } from 'react';
import { copy, fill } from '../content';
import { courtForm } from '../forms';
import { routeState, routing, type RouteOutcome } from '../forms/routing';
import { useAppState } from '../state/AppStateProvider';
import { StepHeading } from '../ui/StepHeading';
import { Glossed } from '../ui/Term';

/**
 * Asks who the order is for and what she is trying to do, one question at a
 * time, until it reaches the court forms that fit (content/routing.json).
 */
export function RouteStep() {
  const { state } = useAppState();
  const where = routeState(state.route);
  // Keyed by question, so each new question starts unpicked and its heading takes focus.
  return (
    <div>
      {'node' in where ? (
        <RouteQuestion key={`${state.route.length}-${where.node}`} nodeId={where.node} />
      ) : (
        <RouteResult key={where.outcome} outcome={routing.outcomes[where.outcome]} />
      )}
    </div>
  );
}

function RouteQuestion({ nodeId }: { nodeId: string }) {
  const { state, dispatch } = useAppState();
  const node = routing.nodes[nodeId];
  const [picked, setPicked] = useState<string | null>(null);
  const [showError, setShowError] = useState(false);
  const c = copy.route;
  const note = node.options.find((o) => o.id === picked)?.note;
  const legendId = `route-${nodeId}-legend`;

  function next(event: FormEvent) {
    event.preventDefault();
    if (!picked) {
      setShowError(true);
      return;
    }
    dispatch({ type: 'routeAnswer', answer: { node: nodeId, option: picked } });
  }

  return (
    <form onSubmit={next} autoComplete="off">
      <p className="eyebrow">{fill(c.questionNumber, { n: state.route.length + 1 })}</p>
      <StepHeading>{c.heading}</StepHeading>
      {state.route.length === 0 && <p>{c.intro}</p>}

      <fieldset aria-labelledby={legendId} aria-describedby={node.hint ? `route-${nodeId}-hint` : undefined}>
        <legend id={legendId}>{node.question}</legend>
        {node.hint && (
          <p id={`route-${nodeId}-hint`} className="hint">
            <Glossed text={node.hint} />
          </p>
        )}
        {node.options.map((option) => (
          <label key={option.id} className="choice">
            <input
              type="radio"
              name={`route-${nodeId}`}
              value={option.id}
              checked={picked === option.id}
              onChange={() => {
                setPicked(option.id);
                setShowError(false);
              }}
            />
            {option.label}
          </label>
        ))}
      </fieldset>

      {note && (
        <div className="callout" role="status">
          <p>
            <Glossed text={note} />
          </p>
        </div>
      )}
      {showError && (
        <p className="hint" role="alert">
          {c.chooseOne}
        </p>
      )}

      <div className="button-row">
        {state.route.length > 0 && (
          <button type="button" className="btn" onClick={() => dispatch({ type: 'routeBack' })}>
            {c.back}
          </button>
        )}
        <button type="submit" className="btn btn-primary">
          {c.continue}
        </button>
      </div>
    </form>
  );
}

function RouteResult({ outcome }: { outcome: RouteOutcome }) {
  const { dispatch } = useAppState();
  const c = copy.route;
  const forms = outcome.packet.map(courtForm);

  return (
    <div>
      <StepHeading>{outcome.title}</StepHeading>
      <p>
        <Glossed text={outcome.summary} />
      </p>

      {forms.length > 0 && (
        <>
          <h2 id="route-forms-heading">{outcome.flow === 'info' ? c.formsHeadingInfo : c.formsHeading}</h2>
          <ul className="form-list" aria-labelledby="route-forms-heading">
            {forms.map((form) => (
              <li key={form.id}>
                <span className="form-number">{form.number ?? c.coverTag}</span>
                <span className="form-title">{form.plainTitle}</span>
                <span className="form-official">{form.title}</span>
                <span className="form-meta">{c.filledBy[form.filler]}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {outcome.flow === 'forms' && <p className="note">
          <Glossed text={c.notFilledYet} />
        </p>}

      <div className="button-row">
        <button type="button" className="btn" onClick={() => dispatch({ type: 'routeBack' })}>
          {c.back}
        </button>
        {outcome.flow === 'petition' || outcome.flow === 'form' ? (
          <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'routeDone' })}>
            {outcome.flow === 'petition' ? c.toPetition : c.toForm}
          </button>
        ) : (
          <StartOver />
        )}
      </div>
    </div>
  );
}

function StartOver() {
  const { dispatch } = useAppState();
  return (
    <button type="button" className="btn" onClick={() => dispatch({ type: 'routeReset' })}>
      {copy.route.startOver}
    </button>
  );
}
