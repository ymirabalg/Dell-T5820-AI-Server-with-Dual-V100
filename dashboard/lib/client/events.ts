/**
 * §6.4's **session event log** — 500 entries, newest first, lost on reload.
 *
 * > A compact scrolling list of state transitions observed since page load, newest first …
 * > Transitions are computed in the browser by diffing consecutive snapshots. It is lost on
 * > reload, by design — decision 4. Cap it at a few hundred entries.
 *
 * §6.7 fixes the cap at 500 and adds the one feed that is not a condition:
 *
 * > **The event log records the transition, not the poll**: one entry when a collector stops
 * > answering and one when it resumes, never one every five seconds.
 *
 * ### What it logs, and what debounces each of them
 *
 * §6.4: the debounce gates "the condition ledger, the banner, **the event log**, and §9's dot
 * and count". So nothing here logs a band that has not held for ten seconds of wall time —
 * but *which* band that is differs by row, and getting it wrong loses one of §6.4's own
 * examples:
 *
 * | feed | band | debounced where |
 * |---|---|---|
 * | a continuous metric (`gpu_temp`, `fan5_absolute`, `disk_free`, …) | its `displaySeverity` | already, by `observePoll` |
 * | a state-valued row (`unit`, `health`, `link`, `gpu_throttle`, the three safety checks) | its **rendered value** | here, with `stepBandHold` |
 * | a collector's presence in `errors[]` | present / absent | here, with `stepBandHold` |
 * | a condition going **stale**, being **retired**, or being **read again** (§6.5) | present / absent | already, by `observePoll` |
 * | §6.2's mode crossing into and out of `stale` (§6.7) | the mode | not debounced — see {@link observeStaleness} |
 *
 * ### ⚠ Why §6.5's three edges are here at all
 *
 * They are the counter-signal to the worst thing this dashboard can do. A GPU that stops
 * being enumerated keeps its alarm (§9), and *"never a silent removal"* is §6.5's phrase for
 * the other half: an operator must be able to see, in the log, that a reading stopped rather
 * than that a machine got better. A retirement is the opposite fact — the subject left, which
 * is an answer — and it is toned `normal` for exactly that reason.
 *
 * ⚠ The state-valued rows are why `BandHold` is generic. §6.4's own example line is
 * `llama-server@1  active`, and `active → reloading` is `normal → normal`: a log keyed on
 * severity alone would never show it. Continuous rows are **not** debounced a second time —
 * `observePoll` has already held them for ten seconds, and a second hold would make a 30 s
 * cadence log a full poll late.
 *
 * ### O5 — the once-per-session standing entry
 *
 * §6.4: a standing condition "shows at watch colour in SAFETY with its real severity named in
 * the row, **logs once per session**, and never raises the banner". HANDOVER: *"`logOncePerSession`
 * was deleted; **step 8 holds the *already logged* state itself**"* — it is {@link EventState.loggedStanding},
 * and it is consulted **only while the condition is still suppressed**. The moment it stops
 * being suppressed — §6.4's "returns to full alarm behaviour the moment it changes, including
 * when it clears and later regresses" — ordinary logging resumes, which is the behaviour the
 * once-per-session rule must not be allowed to swallow.
 *
 * ### ⚠ Entries are structured, not sentences
 *
 * §6.4 fixes neither the wording nor the tone of a log line, and `MOCK.html`'s column layout
 * (`t · src · sev · m · n`) is a reference rather than a source. So a {@link LogEntry} carries
 * the *facts* — which condition, which band it left, which it reached, the reading, and the
 * `errors[]` message where there is one — and step 10 writes the sentence. Recorded in the
 * step notes: inventing copy here would put it out of reach of the phase that owns the panel.
 */

import type { BandHold, ConditionId, PollResult } from '../conditions';
import { DEBOUNCE_MS, restartPendingRuns, startBandHold, stepBandHold } from '../conditions';
import type { ErrorSource, Severity, TelemetryError } from '../types';
import { VALUE_IS_A_BAND, conditionSource } from './observations';

/** §6.7: "Event log holds 500 entries, newest first, then discards the oldest." */
export const MAX_EVENTS = 500;

/** What produced an entry. */
export type LogEntryKind =
  /** The session's first line. Nothing has been polled yet. */
  | 'page-loaded'
  /** A condition's band moved, or was already non-normal when the page opened. */
  | 'band'
  /** §6.4's once-per-session line for a suppressed standing condition (O5). */
  | 'standing'
  /** A collector stopped answering — §6.7's transition, not the poll. */
  | 'source-lost'
  /** …and the one when it resumes. */
  | 'source-recovered'
  /** §6.5: the subject stopped being reported and its collection could not be read. */
  | 'stale'
  /** §6.5: the subject is absent from a collection that **was** read. It has left. */
  | 'retired'
  /** §6.5: a stale condition is being read again. */
  | 'reading-returned'
  /** §9: two observations of one id disagreed, and the reduction took the worse (once/session). */
  | 'conflict'
  /** §6.7: the newest reading became older than the cadence can explain. */
  | 'mode-stale'
  /** …and the one when a fresh reading arrives. */
  | 'mode-current';

