/**
 * §6.7's ring buffer — **8192 samples, keyed on `ts`, drawn against time**.
 *
 * §6.7, in full:
 *
 * > Buffer is a ring capped at **8192 samples**. The worst case the selectors allow is 2 h
 * > at 1 s = 7200; the cap sits deliberately *above* that rather than exactly equal to it,
 * > so a late-landing poll on the backoff path cannot silently evict the oldest sample while
 * > the window still needs it. Samples carry their real timestamps and traces are drawn
 * > **against time, not index**, so changing cadence mid-session neither clears the buffer
 * > nor distorts the axis.
 *
 * ### ⚠ The `ts` dedupe, which is the single most likely thing for step 8 to get wrong
 *
 * §4's cache holds the **in-flight promise** for 2 s, so at the 1 s cadence a client
 * receives the same snapshot two or three times in a row — and occasionally at 2 s — with an
 * identical `ts`. That is deliberate: it is what stops five tabs at 1 s forking five
 * `nvidia-smi` a second. §6.7: *"The client keys its buffer on `ts` and ignores a snapshot
 * whose `ts` it already holds … appending it twice would put duplicate points in the ring,
 * flatten the min/max decimation over a bucket, and double-count an event in the log."*
 *
 * {@link appendSample} therefore returns the ring **by identity** when the `ts` is one it
 * already holds. A caller can test `next === previous` and know nothing happened, which is
 * how `runtime.ts` skips the whole condition/event pipeline for a repeat rather than
 * re-running it and hoping the debounce absorbs it.
 *
 * ⚠ **A repeated `ts` is not a failed poll.** It never reaches the backoff, the header dot
 * stays green, and the age counts from that `ts`. That distinction is the runtime's, and it
 * is only expressible because this module says *nothing happened* rather than *this failed*.
 *
 * ### Why eviction cannot distort the axis
 *
 * Three facts, and the argument needs all three:
 *
 * 1. **Eviction is oldest-first**, and `ts` is stamped by one server clock at the start of
 *    each poll (§4), so arrival order is time order and the sample evicted is always the
 *    temporally oldest one. ⚠ That last step is an **assumption**, and a server whose wall
 *    clock steps backwards breaks it: an evicted-then-repeated `ts` is re-appended out of
 *    order, so eviction can drop a sample that is not the temporally oldest. The residue is
 *    bounded and cosmetic at 8192 samples, because {@link samplesWithin} sorts.
 * 2. **8192 > 7200**, the largest window (2 h) at the fastest cadence (1 s), so the window
 *    can never need a sample the cap has dropped. The 992-sample headroom is what §6.7
 *    spends on "a late-landing poll on the backoff path".
 * 3. **{@link samplesWithin} selects by time, not by index**, and returns its result in `ts`
 *    order. So a trace is a function of the timestamps alone: changing cadence mid-session
 *    changes the *density* of points and nothing else, and a server whose wall clock steps
 *    backwards cannot make the line double back on itself.
 *
 * ### ⚠ Which clock this module uses: the server's `ts`, and never the browser's
 *
 * §6.7: *"Everything that positions a reading in time uses it and nothing else: the ring's
 * key, the x-axis, the bounds of the rendering window, a gap's endpoints, and the horizon
 * past which a gap is pruned."* So {@link samplesWithin} takes **no** `nowMs` — the window is
 * `[newest.tsMs − windowMs, ∞)`, anchored on the data.
 *
 * The browser's clock looked equivalent and is not. Anchored on it, a server 31 minutes
 * behind empties a 30-minute chart **while the ring is full of good data and the header still
 * reads `live`** — the "plotting nothing" half of the failure §6.5's first row exists to
 * prevent ("charts freeze rather than plotting zeros"). Anchored on `ts`, the trace freezes,
 * which is exactly what that row asks for, and §6.2's age indicator and `stale` mode say how
 * old it is. Comparing the two clocks is the age indicator's whole job and nothing else's.
 *
 * ### ⚠ {@link newestSample} is newest by `ts`, not newest by arrival
 *
 * Step 10 colours every cell from it (§6.4: a cell's colour tracks the current reading), and
 * the chart's last point comes from `samplesWithin`, which is `ts`-ordered. If the two
 * disagreed, the figure and the trace beside it would show different readings — §6.4:
 * *"a colour that disagreed with its own figure would be a worse lie than a colour that
 * flickers."* Tracked on append, so it stays O(1).
 */

import type { IsoTimestamp, TelemetrySnapshot } from '../types';
import type { WireSnapshot } from './wire';

