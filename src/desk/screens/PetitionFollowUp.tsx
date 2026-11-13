// Screen 2: one petition, for the specialist. Holding, texting, and calls.
import { useState, type FormEvent } from 'react';
import type { Finding } from '../../checker';
import { DEMO_MODE } from '../../config';
import {
  ActivityLog,
  Breadcrumb,
  Facts,
  PageTitle,
  QuestionIcon,
  StatusChip,
  cls,
  useFocusAfterRender,
} from '../components/common';
import { DemoControls } from '../components/DemoControls';
import { NumberedText } from '../components/NumberedText';
import { TimelineStrip } from '../components/TimelineStrip';
import { deskConfig } from '../config';
import { deskCopy, fill, plural, staffText } from '../content';
import { formatBirthDate, formatClock, formatLong, formatMinutesRange, formatShort, weekdayName } from '../format';
import { caseTypeLabel, dateText, howText, linesText, textMessage } from '../messages';
import { fullName, maskPhone, petitionById, type Petition, type PetitionVersion } from '../petitions';
import { callDaysLabel, insideCallTimes, overlapSentence } from '../schedule';
import { CALL_RESULTS, canHold, currentVersion, statusOf, type CallResult, type PetitionRecord } from '../state/deskState';
import { useDesk } from '../state/DeskStateProvider';
import { useView } from '../state/view';

const c = deskCopy.petition;
const HOLD_TITLE_ID = 'hold-title';

export function PetitionFollowUp({ id }: { id: string }) {
  const { state } = useDesk();
  const { go } = useView();
  const petition = petitionById(id);
  const record = state.records[id];
  const version = currentVersion(petition, record);
  const focusAfter = useFocusAfterRender();

  return (
    <div className="screen">
      <Breadcrumb
        parent={deskCopy.app.nav.petitions}
        onParent={() => go({ screen: 'petitions' })}
        current={petition.caseNumber}
      />
      <div className="page-head">
        <div>
          <PageTitle>
            {fill(c.title, { caseType: caseTypeLabel(petition), name: fullName(petition.petitioner) })}
          </PageTitle>
          <p className="page-sub">
            {fill(c.filed, { date: formatLong(petition.original.filedAt), respondent: fullName(petition.respondent) })}
          </p>
        </div>
        <p className="page-status">
          <span className="sr-only">{c.statusLabel}: </span>
          <StatusChip status={statusOf(petition, record)} />
        </p>
      </div>

      <HoldPanel petition={petition} record={record} focusAfter={focusAfter} />

      <div className="columns columns-specialist">
        <div className="col-main">
          <QuestionsPanel findings={version.findings} />
          <PetitionPanel petition={petition} record={record} />
        </div>
        <div className="col-side">
          <ContactPanel petition={petition} record={record} focusAfter={focusAfter} />
          <section className="panel" aria-labelledby="activity-title">
            <h2 id="activity-title" className="panel-title">
              {c.activity.title}
            </h2>
            <ActivityLog log={record.log} />
          </section>
        </div>
      </div>

      {DEMO_MODE && <DemoControls petition={petition} record={record} onDone={() => focusAfter(HOLD_TITLE_ID)} />}
    </div>
  );
}

function HoldPanel({
  petition,
  record,
  focusAfter,
}: {
  petition: Petition;
  record: PetitionRecord;
  focusAfter: (id: string) => void;
}) {
  const { state, dispatch } = useDesk();
  const { go } = useView();
  const h = c.hold;
  const { hold } = record;
  const hasPhone = petition.contact.phone !== null;

  let title: string;
  let body: string[];
  if (hold) {
    title = fill(h.heldTitle, { weekday: weekdayName(hold.end), time: formatClock(hold.end) });
    body = [
      fill(hold.byMagistrate ? h.heldByMagistrateBody : h.heldBody, {
        time: formatClock(hold.start),
        weekday: weekdayName(hold.start),
      }),
    ];
    if (hold.byMagistrate) body.push(fill(h.magistrateAsked, { time: formatShort(hold.start) }));
  } else if (record.sentAt !== null) {
    title = h.sentTitle;
    body = [fill(h.sentBody, { time: formatShort(record.sentAt) })];
  } else {
    title = h.notHeldTitle;
    body = [hasPhone ? fill(h.notHeldBody, { hours: deskConfig.holdHours }) : h.noPhone];
  }

  // The button goes away, so focus moves to the panel title, which now says what changed.
  const act = (type: 'hold' | 'sendNow') => {
    dispatch({ type, id: petition.id });
    focusAfter(HOLD_TITLE_ID);
  };

  return (
    <section className={cls('panel', 'hold-panel', hold && 'is-held')} aria-labelledby={HOLD_TITLE_ID}>
      <div className="hold-text">
        <h2 id={HOLD_TITLE_ID} tabIndex={-1} className="panel-title tnum">
          {title}
        </h2>
        {body.map((line) => (
          <p key={line} className="tnum">
            {line}
          </p>
        ))}
        <div className="button-row">
          {hold ? (
            <>
              <button type="button" className="btn btn-primary" onClick={() => act('sendNow')}>
                {h.sendNow}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => go({ screen: 'bench', id: petition.id, preview: true })}
              >
                {h.preview}
              </button>
            </>
          ) : (
            record.sentAt === null && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!canHold(petition, record)}
                onClick={() => act('hold')}
              >
                {h.holdButton}
              </button>
            )
          )}
        </div>
      </div>
      <div className="hold-timeline">
        <TimelineStrip petition={petition} record={record} now={state.now} />
        <p className="timeline-sentence">{overlapSentence(petition.contact, state.now)}</p>
      </div>
    </section>
  );
}

