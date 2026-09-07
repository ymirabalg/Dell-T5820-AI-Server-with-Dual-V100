/**
 * §6.7's ring: the `ts` dedupe, the 8192 cap, and the guarantee that eviction cannot distort
 * the axis.
 *
 * The dedupe is the rule HANDOVER puts at the top of step 8's inheritance, so it is tested
 * from four directions: identity is preserved, the ring does not grow, an already-evicted `ts`
 * is not treated as held, and the repeat is not confused with a failure (that last one lives
 * in `runtime.test.ts`, where failure exists at all).
 */

import { describe, expect, test } from 'vitest';

import { everythingZero } from '../fixtures';
import { isoTimestamp } from '../types';
import { MAX_SAMPLES, EMPTY_RING, appendSample, newestSample, samplesWithin } from './ring';
import type { SampleRing } from './ring';
import type { WireSnapshot } from './wire';

const at = (secondsPastTheHour: number): WireSnapshot => {
  const ms = Date.UTC(2026, 8, 6, 14, 0, 0, 0) + secondsPastTheHour * 1000;
  const ts = new Date(ms).toISOString();
  return { snapshot: { ...everythingZero, ts: isoTimestamp(ts) }, tsMs: ms };
};

const fill = (count: number, from = 0): SampleRing => {
  let ring = EMPTY_RING;
  for (let i = 0; i < count; i += 1) ring = appendSample(ring, at(from + i));
  return ring;
};

describe('⚠ §6.7: the client keys its buffer on ts and ignores a repeat', () => {
  /*
   * ⚠ §4's cache serves the same snapshot two or three times in a row at the 1 s cadence.
   * Appending it twice would "put duplicate points in the ring, flatten the min/max decimation
   * over a bucket, and double-count an event in the log" — so the ring must not merely
   * tolerate the repeat, it must be **unchanged by identity**, which is what lets `runtime.ts`
   * skip the condition and event pipelines entirely rather than re-running them.
   */
  test('⚠ a snapshot whose ts is already held returns the ring by identity', () => {
    const ring = fill(3);
    const again = appendSample(ring, at(2));
    expect(again).toBe(ring);
    expect(again.samples).toHaveLength(3);
  });

  test('⚠ three arrivals of one ts are one sample, which is §4’s 1 s cadence exactly', () => {
    let ring = appendSample(EMPTY_RING, at(0));
    ring = appendSample(ring, at(0));
    ring = appendSample(ring, at(0));
    expect(ring.samples).toHaveLength(1);
    expect(ring.samples.map((s) => s.ts)).toEqual([at(0).snapshot.ts]);
  });

  test('⚠ a new ts is appended, so the dedupe is not simply refusing everything', () => {
    const ring = fill(1);
    const next = appendSample(ring, at(1));
    expect(next).not.toBe(ring);
    expect(next.samples).toHaveLength(2);
  });

  test('⚠ dedupe is over the whole ring, not only its newest sample', () => {
    const ring = fill(5);
    expect(appendSample(ring, at(0))).toBe(ring);
    expect(appendSample(ring, at(3))).toBe(ring);
  });

  test('the sample keeps the server’s own ts and its epoch, and nothing re-stamps them', () => {
    const wire = at(7);
    const sample = newestSample(appendSample(EMPTY_RING, wire));
    expect(sample?.ts).toBe(wire.snapshot.ts);
    expect(sample?.tsMs).toBe(wire.tsMs);
    expect(sample?.snapshot).toBe(wire.snapshot);
  });
});

describe('⚠ the 8192 cap', () => {
  test('⚠ the cap is 8192, and it sits above 2 h at 1 s', () => {
    expect(MAX_SAMPLES).toBe(8192);
    expect(MAX_SAMPLES).toBeGreaterThan(7200);
  });

  /*
   * §5.1's fixture symmetry, at the cap: 8192 samples fit and the 8193rd evicts. The two sides
   * differ at a panel — one is a full 2 h window plus headroom, the other has silently lost its
   * oldest reading.
   */
  test('⚠ 8192 samples are all held, and the 8193rd evicts the oldest', () => {
    const full = fill(MAX_SAMPLES);
    expect(full.samples).toHaveLength(MAX_SAMPLES);
    expect(full.samples[0]?.tsMs).toBe(at(0).tsMs);

    const over = appendSample(full, at(MAX_SAMPLES));
    expect(over.samples).toHaveLength(MAX_SAMPLES);
    expect(over.samples[0]?.tsMs).toBe(at(1).tsMs);
    expect(newestSample(over)?.tsMs).toBe(at(MAX_SAMPLES).tsMs);
  });

  test('⚠ an evicted ts leaves the dedupe key set, so the ring cannot leak one key per poll', () => {
    const over = appendSample(fill(MAX_SAMPLES), at(MAX_SAMPLES));
    expect(over.heldTs.size).toBe(MAX_SAMPLES);
    expect(over.heldTs.has(at(0).snapshot.ts)).toBe(false);
    expect(over.heldTs.has(at(1).snapshot.ts)).toBe(true);
  });

  test('⚠ eviction is oldest-first, so the window can never lose its newest samples', () => {
    let ring = fill(MAX_SAMPLES);
    for (let i = 0; i < 50; i += 1) ring = appendSample(ring, at(MAX_SAMPLES + i));
    expect(ring.samples).toHaveLength(MAX_SAMPLES);
    expect(ring.samples[0]?.tsMs).toBe(at(50).tsMs);
    expect(newestSample(ring)?.tsMs).toBe(at(MAX_SAMPLES + 49).tsMs);
  });

  /*
   * ⚠ §6.7's own justification for the cap sitting *above* 7200 rather than equal to it, run
   * as a fixture: two hours of 1 s samples, then the whole 2 h window asked for, and every one
   * of the 7200 is still there.
   */
  test('⚠ two hours at 1 s fits the window with headroom to spare', () => {
    const ring = fill(7200);
    expect(samplesWithin(ring, 7_200_000)).toHaveLength(7200);
  });
});

