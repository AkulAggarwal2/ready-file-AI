import { useState } from 'react';
import type { CaseType } from '../checker';
import { copy, fill } from '../content';
import type { Incident } from '../organizer';
import { buildSummary, describeDate, sortByDate } from '../review/summary';
import { ORGANIZE_HEADING_ID } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';
import { ConfirmButton } from '../ui/ConfirmButton';
import { StepHeading } from '../ui/StepHeading';
import { Timeline } from '../ui/Timeline';

export function ReviewStep() {
  const { state, dispatch } = useAppState();
  const [copyStatus, setCopyStatus] = useState('');
  const c = copy.review;
  const summary = buildSummary(state.caseType ?? 'not-sure', state.incidents, state.story);

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

      <PrintSummary caseType={state.caseType ?? 'not-sure'} incidents={state.incidents} story={state.story} />
    </div>
  );
}

/** The court-ready page. It is hidden on screen and is the only thing that prints. */
function PrintSummary({ caseType, incidents, story }: { caseType: CaseType; incidents: Incident[]; story: string }) {
  const s = copy.summary;
  return (
    <article className="print-doc">
      <h1>{s.title}</h1>
      <p>{fill(s.caseType, { caseType: copy.start.caseTypes[caseType] })}</p>
      {incidents.length === 0 && <p>{s.noIncidents}</p>}
      {sortByDate(incidents).map((incident, index) => (
        <section key={incident.id} className="print-incident">
          <h2>{fill(s.incident, { n: index + 1 })}</h2>
          <p>{fill(s.when, { when: describeDate(incident) })}</p>
          <p>{fill(s.how, { how: copy.incident.how[incident.how] })}</p>
          <p>
            <strong>{s.what}</strong>
          </p>
          <p className="print-text">{incident.description.trim()}</p>
          {incident.evidence.trim() && <p>{fill(s.evidence, { evidence: incident.evidence.trim() })}</p>}
        </section>
      ))}
      {story.trim() && (
        <section className="print-incident">
          <h2>{s.story}</h2>
          <p className="print-text">{story.trim()}</p>
        </section>
      )}
    </article>
  );
}
