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
 *
 * ### ⚠ Q2 — the hover layer and the table view
 *
 * `SPEC.md` §6.2 (amended 2026-09-07) makes both DEFAULTS on every line/area plot, and a
 * sparkline is one — including, by §6.1's own breakpoint table, on a laptop under 1600px,
 * which is exactly the "reading a value off a trace by eye is worst" viewer §6.2's amendment
 * names. So this is not exempted as a decorative micro-chart; it gets the same treatment as
 * `StackedTimeSeriesChart`, at its own scale:
 *
 * - **`view: 'chart' | 'table'`**, a PROP (`purity.test.ts` forbids the hook a self-toggling
 *   leaf would need) — the same shape as the full chart's, so a caller that promotes a
 *   sparkline to the full chart at ≥1600px (§6.1) is switching primitives, not switching APIs.
 * - **`formatValue`/`formatTime` are REQUIRED**, unlike the full chart's already-required
 *   `formatTick`/`formatTime`. A sparkline previously took no formatter at all — its only
 *   text was the caller's headline figure, drawn elsewhere. The hover tooltip and the table
 *   both need one now, and making them required means a caller cannot ship a sparkline with a
 *   silently-inert hover layer by forgetting an optional prop — matching "defaults rather
 *   than requests" by construction rather than by convention.
 * - **The crosshair is CSS-only**, one hover column per array index (this file already
 *   positions by index — see above), each with a native `<title>` reporting the point's REAL
 *   `tMs` and value even though its on-screen x is compressed. There is no cross-series
 *   lookup to get wrong here — a sparkline is always one series — so unlike the full chart's
 *   hover tooltip there is no "exact match, never a neighbour's value" subtlety to record.
 * - **`ariaLabel` is REQUIRED and deliberately un-defaulted** (Q2 reconciliation, F12), for
 *   exactly the reason `StackedTimeSeriesChart`'s own prop doc gives: §6.1 puts a sparkline in
 *   GPU 0, GPU 1 and CPU, and the built-in sentence this component used to carry
 *   ("trend over the selected window") announced all three as the same thing. In table view
 *   that is worse than in chart view: a screen-reader user listing the page's tables heard
 *   three tables with identical names and a column called "value", leaving which card a table
 *   belongs to recoverable from DOM order alone — while §9 requires identity never rest on
 *   position or colour, and §6.2 promotes the table view to the thing that discharges it.
 * - **The table has no gap column.** HANDOVER's "a table view must represent gaps and nulls
 *   as honestly as the chart does" is satisfied by symmetry: this chart form does not
 *   represent gaps EITHER (the decision above), so a table claiming to show gaps this
 *   component cannot draw would say more than the chart it stands in for. Nulls still render
 *   `EM_DASH`, matching the broken polyline.
 */

import { Fragment } from 'react';

import { EM_DASH } from '@/lib/format';

import styles from './sparkline.module.css';
import './tokens.css';

export interface SparklinePoint {
  readonly tMs: number;
  readonly v: number | null;
}

