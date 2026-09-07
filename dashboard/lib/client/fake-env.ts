/**
 * The fake {@link RuntimeEnv} step 8's tests drive, and the snapshot helpers they share.
 *
 * Test scaffolding, in the shape `lib/fixtures.ts` and `lib/collectors/samples.ts` already
 * established: one place, imported by several test files, so a change to the seam breaks in
 * one place rather than nine.
 *
 * ### ⚠ Why this rather than `vi.useFakeTimers`
 *
 * The runtime never calls a global scheduler — it calls `env.setTimer` — so the clock does
 * not need to be *replaced*, it is already a parameter. That is strictly better than faking
 * the global:
 *
 * - **Every scheduled timer is visible**, so "a hidden tab schedules nothing" and "`stop()`
 *   clears the pending timer" are assertions about {@link FakeEnv.pending}, not inferences
 *   from the absence of an effect.
 * - **No global is patched**, so `setImmediate` still works and can be used to drain the
 *   microtask queue — HANDOVER records that reading a spy synchronously misses a microtask,
 *   and `vi.advanceTimersByTimeAsync` exists precisely because faking the global creates that
 *   problem. Here the poll's `await` is drained by {@link flush} explicitly.
 * - **The wall clock and the timer clock are the same number.** §6.4's debounce is wall time
 *   and §6.7's cadence is a timer; a test that advanced one without the other would confirm a
 *   band ten seconds early or never.
 */

import type { TelemetrySnapshot } from '../types';
import { isoTimestamp } from '../types';
import type { PrefStorage } from './prefs';
import type { RuntimeEnv, TelemetryResponse, TimerHandle } from './env';

/**
 * Drain the microtask queue. A macrotask tick is the only thing that reliably does it.
 *
 * ⚠ The reference is captured **at module load**, so a test that wraps `globalThis.setImmediate`
 * to prove the runtime reaches no global scheduler does not see the harness's own use of one.
 */
const scheduleMacrotask = setImmediate;

export const flush = (): Promise<void> =>
  new Promise<void>((resolve) => {
    scheduleMacrotask(resolve);
  });

/** `ts` for a whole second of 2026-09-06, so a test reads as a clock rather than as a number. */
export const tsAt = (secondsPastTheHour: number): string => {
  const base = Date.UTC(2026, 8, 6, 14, 0, 0, 0);
  return new Date(base + secondsPastTheHour * 1000).toISOString();
};

/** A `localStorage` that works, and remembers what was written to it. */
export class MemoryStorage implements PrefStorage {
  readonly entries = new Map<string, string>();
  readonly writes: (readonly [string, string])[] = [];
  reads = 0;

  constructor(initial: Readonly<Record<string, string>> = {}) {
    for (const [key, value] of Object.entries(initial)) this.entries.set(key, value);
  }

  getItem(key: string): string | null {
    this.reads += 1;
    return this.entries.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.writes.push([key, value]);
    this.entries.set(key, value);
  }
}

/** A `localStorage` whose every method throws — a private window, or a blocked origin. */
export class ThrowingStorage implements PrefStorage {
  getItem(): string | null {
    throw new DOMException('The operation is insecure.', 'SecurityError');
  }

  setItem(): void {
    throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
  }
}

interface ScheduledTimer {
  readonly id: number;
  readonly at: number;
  readonly delayMs: number;
  readonly run: () => void;
}

/** A `RuntimeEnv` whose clock, timers, visibility and network are all driven by the test. */
export class FakeEnv implements RuntimeEnv {
  /**
   * The browser's wall clock.
   *
   * ⚠ **It starts at {@link tsAt}(0), the same instant the fake server stamps its first
   * snapshot** — a browser and a server that agree. That coupling is not cosmetic: §6.2's mode
   * is a function of `browser now − server ts` (`mode.ts`), so a harness whose two clocks sat
   * in different years would report every fixture `stale` and would hide the one property the
   * mode exists to show. A test that wants skew now has to *ask* for it, which is the right
   * way round.
   */
  now = Date.parse(tsAt(0));
  hidden = false;
  storage: PrefStorage | null;

