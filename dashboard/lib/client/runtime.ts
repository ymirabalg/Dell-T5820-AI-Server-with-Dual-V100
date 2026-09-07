/**
 * §6.7's client runtime — the poll loop, and everything that hangs off it.
 *
 * One object, no globals (`env.ts` holds every one of them), no React. It is a store:
 * {@link TelemetryRuntime.subscribe} and {@link TelemetryRuntime.getState} are shaped for
 * `useSyncExternalStore`, and `use-telemetry.ts` is the twelve lines that connect them.
 *
 * ### The four rules that are easiest to get wrong, and where each is enforced
 *
 * 1. ⚠ **A repeated `ts` is not a failed poll.** §4's 2 s cache serves the same snapshot two
 *    or three times in a row at the 1 s cadence. `ring.ts` returns the ring **by identity**
 *    for a repeat; {@link TelemetryRuntime} treats that as a *successful* poll — the failure
 *    count resets, the mode stays `live`, the age keeps counting from that `ts` — and runs
 *    **none** of the condition, event or gap machinery, because §6.7 says appending it twice
 *    "would put duplicate points in the ring, flatten the min/max decimation over a bucket,
 *    and double-count an event in the log".
 * 2. ⚠ **`ts` is the poll's start** (§4), so {@link ageMs} can only over-state. Nothing here
 *    re-stamps on arrival, and nothing corrects `ts` against the browser's clock.
 * 3. ⚠ **A 401 is not a failed poll** (§5.2). It routes to `LOGIN_PATH` with `EXPIRED_PARAM`
 *    set and stops polling. Backoff, the grey dot and the failure banner are for a *server*
 *    failure; sending a 401 down that path leaves the operator watching a stale dashboard
 *    instead of a login screen.
 * 4. ⚠ **The debounce is `observePoll`'s, not this file's.** `lib/conditions.ts` composes the
 *    ten-second hold, the ledger and the standing rule *in that order* and does not export
 *    the halves. This module feeds it `conditionsFrom(snapshot)` and a wall clock, and reads
 *    back `displayed`. Nothing here re-derives a severity, and nothing here reads
 *    `rawSeverity`.
 *
 * ### Timers
 *
 * There is **at most one** pending timer, ever. `document.hidden` schedules none at all —
 * §6.7's pause is the absence of a timer rather than a timer that returns early, which is
 * also the only version a test can prove. `stop()` clears the pending timer, removes the
 * visibility listener and invalidates any in-flight request, so a poll that lands after
 * unmount cannot write to a dead store. `lib/client/guardrails.test.ts` asserts all three
 * behaviourally, and asserts by source text that nothing under `lib/client/` outside `env.ts`
 * names a global scheduler.
 *
 * ### `STANDING` rides §4's snapshot, and is therefore per-poll state
 *
 * §6.4 puts the standing list in `/etc/ai-dashboard.env` and applies the suppression in the
 * client. §4 carries it on the snapshot — the one authenticated, cached, validated, per-poll
 * payload that reaches the browser — echoed verbatim and judged only here, by
 * `standingIdsFrom`. So it is **read from every accepted sample** rather than fixed at
 * construction: an operator who edits the env file sees the change on the next poll, with no
 * reload path invented for it.
 *
 * ⚠ Two consequences worth stating, because both are easy to get backwards. A condition that
 * *gains* standing mid-session logs its once-per-session line from then on, and one that
 * *loses* it returns to full alarm behaviour — which is already §6.4's rule for a standing
 * condition that changes. And `loggedStanding` is **not** reset when the list changes: it
 * belongs to the session, not to the configuration.
 *
 * ### ⚠ Two clocks, and this file is where they are kept apart
 *
 * §6.7: everything that **positions a reading in time** uses the server's `ts` — the ring's
 * key, the window's bounds, a gap's endpoints, the prune horizon (`ring.ts`, `gaps.ts`).
 * Everything that **measures the session** uses `env.nowMs()` — §6.4's ten-second hold, an
 * event-log line's time, the banner's "since". The age indicator is the one place the two are
 * compared, and that is its whole job (`mode.ts`).
 */