export interface SparklineProps {
  readonly points: readonly SparklinePoint[];
  /**
   * REQUIRED, and never defaulted — the accessible name for this trend, in BOTH views (the
   * `<svg role="img">`'s label and the table's `<caption>`). See the module doc: a built-in
   * sentence names every sparkline on the page identically.
   */
  readonly ariaLabel: string;
  /** A resolved hex colour — the caller's, from `components/palette.ts` or a severity ramp. */
  readonly color: string;
  readonly width?: number;
  readonly height?: number;
  /**
   * §6.2's chart/table default — a PROP, not internal state, for the same reason the toggle
   * lives outside every other primitive here (see the module doc). `'chart'` by default.
   */
  readonly view?: 'chart' | 'table';
  /**
   * Q2, REQUIRED. Renders a reading for the hover tooltip and the table view — e.g.
   * `formatCelsius` bound to its unit. Called only on a readable number; a `null` point
   * renders `EM_DASH` without reaching it (§6.6's law 1, same contract as
   * `StackedTimeSeriesChart`'s `formatTick`). This file still formats nothing itself.
   */
  readonly formatValue: (v: number) => string;
  /**
   * Q2, REQUIRED. Renders a point's real `tMs` for the hover tooltip and the table's time
   * column — e.g. `formatTimeOfDay`. The sparkline's on-screen x is compressed to an index
   * (see the module doc), but the tooltip and table report the actual instant regardless.
   */
  readonly formatTime: (ms: number) => string;
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

/** Q2's hover columns — one per array INDEX (this file positions by index; see the module
 * doc), bounded to the midpoints of its neighbours so the pointer always lands on exactly one
 * column. Covers every point, readable or not: a `null` reading still gets a column, showing
 * `EM_DASH` rather than silently borrowing whichever readable neighbour's zone would
 * otherwise absorb it. */
interface HoverColumn {
  readonly index: number;
  readonly x: number;
  readonly xStart: number;
  readonly xEnd: number;
}

const hoverColumnsFor = (
  n: number,
  xFor: (index: number) => number,
  width: number,
): readonly HoverColumn[] =>
  Array.from({ length: n }, (_, index) => {
    const x = xFor(index);
    const xStart = index === 0 ? 0 : (xFor(index - 1) + x) / 2;
    const xEnd = index === n - 1 ? width : (x + xFor(index + 1)) / 2;
    return { index, x, xStart, xEnd };
  });

/** §6.2's table view — see the module doc for why there is no gap column. */
function SparklineTableView({
  points,
  ariaLabel,
  formatValue,
  formatTime,
}: Pick<SparklineProps, 'points' | 'ariaLabel' | 'formatValue' | 'formatTime'>) {
  if (points.length === 0) {
    return (
      <p className={styles.tableEmpty}>{`${ariaLabel} — no readings in the selected window`}</p>
    );
  }
  return (
    <table className={styles.table} data-role="table-view">
      <caption className="sr-only">{ariaLabel}</caption>
      <thead>
        <tr>
          <th scope="col">time</th>
          <th scope="col">value</th>
        </tr>
      </thead>
      <tbody>
        {points.map((p) => (
          <tr key={p.tMs}>
            {/* ⚠ A row HEADER, not a data cell — see the identical note in
                `stacked-time-series-chart.tsx` (Q2 reconciliation, F4). */}
            <th scope="row">{formatTime(p.tMs)}</th>
            {/* ⚠ `Number.isFinite` matches this file's OWN chart-path guard in `runsOf`: a
                non-finite reading is a break in the polyline, so it must not be a printed
                `NaN` in the table beside it (Q2 reconciliation, F6). */}
            <td>{p.v !== null && Number.isFinite(p.v) ? formatValue(p.v) : EM_DASH}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Sparkline({
  points,
  ariaLabel,
  color,
  width = 96,
  height = 24,
  view = 'chart',
  formatValue,
  formatTime,
}: SparklineProps) {
  if (view === 'table') {
    return (
      <SparklineTableView
        points={points}
        ariaLabel={ariaLabel}
        formatValue={formatValue}
        formatTime={formatTime}
      />
    );
  }

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
        aria-label={`${ariaLabel} — no readings in the selected window`}
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
  const hoverColumns = hoverColumnsFor(n, xFor, width);

  return (
    <svg
      className={styles.sparkline}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
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
            >
              <title>
                {`${formatTime((points[(run[0] as IndexedPoint).index] as SparklinePoint).tMs)}\n${formatValue((run[0] as IndexedPoint).v)}`}
              </title>
            </circle>
          )}
        </Fragment>
      ))}
      {last === undefined ? null : (
        <circle className={styles.end} cx={xFor(last.index)} cy={yFor(last.v)} r={2.5} fill={color}>
          <title>
            {`${formatTime((points[last.index] as SparklinePoint).tMs)}\n${formatValue(last.v)}`}
          </title>
        </circle>
      )}

      {/* Q2's crosshair — CSS-only, adjacent-sibling reveal (see the module doc and
          `StackedTimeSeriesChart`'s identical mechanism). Drawn last so its hit-target rects
          sit on top of every mark. */}
      <g data-role="hover">
        {hoverColumns.map((col) => {
          const p = points[col.index] as SparklinePoint;
          return (
            <Fragment key={col.index}>
              <rect
                className={styles.hoverZone}
                data-role="hover-zone"
                x={col.xStart}
                y={0}
                width={Math.max(0, col.xEnd - col.xStart)}
                height={height}
              >
                <title>{`${formatTime(p.tMs)}\n${p.v !== null && Number.isFinite(p.v) ? formatValue(p.v) : EM_DASH}`}</title>
              </rect>
              <g className={styles.crosshairGroup} data-role="crosshair" aria-hidden="true">
                <line x1={col.x} y1={0} x2={col.x} y2={height} className={styles.crosshairLine} />
              </g>
            </Fragment>
          );
        })}
      </g>
    </svg>
  );
}
