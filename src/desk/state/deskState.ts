// Desk's shared state. It lives in memory only (section 8): a reload resets the
// demo, and nothing is written to browser storage, cookies, or a server.
//
// Ground rule 1: Desk never holds a petition on its own. A hold starts only
// from a staff action ("hold" or "askFollowUp"), lasts holdHours, and then the
// petition goes to the magistrate, answered or not.
import { deskConfig, type OutcomeId } from '../config';
import { deskCopy, fill, plural } from '../content';
import { formatShort } from '../format';
import { petitionById, petitions, type Petition, type PetitionVersion } from '../petitions';
import { HOUR, MINUTE } from '../time';

export type CallResult = 'reached' | 'no-answer' | 'not-safe';
export const CALL_RESULTS: CallResult[] = ['reached', 'no-answer', 'not-safe'];

export type ListFilter = 'questions' | 'none' | 'all';

export interface LogEntry {
  at: number;
  text: string;
}

export interface Hold {
  start: number;
  // When it ends on its own. For a past hold: when it actually ended.
  end: number;
  byMagistrate: boolean;
}

export interface SavedOutcome {
  choice: OutcomeId;
  reasons: string[];
  savedAt: number;
}

export interface PetitionRecord {
  hold: Hold | null;
  pastHolds: Hold[];
  // When it last went to the magistrate after a hold.
  sentAt: number | null;
  // When it last entered the magistrate's review queue.
  queueSince: number;
  amendedAt: number | null;
  // When the link was texted during the current hold.
  linkTextedAt: number | null;
  callsLogged: number;
  outcome: SavedOutcome | null;
  log: LogEntry[];
}

export interface DeskState {
  // The demo clock. Desk never reads the real clock.
  now: number;
  showNames: boolean;
  filter: ListFilter;
  records: Record<string, PetitionRecord>;
}

export type DeskAction =
  | { type: 'hold'; id: string }
  | { type: 'sendNow'; id: string }
  | { type: 'textLink'; id: string }
  | { type: 'logCall'; id: string; result: CallResult }
  | { type: 'askFollowUp'; id: string }
  | { type: 'saveOutcome'; id: string; choice: OutcomeId; reasons: string[] }
  | { type: 'setShowNames'; show: boolean }
  | { type: 'setFilter'; filter: ListFilter }
  | { type: 'demoAddIncidents'; id: string }
  | { type: 'demoJumpToHoldEnd'; id: string }
  | { type: 'reset' };

const log = deskCopy.petition.activity;
const holdLength = () => deskConfig.holdHours * HOUR;

export function createInitialState(): DeskState {
  const records: Record<string, PetitionRecord> = {};
  for (const petition of petitions) {
    const { filedAt, findings } = petition.original;
    records[petition.id] = {
      hold: null,
      pastHolds: [],
      sentAt: null,
      queueSince: filedAt,
      amendedAt: null,
      linkTextedAt: null,
      callsLogged: 0,
      outcome: null,
      // Desk checks each petition when it arrives, so each log starts at the filing time.
      log: [{ at: filedAt, text: plural(log.checked, findings.length) }],
    };
  }
  return { now: deskConfig.clockStart, showNames: false, filter: 'questions', records };
}

// ---- Things every screen works out from the state ----

/** The version the magistrate reviews: the amended petition if there is one. */
export function currentVersion(petition: Petition, record: PetitionRecord): PetitionVersion {
  return record.amendedAt !== null && petition.amendment ? petition.amendment : petition.original;
}

export function openFindings(petition: Petition, record: PetitionRecord) {
  return currentVersion(petition, record).findings;
}

export const inReview = (record: PetitionRecord) => record.hold === null;

/** A specialist can hold a petition once, if there's a phone number to follow up with. */
export function canHold(petition: Petition, record: PetitionRecord): boolean {
  return petition.contact.phone !== null && record.hold === null && record.sentAt === null;
}

export type StatusKind = 'notHeld' | 'inQueue' | 'held' | 'magistrateHold' | 'sent';

export interface Status {
  kind: StatusKind;
  text: string;
  // Gold while held.
  onHold: boolean;
}

export function statusOf(petition: Petition, record: PetitionRecord): Status {
  const s = deskCopy.status;
  if (record.hold?.byMagistrate) return { kind: 'magistrateHold', text: s.magistrateHold, onHold: true };
  if (record.hold) return { kind: 'held', text: fill(s.held, { time: formatShort(record.hold.end) }), onHold: true };
  if (record.sentAt !== null) return { kind: 'sent', text: fill(s.sent, { time: formatShort(record.sentAt) }), onHold: false };
  if (openFindings(petition, record).length > 0 && petition.contact.phone !== null) {
    return { kind: 'notHeld', text: s.notHeld, onHold: false };
  }
  return { kind: 'inQueue', text: s.inQueue, onHold: false };
}

/** Whether staff followed up, and if so how many incidents the amendment added. */
export function followUpOf(petition: Petition, record: PetitionRecord): { followedUp: boolean; added: number | null } {
  const followedUp = record.hold !== null || record.pastHolds.length > 0 || record.callsLogged > 0;
  if (record.amendedAt !== null && petition.amendment) {
    return { followedUp: true, added: petition.amendment.incidents.length - petition.original.incidents.length };
  }
  return { followedUp, added: null };
}

