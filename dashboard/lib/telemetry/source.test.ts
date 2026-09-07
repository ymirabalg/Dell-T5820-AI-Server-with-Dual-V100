import { describe, expect, test, vi } from 'vitest';

import { advanceDeltas } from '@/lib/collectors';
import type { CpuTimes, DeltaSample, NetCounters } from '@/lib/collectors';
import { isoTimestamp } from '@/lib/types';
import type { ErrorSource, IsoTimestamp, TelemetryError } from '@/lib/types';
import { everythingZero } from '@/lib/fixtures';

import { HOST_SOURCES, NO_HOST, NO_NETWORK } from './snapshot';
import type { SnapshotCollectors } from './snapshot';
import { TELEMETRY_CACHE_MS, createTelemetrySource, mergePrevious, systemClock } from './source';
import type { TelemetryClock } from './source';

/**
 * The one stateful object on the server: §4's cache and §6.7's carried counters, and the
 * fact that the first is what makes the second single-writer.
 */

const NOTHING: DeltaSample = { atMs: 0, cpu: null, net: null };

const cpu = (busy: bigint, total: bigint): CpuTimes => ({ busy, total });
const net = (rxBytes: bigint, txBytes: bigint): NetCounters => ({ rxBytes, txBytes });

const sourcesOf = (errors: readonly TelemetryError[]): ErrorSource[] =>
  errors.map((entry) => entry.source);

/** A clock a test drives, with the two halves kept apart exactly as production keeps them. */
const fakeClock = (start = 0) => {
  let t = start;
  let iso = '2026-09-06T14:02:11.482Z';
  return {
    clock: {
      monotonicMs: (): number => t,
      isoNow: (): IsoTimestamp => isoTimestamp(iso),
    } satisfies TelemetryClock,
    advance: (ms: number): void => {
      t += ms;
    },
    setIso: (value: string): void => {
      iso = value;
    },
  };
};

/**
 * Collectors that succeed and count their calls. `host` records the `previous` it was given
 * and returns whatever sample the test queued, which is how O16 is observed from outside.
 */
const spyCollectors = (samples: readonly DeltaSample[]) => {
  const calls = { gpus: 0, host: 0, cooling: 0, serving: 0, storage: 0, safety: 0 };
  const seenPrevious: (DeltaSample | null)[] = [];
  const seenNowMs: number[] = [];
  /** When set, `host` blocks on it — an in-flight sample the test holds open. */
  let gate: Promise<void> | null = null;
  let openGate: (() => void) | null = null;

  const collectors: SnapshotCollectors = {
    gpus: async () => {
      calls.gpus += 1;
      return { gpus: null, errors: [] };
    },
    host: async ({ previous, nowMs }) => {
      seenPrevious.push(previous ?? null);
      seenNowMs.push(nowMs);
      const sample = samples[calls.host] ?? { ...NOTHING, atMs: nowMs };
      calls.host += 1;
      if (gate !== null) await gate;
      return { hostname: 'ai-server', host: NO_HOST, net: NO_NETWORK, sample, errors: [] };
    },
    cooling: async () => {
      calls.cooling += 1;
      return { cooling: everythingZero.cooling, pwm5Present: null, errors: [] };
    },
    serving: async () => {
      calls.serving += 1;
      return { serving: null, errors: [] };
    },
    storage: async () => {
      calls.storage += 1;
      return {
        filesystems: { root: everythingZero.storage.root, home: everythingZero.storage.home },
        errors: [],
      };
    },
    safety: async () => {
      calls.safety += 1;
      return {
        checks: { ufwEnforcing: null, dkmsForRunningKernel: null, fanServiceState: null },
        errors: [],
      };
    },
  };

  return {
    collectors,
    calls,
    seenPrevious,
    seenNowMs,
    /** Make `host` block until the returned `release()` is called. */
    hold: (): (() => void) => {
      gate = new Promise<void>((resolve) => {
        openGate = resolve;
      });
      return () => {
        const open = openGate;
        gate = null;
        openGate = null;
        if (open !== null) open();
      };
    },
  };
};

// ---------------------------------------------------------------------------
// §6.7 / O16 — the retention rule
// ---------------------------------------------------------------------------

