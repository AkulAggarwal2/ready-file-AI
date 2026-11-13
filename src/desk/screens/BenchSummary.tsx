// Screen 4: the bench summary for the magistrate. Her words are shown in full,
// unchanged, sorted by date. Desk doesn't judge whether the petition meets any
// legal standard (ground rule 4).
import { useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  ActivityLog,
  Breadcrumb,
  Facts,
  PageTitle,
  QuestionIcon,
  ScrollBox,
  cls,
  useFocusAfterRender,
} from '../components/common';
import { NumberedText } from '../components/NumberedText';
import { deskConfig, type OutcomeId } from '../config';
import { deskCopy, deskRules, fill, plural, staffText } from '../content';
import { inDateOrder } from '../dateOrder';
import { formatAt, formatLong, formatShort } from '../format';
import type { LineRange } from '../lineWrap';
import { caseTypeLabel, dateText, howText } from '../messages';
import { fullName, petitionById, type Petition, type PetitionVersion, type VersionKind } from '../petitions';
import { currentVersion, inReview, type PetitionRecord } from '../state/deskState';
import { useDesk } from '../state/DeskStateProvider';
import { useView } from '../state/view';

const b = deskCopy.bench;

type Tab = 'summary' | VersionKind;

interface Highlight extends LineRange {
  kind: VersionKind;
}

