import { QuestionIcon, ScreenTitle, StatusChip } from '../components';
import { deskCopy, plural } from '../content';
import { currentFindings, filedAt, fullName, initials, staffText, status, type Petition } from '../model';
import { withQuestions, useDesk, type Filter } from '../state';
import { formatShort } from '../time';

const FILTERS: Filter[] = ['questions', 'none', 'all'];

export function contactSummary(p: Petition): string {
  const c = deskCopy.contact;
  const { texts, calls } = p.sample.contact;
  return [texts ? c.textsOk : c.textsNotOk, calls ? plural(c.calls, { calls: calls.text }) : c.noCalls].join(' ');
}

export function OnlinePetitions() {
  const { state, dispatch } = useDesk();
  const c = deskCopy.list;
  const all = state.petitions;
  const questions = withQuestions(all);
  const counts: Record<Filter, number> = { questions: questions.length, none: all.length - questions.length, all: all.length };
  const shown = all.filter((p) => {
    const has = currentFindings(p).length > 0;
    return state.filter === 'all' || (state.filter === 'questions' ? has : !has);
  });

  return (
    <div className="desk-screen">
      <ScreenTitle>{c.title}</ScreenTitle>
      <p className="lede">
        {plural(c.introTotal, { total: all.length })} {plural(c.introQuestions, { withQuestions: questions.length })}
      </p>

      <div className="list-controls">
        <div>
          <label className="check-label">
            <input
              type="checkbox"
              checked={state.showNames}
              onChange={(e) => dispatch({ type: 'showNames', show: e.target.checked })}
            />
            {c.showNames}
          </label>
          <p className="meta tabular">{plural(c.updated, { time: formatShort(state.clock) })}</p>
        </div>
        <div className="filters">
          <div role="group" aria-label={c.filtersLabel} className="filter-buttons">
            {FILTERS.map((filter) => (
              <button
                key={filter}
                type="button"
                className="btn"
                aria-pressed={state.filter === filter}
                onClick={() => dispatch({ type: 'filter', filter })}
              >
                {plural(c.filters[filter], { n: counts[filter] })}
              </button>
            ))}
          </div>
          <p className="meta">{c.filterNote}</p>
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="panel">{c.empty}</p>
      ) : (
        <ul className="petition-list">
          {shown.map((p) => (
            <PetitionRow key={p.sample.id} petition={p} showName={state.showNames} />
          ))}
        </ul>
      )}

      <div className="list-notes">
        {c.notes.map((note) => (
          <p key={note} className="meta">
            {note}
          </p>
        ))}
      </div>
    </div>
  );
}

function PetitionRow({ petition: p, showName }: { petition: Petition; showName: boolean }) {
  const { dispatch } = useDesk();
  const c = deskCopy.list;
  const findings = currentFindings(p);
  const headingId = `row-${p.sample.id}`;

  return (
    <li className="panel petition-row" aria-labelledby={headingId}>
      <div className="row-who">
        <h2 id={headingId} className="row-heading">
          <span>{deskCopy.caseTypes[p.sample.caseType]}</span>
          <span className="row-name">{showName ? fullName(p) : initials(p)}</span>
        </h2>
        <p className="meta tabular">
          {plural(c.filed, { time: formatShort(filedAt(p)) })} · <span className="nowrap">{p.sample.caseNumber}</span>
        </p>
      </div>
      <div className="row-findings">
        {findings.length === 0 ? (
          <p className="meta">{c.noQuestions}</p>
        ) : (
          <ul className="finding-list" aria-label={c.questionsLabel}>
            {findings.map((finding) => (
              <li key={finding.key} className="finding">
                <QuestionIcon />
                {staffText(finding)}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="row-contact">
        <p className="row-strong">{p.sample.contact.phone ? c.phoneGiven : c.noPhone}</p>
        <p className="meta">{p.sample.contact.phone ? contactSummary(p) : c.noPhoneNote}</p>
      </div>
      <div className="row-status">
        <StatusChip status={status(p)} />
        <button
          type="button"
          className="btn"
          aria-label={plural(c.openLabel, { caseNumber: p.sample.caseNumber })}
          onClick={() => dispatch({ type: 'go', view: { screen: 'petition', id: p.sample.id } })}
        >
          {c.open}
        </button>
      </div>
    </li>
  );
}
