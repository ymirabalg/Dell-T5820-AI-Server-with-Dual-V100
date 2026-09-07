import { describe, expect, test } from 'vitest';

import { createInFlightCache } from './cache';

/**
 * §4's cache, and specifically the half that is easy to get wrong: **it holds the in-flight
 * promise**, so N callers cost one sample.
 *
 * Every test here counts calls to the sample function. That is the only evidence that
 * matters — O18's damage is a *second `nvidia-smi`*, not a second snapshot object — and it
 * is the form PLAN asks for ("cache proven by call count").
 *
 * No fake timers anywhere. The clock is injected and the samples are hand-resolved
 * deferreds, so a 6 s poll costs no wall-clock time and the tests cannot go flaky on a busy
 * machine. Nothing in `cache.ts` calls `setTimeout`, which is the property being preserved.
 */

/** A monotonic clock a test can drive. */
const fakeClock = (start = 0) => {
  let t = start;
  return {
    monotonicMs: (): number => t,
    advance: (ms: number): void => {
      t += ms;
    },
  };
};

/** A promise a test settles by hand — an in-flight sample, held open for as long as it likes. */
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
};

/** A sample function that records how many times it ran and with what clock reading. */
const counted = <T>(run: (startedMs: number) => Promise<T>) => {
  const startedAt: number[] = [];
  return {
    startedAt,
    get calls(): number {
      return startedAt.length;
    },
    sample: (startedMs: number): Promise<T> => {
      startedAt.push(startedMs);
      return run(startedMs);
    },
  };
};

