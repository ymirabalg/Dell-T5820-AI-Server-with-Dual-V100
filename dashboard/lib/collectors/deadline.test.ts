/**
 * The shared bound — O17's mechanism, extracted from `cooling.ts` so step 5 has one copy
 * to call for D-Bus, `/health`, `/v1/models` and `statvfs` rather than four to write.
 *
 * Two defects live here and both were found in step 4's review, four lines apart:
 *
 * - **A2** — the deadline arithmetic read `Date.now()`, a *wall* clock, while `setTimeout`
 *   counts on the *monotonic* one. A backward NTP step turned a declared 2 s bound into a
 *   measured one-hour bound.
 * - **A7** — nothing guarded the top of the range, so `Infinity`, `NaN` or anything at or
 *   above 2³¹ became a **1 ms** budget: the whole probe timed out on every poll.
 */

import { describe, expect, test, vi } from 'vitest';

import { MAX_TIMEOUT_MS, boundedReader, boundedTimeoutMs, deadline } from './deadline';
import type { HwmonReader } from './hwmon';

const FALLBACK = 2000;

// ---------------------------------------------------------------------------
// A7 — the budget `setTimeout` will actually honour
// ---------------------------------------------------------------------------

describe('boundedTimeoutMs — a budget setTimeout can honour, or the fallback', () => {
  test('the documented ceiling is setTimeout’s own', () => {
    expect(MAX_TIMEOUT_MS).toBe(2 ** 31 - 1);
  });

  const accepted: readonly number[] = [1, 20, 2000, 4000, 2 ** 31 - 1];
  test.each(accepted)('%s is in range and is used verbatim', (ms) => {
    expect(boundedTimeoutMs(ms, FALLBACK)).toBe(ms);
  });

  const rejected: readonly [string, number][] = [
    ['zero', 0],
    ['negative', -1],
    ['-0', -0],
    ['2**31 — one past the ceiling', 2 ** 31],
    ['2**31 + 1', 2 ** 31 + 1],
    ['+Infinity — "do not bound this"', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['NaN', Number.NaN],
  ];
  test.each(rejected)('%s falls back', (_name, ms) => {
    expect(boundedTimeoutMs(ms, FALLBACK)).toBe(FALLBACK);
  });

  test('⚠ both sides of the 2³¹−1 ceiling, which is where setTimeout clamps to 1 ms', () => {
    // HANDOVER §5's fixture-symmetry rule, on the boundary A7 is about. The two sides are
    // distinguishable and opposite in effect: 2³¹−1 is ~25 days of budget, and 2³¹ used to
    // be the *tightest possible* one. A guard that pointed the wrong way here would blank
    // the COOLING panel on every poll for any caller asking for a long bound.
    expect(boundedTimeoutMs(MAX_TIMEOUT_MS, FALLBACK)).toBe(MAX_TIMEOUT_MS);
    expect(boundedTimeoutMs(MAX_TIMEOUT_MS + 1, FALLBACK)).toBe(FALLBACK);
  });

  test('⚠ and both sides of the zero floor, which is the other direction', () => {
    expect(boundedTimeoutMs(1, FALLBACK)).toBe(1);
    expect(boundedTimeoutMs(0, FALLBACK)).toBe(FALLBACK);
  });

  test('the fallback is returned, not thrown — invariant 5', () => {
    // A caller's bad argument degrades one poll's bound. It does not turn §4's route into
    // a 500, and it does not silently produce a bound nobody asked for.
    expect(() => boundedTimeoutMs(Number.NaN, FALLBACK)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// A2 — the clock
// ---------------------------------------------------------------------------

describe('the deadline is measured on a MONOTONIC clock', () => {
  test('⚠ a backward wall-clock step does not extend the bound', async () => {
    // The measured failure: `systemd-timesyncd` steps the clock back — first sync after
    // boot, a VM resume, the end of a leap smear — and a `Date.now()` deadline grows by the
    // size of the step. Against an EC that has hung before, on a per-request route, a
    // declared 2 s bound became one hour. `performance.now()` is immune because it counts
    // from process start and cannot be set.
    //
    // ⚠ The step must land BETWEEN opening the budget and spending it, which is what makes
    // this test bite. A constant offset on `Date.now` does not: both reads shift by the
    // same amount, the subtraction cancels, and a wall-clock implementation looks correct.
    // That was the first version of this test, and the mutation below it (T52) walked
    // straight through it. HANDOVER §5: when a mutation does not bite, the first hypothesis
    // is a missing test, not a bad mutation.
    let stepped = false;
    const realNow = Date.now;
    const spy = vi
      .spyOn(Date, 'now')
      .mockImplementation(() => (stepped ? realNow() - 3_600_000 : realNow()));
    try {
      const within = deadline(20, FALLBACK); // the budget opens here…
      stepped = true; // …and systemd-timesyncd steps the clock back an hour here.
      const started = performance.now();
      await expect(within(() => new Promise((r) => setTimeout(r, 300)))).rejects.toThrow(
        'timed out after 20 ms',
      );
      // On a wall clock the remaining budget would read 3_600_020 ms and the 300 ms
      // operation would resolve normally — a 20 ms bound turned into an hour.
      expect(performance.now() - started).toBeLessThan(200);
    } finally {
      spy.mockRestore();
    }
  });

  test('a spent budget rejects without starting the operation at all', async () => {
    const within = deadline(1, FALLBACK);
    await new Promise((r) => setTimeout(r, 20));
    let started = false;
    await expect(
      within(async () => {
        started = true;
        return 'x';
      }),
    ).rejects.toThrow('timed out after 1 ms');
    expect(started).toBe(false);
  });

  test('the message names the budget in force, not the one requested', async () => {
    // The requested `Infinity` was replaced by the fallback, and an operator reading the
    // `errors[]` entry must see the number that actually bounded the read.
    const within = deadline(Number.POSITIVE_INFINITY, 5);
    await expect(within(() => new Promise((r) => setTimeout(r, 500)))).rejects.toThrow(
      'timed out after 5 ms',
    );
  });
});

describe('the budget is shared across operations, not granted per operation', () => {
  test('three 30 ms operations do not each get the whole 50 ms', async () => {
    const within = deadline(50, FALLBACK);
    const slow = (): Promise<string> => new Promise((r) => setTimeout(() => r('ok'), 30));
    const results: string[] = [];
    for (let i = 0; i < 3; i += 1) {
      try {
        results.push(await within(slow));
      } catch {
        results.push('timeout');
      }
    }
    expect(results).toContain('ok');
    expect(results).toContain('timeout');
  });

  test('an operation that finishes in time resolves with its own value', async () => {
    const within = deadline(500, FALLBACK);
    await expect(within(async () => 42)).resolves.toBe(42);
  });

  test('an operation that rejects in time keeps its own rejection', async () => {
    const within = deadline(500, FALLBACK);
    await expect(within(async () => Promise.reject(new Error('EIO')))).rejects.toThrow('EIO');
  });

  test('a non-Error rejection is still an Error by the time it leaves', async () => {
    // Every wrapper above this catches and calls `reason(e)`, which expects an Error or a
    // string. Normalising here keeps `errors[]` messages from reading `unknown failure`.
    const within = deadline(500, FALLBACK);
    await expect(within(async () => Promise.reject('a string'))).rejects.toThrow('a string');
  });
});

describe('⚠ an abandoned operation is subscribed to, never unhandled', () => {
  test('its late rejection does not reach process.on(unhandledRejection)', async () => {
    // A bare `Promise.race` leaves the loser unsubscribed. On a per-request route that is a
    // process-level crash, not a lost reading.
    const seen: unknown[] = [];
    const onUnhandled = (e: unknown): void => {
      seen.push(e);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const within = deadline(5, FALLBACK);
      await expect(
        within(
          () =>
            new Promise((_resolve, reject) => {
              setTimeout(() => reject(new Error('the EC finally gave up')), 40);
            }),
        ),
      ).rejects.toThrow('timed out');
      await new Promise((r) => setTimeout(r, 90));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(seen).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// boundedReader — the hwmon-shaped adapter
// ---------------------------------------------------------------------------

describe('boundedReader wraps both reader methods and nothing else', () => {
  const reader = (delayMs: number): HwmonReader => ({
    readFile: async (path) => {
      await new Promise((r) => setTimeout(r, delayMs));
      return `contents of ${path}`;
    },
    readDir: async () => {
      await new Promise((r) => setTimeout(r, delayMs));
      return ['a', 'b'];
    },
  });

  test('both methods pass through when the budget is not spent', async () => {
    const bounded = boundedReader(reader(1), deadline(500, FALLBACK));
    await expect(bounded.readFile('/sys/x')).resolves.toBe('contents of /sys/x');
    await expect(bounded.readDir('/sys')).resolves.toEqual(['a', 'b']);
  });

  test('both methods are bounded — neither is left unwrapped', async () => {
    // The failure this catches is wrapping one and forgetting the other, which leaves the
    // walk's directory listing unbounded while the file reads look protected.
    const bounded = boundedReader(reader(500), deadline(10, FALLBACK));
    await expect(bounded.readFile('/sys/x')).rejects.toThrow('timed out after 10 ms');
    await expect(bounded.readDir('/sys')).rejects.toThrow('timed out after 10 ms');
  });

  test('the path reaches the underlying reader unchanged', async () => {
    const seen: string[] = [];
    const bounded = boundedReader(
      {
        readFile: async (path) => {
          seen.push(path);
          return '';
        },
        readDir: async (path) => {
          seen.push(path);
          return [];
        },
      },
      deadline(500, FALLBACK),
    );
    await bounded.readFile('/host/sys/class/hwmon/hwmon3/pwm5');
    await bounded.readDir('/host/sys/class/hwmon');
    expect(seen).toEqual(['/host/sys/class/hwmon/hwmon3/pwm5', '/host/sys/class/hwmon']);
  });
});

// ---------------------------------------------------------------------------
// The latch — found by step 5 as an intermittent failure of a step-4 test
// ---------------------------------------------------------------------------

describe('once the budget has expired ONCE it stays expired', () => {
  /*
   * ⚠ The two clocks in this module are not the same clock.
   *
   * `setTimeout` counts on libuv's cached, millisecond-resolution `uv_now`; the arithmetic
   * reads `performance.now()`, which is finer and advances continuously. They can disagree
   * by a fraction of a millisecond, so the timer can fire *marginally before* `deadlineAt`
   * — and the very next `left = deadlineAt - performance.now()` is then a hair ABOVE zero,
   * so the next operation starts, and a fast one finishes.
   *
   * That is not hypothetical. It showed up as an intermittent failure of step 4's
   * "⚠ a wedged read in the FIRST position salvages nothing" — measured at 2 runs in 8 —
   * where four fan channels came back with real RPM values *after* the first read had
   * already timed out. Five figures the COOLING panel would show as live readings taken
   * past a budget it had already declared spent.
   *
   * The fake timers below reproduce it deterministically: `setTimeout` is faked and
   * `performance.now()` is left real, so advancing the timer fires the deadline while the
   * clock still says there is budget remaining. That is exactly the skew, made reliable.
   */
  test('⚠ a timer that fires marginally early does not leave a usable sliver of budget', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const within = deadline(1000, FALLBACK);
      const started: string[] = [];

      const first = within(() => {
        started.push('first');
        return new Promise<string>(() => undefined); // never settles
      });
      const firstOutcome = first.then(
        () => 'resolved',
        (e: unknown) => (e instanceof Error ? e.message : 'rejected'),
      );
      // Fire the deadline while `performance.now()` has barely moved — so the arithmetic
      // still believes almost the whole 1000 ms budget is left.
      vi.advanceTimersByTime(1000);
      expect(await firstOutcome).toContain('timed out');

      const second = await within(() => {
        started.push('second');
        return Promise.resolve('a reading taken after the budget was spent');
      }).then(
        (value) => value,
        (e: unknown) => (e instanceof Error ? e.message : 'rejected'),
      );

      expect(second).toContain('timed out');
      // ⚠ "…rejected **without being started**", which is what the module's doc promises.
      expect(started).toEqual(['first']);
    } finally {
      vi.useRealTimers();
    }
  });

  test('a budget that has not expired still admits operations', async () => {
    // The other side of the boundary: the latch must not close early.
    const within = deadline(1000, FALLBACK);
    expect(await within(() => Promise.resolve('one'))).toBe('one');
    expect(await within(() => Promise.resolve('two'))).toBe('two');
  });
});