/** One line of §6.4's log. Rendered by step 10; every string here is a fact, not a sentence. */
export interface LogEntry {
  /**
   * Strictly increasing within a session. It is the React key **and** the tiebreak: two
   * entries can share a millisecond, and `atMs` alone would leave their order to the sort.
   */
  readonly seq: number;
  /** Wall clock at the moment the entry was made. §6.6 renders it in the browser's zone. */
  readonly atMs: number;
  /** The panel column — `gpu 0`, `cooling`, `safety` — or an {@link ErrorSource} verbatim. */
  readonly source: string;
  /** The tone. `displaySeverity`, so a suppressed standing condition reads watch, not alarm. */
  readonly severity: Severity;
  /** `null` for the session line and for collector transitions. */
  readonly id: ConditionId | null;
  /** What moved: a condition's label, or the {@link ErrorSource}. */
  readonly label: string;
  readonly kind: LogEntryKind;
  /** The band it left. `null` when there was none — the first sighting of the session. */
  readonly from: string | null;
  /** The band it reached. */
  readonly to: string;
  /**
   * The reading behind the transition, or the `errors[]` message.
   *
   * ⚠ For a collector transition this carries §6.7's distinction verbatim: "A skipped call
   * and a failed call must not read alike … The distinction lives in the `errors[]` message
   * text, and it is the only signal that a source is wedged rather than merely broken."
   */
  readonly detail: string;
}

/** Everything the log remembers. Immutable; replaced per poll. */
export interface EventState {
  /** Newest first (§6.4), capped at {@link MAX_EVENTS}. */
  readonly entries: readonly LogEntry[];
  /** Per-id debounce for the rows whose *value* is the band. */
  readonly valueHolds: ReadonlyMap<string, BandHold<string>>;
  /** Per-source debounce for presence in `errors[]`. */
  readonly sourceHolds: ReadonlyMap<string, BandHold<boolean>>;
  /** The band last written to the log for each id or source. */
  readonly logged: ReadonlyMap<string, string>;
  /** O5's "already logged" set, consulted only while a condition is still suppressed. */
  readonly loggedStanding: ReadonlySet<string>;
  /** §9's disagreements already reported, so one server defect costs one line per session. */
  readonly loggedConflicts: ReadonlySet<string>;
  /** Next {@link LogEntry.seq}. */
  readonly nextSeq: number;
}

/** The `logged` key §6.2's mode uses. Namespaced like `errors:`, so no condition id can collide. */
const MODE_KEY = 'mode:stale';

/**
 * A session, one line old.
 *
 * §6.4's own example opens with `13:57:41  page loaded`, and it is not decoration: an empty
 * log and a log of a session that has seen nothing wrong look identical without it.
 */
export const startEventLog = (nowMs: number): EventState => ({
  entries: [
    {
      seq: 0,
      atMs: nowMs,
      source: 'session',
      severity: 'normal',
      id: null,
      label: 'page loaded',
      kind: 'page-loaded',
      from: null,
      to: 'loaded',
      detail: '',
    },
  ],
  valueHolds: new Map<string, BandHold<string>>(),
  sourceHolds: new Map<string, BandHold<boolean>>(),
  // ⚠ Seeded `live`, so the **first** crossing into `stale` logs. A source is seeded
  // *answering* for the same reason (see below); a mode is seeded from what §6.2 shows on a
  // page that has just loaded, which is a dashboard that is not yet stale.
  logged: new Map<string, string>([[MODE_KEY, 'live']]),
  loggedStanding: new Set<string>(),
  loggedConflicts: new Set<string>(),
  nextSeq: 1,
});

/**
 * §6.7's one line at the staleness crossing, and one at the recovery.
 *
 * > One event-log entry marks the crossing and one the recovery. This is the same signal
 * > §6.7 already asks for from a run of *skipped* collector entries: the only evidence a
 * > source is wedged rather than merely broken.
 *
 * ⚠ **Not debounced**, unlike every other feed here. §6.2's mode is already a function of an
 * age measured in cadences (`mode.ts`), so it cannot flicker on a single poll the way a band
 * at the 79/80 knee can — holding it for a further ten seconds would delay the one line that
 * says *what you are looking at is not current* without making it any truer.
 *
 * Returns the state **by identity** when the mode did not cross, so a caller can keep using
 * `===` to decide whether anything happened.
 */