export function BenchSummary({ id, preview }: { id: string; preview: boolean }) {
  const { state } = useDesk();
  const { go } = useView();
  const petition = petitionById(id);
  const record = state.records[id];
  const version = currentVersion(petition, record);
  const amended = version.kind === 'amended' ? petition.amendment : null;

  const tabs: Tab[] = ['summary', ...(amended ? (['amended'] as const) : []), 'original'];
  const [tab, setTab] = useState<Tab>('summary');
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const tabRefs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const focusAfter = useFocusAfterRender();

  const openLines = (kind: VersionKind, first: number, last: number) => {
    setTab(kind);
    setHighlight({ kind, first, last });
    focusAfter(`highlight-${kind}`);
  };

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const index = tabs.indexOf(tab);
    const next =
      event.key === 'ArrowRight'
        ? tabs[(index + 1) % tabs.length]
        : event.key === 'ArrowLeft'
          ? tabs[(index - 1 + tabs.length) % tabs.length]
          : event.key === 'Home'
            ? tabs[0]
            : event.key === 'End'
              ? tabs[tabs.length - 1]
              : null;
    if (!next) return;
    event.preventDefault();
    setTab(next);
    tabRefs.current[next]?.focus();
  };

  const title = fill(b.title, { petitioner: petition.petitioner.lastName, respondent: petition.respondent.lastName });
  const subtitle = fill(b.subtitle, {
    caseType: caseTypeLabel(petition),
    filed: formatAt(petition.original.filedAt),
    amended: amended ? fill(b.amended, { time: formatAt(amended.filedAt) }) : '',
    queue: inReview(record)
      ? fill(b.queue, { time: formatAt(record.queueSince) })
      : fill(b.onHold, { time: formatAt(record.hold!.end) }),
  });

  return (
    <div className="screen">
      {preview ? (
        <p className="back-link">
          <button type="button" className="link-button" onClick={() => go({ screen: 'petition', id })}>
            <span aria-hidden="true">← </span>
            {b.back}
          </button>
        </p>
      ) : (
        <Breadcrumb parent={deskCopy.app.nav.review} onParent={() => go({ screen: 'review' })} current={petition.caseNumber} />
      )}
      <div className="page-head">
        <div>
          <PageTitle>{title}</PageTitle>
          <p className="page-sub tnum">{subtitle}</p>
        </div>
      </div>

      <div className={cls('columns', preview ? 'columns-single' : 'columns-magistrate')}>
        <div className="col-main">
          <div className="tabs" role="tablist" aria-label={b.tabsLabel}>
            {tabs.map((t) => (
              <button
                key={t}
                ref={(element) => {
                  tabRefs.current[t] = element;
                }}
                id={`tab-${t}`}
                type="button"
                role="tab"
                className="tab"
                aria-selected={tab === t}
                aria-controls={`panel-${t}`}
                tabIndex={tab === t ? 0 : -1}
                onClick={() => setTab(t)}
                onKeyDown={onTabKey}
              >
                {b.tabs[t]}
              </button>
            ))}
          </div>

          {tabs.map((t) => (
            <div
              key={t}
              id={`panel-${t}`}
              role="tabpanel"
              aria-labelledby={`tab-${t}`}
              className="panel tab-panel"
              hidden={tab !== t}
              tabIndex={0}
            >
              {t === 'summary' ? (
                <SummaryTab petition={petition} record={record} version={version} onOpenLines={openLines} />
              ) : (
                <PetitionTab
                  version={t === 'amended' ? amended! : petition.original}
                  highlight={highlight?.kind === t ? highlight : null}
                  onClear={() => {
                    setHighlight(null);
                    focusAfter(`tab-${t}`);
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {!preview && (
          <div className="col-side">
            <OutcomePanel petition={petition} record={record} />
            <OpenQuestionsPanel petition={petition} record={record} version={version} />
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryTab({
  petition,
  record,
  version,
  onOpenLines,
}: {
  petition: Petition;
  record: PetitionRecord;
  version: PetitionVersion;
  onOpenLines: (kind: VersionKind, first: number, last: number) => void;
}) {
  const incidents = inDateOrder(version.incidents, version.filedAt);
  const versionTitle = b.versionTitles[version.kind];
  const lineLink = (first: number, last: number) =>
    fill(first === last ? b.lineLink : b.linesLink, { version: versionTitle, a: first, b: last });

  // Every rule that applies to the case type and has a condition.
  const rules = deskRules.filter((rule) => rule.condition && rule.caseTypes.includes(petition.caseType));

  return (
    <>
      <h2 className="panel-title">{b.summaryTitle}</h2>
      <p className="lead">{fill(b.builtFrom, { version: b.versionNames[version.kind] })}</p>
      <Facts
        className="facts-grid"
        items={[
          [b.fields.petitioner, fullName(petition.petitioner)],
          [b.fields.respondent, fullName(petition.respondent)],
          [b.fields.relationship, petition.respondent.relationship],
          [b.fields.basis, caseTypeLabel(petition)],
        ]}
      />

      <h3 className="section-title">{plural(b.incidentsTitle, incidents.length)}</h3>
      <ol className="bench-incidents">
        {incidents.map((incident, index) => (
          <li key={incident.id} className="bench-incident">
            <h4 className="subsection-title">{fill(b.incident, { k: index + 1 })}</h4>
            <p className="incident-meta">
              <span>{dateText(incident.date)}</span>
              <span>{howText(incident.how)}</span>
            </p>
            <div className="paper verbatim">
              <p>{incident.description}</p>
            </div>
            <button
              type="button"
              className="link-button tnum"
              onClick={() => onOpenLines(version.kind, incident.firstLine, incident.lastLine)}
            >
              {lineLink(incident.firstLine, incident.lastLine)}
            </button>
          </li>
        ))}
      </ol>

      {version.statements.length > 0 && (
        <>
          <h3 className="section-title">{b.notTied}</h3>
          <ul className="bench-incidents">
            {version.statements.map((statement) => (
              <li key={statement.firstLine} className="bench-incident">
                <div className="paper verbatim">
                  <p>{statement.text}</p>
                </div>
                <button
                  type="button"
                  className="link-button tnum"
                  onClick={() => onOpenLines(version.kind, statement.firstLine, statement.lastLine)}
                >
                  {lineLink(statement.firstLine, statement.lastLine)}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 id="counter-questions-title" className="section-title">
        {b.questionsTitle}
      </h3>
      <ScrollBox label={b.questionsTableLabel}>
        <table className="table questions-table" aria-labelledby="counter-questions-title">
          <thead>
            <tr>
              <th scope="col">{b.questionsColumns.question}</th>
              <th scope="col">{b.questionsColumns.status}</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((rule) => {
              const open = version.findings.filter((f) => f.ruleId === rule.id);
              const askedOfOriginal = petition.original.findings.some((f) => f.ruleId === rule.id);
              return (
                <tr key={rule.id}>
                  <td>{rule.questionText}</td>
                  <td className="tnum">
                    {open.length > 0 ? (
                      open.map((finding) => (
                        <span key={finding.key} className="status-open">
                          {fill(b.stillOpen, { text: staffText(finding) })}
                        </span>
                      ))
                    ) : version.kind === 'amended' && askedOfOriginal && record.amendedAt !== null ? (
                      fill(b.answered, { time: formatShort(record.amendedAt) })
                    ) : (
                      b.noQuestion
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollBox>

      <h3 className="section-title">{b.recordTitle}</h3>
      <ActivityLog log={record.log} />
      <p className="note">{b.recordNote}</p>
    </>
  );
}

function PetitionTab({
  version,
  highlight,
  onClear,
}: {
  version: PetitionVersion;
  highlight: Highlight | null;
  onClear: () => void;
}) {
  const p = b.petitionTab;
  return (
    <>
      <h2 className="panel-title">{b.tabs[version.kind]}</h2>
      <p className="lead tnum">{fill(p.filed, { date: formatLong(version.filedAt) })}</p>
      {highlight && (
        <div className="highlight-bar">
          <p id={`highlight-${version.kind}`} tabIndex={-1} className="tnum">
            {highlight.first === highlight.last
              ? fill(p.highlightedLine, { a: highlight.first })
              : fill(p.highlightedLines, { a: highlight.first, b: highlight.last })}
          </p>
          <button type="button" className="btn btn-small" onClick={onClear}>
            {p.clear}
          </button>
        </div>
      )}
      <NumberedText
        lines={version.lines}
        label={fill(deskCopy.petition.filedPetition.narrativeLabel, { version: b.versionNames[version.kind] })}
        highlight={highlight}
      />
    </>
  );
}

function OutcomePanel({ petition, record }: { petition: Petition; record: PetitionRecord }) {
  const { dispatch } = useDesk();
  const o = b.outcome;
  const choices = deskConfig.outcomes[petition.caseType] ?? [];
  const reasons = deskConfig.denialReasons;
  const [choice, setChoice] = useState<OutcomeId | null>(record.outcome?.choice ?? null);
  const [picked, setPicked] = useState<string[]>(record.outcome?.reasons ?? []);
  const [error, setError] = useState<'outcome' | 'reason' | null>(null);
  const [dirty, setDirty] = useState(false);
  const focusAfter = useFocusAfterRender();
  const note = (o.caseTypeNotes as Record<string, string | undefined>)[petition.caseType];

  const save = (event: FormEvent) => {
    event.preventDefault();
    if (!choice) {
      setError('outcome');
      focusAfter('outcome-0');
      return;
    }
    if (choice === 'denied' && picked.length === 0) {
      setError('reason');
      focusAfter('reason-0');
      return;
    }
    setError(null);
    setDirty(false);
    dispatch({ type: 'saveOutcome', id: petition.id, choice, reasons: picked });
  };

  const saved = record.outcome && !dirty ? record.outcome : null;

  return (
    <section className="panel" aria-labelledby="outcome-title">
      <h2 id="outcome-title" className="panel-title">
        {o.title}
      </h2>
      <p>{o.intro}</p>
      <form onSubmit={save} noValidate>
        <fieldset aria-describedby={error === 'outcome' ? 'outcome-error' : note ? 'outcome-note' : undefined}>
          <legend className="legend">{o.legend}</legend>
          {choices.map((id, index) => (
            <label key={id} className="choice">
              <input
                id={`outcome-${index}`}
                type="radio"
                name="outcome"
                value={id}
                checked={choice === id}
                onChange={() => {
                  setChoice(id);
                  if (id !== 'denied') setPicked([]);
                  setError(null);
                  setDirty(true);
                }}
              />
              <span>{o.choices[id]}</span>
            </label>
          ))}
          {note && (
            <p id="outcome-note" className="note">
              {note}
            </p>
          )}
        </fieldset>
        {error === 'outcome' && (
          <p id="outcome-error" className="error" role="alert">
            {o.needOutcome}
          </p>
        )}

        <fieldset
          disabled={choice !== 'denied'}
          aria-describedby={cls('reasons-source', error === 'reason' && 'reason-error')}
        >
          <legend className="legend">{o.reasonsLegend}</legend>
          {reasons.reasons.map((reason, index) => (
            <label key={reason.id} className="choice">
              <input
                id={`reason-${index}`}
                type="checkbox"
                value={reason.id}
                checked={picked.includes(reason.id)}
                onChange={(event) => {
                  setPicked((list) =>
                    event.target.checked ? [...list, reason.id] : list.filter((r) => r !== reason.id),
                  );
                  setError(null);
                  setDirty(true);
                }}
              />
              <span>{reason.label}</span>
            </label>
          ))}
          <p id="reasons-source" className="note">
            {fill(o.reasonsSource, { source: reasons.source })}
          </p>
        </fieldset>
        {error === 'reason' && (
          <p id="reason-error" className="error" role="alert">
            {o.needReason}
          </p>
        )}

        <div className="told">
          <h3 className="section-title">{o.toldTitle}</h3>
          <p aria-live="polite">{choice ? o.told[choice] : o.told.none}</p>
        </div>

        <button type="submit" className="btn btn-primary">
          {o.save}
        </button>
        <p className="saved" role="status">
          {saved ? fill(o.saved, { outcome: o.choices[saved.choice] }) : ''}
        </p>
      </form>
    </section>
  );
}

function OpenQuestionsPanel({
  petition,
  record,
  version,
}: {
  petition: Petition;
  record: PetitionRecord;
  version: PetitionVersion;
}) {
  const { dispatch } = useDesk();
  const q = b.openQuestions;
  const focusAfter = useFocusAfterRender();
  const findings = version.findings;
  if (findings.length === 0) return null;

  return (
    <section className="panel" aria-labelledby="open-title">
      <h2 id="open-title" className="panel-title">
        {plural(q.title, findings.length)}
      </h2>
      <ul className="finding-list">
        {findings.map((finding) => (
          <li key={finding.key}>
            <QuestionIcon />
            <span>{staffText(finding)}</span>
          </li>
        ))}
      </ul>
      {record.hold?.byMagistrate ? (
        <p id="asked-note" tabIndex={-1} className="hold-note">
          {fill(q.sent, { specialist: deskCopy.app.specialistName, hours: deskConfig.holdHours })}
        </p>
      ) : petition.contact.phone ? (
        !record.hold && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              dispatch({ type: 'askFollowUp', id: petition.id });
              focusAfter('asked-note');
            }}
          >
            {q.ask}
          </button>
        )
      ) : (
        <p className="note">{q.noPhone}</p>
      )}
    </section>
  );
}
