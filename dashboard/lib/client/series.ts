/**
 * §6.7's decimation — **min/max per bucket, above 600 rendered points**.
 *
 * §6.7: *"Downsample above 600 rendered points, using min/max decimation per bucket so a
 * one-sample spike survives rather than being averaged away. A thermal spike that vanishes
 * because of rendering is a lie."*
 *
 * That last sentence is the whole specification of the algorithm, and it rules out the two
 * obvious cheaper ones. **Averaging** a bucket destroys the spike by construction.
 * **Sampling every n-th point** destroys it with probability `1 − 1/n`, which is worse
 * because it destroys it *silently and intermittently*: the same excursion appears on one
 * reload and not the next.
 *
 * ### The proof that a one-sample spike survives
 *
 * A bucket emits the point holding its **maximum** and the point holding its **minimum**,
 * each with its own real timestamp and its own real value — not a bucket midpoint, and not
 * an interpolation. A single sample that is the largest value in the whole series is
 * therefore the maximum of whichever bucket contains it, so it is emitted. The same argument
 * runs downwards for a one-sample dip. `series.test.ts` runs it as a fixture: 7 200 points
 * (2 h at 1 s, §6.7's own worst case) with one 92 °C sample among 60 °C ones, decimated to
 * 600, and the assertion is on the **exact `tMs` and `v`**, because a spike drawn at the
 * wrong instant is a different lie from a spike averaged away.
 *
 * ### `null` is not a value, and an absent stretch stays absent
 *
 * A `null` reading is not plottable and must never be drawn as `0` (invariant 1). Buckets
 * ignore `null`s when choosing a min and a max; a bucket with **no** reading at all emits a
 * single `null` point, so a lost channel or an un-sampled span survives decimation as a hole
 * rather than closing up into a line that was never measured.
 *
 * ### Three limitations, stated so step 9 does not rediscover them as rendering bugs
 *
 * 1. ⚠ **Only a bucket's extremes survive**, which is what min/max decimation *is*. A 24 s
 *    bucket at the worst case can therefore hide a *second* excursion: with 92 °C and 91 °C in
 *    one bucket, the 91 is not drawn. That is the algorithm working as specified — the largest
 *    value in the series always survives — but it is worth knowing before somebody reads a
 *    missing minor spike as a bug.
 * 2. ⚠ **Bucket boundaries move on every append.** Appending one sample to a 1,201-point
 *    series moved the `tMs` of 215 of the 600 emitted points, so at the 1 s cadence with a 2 h
 *    window about a third of the drawn polyline shifts every second. Correctness is
 *    unaffected — every emitted point is a real reading at its own real instant — but the line
 *    shimmers, and §6.7 does not require stability.
 * 3. ⚠ **The budget is per SERIES, not per chart.** §6.7's justification is about a spike
 *    surviving *its own* trace, and a per-chart budget would make GPU 0's resolution depend on
 *    how many other series happen to be drawn beside it — the same "one written rule behaving
 *    differently depending on a dropdown" failure §6.4 rejects for the debounce. §6.2's
 *    stacked GPU 0 + GPU 1 + fan 5 chart therefore draws up to 1,800 points, which at 1280 px
 *    is sub-pixel spacing per series and costs nothing. §6.7 does not say *per series* in so
 *    many words; recorded as a spec gap rather than assumed.
 *
 * ⚠ **A `null` inside an otherwise readable bucket is dropped**, and that is a real
 * limitation rather than an oversight: preserving it would need a third emitted point per
 * bucket and cost a third of the point budget on every healthy chart. It is bounded — a
 * bucket at the worst case is 7200/300 = 24 samples ≈ 24 s of a 2 h axis — and it is not
 * the mechanism §6.7 relies on for the spans it names. **The un-sampled spans a hidden tab
 * and a failed poll produce are recorded by the runtime with their real start and end
 * times** (`runtime.ts`'s `gaps`), not inferred from holes in a series, so hatching them
 * does not depend on this at all.
 */

import type { TelemetrySnapshot } from '../types';
import type { Sample } from './ring';

/** §6.7's threshold. Strictly *above*: 600 points render as they are, 601 are decimated. */
export const MAX_RENDERED_POINTS = 600;

/** One plottable instant. `v` is `null` for a reading that was not taken (invariant 1). */
export interface SeriesPoint {
  readonly tMs: number;
  readonly v: number | null;
}

/**
 * Project one reading out of each sample, keeping the sample's own timestamp.
 *
 * `pick` returns `number | null` and every branded unit is a `number`, so
 * `seriesFrom(samples, (s) => s.gpus?.[0]?.tempC ?? null)` needs no unwrapping. ⚠ Write the
 * `?? null` deliberately: an absent GPU and a GPU with no reading are both "no value here",
 * and neither is `0`.
 */
export const seriesFrom = (
  samples: readonly Sample[],
  pick: (snapshot: TelemetrySnapshot) => number | null,
): readonly SeriesPoint[] =>
  samples.map((sample) => ({ tMs: sample.tsMs, v: pick(sample.snapshot) }));

/**
 * §6.7's decimation.
 *
 * At or below `maxPoints` the input is returned **by identity** — no copy, and a caller can
 * see with `===` that nothing was resampled. Above it, the points are split into
 * `floor(maxPoints / 2)` equal-count buckets and each emits its min and its max in time
 * order, so the result never exceeds `maxPoints`.
 *
 * Buckets are equal **counts**, not equal spans of time. Equal spans would spend the budget
 * on stretches where nothing was sampled — precisely the stretches a hidden tab produces —
 * and would leave the busy part of the axis coarser than the empty part. The x-position of
 * every emitted point is its own `tMs` either way, so the axis is unaffected by the choice.
 */
export const decimateSeries = (
  points: readonly SeriesPoint[],
  maxPoints: number = MAX_RENDERED_POINTS,
): readonly SeriesPoint[] => {
  // Two is the floor: a bucket can emit a min and a max, so a cap below two could not hold
  // even one bucket's output.
  const cap = Math.max(2, Math.floor(maxPoints));
  if (points.length <= cap) return points;

  const bucketCount = Math.floor(cap / 2);
  const out: SeriesPoint[] = [];

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor((bucket * points.length) / bucketCount);
    const end = Math.floor(((bucket + 1) * points.length) / bucketCount);
    if (end <= start) continue;

    let lowIndex = -1;
    let highIndex = -1;
    for (let i = start; i < end; i += 1) {
      const value = points[i]?.v;
      if (value === undefined || value === null) continue;
      if (lowIndex === -1 || value < (points[lowIndex]?.v ?? Number.POSITIVE_INFINITY)) {
        lowIndex = i;
      }
      if (highIndex === -1 || value > (points[highIndex]?.v ?? Number.NEGATIVE_INFINITY)) {
        highIndex = i;
      }
    }

    if (lowIndex === -1) {
      // No reading anywhere in this bucket. Emit one `null` so the hole survives the
      // downsample instead of the line closing over ground that was never measured.
      const first = points[start];
      if (first !== undefined) out.push(first);
      continue;
    }

    const firstIndex = Math.min(lowIndex, highIndex);
    const secondIndex = Math.max(lowIndex, highIndex);
    const first = points[firstIndex];
    if (first !== undefined) out.push(first);
    if (secondIndex !== firstIndex) {
      const second = points[secondIndex];
      if (second !== undefined) out.push(second);
    }
  }

  return out;
};