describe('⚠ the window selects by time, never by index', () => {
  test('⚠ only samples inside the window are returned, and the boundary one is in it', () => {
    const ring = fill(600);
    const within = samplesWithin(ring, 60_000);
    expect(within).toHaveLength(61);
    expect(within[0]?.tsMs).toBe(at(539).tsMs);
    expect(within.at(-1)?.tsMs).toBe(at(599).tsMs);
  });

  /*
   * ⚠ §6.7's clock rule, as the failure it prevents: the window is anchored on the newest
   * sample's own `ts`, so a server whose clock is **behind the browser's by more than the
   * window** still draws every point it sent. Anchored on the browser's clock this returns
   * nothing — an empty chart over a full ring, with the header still reading `live`, which is
   * the "plotting nothing" half of the failure §6.5's first row exists to prevent.
   */
  test('⚠ a server an hour behind the browser still fills a 30-minute window', () => {
    const ring = fill(60);
    const within = samplesWithin(ring, 1_800_000);
    expect(within).toHaveLength(60);
    expect(within.at(-1)?.tsMs).toBe(at(59).tsMs);
  });

  /*
   * ⚠ §6.7: "changing cadence mid-session neither clears the buffer nor distorts the axis."
   * The fixture changes cadence twice — 1 s, then 30 s, then 1 s again — and the assertion is
   * that the window still selects by elapsed time, so the trace is denser in the middle and
   * covers exactly the same span.
   */
  test('⚠ a cadence change mid-session changes density and nothing else', () => {
    let ring = EMPTY_RING;
    for (let i = 0; i < 10; i += 1) ring = appendSample(ring, at(i));
    for (let i = 0; i < 4; i += 1) ring = appendSample(ring, at(10 + i * 30));
    for (let i = 0; i < 10; i += 1) ring = appendSample(ring, at(130 + i));

    expect(ring.samples).toHaveLength(24);

    // The whole span: every sample, in order, whatever cadence produced it.
    const all = samplesWithin(ring, 200_000);
    expect(all).toHaveLength(24);
    expect(all[0]?.tsMs).toBe(at(0).tsMs);
    expect(all.at(-1)?.tsMs).toBe(at(139).tsMs);

    // ⚠ And a window **shorter than the span**, which is what tells time from index apart: the
    // last 100 s holds thirteen samples — three from the slow stretch and ten from the fast one
    // — and no fixed count of trailing samples is that set.
    const recent = samplesWithin(ring, 100_000);
    expect(recent.map((s) => (s.tsMs - at(0).tsMs) / 1000)).toEqual([
      40, 70, 100, 130, 131, 132, 133, 134, 135, 136, 137, 138, 139,
    ]);
  });

  test('⚠ the window is returned oldest-first, whatever order the ring holds', () => {
    let ring = EMPTY_RING;
    // A server whose wall clock stepped backwards: `ts` 5 arrives before `ts` 3.
    ring = appendSample(ring, at(5));
    ring = appendSample(ring, at(3));
    ring = appendSample(ring, at(7));
    const within = samplesWithin(ring, 600_000);
    expect(within.map((s) => s.tsMs)).toEqual([at(3).tsMs, at(5).tsMs, at(7).tsMs]);
  });

  /*
   * ⚠ F5, and the argument is §6.4's own: "a colour that disagreed with its own figure would
   * be a worse lie than a colour that flickers." Step 10 colours every cell from
   * `newestSample`; the chart's last point comes from `samplesWithin`, which is `ts`-ordered.
   * If the accessor answered *newest by arrival*, one backwards clock step would put a 0 °C
   * figure beside a trace ending at 84 °C.
   */
  test('⚠ the newest sample is the newest by ts, not the last one to arrive', () => {
    let ring = appendSample(EMPTY_RING, at(100));
    ring = appendSample(ring, at(50));
    expect(newestSample(ring)?.tsMs).toBe(at(100).tsMs);
    expect(samplesWithin(ring, 600_000).at(-1)?.tsMs).toBe(at(100).tsMs);

    ring = appendSample(ring, at(140));
    expect(newestSample(ring)?.tsMs).toBe(at(140).tsMs);
  });

  test('an empty ring has no newest sample and no window', () => {
    expect(newestSample(EMPTY_RING)).toBeNull();
    expect(samplesWithin(EMPTY_RING, 60_000)).toEqual([]);
  });
});