export const observeStaleness = (
  state: EventState,
  stale: boolean,
  detail: string,
  nowMs: number,
): EventState => {
  const band = stale ? 'stale' : 'live';
  const previous = state.logged.get(MODE_KEY);
  if (previous === band) return state;
  const logged = new Map(state.logged);
  logged.set(MODE_KEY, band);
  const entry: LogEntry = {
    seq: state.nextSeq,
    atMs: nowMs,
    source: 'session',
    severity: stale ? 'watch' : 'normal',
    id: null,
    label: 'dashboard',
    kind: stale ? 'mode-stale' : 'mode-current',
    from: previous ?? null,
    to: band,
    detail,
  };
  return {
    ...state,
    entries: [entry, ...state.entries].slice(0, MAX_EVENTS),
    logged,
    nextSeq: state.nextSeq + 1,
  };
};

/**
 * Fold one poll into the log.
 *
 * `poll` is `observePoll`'s whole result — **not** raw observations, so every severity here
 * is the confirmed band, every standing decision has already been made, and §6.5's three
 * edges arrive already debounced. `errors` is the snapshot's own `errors[]`.
 *
 * ⚠ Called once per **accepted** sample. A snapshot whose `ts` the ring already holds never
 * reaches this function: §6.7 says appending a repeat would "double-count an event in the
 * log", and the defence is that the repeat is dropped upstream rather than absorbed here.
 *
 * ⚠ `afterGap` restarts every pending run here for the same reason `observePoll` does it for
 * §6.4's bands: a hidden tab, a paused dashboard and a run of failed polls are wall time with
 * no readings behind them, and a state-valued row must not confirm across them either.
 */
