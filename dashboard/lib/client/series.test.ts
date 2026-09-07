/**
 * §6.7's decimation, and the one property the whole thing exists for: **a one-sample spike
 * survives**.
 *
 * §6.7: "A thermal spike that vanishes because of rendering is a lie." So the central fixture
 * is §6.7's own worst case — 2 h at 1 s = 7200 points — with a single excursion in it,
 * decimated to 600, and the assertion is on the spike's **exact timestamp and value**. Two
 * near-misses are asserted alongside it, because they are what a plausible wrong
 * implementation produces: averaging the bucket, and taking every n-th point.
 */

import { describe, expect, test } from 'vitest';

import { MAX_RENDERED_POINTS, decimateSeries, seriesFrom, traceFor } from './series';
import type { SeriesPoint } from './series';
import { EMPTY_CONDITION_STATE } from '../conditions';
import { everythingZero } from '../fixtures';
import type { Gpu, TelemetrySnapshot } from '../types';
import { celsius, isoTimestamp } from '../types';
import { startEventLog } from './events';
import type { WindowMinutes } from './prefs';
import { DEFAULT_CADENCE_SECONDS } from './prefs';
import type { Sample, SampleRing } from './ring';
import { EMPTY_RING, appendSample } from './ring';
import type { RuntimeState } from './runtime';
import type { WireSnapshot } from './wire';

const ramp = (count: number, value: (i: number) => number | null): SeriesPoint[] =>
  Array.from({ length: count }, (_unused, i) => ({ tMs: i * 1000, v: value(i) }));

describe('the threshold', () => {
  /*
   * §5.1: a boundary needs a fixture on both sides, and these two differ at a panel — 600
   * points are the samples themselves, 601 have been resampled.
   */
  test('⚠ 600 points render as they are; 601 are decimated', () => {
    const exact = ramp(600, (i) => i);
    expect(decimateSeries(exact)).toBe(exact);

    const over = ramp(601, (i) => i);
    expect(decimateSeries(over)).not.toBe(over);
    expect(decimateSeries(over).length).toBeLessThanOrEqual(MAX_RENDERED_POINTS);
  });

  test('⚠ §6.7’s threshold is 600 rendered points', () => {
    expect(MAX_RENDERED_POINTS).toBe(600);
  });

  test('⚠ the result never exceeds the cap, at any input size', () => {
    for (const n of [601, 1000, 3600, 7200, 8192]) {
      expect(decimateSeries(ramp(n, (i) => Math.sin(i))).length).toBeLessThanOrEqual(600);
    }
  });
});

describe('⚠ §6.7: a one-sample spike survives rather than being averaged away', () => {
  const SPIKE_AT = 4321;
  const spiky = ramp(7200, (i) => (i === SPIKE_AT ? 92 : 60));

  /*
   * ⚠ The whole reason §6.7 names min/max decimation. 7200 points is two hours at 1 s —
   * §6.7's own worst case — and one of them is 32 °C above the rest. Asserted on `tMs` **and**
   * `v`: a spike drawn at the wrong instant is a different lie from a spike averaged away, and
   * an implementation that emitted a bucket midpoint would pass a value-only assertion.
   */
  test('⚠ the spike is emitted with its own timestamp and its own value', () => {
    const drawn = decimateSeries(spiky);
    expect(drawn).toContainEqual({ tMs: SPIKE_AT * 1000, v: 92 });
  });

  test('⚠ a one-sample dip survives too, because the bucket keeps its minimum', () => {
    const dippy = ramp(7200, (i) => (i === SPIKE_AT ? 3 : 60));
    expect(decimateSeries(dippy)).toContainEqual({ tMs: SPIKE_AT * 1000, v: 3 });
  });

  test('⚠ averaging the bucket would have lost it — the mean of that bucket is not 92', () => {
    const drawn = decimateSeries(spiky);
    const bucket = spiky.slice(4320, 4344).map((p) => p.v ?? 0);
    const mean = bucket.reduce((a, b) => a + b, 0) / bucket.length;
    expect(mean).toBeLessThan(92);
    expect(drawn.some((p) => p.v === 92)).toBe(true);
  });

  test('⚠ sampling every n-th point would have lost it — 4321 is not on the 12× grid', () => {
    // The naive alternative keeps index 0, 12, 24 … at this ratio. 4321 is not among them, so
    // an implementation that "took every 12th sample" would draw a flat 60 °C line through a
    // 92 °C excursion — and would do it intermittently, depending on where the spike landed.
    expect(SPIKE_AT % 12).not.toBe(0);
    expect(decimateSeries(spiky).some((p) => p.v === 92)).toBe(true);
  });

  test('the emitted points stay in time order', () => {
    const drawn = decimateSeries(ramp(7200, (i) => Math.sin(i / 7) * 40 + 60));
    for (let i = 1; i < drawn.length; i += 1) {
      expect(drawn[i]?.tMs).toBeGreaterThanOrEqual(drawn[i - 1]?.tMs ?? 0);
    }
  });

  test('the extremes of the whole series are among the emitted points', () => {
    const wave = ramp(5000, (i) => (i === 10 ? -5 : i === 4990 ? 105 : 50));
    const drawn = decimateSeries(wave);
    expect(drawn).toContainEqual({ tMs: 10_000, v: -5 });
    expect(drawn).toContainEqual({ tMs: 4_990_000, v: 105 });
  });
});

