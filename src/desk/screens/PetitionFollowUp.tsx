import { useState } from 'react';
import { DEMO_MODE } from '../../config';
import { ActivityLog, Breadcrumb, NumberedText, QuestionIcon, ScreenTitle, StatusChip } from '../components';
import { deskCopy, plural, type CallResult } from '../content';
import {
  activeHold,
  currentFindings,
  currentVersionName,
  filedAt,
  fullName,
  hasPhone,
  holdEndFrom,
  inCallTimes,
  linesText,
  nextActionTime,
  maskPhone,
  numberVersion,
  respondentName,
  ruleFor,
  staffText,
  status,
  type Petition,
  type VersionName,
} from '../model';
import { useDesk } from '../state';
import { buildStrip, tickLabel } from '../timeline';
import { day, formatBirthDate, formatShort, formatTime, month, weekday } from '../time';

export function PetitionFollowUp({ id }: { id: string }) {
  const { state, dispatch } = useDesk();
  const p = state.petitions.find((petition) => petition.sample.id === id);
  if (!p) return null;
  const c = deskCopy.petition;
  const filed = filedAt(p);

  return (
    <div className="desk-screen">
      <Breadcrumb
        parent={c.breadcrumb}
        current={p.sample.caseNumber}
        onParent={() => dispatch({ type: 'go', view: { screen: 'petitions' } })}
      />
      <div className="title-row">
        <div>
          <ScreenTitle>
            {plural(c.title, { caseType: deskCopy.caseTypes[p.sample.caseType], name: fullName(p) })}
          </ScreenTitle>
          <p className="lede tabular">
            {plural(c.filedLine, {
              weekday: weekday(filed),
              month: month(filed),
              day: day(filed),
              time: formatTime(filed),
              respondent: respondentName(p),
            })}
          </p>
        </div>
        <p>
          <span className="sr-only">{c.statusLabel} </span>
          <StatusChip status={status(p)} />
        </p>
      </div>

      <HoldPanel petition={p} now={state.clock} />

      <div className="columns">
        <div className="main-column">
          <QuestionsPanel petition={p} />
          <InfoBox />
          <FiledPanel petition={p} />
        </div>
        <div className="side-column">
          <ContactPanel petition={p} now={state.clock} />
          <ActivityLog entries={p.followUp.log} title={deskCopy.activity.title} />
        </div>
      </div>

      {DEMO_MODE && <DemoControls petition={p} />}
    </div>
  );
}

function HoldPanel({ petition: p, now }: { petition: Petition; now: number }) {
  const { dispatch } = useDesk();
  const c = deskCopy.hold;
  const hold = p.followUp.hold;
  const running = activeHold(p);
  const id = p.sample.id;

  let text;
  if (running) {
    const body = running.by === 'magistrate' ? c.heldBodyAsked : c.heldBody;
    text = (
      <>
        <h2 className="panel-title">{plural(c.heldTitle, { weekday: weekday(running.end), time: formatTime(running.end) })}</h2>
        <p>{plural(body, { time: formatTime(running.start), weekday: weekday(running.start) })}</p>
        {running.by === 'magistrate' && <p>{plural(c.askedBy, { time: formatShort(running.start) })}</p>}
        <div className="button-row">
          <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'sendNow', id })}>
            {c.sendNow}
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => dispatch({ type: 'go', view: { screen: 'bench', id, preview: true } })}
          >
            {c.preview}
          </button>
        </div>
      </>
    );
  } else if (hold?.endedAt !== undefined) {
    text = (
      <>
        <h2 className="panel-title">{c.sentTitle}</h2>
        <p>{plural(c.sentBody, { time: formatShort(hold.endedAt) })}</p>
      </>
    );
  } else {
    text = (
      <>
        <h2 className="panel-title">{c.notHeldTitle}</h2>
        <p>{c.notHeldBody}</p>
        {!hasPhone(p) && <p className="meta">{c.noPhone}</p>}
        <div className="button-row">
          <button
            type="button"
            className="btn btn-primary"
            disabled={!hasPhone(p)}
            onClick={() => dispatch({ type: 'hold', id })}
          >
            {c.holdButton}
          </button>
        </div>
      </>
    );
  }

  return (
    <section className={`panel hold-panel${running ? ' is-held' : ''}`} aria-label={c.label}>
      <div className="hold-text">{text}</div>
      <TimelineStrip petition={p} now={now} />
    </section>
  );
}