describe('mergePrevious — the collector owns previous across a failed read', () => {
  test('the first sample becomes previous unchanged', () => {
    const first: DeltaSample = { atMs: 1000, cpu: cpu(0n, 1000n), net: net(1000n, 2000n) };
    expect(mergePrevious(null, first)).toEqual(first);
  });

  /*
   * ⚠ §6.7: "A failed poll must not discard the last good counters, or one transient failure
   * costs two polls of every delta — the failed one and the one after it."
   *
   * A poll where *both* reads failed keeps both counters and the timestamp. The next poll
   * then still has a baseline, so the transient costs exactly one poll of each delta.
   */
  test('⚠ a poll that read nothing keeps the last good counters and timestamp', () => {
    const good: DeltaSample = { atMs: 1000, cpu: cpu(0n, 1000n), net: net(1000n, 2000n) };
    const failed: DeltaSample = { atMs: 6000, cpu: null, net: null };

    expect(mergePrevious(good, failed)).toEqual(good);
  });

  /*
   * ⚠ Retention is PER COUNTER, not per sample. `/proc/stat` and `/proc/net/dev` are two
   * files and they fail independently; keeping the whole sample only when both succeed
   * would freeze the CPU baseline for as long as the network read stayed broken, and
   * `cpuPct` would drift from a 5 s figure into a lifetime average.
   */
  test('⚠ each counter is retained on its own, not the sample as a whole', () => {
    const good: DeltaSample = { atMs: 1000, cpu: cpu(0n, 1000n), net: net(1000n, 2000n) };

    expect(mergePrevious(good, { atMs: 6000, cpu: cpu(5n, 2000n), net: null })).toEqual({
      atMs: 1000,
      cpu: cpu(5n, 2000n),
      net: net(1000n, 2000n),
    });
    expect(mergePrevious(good, { atMs: 6000, cpu: null, net: net(9n, 9n) })).toEqual({
      atMs: 6000,
      cpu: cpu(0n, 1000n),
      net: net(9n, 9n),
    });
  });

  /*
   * ⚠ **`atMs` belongs to `net`.** It is the only field paired with a clock —
   * `netRatesBetween` divides by `next.atMs - prev.atMs`, and `cpuPctBetween` never looks at
   * it. Advancing it whenever *anything* succeeded would divide a two-poll counter delta by
   * a one-poll interval and report double the real throughput.
   *
   * Three polls, with the network read failing in the middle, run through the real
   * `advanceDeltas`:
   *
   * - poll 2 reports no rate (its own read failed) — §6.7's `—`, never `0`;
   * - poll 3 reports 10,000 bytes over the full **10 s** since the last successful read;
   * - poll 3's `cpuPct` uses poll 2's *retained* CPU counters, not poll 1's.
   *
   * The bug this pins is silent: 2,000 B/s instead of 1,000 renders perfectly.
   */
  test('⚠ a retained network counter keeps its own timestamp, so the rate is not doubled', () => {
    const poll1: DeltaSample = { atMs: 1000, cpu: cpu(0n, 1000n), net: net(1000n, 2000n) };
    const poll2: DeltaSample = { atMs: 6000, cpu: cpu(100n, 2000n), net: null };
    const poll3: DeltaSample = { atMs: 11000, cpu: cpu(600n, 3000n), net: net(11000n, 22000n) };

    let previous = mergePrevious(null, poll1);

    const second = advanceDeltas(previous, poll2);
    expect(second.rxBytesPerSec).toBeNull();
    expect(second.txBytesPerSec).toBeNull();
    expect(second.cpuPct).toBeCloseTo(10, 10);
    previous = mergePrevious(previous, poll2);

    const third = advanceDeltas(previous, poll3);
    // 10,000 bytes across 10 s, not across the 5 s since the failed poll.
    expect(third.rxBytesPerSec).toBeCloseTo(1000, 10);
    expect(third.txBytesPerSec).toBeCloseTo(2000, 10);
    // 500 busy of 1000 total since poll 2 — not 600 of 2000 since poll 1.
    expect(third.cpuPct).toBeCloseTo(50, 10);
  });

  test('a poll that read nothing, with nothing before it, stays empty', () => {
    expect(mergePrevious(null, { atMs: 42, cpu: null, net: null })).toEqual({
      atMs: 42,
      cpu: null,
      net: null,
    });
  });
});

// ---------------------------------------------------------------------------
// The source
// ---------------------------------------------------------------------------