function QuestionsPanel({ findings }: { findings: Finding[] }) {
  const q = c.questions;
  const k = c.keepToInfo;
  return (
    <section className="panel" aria-labelledby="questions-title">
      <h2 id="questions-title" className="panel-title">
        {plural(q.title, findings.length)}
      </h2>
      {findings.length === 0 && <p>{q.none}</p>}
      <ul className="questions">
        {findings.map((finding) => (
          <li key={finding.key} className="question">
            <p className="question-staff">
              <QuestionIcon />
              <strong>{staffText(finding)}</strong>
            </p>
            <p className="question-ask">
              <span className="sr-only">{q.askLabel} </span>“{finding.questionText}”
            </p>
            <RuleMeta finding={finding} />
          </li>
        ))}
      </ul>

      <div className="keep-info">
        <h3 className="keep-info-title">{k.title}</h3>
        <div className="keep-info-grid">
          <div className="keep-info-example">
            <p className="keep-info-label">{k.informationLabel}</p>
            <p>“{k.information}”</p>
          </div>
          <div className="keep-info-example keep-info-advice">
            <p className="keep-info-label">{k.adviceLabel}</p>
            {deskCopy.adviceExamples.advice.map((example) => (
              <p key={example}>“{example}”</p>
            ))}
          </div>
        </div>
        <p className="keep-info-test">{deskCopy.adviceExamples.test}</p>
      </div>
    </section>
  );
}

/** "Rule {id}", "Source: {sourceCitation}", and the unverified badge: every question traces to one rule. */
export function RuleMeta({ finding }: { finding: Pick<Finding, 'ruleId' | 'sourceCitation' | 'verified'> }) {
  const q = c.questions;
  return (
    <ul className="rule-meta">
      <li className="tnum">{fill(q.rule, { id: finding.ruleId })}</li>
      <li>{fill(q.source, { source: finding.sourceCitation })}</li>
      {!finding.verified && (
        <li>
          <span className="badge-unverified">{q.unverified}</span>
        </li>
      )}
    </ul>
  );
}

function PetitionPanel({ petition, record }: { petition: Petition; record: PetitionRecord }) {
  const p = c.filedPetition;
  const dob = petition.respondent.dateOfBirth.trim();
  const versions = [
    ...(record.amendedAt !== null && petition.amendment ? [petition.amendment] : []),
    petition.original,
  ];

  return (
    <section className="panel" aria-labelledby="filed-title">
      <div className="panel-head">
        <h2 id="filed-title" className="panel-title">
          {p.title}
        </h2>
        <p className="panel-note">{p.wordsNote}</p>
      </div>
      <Facts
        className="facts-grid"
        items={[
          [p.fields.basis, caseTypeLabel(petition)],
          [p.fields.relationship, petition.respondent.relationship],
          [p.fields.respondent, fullName(petition.respondent)],
          [p.fields.dob, dob ? <span className="tnum">{formatBirthDate(dob)}</span> : <span className="blank-value">{p.blank}</span>],
        ]}
      />
      {versions.map((version) => (
        <VersionBlock key={version.kind} version={version} />
      ))}
      <p className="note">{p.splitNote}</p>
    </section>
  );
}

function VersionBlock({ version }: { version: PetitionVersion }) {
  const p = c.filedPetition;
  const name = deskCopy.bench.versionNames[version.kind];
  return (
    <div className="version">
      <h3 className="section-title tnum">
        {fill(version.kind === 'amended' ? p.amended : p.original, { date: formatLong(version.filedAt) })}
      </h3>
      <NumberedText lines={version.lines} label={fill(p.narrativeLabel, { version: name })} />
      <h4 className="subsection-title">{plural(p.found, version.incidents.length)}</h4>
      <ol className="found-list">
        {version.incidents.map((incident) => (
          <li key={incident.id} className="tnum">
            {fill(p.incident, {
              date: dateText(incident.date),
              how: howText(incident.how),
              lines: linesText(incident.firstLine, incident.lastLine),
            })}
          </li>
        ))}
      </ol>
    </div>
  );
}

