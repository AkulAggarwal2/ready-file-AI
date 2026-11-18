import { ScreenTitle } from '../components';
import { deskCopy, plural } from '../content';
import { caption, currentFindings, filedAt, inReview, wasHeld, type Petition } from '../model';
import { SafetyFlags } from '../SafetyFlags';
import { useDesk } from '../state';
import { formatShort } from '../time';

export function followUpText(p: Petition): string {
  const c = deskCopy.review;
  if (!wasHeld(p)) return c.notFollowedUp;
  const added = p.followUp.amendedAt !== undefined && p.sample.amended
    ? p.sample.amended.incidents.length - p.sample.original.incidents.length
    : 0;
  return plural(c.followedUp, { n: added });
}

export function ReviewList() {
  const { state, dispatch } = useDesk();
  const c = deskCopy.review;
  // Held petitions don't appear until their hold ends.
  const rows = state.petitions.filter(inReview);

  return (
    <div className="desk-screen">
      <ScreenTitle>{c.title}</ScreenTitle>
      <p className="lede">{c.intro}</p>
      {rows.length === 0 ? (
        <p className="panel">{c.empty}</p>
      ) : (
        <div className="table-scroll" role="region" aria-label={c.title} tabIndex={0}>
          <table className="review-table">
            <thead>
              <tr>
                <th scope="col">{c.columns.caption}</th>
                <th scope="col">{c.columns.type}</th>
                <th scope="col">{c.columns.filed}</th>
                <th scope="col">{c.columns.open}</th>
                <th scope="col">{c.columns.followUp}</th>
                <th scope="col">{c.columns.outcome}</th>
                <th scope="col">
                  <span className="sr-only">{c.columns.action}</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => {
                const open = currentFindings(p).length;
                const name = caption(p);
                return (
                  <tr key={p.sample.id}>
                    <th scope="row">
                      {name}
                      <span className="meta tabular block">{p.sample.caseNumber}</span>
                      <span className="block row-flags-inline">
                        <SafetyFlags petition={p} />
                      </span>
                    </th>
                    <td>{deskCopy.caseTypes[p.sample.caseType]}</td>
                    <td className="tabular">{formatShort(filedAt(p))}</td>
                    <td>{open === 0 ? c.none : open}</td>
                    <td>{followUpText(p)}</td>
                    <td>{p.followUp.outcome ? deskCopy.outcome.choices[p.followUp.outcome.choice] : c.noOutcome}</td>
                    <td>
                      <button
                        type="button"
                        className="btn"
                        aria-label={plural(c.openLabel, { caption: name })}
                        onClick={() => dispatch({ type: 'go', view: { screen: 'bench', id: p.sample.id, preview: false } })}
                      >
                        {c.open}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