describe('the telemetry source', () => {
  /*
   * ⚠ §4: "Sampling is per-request, not a background loop. With no clients connected the
   * container does no work at all — it must never itself become load on a box whose thermal
   * margin is the thing being watched."
   *
   * Building the source must therefore run no collector: no warm-up, no priming read, no
   * first sample "so the cache is ready".
   */
  test('⚠ constructing a source runs no collector until a snapshot is asked for', async () => {
    const spy = spyCollectors([]);
    const { clock } = fakeClock();
    const source = createTelemetrySource({ collectors: spy.collectors, clock });

    expect(spy.calls).toEqual({ gpus: 0, host: 0, cooling: 0, serving: 0, storage: 0, safety: 0 });

    await source.snapshot();
    expect(spy.calls).toEqual({ gpus: 1, host: 1, cooling: 1, serving: 1, storage: 1, safety: 1 });
  });

  /*
   * ⚠ **`STANDING` is captured ONCE, at construction, and this test is the correction of a
   * claim rather than the pinning of a preference.**
   *
   * §4 says *"A change takes effect on the next poll"*, and this file used to read
   * `readStandingList(env)` inside every sample to honour it. **That could not work.** In
   * production the values reach `process.env` through Docker's `--env-file`, which reads
   * `/etc/ai-dashboard.env` **once, at `docker run`**, and copies the values into the
   * container's environment — a running Node process does not track the host file. So the
   * per-sample read re-read a value that could not have changed, while the code's own
   * comment told the next reader it could.
   *
   * Settled by the owner 2026-09-07: keep `--env-file`, amend §4 to *"on the next container
   * restart"*, and read once. This asserts the honest behaviour — a mutated environment does
   * **not** reach the second poll — so the day someone re-adds the per-sample read believing
   * §4's old sentence, it goes red and points at this comment.
   *
   * ⚠ The client half is unaffected and still per-poll: `standing` rides every snapshot, and
   * `runtime.test.ts` pins that a *changed snapshot* changes the client's suppression.
   */
  test('⚠ STANDING is captured once — editing the environment does not reach the next poll', async () => {
    const spy = spyCollectors([]);
    const { clock, advance } = fakeClock();
    const env: Record<string, string | undefined> = { STANDING: 'ufw_enforcing' };
    const source = createTelemetrySource({ collectors: spy.collectors, clock, env });

    const first = await source.snapshot();
    expect(first.standing).toEqual(['ufw_enforcing']);

    env['STANDING'] = 'cpu_temp,ram';
    advance(TELEMETRY_CACHE_MS + 1);
    const second = await source.snapshot();

    // A genuinely new sample — the collectors ran a second time, so this is not the cached
    // snapshot — and it still carries the value read at construction.
    expect(spy.calls.gpus).toBe(2);
    expect(second.standing).toEqual(['ufw_enforcing']);
  });

  /*
   * ⚠ §4's cache, at the level a route sees it: ten tabs, one sample. The proof is the call
   * count on every collector, not the identity of the snapshot.
   */
  test('⚠ ten callers inside the window cost exactly one sample', async () => {
    const spy = spyCollectors([]);
    const { clock, advance } = fakeClock();
    const source = createTelemetrySource({ collectors: spy.collectors, clock });

    await source.snapshot();
    for (let poll = 0; poll < 9; poll += 1) {
      advance(100);
      await source.snapshot();
    }

    expect(spy.calls.host).toBe(1);
    expect(spy.calls.gpus).toBe(1);

    // …and past the window, one more.
    advance(TELEMETRY_CACHE_MS);
    await source.snapshot();
    expect(spy.calls.host).toBe(2);
  });

  /*
   * ⚠ O18 and O16 are one mechanism seen twice. `previous` is read when a sample starts and
   * written when it settles, which would be a race — except that the cache never lets a
   * second sample start while one is in flight. A caller arriving mid-sample joins it, so
   * there is exactly one writer.
   */
  test('⚠ a caller arriving mid-sample joins it and starts no second poll', async () => {
    const spy = spyCollectors([]);
    const { clock, advance } = fakeClock();
    const source = createTelemetrySource({ collectors: spy.collectors, clock });

    const release = spy.hold();
    const first = source.snapshot();
    await Promise.resolve();
    advance(6000); // §6.7's legitimate 6 s poll, well past the 2 s window
    const second = source.snapshot();

    expect(spy.calls.host).toBe(1);
    release();
    expect(await first).toBe(await second);
    expect(spy.calls.host).toBe(1);
  });

  /*
   * ⚠ The first poll has no `previous` (§6.7: "they render `—` until the second poll
   * arrives, never `0`"), and the second poll is handed the first's counters.
   */
  test('⚠ previous is null on the first poll and carries the last sample on the next', async () => {
    const first: DeltaSample = { atMs: 0, cpu: cpu(0n, 100n), net: net(1n, 2n) };
    const second: DeltaSample = { atMs: 0, cpu: cpu(50n, 200n), net: net(5n, 6n) };
    const spy = spyCollectors([first, second]);
    const { clock, advance } = fakeClock();
    const source = createTelemetrySource({ collectors: spy.collectors, clock });

    await source.snapshot();
    advance(TELEMETRY_CACHE_MS);
    await source.snapshot();

    expect(spy.seenPrevious[0]).toBeNull();
    expect(spy.seenPrevious[1]).toEqual(first);
  });

  /*
   * ⚠ O16 through the source rather than through `mergePrevious` alone: a poll whose host
   * collector read nothing must leave the stored counters where they were.
   */
  test('⚠ a poll that read no counters leaves the stored ones in place', async () => {
    const good: DeltaSample = { atMs: 0, cpu: cpu(0n, 100n), net: net(1n, 2n) };
    const spy = spyCollectors([good, { atMs: 0, cpu: null, net: null }, good]);
    const { clock, advance } = fakeClock();
    const source = createTelemetrySource({ collectors: spy.collectors, clock });

    await source.snapshot();
    advance(TELEMETRY_CACHE_MS);
    await source.snapshot();
    advance(TELEMETRY_CACHE_MS);
    await source.snapshot();

    expect(spy.seenPrevious[1]).toEqual(good);
    expect(spy.seenPrevious[2]).toEqual(good);
  });

  /*
   * ⚠ The two clocks reach two different places and must not be swapped: the monotonic one
   * times the deltas and the cache, the wall clock is the only one on the wire.
   */
  test('⚠ the monotonic clock times the sample and the wall clock stamps ts', async () => {
    const spy = spyCollectors([]);
    const fake = fakeClock(4242);
    fake.setIso('2026-09-06T14:02:11.482Z');
    const source = createTelemetrySource({ collectors: spy.collectors, clock: fake.clock });

    const first = await source.snapshot();
    expect(spy.seenNowMs).toEqual([4242]);
    expect(first.ts).toBe('2026-09-06T14:02:11.482Z');

    fake.advance(TELEMETRY_CACHE_MS);
    fake.setIso('2026-09-06T14:02:13.482Z');
    const second = await source.snapshot();
    expect(spy.seenNowMs).toEqual([4242, 6242]);
    expect(second.ts).toBe('2026-09-06T14:02:13.482Z');
  });

  test('the shipped window is §4’s two seconds', () => {
    expect(TELEMETRY_CACHE_MS).toBe(2000);
  });

  test('the system clock is monotonic and its ISO stamp parses back', () => {
    const a = systemClock.monotonicMs();
    const b = systemClock.monotonicMs();
    expect(b).toBeGreaterThanOrEqual(a);
    expect(Number.isFinite(a)).toBe(true);
    // The wall clock is a different quantity, and it is the one §4 puts on the wire.
    const stamp = systemClock.isoNow();
    expect(new Date(stamp).toISOString()).toBe(stamp);
  });
});

