/**
 * §6.2's cooling chart: **"Two stacked plots on one shared x-axis. Never a dual y-axis on
 * one plot."** (§9). Generic over 1..N plots rather than hard-coded to "temperature + fan",
 * because the same shape — the ≥1600px "sparklines promoted to full line charts inside the
 * GPU cards" (§6.1) — is a single-plot use of exactly this component, and writing a second
 * chart primitive for that would be a second spelling of the same geometry. This is still
 * ONE primitive from the handoff's list ("stacked cooling chart"), written to the width its
 * one real caller (COOLING) actually needs.
 *
 * ### The structural guarantee behind "never a dual y-axis"
 *
 * A {@link ChartPlot} carries exactly one `formatTick`/`yMin`/`yMax` — one scale. Two scales
 * are therefore two `ChartPlot`s, i.e. two entries in `plots`, each drawn as its own row with
 * its own single axis; the type has no member through which a caller could attach a second
 * scale to one plot. The x-axis is rendered exactly **once**, after every plot, regardless of
 * how many plots there are — never duplicated per plot.
 *
 * ### Never formats a number
 *
 * This file imports nothing from `lib/format.ts` and does not call `Intl` or `toFixed`
 * anywhere. Every axis label — a y-tick's value, a time tick, a series' end-of-line value —
 * is produced by a caller-supplied formatter (`ChartPlot.formatTick`,
 * `StackedTimeSeriesChartProps.formatTime`, `ChartSeries.endLabel`), so the chart is
 * generic over what unit it is drawing.
 *
 * ### ⚠ Hatched gaps come from `gaps`, never from holes in a series
 *
 * HANDOVER rule 3, drawn: a {@link Gap} rect is derived only from `gaps`' own `fromMs`/`toMs`
 * — never from a run of `null`s inside `series.points`, which decimation can and does drop
 * inside an otherwise-readable bucket (`lib/client/series.ts`). The two are independent
 * inputs and this component does not cross-check them.
 *
 * ### What this is NOT
 *
 * No hover, no crosshair, no tooltip, and no table-view toggle. Both are dataviz defaults
 * this project deliberately does not add — see the step notes: §6.2 lists this as a
 * single-screen wall panel with an exhaustive, hover-free control set, and inventing
 * interactive chrome the spec does not ask for is exactly what the handoff tells step 9 not
 * to do. Recorded as a gap for the owner, the same way the handoff treats the hover layer.
 */

import type { Gap } from '@/lib/client/gaps';
import type { SeriesPoint } from '@/lib/client/series';

import styles from './stacked-time-series-chart.module.css';
import './tokens.css';

export interface ChartSeries {
  readonly id: string;
  /** The direct end-label's text and the legend's row (dataviz: identity, never colour alone). */
  readonly label: string;
  /** A resolved hex colour — `components/palette.ts`'s, or a severity ramp step. */
  readonly color: string;
  /** §9: GPU 1 is dashed. Everything else defaults to solid. */
  readonly dashed?: boolean;
  readonly points: readonly SeriesPoint[];
  /** Pre-formatted — e.g. `66 °C`. `null`/omitted draws no end-label for this series. */
  readonly endLabel?: string | null;
}

export interface ChartPlot {
  readonly id: string;
  /** Exactly one scale. See the module doc — this is the "never a dual y-axis" guarantee. */
  readonly series: readonly ChartSeries[];
  readonly formatTick: (v: number) => string;
  readonly yMin?: number;
  readonly yMax?: number;
}

export interface StackedTimeSeriesChartProps {
  /** Uniqueness for this instance's `<defs>` — several charts may render on one page. */
  readonly id: string;
  readonly plots: readonly ChartPlot[];
  /** Hatched independently of any series' own nulls — see the module doc. */
  readonly gaps: readonly Gap[];
  /** The window's bounds, explicit — never inferred from the data (see the step notes). */
  readonly domainStartMs: number;
  readonly domainEndMs: number;
  readonly formatTime: (ms: number) => string;
  readonly width?: number;
  readonly plotHeight?: number;
}