/**
 * §6.7's cap. **Above** 7200 = 2 h at 1 s, deliberately, not equal to it.
 *
 * At ~2 KB of parsed snapshot each this is a few tens of MiB in the worst case, which is
 * the browser's problem and not the box's — invariant 2 and §4's "with no clients connected
 * the container does no work at all" both stay true however full this gets.
 */
export const MAX_SAMPLES = 8192;

/** One accepted poll: the snapshot, and the epoch its own `ts` names. */
export interface Sample {
  readonly ts: IsoTimestamp;
  /** `Date.parse(ts)` — the poll's **start** (§4), so an age computed from it over-states. */
  readonly tsMs: number;
  readonly snapshot: TelemetrySnapshot;
}

/**
 * The ring. Immutable: {@link appendSample} returns a new one, or the same one.
 *
 * `heldTs` is the dedupe key set, kept alongside the samples so a repeat is O(1) rather than
 * a scan of 8192 entries at every poll.
 */
export interface SampleRing {
  readonly samples: readonly Sample[];
  readonly heldTs: ReadonlySet<string>;
  /**
   * The sample with the largest `ts`, or `null` before the first poll — **not** the last one
   * to arrive. See the module doc; it is what stops a cell and the trace beside it
   * disagreeing when a server's clock steps backwards.
   */
  readonly newest: Sample | null;
}

/** A session that has accepted no polls. */
export const EMPTY_RING: SampleRing = { samples: [], heldTs: new Set<string>(), newest: null };

/**
 * Append one validated snapshot, or **return the ring unchanged** if its `ts` is already
 * held.
 *
 * ⚠ Membership is over the whole ring, not merely the newest sample — §6.7 says "a snapshot
 * whose `ts` it **already holds**". The two readings differ only if the server's clock
 * repeats a value it has already left, which nothing on this box does; the literal one costs
 * one `Set` lookup and cannot be wrong.
 */
export const appendSample = (ring: SampleRing, wire: WireSnapshot): SampleRing => {
  if (ring.heldTs.has(wire.snapshot.ts)) return ring;

  const sample: Sample = { ts: wire.snapshot.ts, tsMs: wire.tsMs, snapshot: wire.snapshot };
  const heldTs = new Set(ring.heldTs);
  heldTs.add(sample.ts);
  // Newest **by `ts`**: a snapshot stamped before one already held does not become the
  // current reading merely by arriving second.
  const newest =
    ring.newest === null || sample.tsMs >= ring.newest.tsMs ? sample : ring.newest;

  if (ring.samples.length < MAX_SAMPLES) {
    return { samples: [...ring.samples, sample], heldTs, newest };
  }
  // At the cap: drop exactly as many from the front as we add, so the ring never grows past
  // it and the oldest sample's key leaves `heldTs` with it.
  const evicted = ring.samples.slice(0, ring.samples.length - MAX_SAMPLES + 1);
  for (const gone of evicted) heldTs.delete(gone.ts);
  const samples = [...ring.samples.slice(evicted.length), sample];
  // ⚠ Eviction is oldest-*by-arrival*. That is oldest-in-time on a monotonic server clock and
  // not otherwise, so on the one path where the two can differ, ask the survivors rather than
  // trusting the assumption. Costs one scan on the cap path only, and only after a clock step.
  const survives = evicted.every((gone) => gone !== newest);
  return {
    samples,
    heldTs,
    newest: survives ? newest : samples.reduce((a, b) => (b.tsMs >= a.tsMs ? b : a)),
  };
};

/**
 * The samples a window covers, oldest first.
 *
 * ⚠ **Anchored on the newest sample's `ts`, never on the browser's clock** (§6.7). The window
 * is `[newest.tsMs − windowMs, ∞)`: inclusive at the old end so the boundary sample belongs
 * to the window it names, and unbounded at the young end because there is nothing newer than
 * the anchor to exclude. See the module doc for what the other choice costs.
 *
 * ⚠ Sorted by `ts`, because §6.7 draws "against time, not index". The ring is already in
 * time order on this box — one server clock, one stamp per poll — so the sort is a
 * no-op-shaped guarantee rather than a fix, and it is what makes the axis a function of the
 * timestamps rather than of arrival order.
 */
export const samplesWithin = (ring: SampleRing, windowMs: number): readonly Sample[] => {
  if (ring.newest === null) return [];
  const from = ring.newest.tsMs - windowMs;
  const within = ring.samples.filter((sample) => sample.tsMs >= from);
  return within.every((sample, i) => i === 0 || sample.tsMs >= (within[i - 1]?.tsMs ?? 0))
    ? within
    : [...within].sort((a, b) => a.tsMs - b.tsMs);
};

/** The newest sample **by `ts`**, or `null` before the first poll lands. */
export const newestSample = (ring: SampleRing): Sample | null => ring.newest;
