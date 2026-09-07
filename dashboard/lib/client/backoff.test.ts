/**
 * §6.7's backoff: **1×, 2×, 4× the cadence, capped at 30 s**, and recovery resets it.
 *
 * The reset is the runtime's — it zeroes the counter — so what is tested here is the shape of
 * the sequence and the two boundaries of the cap. §5.1's fixture symmetry applies to the cap:
 * the fixtures below straddle it at every cadence where it bites.
 */

import { describe, expect, test } from 'vitest';

import { BACKOFF_CAP_MS, backoffDelayMs } from './backoff';
import { CADENCE_SECONDS, cadenceMs } from './prefs';

describe('§6.7’s sequence', () => {
  test('⚠ zero failures is the cadence itself, so a healthy poll is not backed off', () => {
    for (const seconds of CADENCE_SECONDS) {
      expect(backoffDelayMs(cadenceMs(seconds), 0)).toBe(Math.min(seconds * 1000, BACKOFF_CAP_MS));
    }
  });

  /*
   * ⚠ §6.7's three multipliers, at the default cadence, in order. The first failure waits one
   * cadence — **not** two: a server that missed one poll is far more likely to answer the next
   * than to need a doubled wait, and §6.7 writes `1×` first for that reason.
   */
  test('⚠ the first three failures wait 1×, 2× and 4× the cadence', () => {
    const cadence = cadenceMs(5);
    expect(backoffDelayMs(cadence, 1)).toBe(5_000);
    expect(backoffDelayMs(cadence, 2)).toBe(10_000);
    expect(backoffDelayMs(cadence, 3)).toBe(20_000);
  });

  test('the sequence keeps doubling until it reaches the cap', () => {
    const cadence = cadenceMs(1);
    expect([1, 2, 3, 4, 5, 6, 7].map((n) => backoffDelayMs(cadence, n))).toEqual([
      1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000,
    ]);
  });
});

describe('⚠ the 30 s cap', () => {
  test('⚠ the cap is 30 s', () => {
    expect(BACKOFF_CAP_MS).toBe(30_000);
  });

  /*
   * §5.1: a boundary needs a fixture on **both** sides. At the 10 s cadence the third failure
   * would be 40 s uncapped and the second is 20 s — one over, one under, and they differ at a
   * panel: 40 s of silence on a 5 s dashboard is a visibly dead page.
   */
  test('⚠ a delay that would exceed 30 s is clamped, and one below it is not', () => {
    const cadence = cadenceMs(10);
    expect(backoffDelayMs(cadence, 2)).toBe(20_000);
    expect(backoffDelayMs(cadence, 3)).toBe(30_000);
  });

  test('⚠ every delay this project can produce is inside setTimeout’s safe range', () => {
    // HANDOVER: "`setTimeout` clamps a delay outside the 32-bit signed range to 1 ms, and
    // `NaN` the same way." A backoff that overflowed would poll a dead server every
    // millisecond — the opposite of what a backoff is for.
    for (const seconds of CADENCE_SECONDS) {
      for (const failures of [0, 1, 2, 3, 8, 64, 4096, Number.MAX_SAFE_INTEGER]) {
        const delay = backoffDelayMs(cadenceMs(seconds), failures);
        expect(Number.isFinite(delay)).toBe(true);
        expect(delay).toBeGreaterThanOrEqual(1000);
        expect(delay).toBeLessThanOrEqual(BACKOFF_CAP_MS);
      }
    }
  });

  test('the slowest cadence is already at the cap, so backing off cannot slow it further', () => {
    expect(backoffDelayMs(cadenceMs(30), 0)).toBe(30_000);
    expect(backoffDelayMs(cadenceMs(30), 5)).toBe(30_000);
  });
});
