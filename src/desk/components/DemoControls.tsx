// Demo controls, shown only in development (like ReadyFile's sample buttons).
// They stand in for things that happen outside Desk: the petitioner using the
// text link, and time passing.
import { deskCopy } from '../content';
import type { Petition } from '../petitions';
import { canDemoAddIncidents, type PetitionRecord } from '../state/deskState';
import { useDesk } from '../state/DeskStateProvider';
import { useView } from '../state/view';

export function DemoControls({
  petition,
  record,
  onDone,
}: {
  petition: Petition;
  record: PetitionRecord;
  onDone: () => void;
}) {
  const { state, dispatch } = useDesk();
  const { go } = useView();
  const d = deskCopy.petition.demo;

  return (
    <section className="panel demo-panel" aria-labelledby="demo-title">
      <h2 id="demo-title" className="panel-title">
        {d.title}
      </h2>
      <p className="note">{d.note}</p>
      <div className="button-row">
        {petition.amendment && (
          <button
            type="button"
            className="btn btn-secondary"
            disabled={!canDemoAddIncidents(petition, record, state.now)}
            aria-describedby="demo-add-hint"
            onClick={() => {
              dispatch({ type: 'demoAddIncidents', id: petition.id });
              onDone();
            }}
          >
            {d.addIncidents}
          </button>
        )}
        <button
          type="button"
          className="btn btn-secondary"
          disabled={!record.hold}
          aria-describedby="demo-jump-hint"
          onClick={() => {
            dispatch({ type: 'demoJumpToHoldEnd', id: petition.id });
            onDone();
          }}
        >
          {d.jump}
        </button>
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            dispatch({ type: 'reset' });
            go({ screen: 'petitions' });
          }}
        >
          {d.reset}
        </button>
      </div>
      {petition.amendment && (
        <p id="demo-add-hint" className="note">
          {d.addIncidentsHint}
        </p>
      )}
      <p id="demo-jump-hint" className="note">
        {d.jumpHint}
      </p>
    </section>
  );
}
