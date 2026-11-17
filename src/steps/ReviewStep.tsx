import { useState } from 'react';
import { copy } from '../content';
import { buildSummary, summarySections, type SummarySection } from '../review/summary';
import { ORGANIZE_HEADING_ID } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';
import { ConfirmButton } from '../ui/ConfirmButton';
import { StepHeading } from '../ui/StepHeading';
import { Timeline } from '../ui/Timeline';

export function ReviewStep() {
  const { state, dispatch } = useAppState();
  const [copyStatus, setCopyStatus] = useState('');
  const c = copy.review;
  const caseType = state.caseType ?? 'not-sure';
  const summary = buildSummary(caseType, state.incidents, state.story, state.relationship);

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(summary);
      setCopyStatus(c.copied);
    } catch {
      setCopyStatus(c.copyFailed);
    }
  }

  return (
    <div>
      <div className="screen-only">
      <StepHeading>{c.heading}</StepHeading>
      <p className="callout">{c.notFiling}</p>

      <h2 id="timeline-label">{copy.timeline.heading}</h2>
      <Timeline incidents={state.incidents} numbering="timeline" />

      <h2 id="summary-label">{c.summaryLabel}</h2>
      <pre className="summary" role="region" aria-labelledby="summary-label" tabIndex={0}>
        {summary}
      </pre>

      <div className="button-row">
        <button type="button" className="btn btn-primary" onClick={copySummary}>
          {c.copy}
        </button>
        <button type="button" className="btn" onClick={() => window.print()}>
          {c.print}
        </button>
      </div>
      <p role="status" className="status">
        {copyStatus}
      </p>
      <p className="hint">{c.clipboardNote}</p>

      <section className="callout" aria-labelledby="form-heading">
        <h2 id="form-heading">{c.formHeading}</h2>
        <p>{c.formIntro}</p>
        <ul className="form-checklist">
          {c.formItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
          {caseType === 'harassment' && <li>{c.formHarassment}</li>}
        </ul>
        <p className="hint">{c.formSource}</p>
      </section>

      <div className="button-row">
        <button type="button" className="btn" onClick={() => dispatch({ type: 'addMore', focusTarget: ORGANIZE_HEADING_ID })}>
          {c.edit}
        </button>
        <ConfirmButton
          label={c.clear}
          question={c.clearQuestion}
          confirmLabel={c.clearYes}
          onConfirm={() => dispatch({ type: 'reset' })}
        />
      </div>
      </div>

      <PrintSummary sections={summarySections(caseType, state.incidents, state.story, state.relationship)} />
    </div>
  );
}

/** The court-ready page. It is hidden on screen and is the only thing that prints. */
function PrintSummary({ sections }: { sections: SummarySection[] }) {
  return (
    <article className="print-doc">
      {sections.map((section, index) => {
        const Heading = index === 0 ? 'h1' : 'h2';
        return (
          <section key={index} className="print-incident">
            {section.heading && <Heading>{section.heading}</Heading>}
            {section.lines.map((line) => (
              <p key={line}>{line}</p>
            ))}
            {section.text && <p className="print-text">{section.text}</p>}
          </section>
        );
      })}
    </article>
  );
}