import { EXPIRED_PARAM, LOGIN_PATH } from '../auth/login-view';
import type { ConditionState, DisplayedCondition } from '../conditions';
import {
  EMPTY_CONDITION_STATE,
  NOTHING_STANDING,
  aggregateSeverity,
  alarmCount,
  observePoll,
  standingIdsFrom,
} from '../conditions';
import type { Severity } from '../types';
import { backoffDelayMs } from './backoff';
import type { RuntimeEnv, TelemetryResponse, TimerHandle } from './env';
import type { EventState } from './events';
import { observeEvents, observeStaleness, startEventLog } from './events';
import type { Gap, GapReason, SamplingState } from './gaps';
import { gapIsOpen, observeSample, openGap } from './gaps';
import type { ModeInput, RuntimeMode } from './mode';
import { isStale, modeOf } from './mode';
import { conditionsFrom, enumerationsRead } from './observations';
import type { CadenceSeconds, Preferences, WindowMinutes } from './prefs';
import {
  LONGEST_WINDOW_MS,
  cadenceMs,
  readPreferences,
  writeCadenceSeconds,
  writeWindowMinutes,
} from './prefs';
import type { Sample, SampleRing } from './ring';
import { EMPTY_RING, appendSample, newestSample } from './ring';
import type { WireSnapshot } from './wire';
import { parseSnapshot } from './wire';

export type { Gap, GapReason } from './gaps';
export type { RuntimeMode } from './mode';

/** Everything a panel needs, and nothing a panel has to recompute. */
export interface RuntimeState {
  readonly preferences: Preferences;
  readonly ring: SampleRing;
  /** §6.4's ledger and holds. Threaded, never mutated. */
  readonly conditions: ConditionState;
  /**
   * `observePoll`'s output — the banner's input, and §9's.
   *
   * ⚠ **Every condition the session has confirmed, not only this poll's**, each carrying
   * `stale` and `lastSeenMs` (§6.5). This is the panel surface; `conditionsFrom` is not, and
   * emits `unit:gpu-fan-control.service` twice by design.
   */
  readonly displayed: readonly DisplayedCondition[];
  readonly events: EventState;
  readonly gaps: readonly Gap[];
  /** §6.2's pause control. The user's, not the browser's. */
  readonly paused: boolean;
  /** `document.hidden`. §6.2 names no display mode for it, and none is invented here. */
  readonly hidden: boolean;
  /** §6.7's backoff counter. Reset by any successful poll, including a repeated `ts`. */
  readonly consecutiveFailures: number;
  /** What the last failure was, for §6.7's banner. `null` once a poll succeeds. */
  readonly lastFailure: string | null;
  readonly mode: RuntimeMode;
  /** §9's dot: one reduction over `displaySeverity`. `null` when nothing has a band. */
  readonly severity: Severity | null;
  /** §9's count. Omitted when zero **by step 10** — the number itself is just a number. */
  readonly alarms: number;
  /**
   * Malformed `STANDING` entries from the newest snapshot (§6.4: "reported as unknown").
   *
   * ⚠ Reachable in production since §4 started carrying the list. Step 10 owes it a place on
   * screen: silence is not acceptable for a mechanism whose whole job is suppressing alarms.
   */
  readonly unknownStanding: readonly string[];
}

/** §6.2's age indicator: `now − ts`, and `ts` is the poll's **start**, so it over-states. */
export const ageMs = (state: RuntimeState, nowMs: number): number | null => {
  const newest = newestSample(state.ring);
  return newest === null ? null : nowMs - newest.tsMs;
};

/** The newest accepted sample, or `null` before the first one lands. */
export const latestSample = (state: RuntimeState): Sample | null => newestSample(state.ring);