describe('⚠ null is not a value, and an absent stretch stays absent', () => {
  test('⚠ a bucket with no reading at all emits a null point rather than closing the gap', () => {
    // 7200 points where a contiguous fifth of the series was never read: whole buckets are
    // empty, and each emits a `null` so the renderer cannot draw a line across ground nobody
    // measured (§6.7: "it must not be interpolated across").
    const holed = ramp(7200, (i) => (i >= 2000 && i < 3400 ? null : 60));
    const drawn = decimateSeries(holed);
    const nulls = drawn.filter((p) => p.v === null);
    expect(nulls.length).toBeGreaterThan(0);
    for (const point of nulls) {
      expect(point.tMs / 1000).toBeGreaterThanOrEqual(2000);
      expect(point.tMs / 1000).toBeLessThan(3400);
    }
  });

  test('⚠ a null is never rendered as zero, which invariant 1 forbids everywhere', () => {
    const holed = ramp(7200, (i) => (i >= 100 && i < 5000 ? null : 60));
    expect(decimateSeries(holed).some((p) => p.v === 0)).toBe(false);
  });

  test('a bucket that has one reading among nulls keeps the reading', () => {
    const sparse = ramp(1200, (i) => (i === 700 ? 88 : null));
    expect(decimateSeries(sparse)).toContainEqual({ tMs: 700_000, v: 88 });
  });

  test('an all-null series decimates to nulls, not to an empty chart', () => {
    const drawn = decimateSeries(ramp(2000, () => null));
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.every((p) => p.v === null)).toBe(true);
  });
});

describe('seriesFrom projects one reading per sample', () => {
  const card = everythingZero.gpus?.[0];
  if (card === undefined) throw new Error('the everythingZero fixture lost its GPU');

  const sampleAt = (secondsPastTheHour: number, tempC: number | null): Sample => {
    const ms = Date.UTC(2026, 8, 6, 14, 0, 0, 0) + secondsPastTheHour * 1000;
    const ts = isoTimestamp(new Date(ms).toISOString());
    const gpus: Gpu[] | null = tempC === null ? null : [{ ...card, tempC: celsius(tempC) }];
    return { ts, tsMs: ms, snapshot: { ...everythingZero, ts, gpus } };
  };

  test('⚠ the point carries the sample’s own ts, so the axis is time and not index', () => {
    const points = seriesFrom(
      [sampleAt(0, 60), sampleAt(30, 61), sampleAt(31, 62)],
      (snapshot) => snapshot.gpus?.[0]?.tempC ?? null,
    );
    expect(points.map((p) => p.tMs - points[0]!.tMs)).toEqual([0, 30_000, 31_000]);
    expect(points.map((p) => p.v)).toEqual([60, 61, 62]);
  });

  test('⚠ a card that did not enumerate yields null, never 0', () => {
    const points = seriesFrom([sampleAt(0, null)], (snapshot) => snapshot.gpus?.[0]?.tempC ?? null);
    expect(points).toEqual([{ tMs: points[0]?.tMs, v: null }]);
  });
});

// --------------------------------------------------------------------------- traceFor
//
// §6.2's trace as a panel gets it. The fixtures below build a real ring with `appendSample`
// rather than a literal, because the property under test is a **composition** — the window,
// the projection and the decimation over one another — and a hand-built ring would let the
// test agree with an implementation that never asked the ring anything.

const BASE_MS = Date.UTC(2026, 8, 6, 14, 0, 0, 0);

const gpuCard = everythingZero.gpus?.[0];
if (gpuCard === undefined) throw new Error('the everythingZero fixture lost its GPU');

const wireAt = (offsetMs: number, tempC: number | null): WireSnapshot => {
  const ms = BASE_MS + offsetMs;
  const ts = isoTimestamp(new Date(ms).toISOString());
  const gpus: Gpu[] | null = tempC === null ? null : [{ ...gpuCard, tempC: celsius(tempC) }];
  return { snapshot: { ...everythingZero, ts, gpus }, tsMs: ms };
};