function TimelineStrip({ petition: p, now }: { petition: Petition; now: number }) {
  const t = deskCopy.timeline;
  const strip = buildStrip(p, now);
  const span = strip.end - strip.start;
  const pos = (time: number) => `${((time - strip.start) / span) * 100}%`;
  const size = (from: number, to: number) => `${((to - from) / span) * 100}%`;
  const bar = (from: number, to: number) => ({ left: pos(from), width: size(from, to) });

  return (
    <div className="strip-wrap">
      <div className="strip" role="img" aria-label={strip.alt}>

        <Lane label={t.lanes.counter}>
          {strip.counter.map((s) => (
            <span key={s.start} className="seg seg-counter" style={bar(s.start, s.end)} />
          ))}
        </Lane>
        <Lane label={t.lanes.calls} empty={!strip.calls || strip.calls.length === 0 ? t.noneGiven : undefined}>
          {strip.calls?.map((s) => <span key={s.start} className="seg seg-calls" style={bar(s.start, s.end)} />)}
        </Lane>
        <Lane label={t.lanes.texts}>
          {strip.texts ? (
            <span className="seg seg-texts" style={{ left: 0, width: '100%' }}>
              {t.textsOk}
            </span>
          ) : (
            <span className="lane-empty">{t.textsNotOk}</span>
          )}
        </Lane>
        <Lane label={t.lanes.hold}>
          {strip.hold && <span className="seg seg-hold" style={bar(strip.hold.start, strip.hold.end)} />}
          {strip.ifHeld && (
            <span className="seg seg-if-held" style={bar(strip.ifHeld.start, strip.ifHeld.end)}>
              {plural(t.ifHeld, { time: formatShort(strip.ifHeld.end) })}
            </span>
          )}
        </Lane>
        {/* Hour labels and the "Now" line sit over the lane tracks. */}
        <div className="strip-overlay">
          {strip.ticks.map((tick) => (
            <span key={tick} className="strip-tick" style={{ left: pos(tick) }}>
              {tickLabel(tick)}
            </span>
          ))}
          <div className="strip-now" style={{ left: pos(strip.now) }}>
            <span>{plural(t.now, { time: formatTime(strip.now) })}</span>
          </div>
        </div>
      </div>
      <p className="strip-sentence">{strip.sentence}</p>
    </div>
  );
}

function Lane({ label, empty, children }: { label: string; empty?: string; children?: React.ReactNode }) {
  return (
    <div className="lane">
      <span className="lane-label">{label}</span>
      <span className="lane-track">{empty ? <span className="lane-empty">{empty}</span> : children}</span>
    </div>
  );
}

