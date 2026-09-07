/**
 * §6.2's mode, and §6.7's rule that `stale` is a function of the newest reading's **age**.
 *
 * The table below is built at the boundary the rule actually turns on — three cadences, with
 * the 10 s floor underneath — because a table of typical values would pass against the
 * implementation this replaced, which asked only whether a poll had failed.
 */

import { describe, expect, test } from 'vitest';

import type { ModeInput } from './mode';
import { MIN_STALE_AGE_MS, isStale, modeOf, staleAfterMs } from './mode';

const LIVE: ModeInput = {
  expired: false,
  paused: false,
  consecutiveFailures: 0,
  ageMs: 0,
  cadenceMs: 5_000,
};

describe('the threshold', () => {
  test.each([
    [1_000, MIN_STALE_AGE_MS],
    [2_000, MIN_STALE_AGE_MS],
    [5_000, 15_000],
    [10_000, 30_000],
    [30_000, 90_000],
  ])('at a %d ms cadence a reading is stale after %d ms', (cadenceMs, expected) => {
    expect(staleAfterMs(cadenceMs)).toBe(expected);
  });

  /*
   * ⚠ The floor is not decoration. At 1 s three cadences is 3 s, and §6.7 blesses a poll that
   * takes 6 s against a 5 s cadence — so without it a perfectly healthy fast dashboard would
   * flicker into `stale` on any poll that ran long. Ten seconds is §6.4's own hold, so the two
   * thresholds cannot disagree about what "a moment" is.
   */
  test('⚠ the floor is what stops a healthy 1 s dashboard flickering stale', () => {
    expect(staleAfterMs(1_000)).toBe(10_000);
    expect(isStale({ ...LIVE, cadenceMs: 1_000, ageMs: 6_000 })).toBe(false);
    expect(isStale({ ...LIVE, cadenceMs: 1_000, ageMs: 10_001 })).toBe(true);
  });
});

describe('⚠ what makes a dashboard stale', () => {
  test('a failed poll, as it always did', () => {
    expect(modeOf({ ...LIVE, consecutiveFailures: 1 })).toBe('stale');
  });

  test('both sides of the age boundary', () => {
    expect(modeOf({ ...LIVE, ageMs: 15_000 })).toBe('live');
    expect(modeOf({ ...LIVE, ageMs: 15_001 })).toBe('stale');
  });

  /*
   * ⚠ **F4.** §6.7's `ts` dedupe is correct and is not weakened: a repeat is dropped and is
   * not a failed poll. What §6.7 had no rule for was a **run** of repeats. §4's cache bounds
   * one at two or three at the 1 s cadence; a server whose wall clock steps backwards produces
   * an unbounded one, and every snapshot in it is a *different* reading wearing a timestamp
   * the client already holds. Measured before this: thirty polls, thirty correct answers,
   * nothing on screen, `consecutiveFailures` zero throughout, dot green.
   */
  test('⚠ a run of repeats no failure counter can see — the age says it instead', () => {
    // The failure counter is 0 for every one of these, which is exactly the problem.
    expect(modeOf({ ...LIVE, ageMs: 3_000 })).toBe('live');
    expect(modeOf({ ...LIVE, ageMs: 30_000 })).toBe('stale');
  });

  /*
   * ⚠ **F11's damaging half.** A `ts` ahead of the browser's clock is skew, and skew is not
   * currency. One signal covers it, the backwards step and the silent server alike.
   */
  test('⚠ a ts ahead of the browser’s clock is not live', () => {
    expect(modeOf({ ...LIVE, ageMs: -1 })).toBe('stale');
    expect(modeOf({ ...LIVE, ageMs: -2_370_908_800_000 })).toBe('stale');
  });

  /*
   * ⚠ Before the first sample there is no reading to be old. §6.7's "first sample" rules
   * already describe that state, and a page that opened as `stale` would be lying about a poll
   * that has not come back yet.
   */
  test('⚠ no sample yet is live, not stale', () => {
    expect(modeOf({ ...LIVE, ageMs: null })).toBe('live');
    expect(isStale({ ...LIVE, ageMs: null })).toBe(false);
  });
});

describe('precedence', () => {
  test('expired wins over everything, because the browser is leaving', () => {
    expect(
      modeOf({ ...LIVE, expired: true, paused: true, consecutiveFailures: 9, ageMs: 1e9 }),
    ).toBe('expired');
  });

  /*
   * ⚠ An operator who paused knows why the reading is old; `stale` would hide the mode they
   * chose. §6.2 shows the mode alongside the aggregate, never instead of it — so nothing here
   * touches a severity, and the count is unaffected either way.
   */
  test('⚠ paused outranks stale, so the operator’s own choice is what they are told', () => {
    expect(modeOf({ ...LIVE, paused: true, ageMs: 1e9 })).toBe('paused');
    expect(modeOf({ ...LIVE, paused: true, consecutiveFailures: 3 })).toBe('paused');
  });

  test('a healthy poll on a current reading is live', () => {
    expect(modeOf(LIVE)).toBe('live');
  });
});
