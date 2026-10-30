import { useEffect, useMemo, useRef } from 'react';
import { runChecks, type Finding } from '../checker';
import { copy, fill, rules } from '../content';
import type { Incident } from '../organizer';
import { ADD_INCIDENT_ID, ORGANIZE_HEADING_ID } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';
import { StepHeading } from '../ui/StepHeading';
import { dateKindId, descriptionId } from './IncidentEditor';

/** Where "Add more" takes her: the field the question is about. */
function addMoreTarget(finding: Finding): string {
  if (!finding.incidentId) return ADD_INCIDENT_ID;
  return finding.conditionType === 'incidentDateMissing'
    ? dateKindId(finding.incidentId)
    : descriptionId(finding.incidentId);
}

export function CheckStep() {
  const { state, dispatch } = useAppState();
  const c = copy.check;

  const open = useMemo(
    () =>
      runChecks({ caseType: state.caseType ?? 'not-sure', incidents: state.incidents }, rules).filter(
        (finding) => !state.dismissed.includes(finding.key),
      ),
    [state.caseType, state.incidents, state.dismissed],
  );
  const current = open[0];

  // Focus moves to each new question after she answers one, but not on
  // arrival, when the screen heading takes focus.
  const answered = useRef(false);

  return (
    <div>
      <StepHeading>{c.heading}</StepHeading>
      <p>{c.intro}</p>

      {current ? (
        <Question
          key={current.key}
          finding={current}
          left={open.length}
          incidents={state.incidents}
          takeFocus={answered.current}
          onAddMore={() => dispatch({ type: 'addMore', focusTarget: addMoreTarget(current) })}
          onContinue={() => {
            answered.current = true;
            dispatch({ type: 'dismissFinding', key: current.key });
          }}
        />
      ) : (
        <NoMoreQuestions takeFocus={answered.current} />
      )}

      <div className="button-row">
        <button type="button" className="btn" onClick={() => dispatch({ type: 'addMore', focusTarget: ORGANIZE_HEADING_ID })}>
          {c.back}
        </button>
      </div>
    </div>
  );
}

interface QuestionProps {
  finding: Finding;
  left: number;
  incidents: Incident[];
  takeFocus: boolean;
  onAddMore: () => void;
  onContinue: () => void;
}

function Question({ finding, left, incidents, takeFocus, onAddMore, onContinue }: QuestionProps) {
  const c = copy.check;
  const ref = useRef<HTMLHeadingElement>(null);
  const index = incidents.findIndex((incident) => incident.id === finding.incidentId);

  useEffect(() => {
    if (takeFocus) ref.current?.focus();
  }, [takeFocus]);

  return (
    <section className="card question" aria-labelledby="question-text">
      <p className="hint">{fill(c.left, { count: left })}</p>
      {index !== -1 && (
        <>
          <p>{fill(c.aboutIncident, { n: index + 1 })}</p>
          <blockquote>{incidents[index].description || '…'}</blockquote>
        </>
      )}
      <h2 id="question-text" ref={ref} tabIndex={-1}>
        {finding.questionText}
        {import.meta.env.DEV && !finding.verified && (
          <span className="badge badge-dev">{fill(c.unverified, { ruleId: finding.ruleId })}</span>
        )}
      </h2>
      {/* Ground rule 2: both choices always present, with equal visual weight. */}
      <div className="button-row equal">
        <button type="button" className="btn btn-choice" onClick={onAddMore}>
          {c.addMore}
        </button>
        <button type="button" className="btn btn-choice" onClick={onContinue}>
          {c.continueAsIs}
        </button>
      </div>
    </section>
  );
}

function NoMoreQuestions({ takeFocus }: { takeFocus: boolean }) {
  const { dispatch } = useAppState();
  const ref = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (takeFocus) ref.current?.focus();
  }, [takeFocus]);

  return (
    <section className="card">
      <p ref={ref} tabIndex={-1}>
        {copy.check.none}
      </p>
      <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'goTo', step: 'review' })}>
        {copy.check.toReview}
      </button>
    </section>
  );
}
