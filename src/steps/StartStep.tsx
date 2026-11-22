import { useEffect, useState, type FormEvent } from 'react';
import { CHILD_RELATIONSHIPS, RELATIONSHIPS, type Ground, type Relationship } from '../checker';
import { IDLE_TIMEOUT_MS } from '../config';
import { copyFor, fill } from '../content';
import { useAppState } from '../state/AppStateProvider';
import { useVariant } from '../state/useVariant';
import { StepHeading } from '../ui/StepHeading';
import { Glossed, Term } from '../ui/Term';

export const RELATIONSHIP_ID = 'relationship';

// The grounds on the adult petition (PO-0100 question 1), in its order. Sex
// grooming is only on the petition filed for a child (PO-0101).
const ADULT_GROUNDS: Ground[] = ['domestic-violence', 'sex-offense', 'stalking', 'harassment'];
// The grounds PO-0101 question 1 names, in its order.
const CHILD_GROUNDS: Ground[] = ['domestic-violence', 'sex-offense', 'stalking', 'sex-grooming', 'harassment'];

export function StartStep() {
  const { state, dispatch } = useAppState();
  const variant = useVariant();
  const copy = copyFor(variant);
  const groundList = variant === 'child' ? CHILD_GROUNDS : ADULT_GROUNDS;
  const relationshipList: readonly Relationship[] = variant === 'child' ? CHILD_RELATIONSHIPS : RELATIONSHIPS;
  const [grounds, setGrounds] = useState<Ground[]>(state.grounds.filter((g) => groundList.includes(g)));
  // An answer from the other petition's list (if she changed her situation) doesn't carry over.
  const [relationship, setRelationship] = useState<Relationship | null>(
    state.relationship && relationshipList.includes(state.relationship) ? state.relationship : null,
  );
  const r = copy.start.relationships as Record<string, string>;

  // After "Add more" on the relationship question, focus the question.
  useEffect(() => {
    if (state.focusTarget !== RELATIONSHIP_ID) return;
    document.getElementById(RELATIONSHIP_ID)?.focus();
    dispatch({ type: 'focusHandled' });
  }, [state.focusTarget, dispatch]);

  function begin(event: FormEvent) {
    event.preventDefault();
    // Never blocks: with nothing checked, she continues as not sure.
    // Kept in the form's order, whatever order she checked them in.
    dispatch({ type: 'begin', grounds: groundList.filter((g) => grounds.includes(g)), relationship });
  }

  return (
    <form onSubmit={begin} autoComplete="off">
      <StepHeading>{copy.start.heading}</StepHeading>
      <p>
        <Glossed text={copy.start.intro} />
      </p>
      <p className="note">{copy.start.notFiling}</p>

      <section className="callout" aria-labelledby="safety-heading">
        <h2 id="safety-heading">{copy.start.safetyHeading}</h2>
        <p>
          <Glossed text={fill(copy.start.safetyNote, { minutes: IDLE_TIMEOUT_MS / 60000 })} />
        </p>
      </section>

      <fieldset aria-describedby="grounds-hint">
        <legend>{copy.start.groundsLegend}</legend>
        <p id="grounds-hint" className="hint">
          <Glossed text={copy.start.groundsHint} />
        </p>
        {groundList.map((ground) => (
          <div key={ground} className="choice-wrap">
            <label className="choice">
              <input
                type="checkbox"
                name="grounds"
                value={ground}
                checked={grounds.includes(ground)}
                onChange={(e) =>
                  setGrounds(e.target.checked ? [...grounds, ground] : grounds.filter((g) => g !== ground))
                }
              />
              {copy.start.grounds[ground]}
            </label>
            <Term id={ground} />
          </div>
        ))}
      </fieldset>

      <label htmlFor={RELATIONSHIP_ID}>{copy.start.relationshipLabel}</label>
      <p id="relationship-hint" className="hint">
        <Glossed text={copy.start.relationshipHint} />
      </p>
      <select
        id={RELATIONSHIP_ID}
        aria-describedby="relationship-hint"
        value={relationship ?? ''}
        onChange={(e) => setRelationship((e.target.value || null) as Relationship | null)}
      >
        <option value="">{r['']}</option>
        {relationshipList.map((value) => (
          <option key={value} value={value}>
            {r[value]}
          </option>
        ))}
      </select>

      <div className="button-row">
        <button type="submit" className="btn btn-primary">
          {copy.start.begin}
        </button>
      </div>
    </form>
  );
}
