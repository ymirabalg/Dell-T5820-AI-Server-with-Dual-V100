/**
 * §6.7's deltas — `host.cpuPct` and `storage.net.{rx,tx}BytesPerSec`. **Pure.** No IO.
 *
 * > §6.7: "**First sample:** `cpuPct` and network rates are deltas and need two samples.
 * > They render `—` until the second poll arrives, never `0`."
 *
 * That is the whole reason this is a separate module: "needs two samples" is one rule, and
 * a rule scattered through the parsers is a rule that gets half-applied. Every function
 * here takes the previous sample as `T | null` and returns `null` when it is absent, so
 * the first-poll case cannot be reached without writing it down.
 *
 * ### ⚠ HANDOVER O7 — clamp, or send `null`
 *
 * > "A `/proc/stat` delta that comes out fractionally negative — jiffy accounting across a
 * > counter update, an NTP step, a CPU hot-unplug — produces `percent(-0.04)`, and the CPU
 * > panel prints `-0.0 %`. The formatter deliberately does **not** hide that … So the
 * > collector must either clamp to ≥ 0 or send `null`; a negative percentage reaching the
 * > UI is a step-3 defect."
 *
 * **This module sends `null`, and does not clamp.** Both are permitted; `null` is chosen
 * because clamping produces `0.0 %` / `0 B/s`, and invariant 1 says those are *readings* —
 * an idle CPU and a quiet link. A backwards counter is not a reading, it is evidence that
 * something wrapped, was reset, or is being read wrongly, and §6.6 has a rendering for
 * exactly that: `—`. Clamping would convert a collector fault into a plausible number,
 * which is the failure mode this whole project is organised against.
 *
 * The same rule applies to a *zero-length* interval. Two samples inside one jiffy give
 * `0/0`, and `NaN` or an invented `0` are both worse than "not enough information yet".
 */

import { bytesPerSecond, percent } from '../types';
import type { BytesPerSecond, Percent } from '../types';
import type { CpuTimes, NetCounters } from './proc';

/**
 * The counters carried from one poll to the next, plus the monotonic instant the poll they
 * came from began.
 *
 * Held by the caller — §4 fixes the server as stateless per request ("Sampling is
 * per-request, not a background loop"), so *where* this lives between polls is step 6's
 * decision and not this module's. Everything here is a pure function of two of these.
 *
 * Either counter may be `null`: `/proc/stat` can fail while `/proc/net/dev` succeeds, and
 * the surviving one must still produce a rate on the next poll.
 *
 * ⚠ **`atMs` and `net` are ONE PAIR.** {@link netRatesBetween} divides by
 * `next.atMs - prev.atMs`; {@link cpuPctBetween} is self-normalising (`busy/total`, both
 * deltas) and never reads the field. So a caller retaining counters across a failed read
 * (§6.7, O16) must advance `atMs` exactly when it advances `net` — advancing it whenever
 * *anything* succeeded divides a two-poll counter delta by a one-poll interval and reports
 * **double** the real throughput, which renders perfectly. `lib/telemetry/source.ts`'s
 * `mergePrevious` is the implementation of that rule.
 */
export interface DeltaSample {
  /**
   * ⚠ **MONOTONIC** — `performance.now()`, stamped at the top of the poll, *before* the
   * counters are read. Never `Date.now()`: a backward NTP step (the first sync after boot,
   * a container resume) makes an interval negative and a forward one halves a real rate,
   * which is the bug `lib/collectors/deadline.ts` exists for.
   *
   * It never leaves the process and is only ever subtracted from another reading of the
   * same clock; §4's `ts` is the wall clock, and is the only one on the wire.
   */
  readonly atMs: number;
  readonly cpu: CpuTimes | null;
  readonly net: NetCounters | null;
}

/** What one poll's delta maths yields. All three are `null` on the first sample. */
export interface DeltaReadings {
  readonly cpuPct: Percent | null;
  readonly rxBytesPerSec: BytesPerSecond | null;
  readonly txBytesPerSec: BytesPerSecond | null;
}

/** The first poll: nothing to compare against, so every delta is `—`. */
export const NO_DELTAS: DeltaReadings = {
  cpuPct: null,
  rxBytesPerSec: null,
  txBytesPerSec: null,
};

