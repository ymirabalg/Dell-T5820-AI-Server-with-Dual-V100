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

import { MAX_RENDERED_POINTS, decimateSeries, seriesFrom } from './series';
import type { SeriesPoint } from './series';
import { everythingZero } from '../fixtures';
import type { Gpu } from '../types';
import { celsius, isoTimestamp } from '../types';
import type { Sample } from './ring';

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
