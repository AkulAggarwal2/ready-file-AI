// Screen 3: the magistrate's ex parte review list. Held petitions don't
// appear until their hold ends.
import { PageTitle, ScrollBox } from '../components/common';
import { deskCopy, fill, plural } from '../content';
import { formatShort } from '../format';
import { caseTypeLabel } from '../messages';
import { petitions } from '../petitions';
import { followUpOf, inReview, openFindings } from '../state/deskState';
import { useDesk } from '../state/DeskStateProvider';
import { useView } from '../state/view';

const r = deskCopy.review;

export function ReviewList() {
  const { state } = useDesk();
  const { go } = useView();

  const rows = petitions
    .filter((petition) => inReview(state.records[petition.id]))
    .sort((a, b) => a.original.filedAt - b.original.filedAt);

  return (
    <div className="screen">
      <div className="page-head">
        <div>
          <PageTitle>{r.title}</PageTitle>
          <p className="page-sub">{r.intro}</p>
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="panel empty">{r.empty}</p>
      ) : (
        <div className="panel panel-flush">
          <ScrollBox label={r.tableLabel}>
            <table className="table review-table" aria-label={r.tableLabel}>
              <thead>
                <tr>
                  <th scope="col">{r.columns.case}</th>
                  <th scope="col">{r.columns.type}</th>
                  <th scope="col">{r.columns.filed}</th>
                  <th scope="col">{r.columns.questions}</th>
                  <th scope="col">{r.columns.followUp}</th>
                  <th scope="col">{r.columns.outcome}</th>
                  <th scope="col">
                    <span className="sr-only">{r.columns.open}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((petition) => {
                  const record = state.records[petition.id];
                  const open = openFindings(petition, record).length;
                  const { followedUp, added } = followUpOf(petition, record);
                  const caption = fill(r.caption, {
                    petitioner: petition.petitioner.lastName,
                    respondent: petition.respondent.lastName,
                  });
                  return (
                    <tr key={petition.id}>
                      <th scope="row">
                        <span className="cell-strong">{caption}</span>
                        <span className="cell-meta tnum">{petition.caseNumber}</span>
                      </th>
                      <td>{caseTypeLabel(petition)}</td>
                      <td className="tnum">{formatShort(petition.original.filedAt)}</td>
                      <td className="tnum">{open === 0 ? r.none : open}</td>
                      <td>
                        {added !== null
                          ? added > 0
                            ? plural(r.followedUp, added)
                            : r.amendedNoNew
                          : followedUp
                            ? plural(r.followedUp, 0)
                            : r.notFollowedUp}
                      </td>
                      <td>{record.outcome ? deskCopy.bench.outcome.choices[record.outcome.choice] : r.noOutcome}</td>
                      <td>
                        <button
                          type="button"
                          className="btn btn-secondary btn-compact"
                          onClick={() => go({ screen: 'bench', id: petition.id, preview: false })}
                        >
                          {r.open}{' '}
                          <span className="sr-only">{fill(r.openFor, { caption, caseNumber: petition.caseNumber })}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollBox>
        </div>
      )}
    </div>
  );
}