export const observeEvents = (
  state: EventState,
  poll: PollResult,
  errors: readonly TelemetryError[],
  nowMs: number,
  afterGap = false,
): EventState => {
  const valueHolds = new Map(
    afterGap ? restartPendingRuns(state.valueHolds, nowMs) : state.valueHolds,
  );
  const sourceHolds = new Map(
    afterGap ? restartPendingRuns(state.sourceHolds, nowMs) : state.sourceHolds,
  );
  const logged = new Map(state.logged);
  const loggedStanding = new Set(state.loggedStanding);
  const loggedConflicts = new Set(state.loggedConflicts);
  const fresh: LogEntry[] = [];
  const emittedIds = new Set<string>();
  let seq = state.nextSeq;

  const emit = (entry: Omit<LogEntry, 'seq'>): void => {
    fresh.push({ ...entry, seq });
    seq += 1;
    if (entry.id !== null) emittedIds.add(entry.id);
  };

  // ---- conditions ---------------------------------------------------------
  for (const condition of poll.displayed) {
    // ⚠ §6.4: "A poll in which a condition does not appear steps nothing." A stale condition
    // is carried in `displayed` so it keeps counting toward §9's dot, but its hold is frozen
    // and its band is the last one measured — it has nothing new to say. §6.5's own edges are
    // logged below, from `wentStale` / `retired` / `returned`.
    if (condition.stale) continue;
    let band: string;
    if (VALUE_IS_A_BAND[condition.kind]) {
      const previous = valueHolds.get(condition.id);
      const hold =
        previous === undefined
          ? startBandHold(condition.value, nowMs)
          : stepBandHold(previous, condition.value, nowMs, DEBOUNCE_MS);
      valueHolds.set(condition.id, hold);
      band = hold.confirmed;
    } else {
      band = condition.displaySeverity;
    }

    const previousBand = logged.get(condition.id);
    const first = previousBand === undefined;
    if (!first && previousBand === band) continue;

    // A first sighting is not a transition. It is logged only when it is already something
    // worth seeing: a dashboard opened during an alarm must not show an empty log.
    const worthLogging = first ? condition.displaySeverity !== 'normal' : true;
    logged.set(condition.id, band);

    if (!worthLogging) continue;
    // O5: while suppressed, once per session and no more.
    if (condition.suppressed && loggedStanding.has(condition.id)) continue;
    if (condition.suppressed) loggedStanding.add(condition.id);

    emit({
      atMs: nowMs,
      source: conditionSource(condition.kind, condition.subject),
      severity: condition.displaySeverity,
      id: condition.id,
      label: condition.label,
      kind: condition.suppressed ? 'standing' : 'band',
      from: first ? null : (previousBand ?? null),
      to: band,
      detail: condition.value,
    });
  }

  // ---- §6.5's three edges -------------------------------------------------
  // Already debounced by `observePoll` over the same ten seconds of **sampled** wall time
  // §6.4 requires, which is what stops one flickering enumeration retiring a card.
  for (const condition of poll.wentStale) {
    emit({
      atMs: nowMs,
      source: conditionSource(condition.kind, condition.subject),
      // `watch`, not the condition's own band: this is a fact about the dashboard's ability
      // to read, not about the machine's health. The band it keeps is stated as `from`.
      severity: 'watch',
      id: condition.id,
      label: condition.label,
      kind: 'stale',
      from: logged.get(condition.id) ?? condition.displaySeverity,
      to: 'stale',
      detail: condition.value,
    });
  }
  for (const condition of poll.retired) {
    emit({
      atMs: nowMs,
      source: conditionSource(condition.kind, condition.subject),
      // `normal`: the subject left, and that is an answer rather than a loss of sight.
      severity: 'normal',
      id: condition.id,
      label: condition.label,
      kind: 'retired',
      from: logged.get(condition.id) ?? condition.displaySeverity,
      to: 'retired',
      detail: condition.value,
    });
    // It has left the ledger, so if it ever comes back it is a first sighting, not a
    // transition from a band nobody has measured since.
    logged.delete(condition.id);
    valueHolds.delete(condition.id);
  }
  for (const condition of poll.returned) {
    // ⚠ Only when the loop above did not already say it. A reading that comes back in a
    // *different* band logs that band change, and §6.5 asks for **one** entry, not two.
    if (emittedIds.has(condition.id)) continue;
    emit({
      atMs: nowMs,
      source: conditionSource(condition.kind, condition.subject),
      severity: condition.displaySeverity,
      id: condition.id,
      label: condition.label,
      kind: 'reading-returned',
      from: 'stale',
      to: logged.get(condition.id) ?? condition.displaySeverity,
      detail: condition.value,
    });
  }

  // ---- §9's dedupe, when it had to choose (once per id per session) --------
  for (const conflict of poll.conflicts) {
    if (loggedConflicts.has(conflict.id)) continue;
    loggedConflicts.add(conflict.id);
    emit({
      atMs: nowMs,
      source: conditionSource(
        poll.displayed.find((d) => d.id === conflict.id)?.kind ?? 'unit',
        null,
      ),
      // A server defect, not a machine fault. Worth seeing once; not worth a banner.
      severity: 'watch',
      id: conflict.id,
      label: conflict.label,
      kind: 'conflict',
      from: conflict.others.join(' · '),
      to: conflict.kept,
      detail: `two panels disagreed; the worse severity was kept`,
    });
  }

  // ---- collectors (§6.7) --------------------------------------------------
  // Presence, per source, debounced the same ten seconds. A collector that has stopped
  // answering "produces the same errors[] entries on every poll for as long as it does", so
  // what is logged is the edge.
  // ⚠ **The LAST message per source wins, and that is a decision rather than array order.**
  // §6.7 makes this text carry the one distinction an operator needs — "A skipped call and a
  // failed call must not read alike … it is the only signal that a source is wedged rather
  // than merely broken" — and §4 contemplates a collector filing its own entry *plus* the
  // assembly's ceiling entry for the same source. The assembly appends after the collector,
  // so the last entry is the outer, more recent verdict. Inheriting whichever happened to be
  // first would let the message an operator reaches for the container over be chosen by a
  // concatenation order §4 explicitly declines to fix.
  const present = new Map<ErrorSource, string>();
  for (const error of errors) present.set(error.source, error.message);
  const sources = new Set<string>([...present.keys(), ...sourceHolds.keys()]);
  for (const source of sources) {
    const here = present.has(source as ErrorSource);
    const previous = sourceHolds.get(source);
    // ⚠ A source that has never been seen is seeded **answering**, not at whatever it is
    // doing right now. That is the difference between a collector and a condition: every
    // condition is in every poll, so `observePoll`'s "first sight is confirmed at once" means
    // page load; a source is absent from `errors[]` until it fails, so its first appearance
    // there is a *transition*, and §6.4's ten seconds gate it like any other. Seeding it
    // confirmed would log a collector that failed on one poll and recovered on the next.
    const hold = stepBandHold(previous ?? startBandHold(false, nowMs), here, nowMs, DEBOUNCE_MS);
    sourceHolds.set(source, hold);

    const band = hold.confirmed ? 'lost' : 'answering';
    const key = `errors:${source}`;
    const previousBand = logged.get(key);
    if (previousBand === band) continue;
    const first = previousBand === undefined;
    logged.set(key, band);
    if (first) continue;

    emit({
      atMs: nowMs,
      source,
      severity: hold.confirmed ? 'watch' : 'normal',
      id: null,
      label: source,
      kind: hold.confirmed ? 'source-lost' : 'source-recovered',
      from: previousBand,
      to: band,
      detail: present.get(source as ErrorSource) ?? '',
    });
  }

  if (fresh.length === 0) {
    return { ...state, valueHolds, sourceHolds, logged, loggedStanding, loggedConflicts };
  }
  return {
    entries: [...fresh.reverse(), ...state.entries].slice(0, MAX_EVENTS),
    valueHolds,
    sourceHolds,
    logged,
    loggedStanding,
    loggedConflicts,
    nextSeq: seq,
  };
};
