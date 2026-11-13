// Screen 1: the specialist's list of online petitions and the questions found.
import { PageTitle, QuestionIcon, StatusChip, cls } from '../components/common';
import { deskConfig } from '../config';
import { deskCopy, fill, plural, staffText } from '../content';
import { formatShort } from '../format';
import { caseTypeLabel } from '../messages';
import { fullName, initials, petitions } from '../petitions';
import { contactSummary } from '../schedule';
import { openFindings, statusOf, type ListFilter } from '../state/deskState';
import { useDesk } from '../state/DeskStateProvider';
import { useView } from '../state/view';

const c = deskCopy.list;
const FILTERS: ListFilter[] = ['questions', 'none', 'all'];

export function OnlinePetitions() {
  const { state, dispatch } = useDesk();
  const { go } = useView();

  const rows = [...petitions]
    .sort((a, b) => a.original.filedAt - b.original.filedAt)
    .map((petition) => {
      const record = state.records[petition.id];
      return { petition, record, findings: openFindings(petition, record) };
    });
  const withQuestions = rows.filter((row) => row.findings.length > 0);
  const counts: Record<ListFilter, number> = {
    questions: withQuestions.length,
    none: rows.length - withQuestions.length,
    all: rows.length,
  };
  const visible = rows.filter((row) =>
    state.filter === 'all' ? true : state.filter === 'questions' ? row.findings.length > 0 : row.findings.length === 0,
  );

  return (
    <div className="screen">
      <div className="page-head">
        <div>
          <PageTitle>{c.title}</PageTitle>
          <p className="page-sub">
            {fill(c.summary, {
              total: plural(c.summaryTotal, rows.length),
              withQuestions: plural(c.summaryWithQuestions, withQuestions.length),
            })}
          </p>
        </div>
        <div className="names-toggle">
          <label className="checkbox">
            <input
              type="checkbox"
              checked={state.showNames}
              onChange={(event) => dispatch({ type: 'setShowNames', show: event.target.checked })}
            />
            <span>{c.showNames}</span>
          </label>
          <p className="meta tnum">{fill(c.updated, { time: formatShort(state.now) })}</p>
        </div>
      </div>

      <div className="filter-bar">
        <div className="filters" role="group" aria-label={c.filtersLabel}>
          {FILTERS.map((filter) => (
            <button
              key={filter}
              type="button"
              className="filter-button"
              aria-pressed={state.filter === filter}
              onClick={() => dispatch({ type: 'setFilter', filter })}
            >
              {fill(c.filters[filter], { n: counts[filter] })}
            </button>
          ))}
        </div>
        <p className="filter-note">{c.scopeNote}</p>
      </div>

      {visible.length === 0 ? (
        <p className="panel empty">{c.empty}</p>
      ) : (
        <ul className="rows">
          {visible.map(({ petition, record, findings }) => {
            const status = statusOf(petition, record);
            const name = state.showNames ? fullName(petition.petitioner) : initials(petition.petitioner);
            return (
              <li key={petition.id} className={cls('row', status.onHold && 'row-held')}>
                <div className="row-case">
                  <h2 className="row-title">{fill(c.rowTitle, { caseType: caseTypeLabel(petition), name })}</h2>
                  <p className="meta tnum">{fill(c.filed, { time: formatShort(petition.original.filedAt) })}</p>
                  <p className="meta tnum">
                    <span className="sr-only">{fill(c.caseNumber, { caseNumber: petition.caseNumber })}</span>
                    <span aria-hidden="true">{petition.caseNumber}</span>
                  </p>
                </div>

                <div className="row-findings">
                  <p className="row-label">{c.questionsLabel}</p>
                  {findings.length > 0 ? (
                    <ul className="finding-list">
                      {findings.map((finding) => (
                        <li key={finding.key}>
                          <QuestionIcon />
                          <span>{staffText(finding)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="no-questions">{c.noQuestions}</p>
                  )}
                </div>

                <div className="row-contact">
                  <p className="row-label">{c.contactLabel}</p>
                  {petition.contact.phone ? (
                    <>
                      <p className="strong">{c.phoneGiven}</p>
                      <p className="small">{contactSummary(petition.contact)}</p>
                    </>
                  ) : (
                    <>
                      <p className="strong">{c.noPhone}</p>
                      {findings.length > 0 && <p className="small">{plural(c.noPhoneNote, findings.length)}</p>}
                    </>
                  )}
                </div>

                <div className="row-status">
                  <p className="row-label">{c.statusLabel}</p>
                  <StatusChip status={status} />
                </div>

                <div className="row-action">
                  <button type="button" className="btn btn-secondary" onClick={() => go({ screen: 'petition', id: petition.id })}>
                    {c.open}{' '}
                    <span className="sr-only">{fill(c.openFor, { caseNumber: petition.caseNumber })}</span>
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="list-notes">
        {c.notes.map((note) => (
          <p key={note}>{fill(note, { hours: deskConfig.holdHours })}</p>
        ))}
      </div>
    </div>
  );
}