/** §5.2's hand-off, built from the one module a browser bundle may import. */
export const expiredLoginUrl = (): string => `${LOGIN_PATH}?${EXPIRED_PARAM}=1`;



/**
 * §6.7's client runtime.
 *
 * Construct it, {@link start} it, and {@link stop} it on unmount. Every other method is one
 * of §6.2's four controls.
 */
export class TelemetryRuntime {
  private readonly env: RuntimeEnv;
  private state: RuntimeState;
  private listeners = new Set<() => void>();
  private timer: TimerHandle | null = null;
  private unsubscribeVisibility: (() => void) | null = null;
  private running = false;
  private inFlight = false;
  /**
   * A 401 has been seen (§5.2). Held here rather than read back off `state.mode`, so that
   * {@link modeOf} has one input for it and cannot be asked to infer it from its own output.
   */
  private expired = false;
  /** Bumped by `stop()`, so a request that lands afterwards cannot write to a dead store. */
  private generation = 0;

  constructor(env: RuntimeEnv) {
    this.env = env;
    this.state = {
      // ⚠ Read once, at construction. §6.7's storage rules live in `prefs.ts`; a blocked
      // `localStorage` is `env.storage === null` and lands on the defaults silently.
      preferences: readPreferences(env.storage),
      ring: EMPTY_RING,
      conditions: EMPTY_CONDITION_STATE,
      displayed: [],
      events: startEventLog(env.nowMs()),
      gaps: [],
      paused: false,
      hidden: env.isHidden(),
      consecutiveFailures: 0,
      lastFailure: null,
      mode: 'live',
      severity: null,
      alarms: 0,
      // §4 carries `STANDING` on the snapshot, so nothing is known about it until the first
      // one lands. `[]` is the safe direction either way: nothing suppressed, nothing hidden.
      unknownStanding: NOTHING_STANDING.unknown,
    };
  }

  // ------------------------------------------------------------------ store

  getState = (): RuntimeState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  /**
   * Replace the state and notify — **unless nothing moved**.
   *
   * ⚠ `useSyncExternalStore` re-renders whenever `getState()` returns a different object, so
   * a runtime that allocated a fresh state for every poll would re-render the whole dashboard
   * three times a second at the 1 s cadence for snapshots §4 deliberately repeated. Comparing
   * the patch's own keys is what makes "a repeated `ts` changes nothing" observable with
   * `===` rather than merely true in principle.
   */
  private patch(next: Partial<RuntimeState>): void {
    let changed = false;
    for (const key of Object.keys(next) as (keyof RuntimeState)[]) {
      if (!Object.is(this.state[key], next[key])) {
        changed = true;
        break;
      }
    }
    if (!changed) return;
    this.state = { ...this.state, ...next };
    for (const listener of [...this.listeners]) listener();
  }

  /** What `gaps.ts` asks about the client, after `next` is applied. */
  private samplingAfter(next: Partial<RuntimeState>): SamplingState {
    const merged = { ...this.state, ...next };
    return {
      hidden: merged.hidden,
      paused: merged.paused,
      consecutiveFailures: merged.consecutiveFailures,
    };
  }

  /** The `ts` a gap would start at — the last thing actually measured, or `null` before it. */
  private newestTsMs(): number | null {
    return newestSample(this.state.ring)?.tsMs ?? null;
  }

  private openGapNow(reason: GapReason): readonly Gap[] {
    return openGap(this.state.gaps, reason, this.newestTsMs());
  }