const AXIS_HEIGHT = 20;
const PLOT_GAP = 10;
const LEGEND_HEIGHT = 16;
const Y_TICKS = 4;
const X_TICKS = 5;
const END_LABEL_MIN_GAP = 12;
/** Reserved at the right edge for a direct end-label, so it is never clipped (see below). */
const END_LABEL_MARGIN = 46;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

interface Run {
  readonly points: readonly { readonly tMs: number; readonly v: number }[];
}

/** Maximal runs of consecutive readable points — a `null` breaks the line (invariant 1). */
const runsOf = (points: readonly SeriesPoint[]): readonly Run[] => {
  const runs: Run[] = [];
  let current: { tMs: number; v: number }[] = [];
  for (const p of points) {
    if (p.v === null || !Number.isFinite(p.v)) {
      if (current.length > 0) runs.push({ points: current });
      current = [];
    } else {
      current.push({ tMs: p.tMs, v: p.v });
    }
  }
  if (current.length > 0) runs.push({ points: current });
  return runs;
};

/** The plot's own y-domain: explicit bounds win; otherwise derived from its series' data. */
const yDomainOf = (plot: ChartPlot): readonly [number, number] => {
  if (plot.yMin !== undefined && plot.yMax !== undefined) return [plot.yMin, plot.yMax];
  const values = plot.series
    .flatMap((s) => s.points)
    .map((p) => p.v)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  if (values.length === 0) return [0, 1];
  const min = plot.yMin ?? Math.min(...values);
  const max = plot.yMax ?? Math.max(...values);
  if (min === max) return [min - 1, max + 1];
  return [min, max];
};

/** Evenly spaced tick VALUES — not "nice round numbers" (recorded simplification, see notes). */
const ticksBetween = (min: number, max: number, count: number): readonly number[] =>
  Array.from({ length: count }, (_, i) => min + ((max - min) * i) / (count - 1));

/** Push a sorted-by-`y` list of end-label rows apart so none sit closer than the min gap. */
const spaceApart = (ys: readonly number[], minGap: number): readonly number[] => {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const adjusted: number[] = [];
  order.forEach((entry, position) => {
    const previous = adjusted[position - 1];
    adjusted.push(previous === undefined ? entry.y : Math.max(entry.y, previous + minGap));
  });
  const out = new Array<number>(ys.length);
  order.forEach((entry, position) => {
    out[entry.i] = adjusted[position] as number;
  });
  return out;
};

