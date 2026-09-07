/**
 * §6.7's un-sampled spans — the rule that a gap closes when a **reason** goes away, not when
 * a **sample** arrives.
 *
 * These were end-to-end runtime fixtures before the extraction, which is why the defect they
 * pin survived a suite of nine hidden-tab tests: the only fixture that hid the tab did it with
 * **no poll in flight**, so `closeGap` never ran during the gap and the erasure could not
 * happen. Here the three inputs — the gap list, the sample's `ts`, and what the client was
 * doing — are arguments, so "a reading that lands inside a gap" is a table row rather than a
 * timing accident nobody thought to arrange.
 */

import { describe, expect, test } from 'vitest';

import type { Gap, SamplingState } from './gaps';
import { anyGapReason, gapIsOpen, observeSample, openGap } from './gaps';

/** A round base so a `fromMs`/`toMs` mix-up reads as an obvious wrong number. */
const T = (seconds: number): number => 1_000_000 + seconds * 1000;

const SAMPLING: SamplingState = { hidden: false, paused: false, consecutiveFailures: 0 };
const HIDDEN: SamplingState = { ...SAMPLING, hidden: true };
const PAUSED: SamplingState = { ...SAMPLING, paused: true };
const FAILING: SamplingState = { ...SAMPLING, consecutiveFailures: 2 };

const HORIZON = T(0) - 7_200_000;

describe('which reasons hold a gap open', () => {
  test('none of them, while the client is sampling', () => {
    expect(anyGapReason(SAMPLING)).toBeNull();
  });

  test.each([
    [HIDDEN, 'hidden'],
    [PAUSED, 'paused'],
    [FAILING, 'failed'],
  ] as const)('%o is %s', (state, reason) => {
    expect(anyGapReason(state)).toBe(reason);
  });

  /*
   * ⚠ The seam neither earlier phase reached, and the reason this is a predicate over **all**
   * three rather than a memory of the one that opened the gap: `pause()` → hide → `resume()`
   * leaves a gap whose recorded `reason` is `paused` while the reason actually in force is
   * `hidden`. A rule phrased as "the reason that opened it" closes that gap on resume, on a
   * tab that is still hidden, and the hour that follows is drawn as measured ground.
   */
  test('⚠ a second reason keeps it open after the first goes away', () => {
    const pausedAndHidden: SamplingState = { ...SAMPLING, paused: true, hidden: true };
    expect(anyGapReason(pausedAndHidden)).not.toBeNull();
    // The operator resumes; the tab is still hidden.
    expect(anyGapReason({ ...pausedAndHidden, paused: false })).toBe('hidden');
  });
});

describe('opening a gap', () => {
  test('it starts at the last reading’s ts, not at the instant polling stopped', () => {
    expect(openGap([], 'hidden', T(10))).toEqual([{ fromMs: T(10), toMs: null, reason: 'hidden' }]);
  });

  test('a second reason does not open a second gap', () => {
    const one = openGap([], 'paused', T(10));
    expect(openGap(one, 'hidden', T(20))).toBe(one);
  });

  test('a closed gap does not stop a new one opening', () => {
    const closed: Gap[] = [{ fromMs: T(0), toMs: T(5), reason: 'failed' }];
    expect(openGap(closed, 'hidden', T(10))).toHaveLength(2);
  });

  /*
   * ⚠ A gap endpoint is a server `ts` (§6.7), and before the first sample there is no `ts` to
   * use — the previous implementation fell back to the browser's clock, which put one number
   * from each of the two clocks §6.7 keeps apart into the same list. There is also nothing
   * drawn yet for a hatch to meet.
   */
  test('⚠ no gap is opened before the first accepted sample', () => {
    expect(openGap([], 'hidden', null)).toEqual([]);
  });
});