  /**
   * **The only way state is written.** Recomputes §6.2's mode from what the patch is about to
   * produce, and records §6.7's one line at the staleness crossing.
   *
   * ⚠ Every patch goes through here, including the ones that look unrelated. `setCadence`
   * moves the threshold `stale` is measured against; a repeated `ts` moves nothing at all but
   * is exactly the poll during which the age crosses it — that is F4's frozen-green
   * dashboard, and recomputing on the branch that does the least is what unfreezes it.
   *
   * The mode and the log entry are folded into the same patch, so `patch`'s identity
   * comparison still sees "nothing moved" when nothing did, and a repeat still returns the
   * same state object.
   */
  private applyMode(next: Partial<RuntimeState>): void {
    const merged: RuntimeState = { ...this.state, ...next };
    const nowMs = this.env.nowMs();
    const input: ModeInput = {
      expired: this.expired,
      paused: merged.paused,
      consecutiveFailures: merged.consecutiveFailures,
      ageMs: ageMs(merged, nowMs),
      cadenceMs: cadenceMs(merged.preferences.cadenceSeconds),
    };
    // On the way to `/login` there is no dashboard left to describe as stale.
    const events = this.expired
      ? merged.events
      : observeStaleness(merged.events, isStale(input), merged.lastFailure ?? '', nowMs);
    this.patch({ ...next, mode: modeOf(input), events });
  }

  // ---------------------------------------------------------------- lifecycle

  /** Wire up visibility and poll. Idempotent: a second `start()` on a live runtime does nothing. */
  start(): void {
    if (this.running) return;
    this.running = true;
    this.unsubscribeVisibility = this.env.onVisibilityChange(() => {
      this.onVisibilityChange();
    });
    this.syncHidden();
    if (this.state.hidden) return;
    void this.poll();
  }

  /**
   * Tear everything down: the pending timer, the visibility listener, and any in-flight
   * request's right to write.
   */
  stop(): void {
    this.running = false;
    this.generation += 1;
    this.inFlight = false;
    this.cancelTimer();
    if (this.unsubscribeVisibility !== null) {
      this.unsubscribeVisibility();
      this.unsubscribeVisibility = null;
    }
  }

  // ----------------------------------------------------------- §6.2 controls

  /** The cadence selector. ⚠ Does not clear the ring — §6.7 forbids it explicitly. */
  setCadence(seconds: CadenceSeconds): void {
    if (this.state.preferences.cadenceSeconds === seconds) return;
    writeCadenceSeconds(this.env.storage, seconds);
    // ⚠ Through `applyMode`, because the cadence is what `stale` is measured in: three
    // cadences at 30 s is 90 s, and the same reading can be current at one setting and stale
    // at another the instant the operator changes the dropdown.
    this.applyMode({ preferences: { ...this.state.preferences, cadenceSeconds: seconds } });
    this.reschedule();
  }

  /** The window selector. Changes what is *drawn*; nothing about polling, and nothing stored. */
  setWindow(minutes: WindowMinutes): void {
    if (this.state.preferences.windowMinutes === minutes) return;
    writeWindowMinutes(this.env.storage, minutes);
    this.applyMode({ preferences: { ...this.state.preferences, windowMinutes: minutes } });
  }

  /** §6.2's pause. The age indicator keeps counting, which is the whole point of it. */
  pause(): void {
    if (this.state.paused) return;
    this.cancelTimer();
    this.applyMode({ paused: true, gaps: this.openGapNow('paused') });
  }

  /** §6.2's resume: poll at once, because what is on screen is by now known to be stale. */
  resume(): void {
    if (!this.state.paused) return;
    // ⚠ The gap is **not** closed here. It closes at the `ts` of the first reading taken while
    // no reason to have one is still in force (`gaps.ts`) — and if the tab is also hidden,
    // that reason is still in force and the gap rightly stays open.
    this.applyMode({ paused: false });
    if (this.state.hidden) return;
    void this.poll();
  }