/** `count` samples one second apart, the i-th carrying `temp(i)` on card 0. */
const ringOf = (count: number, temp: (i: number) => number | null): SampleRing => {
  let ring = EMPTY_RING;
  for (let i = 0; i < count; i += 1) ring = appendSample(ring, wireAt(i * 1000, temp(i)));
  return ring;
};

/** A ring whose samples sit at the exact offsets given, so a boundary can be placed by hand. */
const ringAtOffsets = (offsetsMs: readonly number[]): SampleRing => {
  let ring = EMPTY_RING;
  for (const offset of offsetsMs) ring = appendSample(ring, wireAt(offset, 60));
  return ring;
};

/**
 * A `RuntimeState` carrying nothing but the two fields `traceFor` reads.
 *
 * The other eleven are the runtime's own defaults. Written as a whole `RuntimeState` rather
 * than a structural subset deliberately: the parameter is the state a panel actually holds,
 * so a field added to it has to be confronted here rather than silently satisfied.
 */
const stateOf = (ring: SampleRing, windowMinutes: WindowMinutes): RuntimeState => ({
  preferences: { cadenceSeconds: DEFAULT_CADENCE_SECONDS, windowMinutes },
  ring,
  conditions: EMPTY_CONDITION_STATE,
  displayed: [],
  events: startEventLog(BASE_MS),
  gaps: [],
  paused: false,
  hidden: false,
  consecutiveFailures: 0,
  lastFailure: null,
  mode: 'live',
  severity: null,
  alarms: 0,
  unknownStanding: [],
});

const gpu0TempC = (snapshot: TelemetrySnapshot): number | null =>
  snapshot.gpus?.[0]?.tempC ?? null;