// ---------------------------------------------------------------------------
// §4's two halves — the ceiling and the outstanding-call rule, composed
// ---------------------------------------------------------------------------

describe('a collector that stops answering (§4)', () => {
  /*
   * ⚠ §4: "`collectHost` … alone carries a 6 s ceiling at the assembly." Without it a
   * wedged `/proc` read never settles, the in-flight cache holds that promise forever, and
   * `GET /api/telemetry` is dead until the container restarts — measured on this project,
   * and reachable because four blocked libuv thread-pool operations stop every subsequent
   * read in the process.
   *
   * The ceiling is reported as `collectHost`'s own failure: nine `errors[]` entries naming
   * the budget, and the other five collections intact. §6.5's "a partial snapshot is the
   * normal case" is the whole point — the alternative is §6.7's grey dot and a banner
   * naming a *server* failure, which is the least informative thing this dashboard could
   * say on the one occasion the machine most needs it.
   */
  test('⚠ a wedged host collector settles the poll at the ceiling, as a partial snapshot', async () => {
    const spy = spyCollectors([]);
    const { clock } = fakeClock();
    const source = createTelemetrySource({
      collectors: spy.collectors,
      clock,
      hostCeilingMs: 20,
    });

    const release = spy.hold();
    const snapshot = await source.snapshot();

    expect(snapshot.host).toEqual(NO_HOST);
    expect(sourcesOf(snapshot.errors)).toEqual([...HOST_SOURCES]);
    expect(snapshot.errors[0]?.message).toContain('timed out after 20 ms');
    // ⚠ The other five answered, and their readings are on the wire. The bound applied to
    // one subject and to nothing else (§6.7).
    expect(spy.calls).toEqual({ gpus: 1, host: 1, cooling: 1, serving: 1, storage: 1, safety: 1 });
    expect(snapshot.cooling).not.toBeNull();
    expect(snapshot.storage.root).toBe(everythingZero.storage.root);

    release();
  });

  /*
   * ⚠ **The composition order, and it is the finding this pair of rules exists for.** §4:
   * "A ceiling alone would be worse than nothing … it restarts the polling and lets blocked
   * reads, orphaned `nvidia-smi` processes and abandoned sockets accumulate without limit."
   *
   * The gate must hold its slot until the *underlying* call settles. Composed the other way
   * round — a gate outside the ceiling — it would release when the `Promise.race` settled
   * at the bound and the next poll would issue a second call into the same wedged source:
   * one more permanently blocked worker on every poll, for as long as the container runs.
   *
   * Nothing else in this file distinguishes the two orders.
   */
  test('⚠ the next poll issues no second call into the wedged collector', async () => {
    const spy = spyCollectors([]);
    const { clock, advance } = fakeClock();
    const source = createTelemetrySource({
      collectors: spy.collectors,
      clock,
      hostCeilingMs: 20,
    });

    const release = spy.hold();
    await source.snapshot();

    advance(TELEMETRY_CACHE_MS);
    const second = await source.snapshot();

    expect(spy.calls.host).toBe(1);
    expect(spy.calls.gpus).toBe(2);
    expect(second.host).toEqual(NO_HOST);
    expect(second.errors[0]?.message).toContain('the previous call has not returned');

    release();
  });

  /*
   * ⚠ §4: "it recovers on the first poll after the call returns." No cool-down and no
   * failure count — the slot is released by the underlying call settling, however late.
   */
  test('⚠ the collector is polled again on the first poll after it finally answers', async () => {
    const spy = spyCollectors([]);
    const { clock, advance } = fakeClock();
    const source = createTelemetrySource({
      collectors: spy.collectors,
      clock,
      hostCeilingMs: 20,
    });

    const release = spy.hold();
    await source.snapshot();
    advance(TELEMETRY_CACHE_MS);
    await source.snapshot();
    expect(spy.calls.host).toBe(1);

    release();
    // Drain the microtasks the release travels through: the collector resumes, its promise
    // settles, and only then does the gate release its slot.
    for (let tick = 0; tick < 5; tick += 1) await Promise.resolve();

    advance(TELEMETRY_CACHE_MS);
    const third = await source.snapshot();

    expect(spy.calls.host).toBe(2);
    expect(third.hostname).toBe('ai-server');
    expect(third.errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §4 — "with no clients connected the container does no work at all"
// ---------------------------------------------------------------------------

describe('no background work', () => {
  /*
   * ⚠ §4: "Sampling is per-request, not a background loop. With no clients connected the
   * container does no work at all — it must never itself become load on a box whose thermal
   * margin is the thing being watched."
   *
   * ⚠ **This test is behavioural because the property cannot be guarded by text.**
   * `setInterval` is a *global*, and `globalThis.setInterval`, a destructured alias and a
   * computed property are three spellings with no last one. Measured in this step's
   * adversarial phase: an aliased `globalThis.setInterval` and a warm-up queued as a
   * microtask both passed the entire suite while the source sampled the box with no browser
   * open. `lib/guardrails.test.ts` still carries the text rule as a *necessary* condition —
   * it catches the accidental spelling in a new file, which this cannot — but this is the
   * one that catches the property.
   *
   * Fake timers plus `advanceTimersByTimeAsync` covers all three spellings at once: it
   * drains microtasks between timers, so a warm-up queued with `queueMicrotask` or
   * `Promise.resolve().then` is caught by the same assertion as an interval. The earlier
   * version of this test read the call counts *synchronously* after construction, which a
   * microtask has not yet run at — a measured evasion.
   */
  test('⚠ constructing a source schedules no work — no timer, no interval, no microtask', async () => {
    vi.useFakeTimers();
    try {
      const spy = spyCollectors([]);
      const { clock } = fakeClock();
      createTelemetrySource({ collectors: spy.collectors, clock });

      // Synchronously first: a warm-up written as a plain call is caught here.
      expect(spy.calls).toEqual({ gpus: 0, host: 0, cooling: 0, serving: 0, storage: 0, safety: 0 });

      // …then a simulated minute of an idle container, microtasks drained throughout.
      await vi.advanceTimersByTimeAsync(60_000);
      expect(spy.calls).toEqual({ gpus: 0, host: 0, cooling: 0, serving: 0, storage: 0, safety: 0 });
    } finally {
      vi.useRealTimers();
    }
  });

  /*
   * ⚠ The other half, and fake timers cannot see it: a timer created at **module load**
   * rather than at construction. `productionTelemetryDeps` is built when `handler.ts` is
   * first imported, which under Next's lazy route loading is the first request to reach
   * this route — including an unauthenticated one that will be answered 401.
   *
   * Two independent observations, because neither sees what the other does: a spy on the
   * global scheduling functions (which any unqualified `setInterval(…)` call resolves
   * through, however it is spelled) and `process.getActiveResourcesInfo()`, which sees a
   * timer created through `node:timers` as well — a module holding
   * `import { setInterval } from 'node:timers'` captured the reference before the spy and is
   * invisible to it.
   *
   * ⚠ **The resource count is one-sided, and the equality it replaced was a flake.**
   * `process.getActiveResourcesInfo()` is **process-wide**: it counts the test runner's own
   * pending timers exactly as readily as ours. Measured 2026-09-07 while gathering step 8's
   * closing evidence, `expect(after).toBe(before)` failed **3 runs in 20** with
   * `expected +0 to be 1` — one of the runner's timers had **expired** during the dynamic
   * import, and the test reported a violation of a property that held. That is HANDOVER §5.4's
   * rule in a clock-shaped form, and it is the same species as step 8's globals guard, which
   * attributes calls **by stack frame** rather than counting them for exactly this reason.
   *
   * What "importing creates no timer" forbids is an **increase**, so that is what is asserted.
   * The residual is small and stated rather than eliminated: a timer created by the import
   * would have to be spelled through `node:timers` (invisible to the spies) *and* be masked by
   * an unrelated expiry inside the same few milliseconds. Twenty runs produced three decreases
   * and no increase.
   */
  test('⚠ importing the route’s modules creates no timer at module load', async () => {
    const timers = ['setTimeout', 'setInterval', 'setImmediate'] as const;
    const spies = timers.map((name) => vi.spyOn(globalThis, name));
    const isTimer = (kind: string): boolean => kind === 'Timeout' || kind === 'Immediate';
    const before = process.getActiveResourcesInfo().filter(isTimer).length;

    const loaded: unknown = await import('./handler');
    expect(loaded).toBeDefined();

    const after = process.getActiveResourcesInfo().filter(isTimer).length;
    for (const spy of spies) expect(spy).not.toHaveBeenCalled();
    expect(after).toBeLessThanOrEqual(before);

    for (const spy of spies) spy.mockRestore();
  });

  /*
   * ⚠ F8's clock. `cache.ts` compares `nowMs - startedMs` against the window, so a
   * **backward** wall-clock step — the first NTP sync after boot, a container resume —
   * would make that difference negative and hold one stale snapshot for the length of the
   * step. `performance.now()` cannot step; `Date.now()` can, and is the mistake
   * `lib/collectors/deadline.ts` was written for after a backward step turned a declared
   * 2 s bound into a measured one hour.
   *
   * The two are told apart by magnitude: `performance.now()` counts from process start, so
   * it is smaller than the epoch by more than a thousand years.
   */
  test('⚠ the monotonic clock is not the wall clock', () => {
    const monotonic = systemClock.monotonicMs();
    const wall = Date.now();

    expect(monotonic).toBeGreaterThanOrEqual(0);
    expect(wall - monotonic).toBeGreaterThan(1e12);
  });
});