  /**
   * §6.2's *refresh now*.
   *
   * ⚠ §6.2 lists *refresh now* and *pause/resume* side by side and says nothing about their
   * interaction. This polls even while paused — an explicit request for a reading is answered
   * — and does **not** resume, so the mode the operator chose survives their own click.
   * Recorded in the step notes as a silence, not a decision the spec made.
   *
   * With a poll already in flight it is a no-op: an answer is already on its way, and §4's own
   * rule that "overlapping polls must never become overlapping samples" applies on this side of
   * the wire too.
   *
   * ⚠ **It does nothing while the tab is hidden**, and only the `paused` bypass survives.
   * §6.7's pause is that a hidden tab schedules nothing *and asks nothing*; a hidden tab
   * cannot receive a click either, so the only caller there is programmatic. Left unguarded it
   * would take a reading inside a hidden gap and could leave `stale` on a tab nobody is
   * looking at. Pausing is a deliberate operator action and keeps working — that is the whole
   * point of this control.
   */
  refreshNow(): void {
    if (this.state.hidden) return;
    void this.poll(true);
  }

  // ------------------------------------------------------------- visibility

  private syncHidden(): void {
    const hidden = this.env.isHidden();
    if (hidden === this.state.hidden) return;
    // Becoming visible does not close the gap either — see `resume()`.
    if (hidden) this.applyMode({ hidden, gaps: this.openGapNow('hidden') });
    else this.applyMode({ hidden });
  }

  private onVisibilityChange(): void {
    if (!this.running) return;
    const wasHidden = this.state.hidden;
    this.syncHidden();
    if (this.state.hidden) {
      // §6.7: "pause polling on `document.hidden`". Nothing is scheduled at all.
      this.cancelTimer();
      return;
    }
    if (!wasHidden) return;
    // "…resume on visibility." Immediately: a background tab throttles timers, so whatever
    // is on screen is older than the age indicator would suggest even before the pause.
    void this.poll();
  }

  // ------------------------------------------------------------------ timers

  private cancelTimer(): void {
    if (this.timer === null) return;
    this.env.clearTimer(this.timer);
    this.timer = null;
  }

  private reschedule(): void {
    this.cancelTimer();
    if (!this.running || this.expired) return;
    if (this.state.paused || this.state.hidden) return;
    if (this.inFlight) return;
    const delay = backoffDelayMs(
      cadenceMs(this.state.preferences.cadenceSeconds),
      this.state.consecutiveFailures,
    );
    this.timer = this.env.setTimer(() => {
      this.timer = null;
      void this.poll();
    }, delay);
  }

  // -------------------------------------------------------------- the poll

  private async poll(force = false): Promise<void> {
    if (!this.running || this.inFlight || this.expired) return;
    // ⚠ `force` is *refresh now* only. Without it a hidden tab schedules nothing **and asks
    // nothing**, which is the property §6.7's pause is actually about.
    if (!force && (this.state.paused || this.state.hidden)) return;

    this.inFlight = true;
    this.cancelTimer();
    const generation = this.generation;
    // ⚠ `RuntimeEnv.fetchTelemetry` is specified never to reject — the browser adapter catches
    // — but a seam is a promise, not a proof. An escaped rejection here would leave `inFlight`
    // true for ever with no timer pending: the dashboard would stop polling **silently**, which
    // is the one failure §6.2's age indicator cannot describe, because a wedged client and a
    // failed poll would look the same and only one of them ever recovers. The catch is not
    // swallowing a distinction; it is turning a hang into §6.7's failed poll, which the banner
    // and the backoff already know how to say.
    let response: TelemetryResponse;
    try {
      response = await this.env.fetchTelemetry();
    } catch {
      response = { kind: 'error', detail: 'the request seam threw' };
    }
    if (generation !== this.generation || !this.running) return;
    this.inFlight = false;

    // ⚠ The arrival path is inside the `try` as well, and not because a throw is expected.
    // Everything below — `parseSnapshot`, `appendSample`, `conditionsFrom`, `observePoll`,
    // `observeEvents`, the gaps — is total today and no reachable throw was found. But
    // `reschedule()` is the **last** statement, so a throw anywhere in here would leave
    // `inFlight` already `false`, no timer pending, `running` true and the mode still `live`:
    // polling stops silently, which is the one failure §6.2's age indicator cannot describe,
    // because a wedged client and a failed poll look the same and only one recovers. This
    // swallows no distinction — it turns a hang into §6.7's failed poll, which the banner and
    // the backoff already know how to say.
    try {
      switch (response.kind) {
        case 'unauthorized':
          this.expire();
          return;
        case 'error':
          this.fail(response.detail);
          break;
        case 'ok': {
          const wire = parseSnapshot(response.body);
          if (wire === null) {
            // A 200 that is not §4's snapshot is a server this client cannot read, which is a
            // failed poll — never a partial snapshot. A partial snapshot is a well-formed 200
            // carrying `errors[]`, and it validates like any other (invariant 5).
            this.fail('malformed snapshot');
            break;
          }
          this.accept(wire);
          break;
        }
      }
    } catch {
      this.fail('the client could not read the response');
    }
    this.reschedule();
  }