function ContactPanel({
  petition,
  record,
  focusAfter,
}: {
  petition: Petition;
  record: PetitionRecord;
  focusAfter: (id: string) => void;
}) {
  const { state, dispatch } = useDesk();
  const { announce } = useView();
  const cp = c.contactPanel;
  const { contact } = petition;
  const [showNumber, setShowNumber] = useState(false);
  const [callOpen, setCallOpen] = useState(false);
  const [result, setResult] = useState<CallResult | null>(null);
  const [error, setError] = useState(false);

  const calls = contact.calls
    ? contact.calls.anyTime
      ? cp.callsAnyTime
      : fill(cp.callsWindow, {
          days: callDaysLabel(contact.calls.days).replace(/^./, (ch) => ch.toUpperCase()),
          range: formatMinutesRange(contact.calls.from, contact.calls.to),
        })
    : cp.callsNone;

  const closeCall = () => {
    setCallOpen(false);
    setResult(null);
    setError(false);
    focusAfter('log-call');
  };

  const saveCall = (event: FormEvent) => {
    event.preventDefault();
    if (!result) {
      setError(true);
      focusAfter('call-result-0');
      return;
    }
    dispatch({ type: 'logCall', id: petition.id, result });
    announce(fill(cp.callSaved, { result: cp.callResults[result] }));
    closeCall();
  };

  const outside = !insideCallTimes(contact.calls, state.now);

  return (
    <section className="panel" aria-labelledby="contact-title">
      <h2 id="contact-title" className="panel-title">
        {cp.title}
      </h2>
      <Facts
        items={[
          [cp.petitioner, fullName(petition.petitioner)],
          [
            cp.phone,
            contact.phone ? (
              <span className="phone">
                <span className="tnum">{showNumber ? contact.phone : maskPhone(contact.phone)}</span>
                <button type="button" className="btn btn-small" onClick={() => setShowNumber((v) => !v)}>
                  {showNumber ? cp.hideNumber : cp.showNumber}
                </button>
              </span>
            ) : (
              cp.noPhone
            ),
          ],
          [cp.texts, contact.phone && contact.textsOk ? cp.ok : cp.notOk],
          [cp.voicemail, contact.phone && contact.voicemailOk ? cp.ok : cp.notOk],
          [cp.calls, <span className="tnum">{calls}</span>],
        ]}
      />

      {contact.phone && contact.textsOk && (
        <div className="message">
          <h3 className="section-title">{cp.messageTitle}</h3>
          <p className="message-text tnum">{textMessage(petition, record, state.now)}</p>
          <p className="note">{cp.messageNote}</p>
        </div>
      )}

      {contact.phone && (
        <div className="follow-up">
          {!record.hold ? (
            <p className="note">{record.sentAt === null ? cp.holdFirst : cp.holdEnded}</p>
          ) : (
            <>
              {contact.textsOk ? (
                <div className="text-link">
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => dispatch({ type: 'textLink', id: petition.id })}
                  >
                    {record.linkTextedAt === null ? cp.textLink : cp.textAgain}
                  </button>
                  {/* A live region, so screen readers hear when the link is texted. */}
                  <p className="note tnum" role="status">
                    {record.linkTextedAt === null
                      ? ''
                      : record.amendedAt !== null && record.amendedAt > record.linkTextedAt
                        ? fill(cp.linkUsed, { time: formatClock(record.linkTextedAt), added: formatShort(record.amendedAt) })
                        : fill(cp.linkTexted, { time: formatClock(record.linkTextedAt) })}
                  </p>
                </div>
              ) : (
                <p className="note">{cp.noTexts}</p>
              )}

              {!callOpen ? (
                <button
                  id="log-call"
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    setCallOpen(true);
                    focusAfter('call-legend');
                  }}
                >
                  {cp.logCall}
                </button>
              ) : (
                <form className="call-form" onSubmit={saveCall} noValidate>
                  <fieldset aria-describedby={cls(outside && 'call-warning', error && 'call-error') || undefined}>
                    <legend id="call-legend" tabIndex={-1}>
                      {cp.callLegend}
                    </legend>
                    {outside && (
                      <p id="call-warning" className="warning">
                        {contact.calls ? cp.outsideCallTimes : c.timeline.sentence.noCallTimes}
                      </p>
                    )}
                    {CALL_RESULTS.map((option, index) => (
                      <label key={option} className="choice">
                        <input
                          id={`call-result-${index}`}
                          type="radio"
                          name="call-result"
                          value={option}
                          checked={result === option}
                          onChange={() => {
                            setResult(option);
                            setError(false);
                          }}
                        />
                        <span>{cp.callResults[option]}</span>
                      </label>
                    ))}
                  </fieldset>
                  {error && (
                    <p id="call-error" className="error" role="alert">
                      {cp.pickResult}
                    </p>
                  )}
                  <div className="button-row">
                    <button type="submit" className="btn btn-primary">
                      {cp.saveCall}
                    </button>
                    <button type="button" className="btn btn-secondary" onClick={closeCall}>
                      {cp.cancel}
                    </button>
                  </div>
                </form>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
}
