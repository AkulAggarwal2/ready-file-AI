import { DEMO_MODE } from '../config';
import { copy, fill, SAFETY_ANSWERS, safetyQuestions } from '../content';
import { useAppState } from '../state/AppStateProvider';

/**
 * The optional safety questions from the Petition Review Flags design. Each one
 * is a Yes / No / Not sure choice she can leave blank or clear. Nothing depends
 * on the answers here. They go to court staff with the petition.
 */
export function SafetyQuestions() {
  const { state, dispatch } = useAppState();
  const c = copy.safety;

  return (
    <section className="safety-questions" aria-labelledby="safety-heading">
      <h2 id="safety-heading">{c.heading}</h2>
      <p>{c.intro}</p>
      {safetyQuestions.map((q) => {
        const current = state.safetyAnswers[q.id];
        return (
          <fieldset key={q.id} className="card safety-question">
            <legend>
              {q.question}
              {DEMO_MODE && !q.verified && <span className="badge badge-dev">{fill(c.unverified, { id: q.id })}</span>}
            </legend>
            <div className="choice-row">
              {SAFETY_ANSWERS.map((answer) => (
                <label key={answer} className="choice">
                  <input
                    type="radio"
                    name={`safety-${q.id}`}
                    value={answer}
                    checked={current === answer}
                    onChange={() => dispatch({ type: 'setSafetyAnswer', id: q.id, answer })}
                  />
                  {c.answers[answer]}
                </label>
              ))}
              {current && (
                <button
                  type="button"
                  className="btn"
                  aria-label={`${c.clear}: ${q.question}`}
                  onClick={() => dispatch({ type: 'setSafetyAnswer', id: q.id, answer: null })}
                >
                  {c.clear}
                </button>
              )}
            </div>
          </fieldset>
        );
      })}
    </section>
  );
}