  /** §5.2's hand-off. Stops polling first: nothing should fire while the page is unloading. */
  private expire(): void {
    this.cancelTimer();
    this.expired = true;
    this.applyMode({});
    this.env.navigate(expiredLoginUrl());
  }

  private fail(detail: string): void {
    this.applyMode({
      consecutiveFailures: this.state.consecutiveFailures + 1,
      lastFailure: detail,
      gaps: this.openGapNow('failed'),
    });
  }

  private accept(wire: WireSnapshot): void {
    const ring = appendSample(this.state.ring, wire);

    // ⚠ §6.7's `ts` dedupe. Identity, not a length comparison: the ring is at its cap for
    // most of a long session, so `length` is unchanged whether a sample was appended or not.
    if (ring === this.state.ring) {
      // ⚠ A repeat is a **successful** poll — the counter resets, the dot stays green, the
      // next poll is one cadence away — and none of the condition, event or gap machinery
      // runs. But it is not evidence of *currency*: §4's cache repeats a snapshot two or
      // three times at 1 s, and a server whose clock stepped backwards repeats one for as
      // long as it takes real time to catch up. `applyMode` is what tells those apart, from
      // the age of the newest reading rather than from a failure counter that never moves.
      this.applyMode({ consecutiveFailures: 0, lastFailure: null });
      return;
    }

    // ⚠ Read **before** the gap list is folded: "was the client sampling immediately before
    // this reading" is what §6.4's ten seconds and §6.7's hatch both turn on, and folding the
    // sample in first would answer it about the wrong instant.
    const afterGap = gapIsOpen(this.state.gaps);
    const nowMs = this.env.nowMs();
    const standing = standingIdsFrom(wire.snapshot.standing);
    const poll = observePoll(
      this.state.conditions,
      conditionsFrom(wire.snapshot),
      standing,
      nowMs,
      { enumerationsRead: enumerationsRead(wire.snapshot), afterGap },
    );

    this.applyMode({
      ring,
      conditions: poll.state,
      displayed: poll.displayed,
      events: observeEvents(this.state.events, poll, wire.snapshot.errors, nowMs, afterGap),
      // ⚠ Both the closing endpoint and the prune horizon are server `ts` (§6.7). `consecutiveFailures`
      // is `0` because this poll answered — the reading in hand *is* the recovery — while
      // `hidden` and `paused` are read as they stand, so a sample that lands inside a gap
      // neither closes it nor splits it.
      gaps: observeSample(
        this.state.gaps,
        wire.tsMs,
        this.samplingAfter({ consecutiveFailures: 0 }),
        (ring.newest?.tsMs ?? wire.tsMs) - LONGEST_WINDOW_MS,
      ),
      consecutiveFailures: 0,
      lastFailure: null,
      severity: aggregateSeverity(poll.displayed),
      alarms: alarmCount(poll.displayed),
      unknownStanding: standing.unknown,
    });
  }
}