describe('⚠ a sample closes a gap only when no reason is still in force', () => {
  const openHidden: Gap[] = [{ fromMs: T(0), toMs: null, reason: 'hidden' }];

  test('it closes at the sample’s own ts, not at its arrival time', () => {
    expect(observeSample(openHidden, T(300), SAMPLING, HORIZON)).toEqual([
      { fromMs: T(0), toMs: T(300), reason: 'hidden' },
    ]);
  });

  /*
   * ⚠ **F1.** A poll already in flight when the tab is hidden lands *after* the gap opens.
   * §6.7 blesses a poll that outlives its cadence — `collectServing`'s worst case is 6 s
   * against a 5 s default — so a poll is in flight for a large fraction of every cadence, and
   * most often exactly when somebody backgrounds a slow-looking dashboard. Closed here, an
   * hour of hidden time is recorded as the five seconds before that poll landed.
   */
  test('⚠ a poll landing after the tab went hidden does not close the gap', () => {
    expect(observeSample(openHidden, T(5), HIDDEN, HORIZON)).toEqual([
      { fromMs: T(0), toMs: null, reason: 'hidden' },
    ]);
  });

  /* ⚠ **F2**, first half: the same mechanism, reached by the operator pausing instead. */
  test('⚠ a poll landing after the operator paused does not close the gap', () => {
    const openPaused: Gap[] = [{ fromMs: T(0), toMs: null, reason: 'paused' }];
    expect(observeSample(openPaused, T(5), PAUSED, HORIZON)).toEqual([
      { fromMs: T(0), toMs: null, reason: 'paused' },
    ]);
  });

  /* ⚠ **F2**, second half: *refresh now* while paused is a real, blessed operator action. */
  test('⚠ a refresh taken while paused lands inside the gap and does not split it', () => {
    const openPaused: Gap[] = [{ fromMs: T(0), toMs: null, reason: 'paused' }];
    const after = observeSample(openPaused, T(60), PAUSED, HORIZON);
    expect(after).toHaveLength(1);
    expect(after[0]?.toMs).toBeNull();
  });

  test('a reading taken while a failed run is still counted does not close the gap', () => {
    expect(observeSample(openHidden, T(5), FAILING, HORIZON)[0]?.toMs).toBeNull();
  });

  test('with no gap open a sample changes nothing, by identity', () => {
    const closed: Gap[] = [{ fromMs: T(0), toMs: T(5), reason: 'failed' }];
    expect(observeSample(closed, T(10), SAMPLING, HORIZON)).toBe(closed);
    expect(observeSample([], T(10), SAMPLING, HORIZON)).toEqual([]);
  });
});

describe('pruning', () => {
  /*
   * ⚠ The horizon is a server `ts`, like both endpoints. Anchored on the browser's clock, a
   * server two hours behind prunes **every** closed gap on the first successful poll and all
   * the hatching disappears at once — a chart that silently claims it measured ground it did
   * not. This test hands the horizon in, so the mixing cannot happen here at all; `runtime.ts`
   * is where the right number is chosen.
   */
  test('⚠ a closed gap older than the horizon is dropped, and an open one never is', () => {
    const gaps: Gap[] = [
      { fromMs: T(-10_000), toMs: T(-9_000), reason: 'failed' },
      { fromMs: T(0), toMs: null, reason: 'hidden' },
    ];
    const after = observeSample(gaps, T(1), HIDDEN, T(-100));
    expect(after).toEqual([{ fromMs: T(0), toMs: null, reason: 'hidden' }]);
  });

  test('a gap exactly on the horizon is kept', () => {
    const gaps: Gap[] = [{ fromMs: T(-10), toMs: T(-5), reason: 'failed' }];
    expect(observeSample(gaps, T(0), HIDDEN, T(-5))).toEqual(gaps);
  });
});

describe('gapIsOpen', () => {
  test('says whether the client was sampling immediately before a reading', () => {
    expect(gapIsOpen([])).toBe(false);
    expect(gapIsOpen([{ fromMs: T(0), toMs: T(5), reason: 'failed' }])).toBe(false);
    expect(gapIsOpen([{ fromMs: T(0), toMs: null, reason: 'failed' }])).toBe(true);
  });

  /*
   * ⚠ Every other fixture in this file holds **at most one** gap, and in a one-element list
   * `at(-1)` and `at(0)` are the same element — so nothing here could tell the newest gap from
   * the first one the session opened. A session that hides twice holds two, and reading the
   * first one makes `openGap` believe nothing is open: it appends a second gap over a live one,
   * and from then on `gapIsOpen` answers about a span that closed hours ago. Both things that
   * consult it — the hatch, and `afterGap`'s restart of §6.4's pending runs — are then wrong in
   * the reassuring direction.
   */
  test('⚠ it reads the NEWEST gap, not the first one the session opened', () => {
    const closedThenOpen: readonly Gap[] = [
      { fromMs: T(0), toMs: T(5), reason: 'hidden' },
      { fromMs: T(10), toMs: null, reason: 'paused' },
    ];
    expect(gapIsOpen(closedThenOpen)).toBe(true);
    // …and in the other direction, so the assertion is not satisfied by always answering true.
    expect(
      gapIsOpen([
        { fromMs: T(0), toMs: null, reason: 'hidden' },
        { fromMs: T(10), toMs: T(15), reason: 'paused' },
      ]),
    ).toBe(false);
    // `openGap` is the caller that matters: a second gap must never open over an open one.
    expect(openGap(closedThenOpen, 'failed', T(20))).toBe(closedThenOpen);
  });
});
