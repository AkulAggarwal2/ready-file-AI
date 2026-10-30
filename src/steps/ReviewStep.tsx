import { useState } from 'react';
import { copy } from '../content';
import { buildSummary } from '../review/summary';
import { ORGANIZE_HEADING_ID } from '../state/appState';
import { useAppState } from '../state/AppStateProvider';
import { ConfirmButton } from '../ui/ConfirmButton';
import { StepHeading } from '../ui/StepHeading';

export function ReviewStep() {
  const { state, dispatch } = useAppState();
  const [copyStatus, setCopyStatus] = useState('');
  const c = copy.review;
  const summary = buildSummary(state.caseType ?? 'not-sure', state.incidents);

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
      <StepHeading>{c.heading}</StepHeading>
      <p className="callout">{c.notFiling}</p>
      <p className="hint">{c.order}</p>

      <h2 id="summary-label">{c.summaryLabel}</h2>
      <pre className="summary print-area" aria-labelledby="summary-label" tabIndex={0}>
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
  );
}