  private timers = new Map<number, ScheduledTimer>();
  private nextTimerId = 1;
  /** Every delay ever scheduled, in order — the evidence for the backoff's shape. */
  readonly scheduled: number[] = [];
  readonly cleared: TimerHandle[] = [];

  /** Answers, consumed in order; the last one repeats once the queue runs dry. */
  readonly responses: TelemetryResponse[] = [];
  private lastResponse: TelemetryResponse = { kind: 'error', detail: 'no response queued' };
  fetches = 0;

  readonly navigations: string[] = [];
  private visibilityListeners = new Set<() => void>();
  visibilitySubscribes = 0;
  visibilityUnsubscribes = 0;

  constructor(storage: PrefStorage | null = new MemoryStorage()) {
    this.storage = storage;
  }

  // ---------------------------------------------------------------- RuntimeEnv

  nowMs = (): number => this.now;

  setTimer = (run: () => void, delayMs: number): TimerHandle => {
    const id = this.nextTimerId;
    this.nextTimerId += 1;
    this.timers.set(id, { id, at: this.now + delayMs, delayMs, run });
    this.scheduled.push(delayMs);
    return id;
  };

  clearTimer = (handle: TimerHandle): void => {
    this.cleared.push(handle);
    this.timers.delete(handle as number);
  };

  isHidden = (): boolean => this.hidden;

  onVisibilityChange = (listener: () => void): (() => void) => {
    this.visibilitySubscribes += 1;
    this.visibilityListeners.add(listener);
    return () => {
      this.visibilityUnsubscribes += 1;
      this.visibilityListeners.delete(listener);
    };
  };

  fetchTelemetry = (): Promise<TelemetryResponse> => {
    this.fetches += 1;
    const next = this.responses.shift();
    if (next !== undefined) this.lastResponse = next;
    return Promise.resolve(this.lastResponse);
  };

  navigate = (url: string): void => {
    this.navigations.push(url);
  };

  // ------------------------------------------------------------------ driving

  /** Every timer waiting to fire — `[]` is "this runtime has scheduled nothing". */
  get pending(): readonly number[] {
    return [...this.timers.values()].map((timer) => timer.delayMs);
  }

  /** Queue one answer for the next poll. */
  reply(response: TelemetryResponse): this {
    this.responses.push(response);
    return this;
  }

  /** Queue a 200 carrying a snapshot, JSON-round-tripped so it arrives as real wire data. */
  replySnapshot(snapshot: TelemetrySnapshot): this {
    return this.reply({ kind: 'ok', body: wireBodyOf(snapshot) });
  }

  /** Move the clock, firing every timer that comes due, and drain the microtasks after each. */
  async advance(ms: number): Promise<void> {
    const target = this.now + ms;
    for (;;) {
      const due = [...this.timers.values()]
        .filter((timer) => timer.at <= target)
        .sort((a, b) => a.at - b.at)[0];
      if (due === undefined) break;
      this.now = due.at;
      this.timers.delete(due.id);
      due.run();
      await flush();
    }
    this.now = target;
    await flush();
  }

  /** Flip `document.hidden` and fire the listener, exactly as the browser would. */
  async setHidden(hidden: boolean): Promise<void> {
    this.hidden = hidden;
    for (const listener of [...this.visibilityListeners]) listener();
    await flush();
  }
}

/** A snapshot as it arrives over the wire: plain JSON, with no brands and no prototypes. */
export const wireBodyOf = (snapshot: TelemetrySnapshot): unknown =>
  JSON.parse(JSON.stringify(snapshot)) as unknown;

/** The same snapshot at a different `ts` — the only field §4's cache repeats on. */
export const atTs = (snapshot: TelemetrySnapshot, ts: string): TelemetrySnapshot => ({
  ...snapshot,
  ts: isoTimestamp(ts),
});

