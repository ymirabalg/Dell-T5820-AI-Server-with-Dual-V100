/**
 * §6.7's un-sampled spans — **the hatched ground nobody measured.**
 *
 * > **Background tab:** pause polling on `document.hidden`, resume on visibility. The
 * > un-sampled span is drawn with the same hatched "no reading" treatment a lost channel
 * > gets — the data genuinely is absent, and it must not be interpolated across.
 * > **A gap is a span the client was not sampling, and it stays open while ANY reason to
 * > have one is still in force** — hidden, paused, or a run of failed polls — **not until
 * > the next sample arrives.** It closes at the `ts` of the first reading taken while none
 * > of them is.
 *
 * §9 extends the same treatment to a failed poll: "the trace stops, the gap is hatched,
 * nothing is drawn to zero".
 *
 * ---
 *
 * ### ⚠ 1. A gap is closed by a REASON going away, not by a sample arriving
 *
 * This is the whole of the module and it is the bug it was extracted to fix. `closeGap` used
 * to run unconditionally on every accepted sample, so a poll that was **already in flight**
 * when the tab went hidden closed the gap the instant it landed. An hour of hidden time was
 * then recorded as the five seconds before that poll returned, and the chart drew a straight
 * line across 3,600 s of ground nobody measured — precisely what §6.7 wrote the sentence to
 * prevent. Three paths produce such a reading and all three are ordinary: a poll in flight
 * when the tab is hidden, a poll in flight when the operator pauses, and a *refresh now*
 * taken while paused.
 *
 * ### ⚠ 2. ANY reason, not the reason that opened it
 *
 * {@link anyGapReason} is a predicate over all three, and the difference is not pedantry.
 * `pause()` → hide → `resume()` leaves a gap whose recorded `reason` is `paused` while the
 * reason actually in force is `hidden`; a rule phrased as "the reason that opened it" would
 * close that gap on resume, on a tab that is still hidden. One predicate over all three is
 * total and has no such seam. `reason` stays what it always was — *why the gap began* — which
 * is all a hatch legend needs; a gap that begins `paused` and continues `hidden` is labelled
 * `paused`, and that is accepted.
 *
 * ### ⚠ 3. A reading may land INSIDE a gap, and does not split it
 *
 * It is real data and belongs in the ring. It does not make the hour around it observed, so
 * the chart draws a point sitting inside a hatched band. That is not a lie — it is the exact
 * truth, and it is more honest than either alternative: dropping a real reading, or claiming
 * an hour was sampled because one point in it was.
 *
 * ### ⚠ 4. Both endpoints and the prune horizon are server `ts`, never the browser's clock
 *
 * §6.7's clock rule: a gap's endpoints and "the horizon past which a gap is pruned" position
 * *readings* in time, so they use the only timestamp a reading carries. `nowMs` does not
 * appear in this file. A horizon anchored on the browser's clock deletes **every** hatched
 * gap the moment the server is two hours behind — the same class of mistake as
 * "wall clock for the cookie, monotonic clock for the limiter, and they are not
 * interchangeable".
 *
 * And the corollary that removes the last mixed clock: **no gap is opened before the first
 * accepted sample.** A gap endpoint is a `ts`, and before the first sample there is no `ts`
 * to use — nor anything drawn for a hatch to meet.
 */

/** Why the client stopped sampling. Recorded at the moment the gap opened, never rewritten. */
export type GapReason = 'hidden' | 'paused' | 'failed';

/**
 * A span of time nobody sampled, drawn hatched.
 *
 * ⚠ Recorded from what the runtime **did**, not inferred from holes in a series. Inference
 * would be at the mercy of decimation, which drops a `null` inside an otherwise readable
 * bucket; three numbers survive any rendering (see `series.ts`).
 *
 * `toMs` is `null` while the gap is still open — the tab is still hidden, the server is still
 * not answering — and is closed with the **`ts` of the sample that ends it**, so the hatch
 * meets the trace at the instant the reading resumed rather than at the instant it arrived.
 */
export interface Gap {
  readonly fromMs: number;
  readonly toMs: number | null;
  readonly reason: GapReason;
}

/** What the client was doing, as far as gaps are concerned. */
export interface SamplingState {
  readonly hidden: boolean;
  readonly paused: boolean;
  readonly consecutiveFailures: number;
}

/**
 * Is any reason to have a gap still in force? Returns the first one, for a gap that is about
 * to be opened, or `null` when the client is sampling normally.
 *
 * The order is the order §6.7 lists them in and is not otherwise significant: at most one gap
 * is open at a time, so a second reason arriving while one is open changes nothing.
 */
export const anyGapReason = (state: SamplingState): GapReason | null => {
  if (state.hidden) return 'hidden';
  if (state.paused) return 'paused';
  if (state.consecutiveFailures > 0) return 'failed';
  return null;
};

/** Is the most recent gap still open? */
export const gapIsOpen = (gaps: readonly Gap[]): boolean => gaps.at(-1)?.toMs === null;

/**
 * Open a gap at `fromMs`, unless one is already open or there is nothing to hatch back to.
 *
 * It starts at the **newest sample's `ts`**, not at the instant polling stopped: the last
 * thing actually measured is where the trace ends, and the hatch has to begin there or it
 * leaves a sliver of interpolated line behind it. `fromMs` is `null` before the first sample,
 * and then **no gap is opened at all** — see rule 4 in the module doc.
 *
 * Returns the input **by identity** when nothing changed.
 */
export const openGap = (
  gaps: readonly Gap[],
  reason: GapReason,
  fromMs: number | null,
): readonly Gap[] => {
  if (fromMs === null) return gaps;
  if (gapIsOpen(gaps)) return gaps;
  return [...gaps, { fromMs, toMs: null, reason }];
};

/**
 * Fold an accepted sample into the gap list.
 *
 * The open gap closes **only** when no reason to have one is still in force (rule 1). The
 * sample's own `ts` is the closing endpoint, and closed gaps older than the horizon are
 * dropped — nothing older than the longest selectable window can be drawn, so the list stays
 * bounded by visibility toggles inside two hours rather than by session length.
 *
 * Returns the input **by identity** when nothing changed.
 */
export const observeSample = (
  gaps: readonly Gap[],
  atMs: number,
  state: SamplingState,
  horizonMs: number,
): readonly Gap[] => {
  const open = gaps.at(-1);
  const closing = open !== undefined && open.toMs === null && anyGapReason(state) === null;
  const next = closing
    ? [...gaps.slice(0, -1), { ...(open as Gap), toMs: atMs }]
    : gaps;
  const live = next.filter((gap) => gap.toMs === null || gap.toMs >= horizonMs);
  if (live.length === next.length) return next;
  return live;
};