function QuestionsPanel({ petition: p }: { petition: Petition }) {
  const c = deskCopy.questions;
  const findings = currentFindings(p);
  return (
    <section className="panel" aria-labelledby="questions-title">
      <h2 id="questions-title" className="panel-title">
        {plural(c.title, { n: findings.length })}
      </h2>
      {findings.length === 0 && <p>{c.none}</p>}
      <ul className="question-cards">
        {findings.map((finding) => {
          const rule = ruleFor(finding);
          return (
            <li key={finding.key} className="question-card">
              <p className="finding-strong">
                <QuestionIcon />
                <strong>{staffText(finding)}</strong>
              </p>
              <blockquote className="ask">“{finding.questionText}”</blockquote>
              <p className="meta rule-meta">
                <span>{plural(c.rule, { id: finding.ruleId })}</span>
                <span>{plural(c.source, { source: rule?.sourceCitation ?? finding.sourceCitation })}</span>
                {!finding.verified && <span className="badge-dashed">{c.notApproved}</span>}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function InfoBox() {
  const c = deskCopy.infoBox;
  return (
    <section className="panel info-box" aria-labelledby="info-title">
      <h2 id="info-title" className="panel-title">
        {c.title}
      </h2>
      <div className="info-pair">
        <div>
          <h3>{c.infoLabel}</h3>
          <p>“{c.information}”</p>
        </div>
        <div>
          <h3>{c.adviceLabel}</h3>
          {deskCopy.adviceExamples.map((example) => (
            <p key={example}>“{example}”</p>
          ))}
        </div>
      </div>
      <p className="meta">{c.test}</p>
    </section>
  );
}

function FiledPanel({ petition: p }: { petition: Petition }) {
  const c = deskCopy.filed;
  const names: VersionName[] = currentVersionName(p) === 'amended' ? ['amended', 'original'] : ['original'];
  const dob = p.sample.respondent.dateOfBirth;

  return (
    <section className="panel" aria-labelledby="filed-title">
      <div className="panel-head">
        <h2 id="filed-title" className="panel-title">
          {c.title}
        </h2>
        <span className="meta">{c.unchanged}</span>
      </div>
      <dl className="fields">
        <div>
          <dt>{c.basis}</dt>
          <dd>{deskCopy.caseTypes[p.sample.caseType]}</dd>
        </div>
        <div>
          <dt>{c.relationship}</dt>
          <dd>{p.sample.relationship}</dd>
        </div>
        <div>
          <dt>{c.respondent}</dt>
          <dd>{respondentName(p)}</dd>
        </div>
        <div>
          <dt>{c.dob}</dt>
          <dd className={dob ? undefined : 'blank'}>{dob ? formatBirthDate(dob) : c.blank}</dd>
        </div>
      </dl>
      {names.map((name) => {
        const v = numberVersion(p, name);
        const at = name === 'amended' ? p.followUp.amendedAt! : filedAt(p);
        const heading = plural(name === 'amended' ? c.amended : c.original, {
          weekday: weekday(at),
          time: formatTime(at),
        });
        return (
          <div key={name} className="filed-version">
            <h3>{heading}</h3>
            <NumberedText lines={v.lines} label={heading} />
            <p className="row-strong">{plural(c.found, { n: v.incidents.length })}</p>
            <ul className="incident-lines">
              {v.incidents.map((incident) => (
                <li key={incident.k}>
                  {plural(c.incidentLine, {
                    date: incident.date,
                    how: incident.how,
                    lines: incident.lines ? linesText(incident.lines) : '',
                  })}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
      <p className="meta">{c.splitNote}</p>
    </section>
  );
}

function ContactPanel({ petition: p, now }: { petition: Petition; now: number }) {
  const { dispatch } = useDesk();
  const c = deskCopy.contactPanel;
  const [showPhone, setShowPhone] = useState(false);
  const [calling, setCalling] = useState(false);
  const [result, setResult] = useState<CallResult | null>(null);
  const [error, setError] = useState('');
  const { phone, texts, voicemail, calls } = p.sample.contact;
  const running = activeHold(p);
  const hold = p.followUp.hold;
  const until = hold ? hold.end : holdEndFrom(nextActionTime(now));
  const id = p.sample.id;

  const message = plural(c.messageTemplate, {
    filedWeekday: weekday(filedAt(p)),
    untilWeekday: weekday(until),
    untilTime: formatTime(until),
  });

  function saveCall() {
    if (!result) {
      setError(c.pickResult);
      return;
    }
    dispatch({ type: 'logCall', id, result });
    setCalling(false);
    setResult(null);
    setError('');
  }

  return (
    <section className="panel" aria-labelledby="contact-title">
      <h2 id="contact-title" className="panel-title">
        {c.title}
      </h2>
      <dl className="fields fields-stacked">
        <div>
          <dt>{c.petitioner}</dt>
          <dd>{fullName(p)}</dd>
        </div>
        <div>
          <dt>{c.phone}</dt>
          <dd>
            {phone ? (
              <>
                <span className="tabular">{showPhone ? phone : maskPhone(phone)}</span>{' '}
                <button
                  type="button"
                  className="link-button"
                  aria-label={showPhone ? c.hideLabel : c.showLabel}
                  onClick={() => setShowPhone(!showPhone)}
                >
                  {showPhone ? c.hide : c.show}
                </button>
              </>
            ) : (
              c.noPhone
            )}
          </dd>
        </div>
        {phone && (
          <>
            <div>
              <dt>{c.texts}</dt>
              <dd>{texts ? c.ok : c.notOk}</dd>
            </div>
            <div>
              <dt>{c.voicemail}</dt>
              <dd>{voicemail ? c.ok : c.notOk}</dd>
            </div>
            <div>
              <dt>{c.calls}</dt>
              <dd>{calls ? calls.text[0].toUpperCase() + calls.text.slice(1) : c.none}</dd>
            </div>
          </>
        )}
      </dl>

      {phone && (
        <>
          <h3>{c.message}</h3>
          <p className="message">{message}</p>
          <p className="meta">{c.messageNote}</p>

          {!hold && <p>{c.beforeHold}</p>}
          {running && (
            <div className="contact-actions">
              {texts ? (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => dispatch({ type: 'textLink', id })}>
                    {p.followUp.textedAt !== undefined ? c.textAgain : c.text}
                  </button>
                  {p.followUp.textedAt !== undefined && (
                    <p className="meta" role="status">
                      {p.followUp.amendedAt !== undefined
                        ? plural(c.textedAdded, {
                            time: formatShort(p.followUp.textedAt),
                            added: formatShort(p.followUp.amendedAt),
                          })
                        : plural(c.texted, { time: formatShort(p.followUp.textedAt) })}
                    </p>
                  )}
                </>
              ) : (
                <p>{c.noTexts}</p>
              )}

              {!calling ? (
                <button type="button" className="btn" onClick={() => setCalling(true)}>
                  {c.logCall}
                </button>
              ) : (
                <fieldset className="call-form">
                  <legend>{c.callLegend}</legend>
                  {!inCallTimes(p, now) && <p className="time-warning">{c.outsideCallTimes}</p>}
                  {(Object.keys(c.callResults) as CallResult[]).map((key) => (
                    <label key={key} className="radio-label">
                      <input
                        type="radio"
                        name={`call-${id}`}
                        checked={result === key}
                        onChange={() => {
                          setResult(key);
                          setError('');
                        }}
                      />
                      {c.callResults[key]}
                    </label>
                  ))}
                  {error && (
                    <p className="form-error" role="alert">
                      {error}
                    </p>
                  )}
                  <div className="button-row">
                    <button type="button" className="btn btn-primary" onClick={saveCall}>
                      {c.saveCall}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        setCalling(false);
                        setResult(null);
                        setError('');
                      }}
                    >
                      {c.cancel}
                    </button>
                  </div>
                </fieldset>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

/** Demo only (npm run dev). Stands in for the petitioner's side and the passing of time. */
function DemoControls({ petition: p }: { petition: Petition }) {
  const { dispatch } = useDesk();
  const c = deskCopy.demo;
  const id = p.sample.id;
  const running = activeHold(p);
  const canAmend =
    p.sample.amended !== undefined && running && p.followUp.textedAt !== undefined && p.followUp.amendedAt === undefined;

  return (
    <section className="panel demo-panel" aria-labelledby="demo-title">
      <h2 id="demo-title" className="panel-title">
        {c.title}
      </h2>
      <p className="meta">{c.note}</p>
      <div className="button-row">
        {canAmend && (
          <button type="button" className="btn" onClick={() => dispatch({ type: 'demoAmend', id })}>
            {c.addIncidents}
          </button>
        )}
        {running && (
          <button type="button" className="btn" onClick={() => dispatch({ type: 'demoJumpToHoldEnd', id })}>
            {c.jumpEnd}
          </button>
        )}
        <button type="button" className="btn" onClick={() => dispatch({ type: 'reset' })}>
          {c.reset}
        </button>
      </div>
    </section>
  );
}
