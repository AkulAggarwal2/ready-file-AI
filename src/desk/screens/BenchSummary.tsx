import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Tooltip } from '../../ui/Tooltip';
import { ActivityLog, Breadcrumb, NumberedText, ScreenTitle } from '../components';
import { deskConfig, deskCopy, plural, type Outcome } from '../content';
import type { LineRange } from '../lines';
import {
  activeHold,
  caption,
  currentFindings,
  currentVersionName,
  deskRules,
  filedAt,
  findingsFor,
  fullName,
  hasPhone,
  inDateOrder,
  inQueueSince,
  numberVersion,
  respondentName,
  staffText,
  wasHeld,
  type Petition,
  type VersionName,
} from '../model';
import { SafetyAnswersPanel } from '../SafetyFlags';
import { useDesk } from '../state';
import { formatShort, formatTime, weekday } from '../time';

type Tab = 'summary' | VersionName;

export function BenchSummary({ id, preview }: { id: string; preview: boolean }) {
  const { state, dispatch } = useDesk();
  const p = state.petitions.find((petition) => petition.sample.id === id);
  const [tab, setTab] = useState<Tab>('summary');
  const [highlight, setHighlight] = useState<{ version: VersionName; range: LineRange } | null>(null);
  const highlightRef = useRef<HTMLLIElement>(null);
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  // After a line link, the highlighted lines take focus.
  useEffect(() => {
    if (highlight) highlightRef.current?.focus();
  }, [highlight]);

  if (!p) return null;
  const c = deskCopy.bench;
  const current = currentVersionName(p);
  const tabs: Tab[] = current === 'amended' ? ['summary', 'amended', 'original'] : ['summary', 'original'];
  const filed = filedAt(p);
  const amendedAt = p.followUp.amendedAt;

  const line =
    plural(c.filed, { caseType: deskCopy.caseTypes[p.sample.caseType], weekday: weekday(filed), time: formatTime(filed) }) +
    (current === 'amended' && amendedAt !== undefined
      ? plural(c.amendedPart, { weekday: weekday(amendedAt), time: formatTime(amendedAt) })
      : '') +
    c.end +
    (activeHold(p) ? '' : plural(c.queueSince, { weekday: weekday(inQueueSince(p)), time: formatTime(inQueueSince(p)) }));

  function openLines(version: VersionName, range: LineRange) {
    setTab(version);
    setHighlight({ version, range });
  }

  function onTabKey(event: KeyboardEvent<HTMLButtonElement>) {
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
  }

  return (
    <div className="desk-screen">
      {preview ? (
        <p className="breadcrumb">
          <button
            type="button"
            className="link-button"
            onClick={() => dispatch({ type: 'go', view: { screen: 'petition', id } })}
          >
            {c.back}
          </button>
        </p>
      ) : (
        <Breadcrumb
          parent={c.breadcrumb}
          current={p.sample.caseNumber}
          onParent={() => dispatch({ type: 'go', view: { screen: 'review' } })}
        />
      )}
      <ScreenTitle>{caption(p)}</ScreenTitle>
      <p className="lede tabular">{line}</p>
      {preview && <p className="meta">{c.previewNote}</p>}

      <div className={preview ? 'columns single' : 'columns columns-bench'}>
        <div className="main-column">
          <div role="tablist" aria-label={c.tabs.label} className="tabs">
            {tabs.map((name) => (
              <button
                key={name}
                ref={(el) => {
                  tabRefs.current[name] = el;
                }}
                id={`tab-${name}`}
                role="tab"
                type="button"
                aria-selected={tab === name}
                aria-controls={`panel-${name}`}
                tabIndex={tab === name ? 0 : -1}
                onKeyDown={onTabKey}
                onClick={() => setTab(name)}
              >
                {c.tabs[name]}
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="panel tab-panel">
            {tab === 'summary' ? (
              <SummaryTab petition={p} onLines={openLines} />
            ) : (
              <VersionTab
                petition={p}
                name={tab}
                highlight={highlight?.version === tab ? highlight.range : null}
                highlightRef={highlightRef}
                onClear={() => setHighlight(null)}
              />
            )}
          </div>
        </div>

        {!preview && (
          <div className="side-column">
            <OutcomePanel petition={p} />
            <OpenQuestionsPanel petition={p} />
          </div>
        )}
      </div>
    </div>
  );
}

function SummaryTab({ petition: p, onLines }: { petition: Petition; onLines: (v: VersionName, r: LineRange) => void }) {
  const c = deskCopy.bench;
  const name = currentVersionName(p);
  const v = numberVersion(p, name);
  const incidents = inDateOrder(v.incidents);
  const linkText = (range: LineRange) =>
    plural(c.lineLink, { version: c.versionNames[name], count: range.b - range.a + 1, a: range.a, b: range.b });

  return (
    <>
      <h2 className="panel-title">{c.summaryTitle}</h2>
      <p className="meta">{plural(c.builtFrom, { version: c.versions[name] })}</p>
      <dl className="fields">
        <div>
          <dt>{c.petitioner}</dt>
          <dd>{fullName(p)}</dd>
        </div>
        <div>
          <dt>{c.respondent}</dt>
          <dd>{respondentName(p)}</dd>
        </div>
        <div>
          <dt>{c.relationship}</dt>
          <dd>{p.sample.relationship}</dd>
        </div>
        <div>
          <dt>{c.basis}</dt>
          <dd>{deskCopy.caseTypes[p.sample.caseType]}</dd>
        </div>
      </dl>

      <SafetyAnswersPanel petition={p} as="h3" />

      <h3>{plural(c.incidents, { n: incidents.length })}</h3>
      <ol className="bench-incidents">
        {incidents.map((incident, k) => (
          <li key={incident.k} className="bench-incident">
            <h4>{plural(c.incident, { k: k + 1 })}</h4>
            <p className="row-strong">
              {incident.date} · {incident.place} · {incident.how}
            </p>
            <p className="verbatim">{incident.description}</p>
            {incident.lines && (
              <button type="button" className="link-button" onClick={() => onLines(name, incident.lines!)}>
                {linkText(incident.lines)}
              </button>
            )}
          </li>
        ))}
      </ol>

      {v.notTied.length > 0 && (
        <>
          <h3>{c.notTied}</h3>
          <ul className="bench-incidents">
            {v.notTied.map((statement) => (
              <li key={statement.text} className="bench-incident">
                <p className="verbatim">{statement.text}</p>
                {statement.lines && (
                  <button type="button" className="link-button" onClick={() => onLines(name, statement.lines!)}>
                    {linkText(statement.lines)}
                  </button>
                )}
              </li>
            ))}
          </ul>
        </>
      )}

      <QuestionsTable petition={p} />

      <ActivityLog entries={p.followUp.log} title={c.record} />
      <p className="meta">{c.noEdit}</p>
    </>
  );
}

function QuestionsTable({ petition: p }: { petition: Petition }) {
  const c = deskCopy.bench;
  const applies = deskRules(p.sample);
  const open = currentFindings(p);
  const asked = findingsFor(p.sample, p.sample.original);
  const amendedAt = p.followUp.amendedAt;
  // Desk doesn't check this case type, so there's nothing to list.
  if (applies.length === 0) return null;

  return (
    <>
      <h3>{c.questionsTitle}</h3>
      <div className="table-scroll" role="region" aria-label={c.questionsTitle} tabIndex={0}>
        <table className="questions-table">
          <thead>
            <tr>
              <th scope="col">{c.questionCol}</th>
              <th scope="col">{c.statusCol}</th>
            </tr>
          </thead>
          <tbody>
            {applies.map((rule) => {
              const stillOpen = open.filter((f) => f.ruleId === rule.id);
              const wasAsked = asked.some((f) => f.ruleId === rule.id);
              let statusText: string;
              if (stillOpen.length > 0) {
                statusText = stillOpen.map((f) => plural(c.stillOpen, { text: staffText(f) })).join(' ');
              } else if (wasAsked && amendedAt !== undefined) {
                statusText = plural(c.answered, { time: formatShort(amendedAt) });
              } else {
                statusText = c.noQuestion;
              }
              return (
                <tr key={rule.id}>
                  <td>{rule.questionText}</td>
                  <td className={stillOpen.length > 0 ? 'status-open' : undefined}>{statusText}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}

function VersionTab({
  petition: p,
  name,
  highlight,
  highlightRef,
  onClear,
}: {
  petition: Petition;
  name: VersionName;
  highlight: LineRange | null;
  highlightRef: React.Ref<HTMLLIElement>;
  onClear: () => void;
}) {
  const c = deskCopy.bench;
  const v = numberVersion(p, name);
  return (
    <>
      <div className="panel-head">
        <h2 className="panel-title">{c.tabs[name]}</h2>
        <span className="meta">{deskCopy.filed.unchanged}</span>
      </div>
      {highlight && (
        <div className="highlight-bar">
          <p role="status">{plural(c.highlighted, { count: highlight.b - highlight.a + 1, a: highlight.a, b: highlight.b })}</p>
          <button type="button" className="btn" onClick={onClear}>
            {c.clearHighlight}
          </button>
        </div>
      )}
      <NumberedText lines={v.lines} highlight={highlight} highlightRef={highlightRef} label={c.tabs[name]} />
    </>
  );
}

function OutcomePanel({ petition: p }: { petition: Petition }) {
  const { dispatch } = useDesk();
  const c = deskCopy.outcome;
  const saved = p.followUp.outcome;
  const [choice, setChoice] = useState<Outcome | null>(saved?.choice ?? null);
  const [reasons, setReasons] = useState<string[]>(saved?.reasons ?? []);
  const [error, setError] = useState('');
  const choices = deskConfig.outcomes[p.sample.caseType];
  const name = `outcome-${p.sample.id}`;

  const told =
    choice === 'granted' ? c.toldGranted : choice === 'hearing' ? c.toldHearing : choice === 'denied' ? c.toldDenied : c.toldNone;

  function save() {
    if (!choice) return setError(c.pickOutcome);
    if (choice === 'denied' && reasons.length === 0) return setError(c.pickReason);
    setError('');
    dispatch({ type: 'saveOutcome', id: p.sample.id, choice, reasons: choice === 'denied' ? reasons : [] });
  }

  return (
    <section className="panel" aria-labelledby="outcome-title">
      <h2 id="outcome-title" className="panel-title">
        {c.title}
      </h2>
      <p>{c.intro}</p>
      <fieldset>
        <legend>{c.legend}</legend>
        {choices.map((key) => (
          <label key={key} className="radio-label">
            <input
              type="radio"
              name={name}
              checked={choice === key}
              onChange={() => {
                setChoice(key);
                setError('');
              }}
            />
            {c.choices[key]}
          </label>
        ))}
      </fieldset>
      <fieldset disabled={choice !== 'denied'}>
        <legend>{c.reasonsLegend}</legend>
        {deskConfig.denialReasons.map((reason) => (
          <label key={reason.id} className="radio-label">
            <input
              type="checkbox"
              checked={reasons.includes(reason.id)}
              onChange={(e) =>
                setReasons((list) => (e.target.checked ? [...list, reason.id] : list.filter((r) => r !== reason.id)))
              }
            />
            {reason.label}
          </label>
        ))}
        <p className="meta">{deskConfig.denialReasonsSource}</p>
      </fieldset>
      <h3>{c.told}</h3>
      <p aria-live="polite">{told}</p>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
      <button type="button" className="btn btn-primary" onClick={save}>
        {c.save}
      </button>
      {saved && (
        <p role="status" className="saved">
          {plural(c.saved, { outcome: c.choices[saved.choice] })}
        </p>
      )}
    </section>
  );
}

function OpenQuestionsPanel({ petition: p }: { petition: Petition }) {
  const { dispatch } = useDesk();
  const c = deskCopy.openQuestions;
  const open = currentFindings(p);
  if (open.length === 0) return null;
  const hold = activeHold(p);

  return (
    <section className="panel" aria-labelledby="open-title">
      <h2 id="open-title" className="panel-title">
        {plural(c.title, { n: open.length })}
      </h2>
      <ul className="finding-list">
        {open.map((finding) => (
          <li key={finding.key}>{staffText(finding)}</li>
        ))}
      </ul>
      {hold?.by === 'magistrate' ? (
        <p role="status">{c.asked}</p>
      ) : !hasPhone(p) ? (
        <p>{c.noPhone}</p>
      ) : wasHeld(p) ? (
        <p>{c.alreadyHeld}</p>
      ) : (
        <Tooltip text={deskCopy.tooltips.ask}>
          <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'askFollowUp', id: p.sample.id })}>
            {c.ask}
          </button>
        </Tooltip>
      )}
    </section>
  );
}