export function canDemoAddIncidents(petition: Petition, record: PetitionRecord, now: number): boolean {
  const { amendment } = petition;
  return (
    amendment !== null &&
    record.hold !== null &&
    record.linkTextedAt !== null &&
    record.amendedAt === null &&
    amendment.filedAt > now &&
    amendment.filedAt < record.hold.end
  );
}

// ---- Changes ----

function addLog(record: PetitionRecord, at: number, ...texts: string[]): PetitionRecord {
  return { ...record, log: [...record.log, ...texts.map((text) => ({ at, text }))] };
}

function update(state: DeskState, id: string, change: (record: PetitionRecord) => PetitionRecord): DeskState {
  return { ...state, records: { ...state.records, [id]: change(state.records[id]) } };
}

/** Moves the demo clock forward. Any hold that ends on the way ends at its end time. */
function advanceTo(state: DeskState, to: number): DeskState {
  if (to < state.now) return state;
  const records = { ...state.records };
  for (const [id, record] of Object.entries(records)) {
    const { hold } = record;
    if (hold && hold.end <= to) {
      records[id] = addLog(
        { ...record, hold: null, pastHolds: [...record.pastHolds, hold], sentAt: hold.end, queueSince: hold.end },
        hold.end,
        log.holdEnded,
      );
    }
  }
  return { ...state, now: to, records };
}

/** Each staff action moves the demo clock forward a few minutes. */
function tick(state: DeskState): DeskState {
  return advanceTo(state, state.now + deskConfig.minutesPerAction * MINUTE);
}

function startHold(state: DeskState, id: string, byMagistrate: boolean): DeskState {
  const { now } = state;
  const end = now + holdLength();
  return update(state, id, (record) =>
    addLog(
      { ...record, hold: { start: now, end, byMagistrate }, linkTextedAt: null },
      now,
      fill(byMagistrate ? log.askedFollowUp : log.held, { time: formatShort(end) }),
    ),
  );
}

export function deskReducer(state: DeskState, action: DeskAction): DeskState {
  switch (action.type) {
    case 'setShowNames':
      return { ...state, showNames: action.show };
    case 'setFilter':
      return { ...state, filter: action.filter };
    case 'reset':
      return createInitialState();
  }

  const petition = petitionById(action.id);
  const record = state.records[action.id];

  switch (action.type) {
    case 'hold': {
      if (!canHold(petition, record)) return state;
      return startHold(tick(state), action.id, false);
    }
    case 'sendNow': {
      if (!record.hold) return state;
      const next = tick(state);
      const current = next.records[action.id];
      if (!current.hold) return next; // The hold ended on its own as the clock moved.
      const { now } = next;
      return update(next, action.id, (r) =>
        addLog(
          { ...r, hold: null, pastHolds: [...r.pastHolds, { ...current.hold!, end: now }], sentAt: now, queueSince: now },
          now,
          log.sentNow,
        ),
      );
    }
    case 'textLink': {
      if (!record.hold || !petition.contact.phone || !petition.contact.textsOk) return state;
      const next = tick(state);
      if (!next.records[action.id].hold) return next;
      return update(next, action.id, (r) => addLog({ ...r, linkTextedAt: next.now }, next.now, log.texted));
    }
    case 'logCall': {
      if (!record.hold || !petition.contact.phone) return state;
      const next = tick(state);
      return update(next, action.id, (r) =>
        addLog({ ...r, callsLogged: r.callsLogged + 1 }, next.now, fill(log.called, { result: log.callResults[action.result] })),
      );
    }
    case 'askFollowUp': {
      if (record.hold || !petition.contact.phone || openFindings(petition, record).length === 0) return state;
      return startHold(tick(state), action.id, true);
    }
    case 'saveOutcome': {
      const allowed = deskConfig.outcomes[petition.caseType] ?? [];
      if (!allowed.includes(action.choice)) return state;
      if (action.choice === 'denied' && action.reasons.length === 0) return state;
      const reasons = action.choice === 'denied' ? action.reasons : [];
      const next = tick(state);
      return update(next, action.id, (r) =>
        addLog(
          { ...r, outcome: { choice: action.choice, reasons, savedAt: next.now } },
          next.now,
          fill(log.outcome, { outcome: deskCopy.bench.outcome.choices[action.choice] }),
        ),
      );
    }
    case 'demoAddIncidents': {
      if (!canDemoAddIncidents(petition, record, state.now)) return state;
      const amendment = petition.amendment!;
      const next = advanceTo(state, amendment.filedAt);
      const added = amendment.incidents.length - petition.original.incidents.length;
      return update(next, action.id, (r) =>
        addLog(
          { ...r, amendedAt: amendment.filedAt },
          amendment.filedAt,
          plural(log.amended, Math.max(added, 0)),
          plural(log.checkedAmended, amendment.findings.length),
        ),
      );
    }
    case 'demoJumpToHoldEnd': {
      if (!record.hold) return state;
      return advanceTo(state, record.hold.end);
    }
  }
}
