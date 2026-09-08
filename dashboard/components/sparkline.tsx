/**
 * The small trend line behind a dominant figure — GPU/CPU temperature over the selected
 * window, drawn small enough to sit beside a headline number (§6.1: below the 1600px
 * breakpoint, GPU cards show this instead of "sparklines promoted to full line charts").
 *
 * Takes whatever `lib/client/series.ts`'s `traceFor(state, pick)` produced — the one
 * decimation pipeline (HANDOVER rule 10), never re-run or re-budgeted here.
 * {@link SparklinePoint} is structurally identical to that module's `SeriesPoint`
 * (`{ tMs, v }`) but is its own type rather than an import, so this file does not pull the
 * client runtime — and everything behind it — into a component that has no other reason to
 * depend on it. Any `{ tMs, v }` array typechecks here, `traceFor`'s output included.
 *
 * ### ⚠ A `null` reading breaks the line; it is never bridged across
 *
 * Invariant 1, applied to a polyline: interpolating through a `null` would draw a value that
 * was never read. Points are split into maximal non-null runs and each run is its own
 * `<polyline>`, so a hole in the trace is a visible break rather than a smoothed-over lie.
 *
 * ### ⚠ Positioned by INDEX, not by real elapsed time — a deliberate simplification
 *
 * The full stacked chart (`StackedTimeSeriesChart`) positions points by their real `tMs` and
 * hatches real gaps from `state.gaps`, because that chart is where §9's "engage/release …
 * legible at a glance" and the shared-time cooling story live. A sparkline is a compressed
 * shape behind a number at a few dozen pixels — sub-pixel timing differences are not legible
 * at that size, so this positions its points by their order rather than carrying `tMs`,
 * `state.gaps`, or a domain through a second code path. **This is a recorded decision, not
 * an oversight**: SPEC.md does not fix a sparkline's internal geometry, and index-positioning
 * is the conservative reading, since it cannot mis-locate a spike in TIME (there is no time
 * axis to get wrong) at the cost of not showing gap hatching at this size. If a future
 * reviewer wants gap-aware sparklines, that is a real, separate primitive, not a change to
 * this one's contract.
 */

import { Fragment } from 'react';

import styles from './sparkline.module.css';
import './tokens.css';

export interface SparklinePoint {
  readonly tMs: number;
  readonly v: number | null;
}

export interface SparklineProps {
  readonly points: readonly SparklinePoint[];
  /** A resolved hex colour — the caller's, from `components/palette.ts` or a severity ramp. */
  readonly color: string;
  readonly width?: number;
  readonly height?: number;
}

interface IndexedPoint {
  readonly index: number;
  readonly v: number;
}

/**
 * Maximal runs of consecutive readable points, each becoming one polyline — carrying each
 * point's position in the ORIGINAL array, so a run extracted after filtering nulls out still
 * places its points at their true x-position rather than a compacted one.
 */
const runsOf = (points: readonly SparklinePoint[]): (readonly IndexedPoint[])[] => {
  const runs: IndexedPoint[][] = [];
  let current: IndexedPoint[] = [];
  points.forEach((p, index) => {
    if (p.v === null || !Number.isFinite(p.v)) {
      if (current.length > 0) runs.push(current);
      current = [];
    } else {
      current.push({ index, v: p.v });
    }
  });
  if (current.length > 0) runs.push(current);
  return runs;
};

export function Sparkline({ points, color, width = 96, height = 24 }: SparklineProps) {
  const runs = runsOf(points);
  const readable = runs.flat();

  if (points.length === 0 || readable.length === 0) {
    return (
      <svg
        className={styles.sparkline}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="no readings in the selected window"
        data-empty="true"
      />
    );
  }

  const values = readable.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  // ⚠ A flat series has no span to place anything within, and `(v - min) / 1` is 0 for every
  // point — which put the whole line on `y = height`, the BOTTOM edge, the one position that
  // everywhere else in the same trace means "coldest reading in the window". A card idling at
  // a constant 66 °C is not at the bottom of anything. Draw it on the centre line instead,
  // which is where `StackedTimeSeriesChart` puts the identical input, so the two primitives
  // cannot be read against each other and disagree.
  const flat = max - min === 0;

  const n = points.length;
  // A single point has nowhere to span; anchor it at the left edge rather than dividing by 0.
  const xFor = (index: number): number => (n <= 1 ? 0 : (index / (n - 1)) * width);
  const yFor = (v: number): number =>
    flat ? height / 2 : height - ((v - min) / (max - min)) * height;

  const last = readable[readable.length - 1];

  return (
    <svg
      className={styles.sparkline}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label="trend over the selected window"
    >
      {runs.map((run, i) => (
        <Fragment key={i}>
          <polyline
            className={styles.line}
            stroke={color}
            points={run.map((p) => `${xFor(p.index)},${yFor(p.v)}`).join(' ')}
          />
          {/* ⚠ A one-point run has no geometry — an SVG polyline with a single vertex paints
              nothing — so an isolated reading between two nulls vanished entirely. The
              polyline still stands for the run (one polyline per run, invariant 1's shape);
              this dot is what makes the reading visible. */}
          {run.length === 1 && (
            <circle
              className={styles.point}
              cx={xFor((run[0] as IndexedPoint).index)}
              cy={yFor((run[0] as IndexedPoint).v)}
              r={1.5}
              fill={color}
              data-role="lone-point"
            />
          )}
        </Fragment>
      ))}
      {last === undefined ? null : (
        <circle className={styles.end} cx={xFor(last.index)} cy={yFor(last.v)} r={2.5} fill={color} />
      )}
    </svg>
  );
}