describe('⚠ traceFor: window, then pick, then decimate — in that order', () => {
  // §6.7's worst case: two hours at 1 s. The ramp gives every bucket a distinct min and max,
  // so a correctly decimated series is exactly 600 points rather than 300.
  const twoHours = ringOf(7200, (i) => i);
  const THIRTY_MIN_MS = 30 * 60_000;

  /*
   * ⚠ **The property this whole wrapper exists for.** Both orders type-check, both return
   * points, and both draw a curve — so the only thing that can tell them apart is the
   * *resolution inside the window*, and this test measures it directly. Window-then-decimate
   * spends all 600 points on the 1801 samples the chart actually draws. Decimate-then-window
   * spends them across the whole 7200-sample ring and then throws away the three quarters
   * that fall outside, leaving ~150 — a chart at a quarter of its entitled resolution, which
   * is subtly wrong rather than obviously broken.
   *
   * The wrong order is computed in the test rather than described in a comment, so the
   * number this is defending against is a measured one.
   */
  test('⚠ the window is applied before the decimation, so the budget buys drawn points', () => {
    const drawn = traceFor(stateOf(twoHours, 30), gpu0TempC);
    expect(drawn).toHaveLength(MAX_RENDERED_POINTS);

    const newestMs = twoHours.newest?.tsMs ?? 0;
    const from = newestMs - THIRTY_MIN_MS;
    const wrongOrder = decimateSeries(seriesFrom(twoHours.samples, gpu0TempC)).filter(
      (point) => point.tMs >= from,
    );
    expect(wrongOrder.length).toBeLessThan(200);
    expect(drawn.length).toBeGreaterThan(wrongOrder.length * 3);
  });

  /*
   * ⚠ The same failure said in the units a reader cares about: how far apart are two drawn
   * points. Window-first leaves ~6 s between them at this cadence; decimate-first leaves
   * ~24 s, and a 24 s bucket on a 30-minute axis absorbs excursions the chart was asked to
   * show.
   */
  test('⚠ decimate-before-window would quadruple the gap between drawn points', () => {
    const drawn = traceFor(stateOf(twoHours, 30), gpu0TempC);
    let widest = 0;
    for (let i = 1; i < drawn.length; i += 1) {
      widest = Math.max(widest, (drawn[i]?.tMs ?? 0) - (drawn[i - 1]?.tMs ?? 0));
    }
    expect(widest).toBeLessThanOrEqual(12_000);
  });

  /*
   * ⚠ A local excursion that survives the right order and vanishes under the wrong one — the
   * "subtly wrong rather than obviously broken" failure, as a single reading. 70 °C is the
   * largest value in its 6-sample bucket once the window has been applied, so it is drawn;
   * decimating the whole ring first puts it in a 24-sample bucket that also holds a 90 °C
   * sample, which takes the bucket's maximum and leaves the 70 undrawn.
   */
  test('⚠ an excursion inside the window is drawn, where the wrong order absorbs it', () => {
    const ring = ringOf(7200, (i) => (i === 7000 ? 70 : i === 7004 ? 90 : 60));
    const state = stateOf(ring, 30);
    const drawn = traceFor(state, gpu0TempC);
    expect(drawn).toContainEqual({ tMs: BASE_MS + 7_000_000, v: 70 });

    const from = (ring.newest?.tsMs ?? 0) - THIRTY_MIN_MS;
    const wrongOrder = decimateSeries(seriesFrom(ring.samples, gpu0TempC)).filter(
      (point) => point.tMs >= from,
    );
    expect(wrongOrder).not.toContainEqual({ tMs: BASE_MS + 7_000_000, v: 70 });
  });

  /*
   * ⚠ §6.2's selector is the only source of the width. `traceFor` takes no window parameter,
   * so this is the whole of what makes one chart 10 minutes wide and another two hours.
   */
  test('⚠ the width comes from the preferences, and nothing outside it is drawn', () => {
    const newestMs = twoHours.newest?.tsMs ?? 0;
    for (const minutes of [10, 30, 120] as const) {
      const drawn = traceFor(stateOf(twoHours, minutes), gpu0TempC);
      const oldest = drawn[0]?.tMs ?? 0;
      expect(newestMs - oldest).toBeLessThanOrEqual(minutes * 60_000);
      expect(drawn.every((point) => point.tMs >= newestMs - minutes * 60_000)).toBe(true);
      // The 10-minute chart must not be showing the 30-minute default's oldest sample.
      expect(oldest).toBe(newestMs - Math.min(minutes * 60_000, 7_199_000));
    }
  });

  /*
   * ⚠ §5.1, at the window's own boundary and at a panel: the sample exactly `windowMs` old is
   * inside the chart, and the one a single millisecond older is not. Inherited from
   * `samplesWithin`, and asserted here because `traceFor` is what a panel calls.
   */
  test('⚠ the boundary sample is in the window and one millisecond older is not', () => {
    // Newest at +600_001 ms, so a 10-minute window opens at exactly +1 ms.
    const ring = ringAtOffsets([0, 1, 600_001]);
    const drawn = traceFor(stateOf(ring, 10), gpu0TempC);
    expect(drawn.map((point) => point.tMs)).toEqual([BASE_MS + 1, BASE_MS + 600_001]);
  });

  /*
   * ⚠ §5.1 at the other boundary, and the two sides differ at a panel: 600 samples in the
   * window are the readings themselves, 601 have been resampled.
   */
  test('⚠ 600 samples in the window are drawn as they are; 601 are resampled', () => {
    const exact = ringOf(600, (i) => i);
    const drawnExact = traceFor(stateOf(exact, 10), gpu0TempC);
    expect(drawnExact).toHaveLength(600);
    expect(drawnExact.map((point) => point.v)).toEqual(Array.from({ length: 600 }, (_u, i) => i));

    const over = ringOf(601, (i) => i);
    const drawnOver = traceFor(stateOf(over, 10), gpu0TempC);
    expect(drawnOver.length).toBeLessThanOrEqual(MAX_RENDERED_POINTS);
    expect(drawnOver.map((point) => point.v)).not.toEqual(
      Array.from({ length: 601 }, (_u, i) => i),
    );
  });

  /*
   * ⚠ Invariant 1 through the whole composition. A card that did not enumerate is a hole in
   * the trace; a wrapper that coerced or filtered it would make the line close over a stretch
   * nobody measured — and §6.5's "traces freeze rather than plotting zeros" would be untrue
   * of the one function every panel calls.
   */
  test('⚠ a reading that was not taken stays a hole, and is never a zero', () => {
    const ring = ringOf(2000, (i) => (i >= 400 && i < 1600 ? null : 60));
    const drawn = traceFor(stateOf(ring, 120), gpu0TempC);
    expect(drawn.some((point) => point.v === null)).toBe(true);
    expect(drawn.some((point) => point.v === 0)).toBe(false);
  });

  /*
   * ⚠ HANDOVER §6 rule 10. `traceFor` is called once per trace, so §6.2's stacked cooling
   * chart draws three full budgets. A per-chart budget here would make GPU 0's resolution
   * depend on how many other series happen to be beside it.
   */
  test('⚠ the budget is 600 per series, so a stacked chart draws up to 1,800', () => {
    const state = stateOf(twoHours, 30);
    const stacked = [gpu0TempC, gpu0TempC, gpu0TempC].map((pick) => traceFor(state, pick));
    expect(stacked.map((trace) => trace.length)).toEqual([600, 600, 600]);
    expect(stacked.reduce((total, trace) => total + trace.length, 0)).toBe(1800);
  });

  test('before the first poll the trace is empty rather than a fabricated point', () => {
    expect(traceFor(stateOf(EMPTY_RING, 30), gpu0TempC)).toEqual([]);
  });
});
