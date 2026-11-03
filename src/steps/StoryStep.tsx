import { copy } from '../content';
import { useAppState } from '../state/AppStateProvider';
import { StepHeading } from '../ui/StepHeading';

/** Her account in her own words. It comes after the dated incidents and is optional. */
export function StoryStep() {
  const { state, dispatch } = useAppState();
  const c = copy.story;

  return (
    <div>
      <StepHeading>{c.heading}</StepHeading>
      <p>{c.intro}</p>

      <label htmlFor="story">{c.label}</label>
      <p id="story-hint" className="hint">
        {c.hint}
      </p>
      <textarea
        id="story"
        rows={12}
        aria-describedby="story-hint"
        value={state.story}
        onChange={(e) => dispatch({ type: 'setStory', story: e.target.value })}
      />

      <div className="button-row">
        <button type="button" className="btn" onClick={() => dispatch({ type: 'goTo', step: 'incidents' })}>
          {c.back}
        </button>
        <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'goTo', step: 'questions' })}>
          {c.next}
        </button>
      </div>
    </div>
  );
}