const MAX_SAFE = BigInt(Number.MAX_SAFE_INTEGER);

/**
 * `next - prev` as a `number`, or `null` if that is not a usable delta.
 *
 * Rejects three things, all of which mean "do not report a rate":
 *
 * - **negative** — the counter went backwards: a 64-bit wrap, an interface reset, a CPU
 *   hot-unplug, or the collector comparing two different things. O7.
 * - **above `Number.MAX_SAFE_INTEGER`** — the subtraction is exact in `bigint` but the
 *   conversion to `number` would not be, and a rate computed from a rounded delta is
 *   fabricated. Unreachable in practice at 1 Gbps; cheap to be right about.
 * - nothing else. **Zero is a genuine delta** and passes: a truly idle CPU and a truly
 *   silent link both produce it, and §6.6 renders them `0.0 %` and `0 B/s`.
 */
const safeDelta = (prev: bigint, next: bigint): number | null => {
  const d = next - prev;
  if (d < 0n || d > MAX_SAFE) return null;
  return Number(d);
};

/**
 * Aggregate CPU utilisation between two `/proc/stat` readings, as a percentage.
 *
 * `busy / total`, both deltas — self-normalising, so no wall-clock term is involved and an
 * irregular poll interval does not distort it.
 *
 * `null` when: either sample is absent (**the first poll**), either counter went
 * backwards, or `total` did not advance at all. The last is not a defensive nicety — two
 * polls inside one jiffy give `0/0`, which is `NaN`, and `percent(NaN)` type-checks
 * because the brand constructors do not validate (HANDOVER §3).
 *
 * The final range check cannot fire while both deltas are non-negative and `busy ⊆ total`
 * by construction. It is there because "by construction" stopped being true the moment
 * `/proc/stat` gained a field, and a `cpuPct` of 130 % is a wrong number that renders
 * perfectly.
 */
export const cpuPctBetween = (prev: CpuTimes | null, next: CpuTimes | null): Percent | null => {
  if (prev === null || next === null) return null;
  const busy = safeDelta(prev.busy, next.busy);
  const total = safeDelta(prev.total, next.total);
  if (busy === null || total === null || total === 0) return null;
  const pct = (busy / total) * 100;
  if (!Number.isFinite(pct) || pct < 0 || pct > 100) return null;
  return percent(pct);
};

/**
 * Interface throughput between two `/proc/net/dev` readings, in bytes per second — the
 * native unit of the counters, which §6.6 auto-scales to KB/s or MB/s for display.
 *
 * `null` when: either sample is absent (**the first poll**), either counter went
 * backwards, or the two samples are not separated in time. A non-positive interval would
 * divide by zero; a *negative* one means the clock moved backwards between polls, which is
 * an NTP step and not a measurement.
 */
export const netRatesBetween = (
  prev: DeltaSample | null,
  next: DeltaSample,
): Pick<DeltaReadings, 'rxBytesPerSec' | 'txBytesPerSec'> => {
  const none = { rxBytesPerSec: null, txBytesPerSec: null };
  if (prev === null || prev.net === null || next.net === null) return none;

  const elapsedMs = next.atMs - prev.atMs;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) return none;
  const elapsedSec = elapsedMs / 1000;

  const rate = (from: bigint, to: bigint): BytesPerSecond | null => {
    const d = safeDelta(from, to);
    if (d === null) return null;
    const r = d / elapsedSec;
    return Number.isFinite(r) && r >= 0 ? bytesPerSecond(r) : null;
  };

  return {
    rxBytesPerSec: rate(prev.net.rxBytes, next.net.rxBytes),
    txBytesPerSec: rate(prev.net.txBytes, next.net.txBytes),
  };
};

/**
 * One poll's worth of delta maths: previous sample in, this sample in, three readings out.
 *
 * The caller keeps `next` and hands it back as `prev` on the following poll. Passing
 * `prev = null` is the first sample of a session and yields {@link NO_DELTAS} — §6.7's
 * `—`, never `0`.
 */
export const advanceDeltas = (prev: DeltaSample | null, next: DeltaSample): DeltaReadings => ({
  cpuPct: cpuPctBetween(prev?.cpu ?? null, next.cpu),
  ...netRatesBetween(prev, next),
});