export function StackedTimeSeriesChart({
  id,
  plots,
  gaps,
  domainStartMs,
  domainEndMs,
  formatTime,
  width = 600,
  plotHeight = 110,
}: StackedTimeSeriesChartProps) {
  if (plots.length === 0 || domainEndMs <= domainStartMs) {
    return (
      <svg
        className={styles.chart}
        width={width}
        height={plotHeight}
        role="img"
        aria-label="no time range to plot"
        data-empty="true"
      />
    );
  }

  // Room on the right for a direct end-label (e.g. "4,308 RPM") past the last plotted point,
  // so a label is never clipped by the viewBox it is drawn in.
  const plotWidth = Math.max(1, width - END_LABEL_MARGIN);
  const xFor = (tMs: number): number =>
    clamp(((tMs - domainStartMs) / (domainEndMs - domainStartMs)) * plotWidth, 0, plotWidth);

  const plotTops = plots.map((_, i) => i * (plotHeight + PLOT_GAP));
  const plotsHeight = plots.length * plotHeight + (plots.length - 1) * PLOT_GAP;
  const totalHeight = plotsHeight + AXIS_HEIGHT;
  const hatchId = `${id}-hatch`;

  return (
    <svg
      className={styles.chart}
      width={width}
      height={totalHeight}
      viewBox={`0 0 ${width} ${totalHeight}`}
      role="img"
      aria-label="cooling: temperature and fan speed over the selected window"
    >
      <defs>
        <pattern id={hatchId} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" className={styles.hatchGround} />
          <line x1="0" y1="0" x2="0" y2="6" className={styles.hatchLine} />
        </pattern>
      </defs>

      {/* Hatched gaps — shared across every plot, drawn from `gaps` alone (rule 3). */}
      <g data-role="gaps">
        {gaps.map((gap, i) => {
          const fromX = xFor(gap.fromMs);
          const toX = xFor(gap.toMs ?? domainEndMs);
          if (toX <= fromX) return null;
          return (
            <rect
              key={i}
              x={fromX}
              y={0}
              width={toX - fromX}
              height={plotsHeight}
              fill={`url(#${hatchId})`}
              data-gap-reason={gap.reason}
            />
          );
        })}
      </g>

      {plots.map((plot, plotIndex) => {
        const top = plotTops[plotIndex] as number;
        const legendNeeded = plot.series.length >= 2;
        const chartTop = legendNeeded ? LEGEND_HEIGHT : 0;
        const chartHeight = plotHeight - chartTop;
        const [yMin, yMax] = yDomainOf(plot);
        const yFor = (v: number): number => chartHeight - ((v - yMin) / (yMax - yMin)) * chartHeight;

        const endRows = plot.series
          .map((s) => {
            const runs = runsOf(s.points);
            const lastRun = runs[runs.length - 1];
            const lastPoint = lastRun?.points[lastRun.points.length - 1];
            return lastPoint === undefined || s.endLabel == null
              ? null
              : { id: s.id, color: s.color, text: s.endLabel, y: yFor(lastPoint.v) };
          })
          .filter((r): r is { id: string; color: string; text: string; y: number } => r !== null);
        const spacedYs = spaceApart(
          endRows.map((r) => r.y),
          END_LABEL_MIN_GAP,
        );

        return (
          <g key={plot.id} transform={`translate(0, ${top})`} data-role="plot">
            {legendNeeded && (
              <g data-role="legend">
                {plot.series.map((s, i) => (
                  <g key={s.id} transform={`translate(${i * 90}, 0)`}>
                    <line
                      x1={0}
                      y1={LEGEND_HEIGHT / 2}
                      x2={16}
                      y2={LEGEND_HEIGHT / 2}
                      stroke={s.color}
                      strokeWidth={2}
                      strokeDasharray={s.dashed === true ? '4 3' : undefined}
                    />
                    <text x={20} y={LEGEND_HEIGHT / 2 + 3} className={styles.legendLabel}>
                      {s.label}
                    </text>
                  </g>
                ))}
              </g>
            )}

            <g transform={`translate(0, ${chartTop})`}>
              <g data-role="y-axis">
                {ticksBetween(yMin, yMax, Y_TICKS).map((v, i) => {
                  const y = yFor(v);
                  return (
                    <g key={i}>
                      <line x1={0} y1={y} x2={plotWidth} y2={y} className={styles.gridline} />
                      <text x={2} y={y - 2} className={styles.tickLabel}>
                        {plot.formatTick(v)}
                      </text>
                    </g>
                  );
                })}
              </g>

              <g data-role="series">
                {plot.series.map((s) => (
                  <g key={s.id} data-series={s.id}>
                    {runsOf(s.points).map((run, i) => (
                      <polyline
                        key={i}
                        className={styles.line}
                        stroke={s.color}
                        strokeDasharray={s.dashed === true ? '5 4' : undefined}
                        points={run.points.map((p) => `${xFor(p.tMs)},${yFor(p.v)}`).join(' ')}
                      />
                    ))}
                  </g>
                ))}
              </g>

              <g data-role="end-labels">
                {endRows.map((row, i) => (
                  <g key={row.id}>
                    <circle
                      cx={plotWidth}
                      cy={row.y}
                      r={2.5}
                      fill={row.color}
                      className={styles.endDot}
                    />
                    <text x={plotWidth + 6} y={spacedYs[i] as number} className={styles.endLabel}>
                      {row.text}
                    </text>
                  </g>
                ))}
              </g>
            </g>
          </g>
        );
      })}

      <g transform={`translate(0, ${plotsHeight})`} data-role="x-axis">
        {ticksBetween(domainStartMs, domainEndMs, X_TICKS).map((t, i) => (
          <text key={i} x={xFor(t)} y={14} className={styles.tickLabel} textAnchor="middle">
            {formatTime(t)}
          </text>
        ))}
      </g>
    </svg>
  );
}