describe('the in-flight cache — O18', () => {
  /*
   * The headline property, and the one §4 states twice: "Multiple browser tabs must not
   * each fork `nvidia-smi`." Two callers in the same tick, one sample.
   *
   * This is why the decision and the store in `cache.ts` are one synchronous run. A cache
   * that awaited anything before recording the entry would let both callers find it empty.
   */
  test('⚠ concurrent callers join one sample rather than each starting their own', async () => {
    const clock = fakeClock();
    const gate = deferred<string>();
    const counter = counted(() => gate.promise);
    const cache = createInFlightCache({ sample: counter.sample, ttlMs: 2000, monotonicMs: clock.monotonicMs });

    const a = cache.get();
    const b = cache.get();
    const c = cache.get();
    expect(counter.calls).toBe(1);

    gate.resolve('one sample');
    expect(await Promise.all([a, b, c])).toEqual(['one sample', 'one sample', 'one sample']);
    expect(counter.calls).toBe(1);
  });

  /*
   * ⚠ The rule that is NOT a special case of the freshness window, and the one a plausible
   * cache gets wrong.
   *
   * §6.7: `collectServing`'s worst case is 2 s discovery + 4 s probe = 6 s, against a 5 s
   * cadence — "A poll may legitimately take longer than the cadence, and that is not a
   * fault … **Overlapping polls must never become overlapping samples.**" A cache that only
   * asked "is the last result younger than 2 s?" answers *no* at 2 s into a 6 s sample and
   * forks a second one, which is precisely the accumulation O18 exists to prevent — arriving
   * through the freshness check rather than through the absence of a cache.
   */
  test('⚠ a caller arriving mid-sample joins it even long after the window has elapsed', async () => {
    const clock = fakeClock();
    const gate = deferred<string>();
    const counter = counted(() => gate.promise);
    const cache = createInFlightCache({ sample: counter.sample, ttlMs: 2000, monotonicMs: clock.monotonicMs });

    const first = cache.get();
    // Three times the window, and half of `collectServing`'s legitimate 6 s worst case.
    clock.advance(6000);
    const second = cache.get();

    expect(counter.calls).toBe(1);
    gate.resolve('the slow poll');
    expect(await first).toBe('the slow poll');
    expect(await second).toBe('the slow poll');
  });

  /*
   * ⚠ The failure O18 describes in full: "§3.1's bound abandons a wedged `nvidia-smi` rather
   * than killing it, so a result-only cache would fork a new orphan every poll and
   * accumulate them without limit."
   *
   * A sample that never settles, polled at the 5 s default cadence for a minute. One
   * `nvidia-smi`, not thirteen.
   */
  test('⚠ a wedged sample is never re-forked, however many polls arrive', async () => {
    const clock = fakeClock();
    const wedged = deferred<string>();
    const counter = counted(() => wedged.promise);
    const cache = createInFlightCache({ sample: counter.sample, ttlMs: 2000, monotonicMs: clock.monotonicMs });

    const joined = [cache.get()];
    for (let poll = 0; poll < 12; poll += 1) {
      clock.advance(5000);
      joined.push(cache.get());
    }

    expect(counter.calls).toBe(1);
    expect(new Set(joined).size).toBe(1);
    wedged.resolve('at last');
    expect(await Promise.all(joined)).toEqual(Array.from({ length: 13 }, () => 'at last'));
  });

  /*
   * ⚠ Start-stamped, not completion-stamped, and the two only differ on a slow poll.
   *
   * A sample that starts at t=0 and lands at t=1500 is 2.5 s old at t=2500. Measured from
   * the start it is stale and the next caller samples again; measured from completion it is
   * 1 s old and would be served — a snapshot whose `ts` is 2.5 s behind, handed out under a
   * cache that calls itself 2 s. §6.7's age indicator is the thing that tells a reader the
   * page is behind, and it must not be reporting an age the server has decided to ignore.
   */
  test('⚠ the window is measured from the start of the sample, not its completion', async () => {
    const clock = fakeClock();
    let gate = deferred<string>();
    const counter = counted(() => gate.promise);
    const cache = createInFlightCache({ sample: counter.sample, ttlMs: 2000, monotonicMs: clock.monotonicMs });

    const first = cache.get();
    clock.advance(1500);
    gate.resolve('landed at 1500');
    expect(await first).toBe('landed at 1500');

    // 2500 ms after the sample STARTED; 1000 ms after it finished.
    clock.advance(1000);
    gate = deferred<string>();
    const second = cache.get();
    expect(counter.calls).toBe(2);

    gate.resolve('a fresh sample');
    expect(await second).toBe('a fresh sample');
  });

  /*
   * Both sides of the window boundary. The comparison is `now - startedMs < ttlMs`, so
   * `ttlMs - 1` is served from the cache and `ttlMs` is not.
   *
   * Fixtured on both sides (HANDOVER §5.1) because the two sides differ in what the box
   * actually does: one poll costs zero `nvidia-smi` calls, the other costs one.
   */
  test('a settled sample inside the window is reused', async () => {
    const clock = fakeClock();
    const counter = counted(async (started: number) => `sample at ${String(started)}`);
    const cache = createInFlightCache({ sample: counter.sample, ttlMs: 2000, monotonicMs: clock.monotonicMs });

    expect(await cache.get()).toBe('sample at 0');
    clock.advance(1999);
    expect(await cache.get()).toBe('sample at 0');
    expect(counter.calls).toBe(1);
  });

  test('at exactly the window a new sample is taken', async () => {
    const clock = fakeClock();
    const counter = counted(async (started: number) => `sample at ${String(started)}`);
    const cache = createInFlightCache({ sample: counter.sample, ttlMs: 2000, monotonicMs: clock.monotonicMs });

    expect(await cache.get()).toBe('sample at 0');
    clock.advance(2000);
    expect(await cache.get()).toBe('sample at 2000');
    expect(counter.calls).toBe(2);
  });

  /*
   * ⚠ A rejected sample is evicted, not served for the rest of the window.
   *
   * A rejection here is a bug in the assembler, never a failed reading — a failed reading is
   * `null` plus an `errors[]` entry and settles the promise normally (invariant 5). Holding
   * the rejection would turn one bug into a stall: every caller for the next two seconds
   * gets the same failure without anything having been retried.
   */
  test('⚠ a rejected sample is evicted instead of being served for the window', async () => {
    const clock = fakeClock();
    const first = deferred<string>();
    let next: Promise<string> = first.promise;
    const counter = counted(() => next);
    const cache = createInFlightCache({ sample: counter.sample, ttlMs: 2000, monotonicMs: clock.monotonicMs });

    const failed = cache.get();
    first.reject(new Error('the assembler threw'));
    await expect(failed).rejects.toThrow('the assembler threw');

    // Still deep inside the 2 s window.
    clock.advance(10);
    next = Promise.resolve('recovered');
    expect(await cache.get()).toBe('recovered');
    expect(counter.calls).toBe(2);
  });

  test('every caller joining a rejected sample sees the same rejection', async () => {
    const clock = fakeClock();
    const gate = deferred<string>();
    const counter = counted(() => gate.promise);
    const cache = createInFlightCache({ sample: counter.sample, ttlMs: 2000, monotonicMs: clock.monotonicMs });

    const a = cache.get();
    const b = cache.get();
    gate.reject(new Error('one failure, two callers'));

    await expect(a).rejects.toThrow('one failure, two callers');
    await expect(b).rejects.toThrow('one failure, two callers');
    expect(counter.calls).toBe(1);
  });

  /*
   * ⚠ The sample is handed the same reading of the clock the entry is stamped with.
   *
   * `source.ts` passes it straight to `collectHost` as the instant its counters were read,
   * so a second reading of the clock here would put the delta interval and the freshness
   * window on two slightly different timelines — and a `Date.now()` taken here would put
   * them on two different *clocks*, which is the bug `deadline.ts` was written for.
   */
  test('⚠ the sample receives the clock reading the entry was stamped with', async () => {
    const clock = fakeClock(4242);
    const counter = counted(async () => 'v');
    const cache = createInFlightCache({ sample: counter.sample, ttlMs: 2000, monotonicMs: clock.monotonicMs });

    await cache.get();
    clock.advance(9000);
    await cache.get();

    expect(counter.startedAt).toEqual([4242, 13242]);

    // …and it really is the value the ENTRY was stamped with, not merely a reading of the
    // same clock: the window that follows is measured from 13242, so 1999 ms later is a hit.
    clock.advance(1999);
    await cache.get();
    expect(counter.calls).toBe(2);
  });

  /*
   * A budget that is not a number degrades to "always sample", never to "serve forever".
   *
   * There is no `setTimeout` here, so `boundedTimeoutMs` does not apply — but the direction
   * of the degradation still matters, and this is the safe one: every comparison against
   * `NaN` is false, so nothing stale is ever served. The in-flight join is independent of
   * the window and still holds, which is the property that stops orphans accumulating.
   */
  test('a non-finite window degrades to sampling every time, never to serving stale', async () => {
    const clock = fakeClock();
    const counter = counted(async (started: number) => `sample at ${String(started)}`);
    const cache = createInFlightCache({
      sample: counter.sample,
      ttlMs: Number.NaN,
      monotonicMs: clock.monotonicMs,
    });

    expect(await cache.get()).toBe('sample at 0');
    expect(await cache.get()).toBe('sample at 0');
    expect(counter.calls).toBe(2);

    const gate = deferred<string>();
    const wedging = counted(() => gate.promise);
    const wedged = createInFlightCache({
      sample: wedging.sample,
      ttlMs: Number.NaN,
      monotonicMs: clock.monotonicMs,
    });
    void wedged.get();
    clock.advance(60000);
    void wedged.get();
    expect(wedging.calls).toBe(1);
    gate.resolve('done');
  });
});
