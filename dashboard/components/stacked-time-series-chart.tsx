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
 * inputs and this component does not cross-check them. A gap that intersects the window is
 * **always drawn at least {@link MIN_GAP_WIDTH} wide**: at a 2 h window one missed 5 s poll
 * is 0.77 px of a 6 px hatch, and a hatch nobody can see is the un-hatched line §6.5 forbids,
 * by another name.
 *
 * ### ⚠ Nothing is drawn at a time it was not read
 *
 * The end dot and its direct label sit at the **last readable point's own x**, never at the
 * right edge. A trace that stopped half an hour ago must not put a solid dot labelled
 * `69 °C` on the "now" tick — that is precisely the claim §6.2's age indicator exists to
 * stop the page making ("when polling fails, the page must visibly stop claiming to be
 * live"). Every mark is also clamped into its own plot box in **both** axes, so an
 * out-of-range reading pegs visibly at the top rail instead of being cropped away by the
 * viewBox — §6.3's 14,451 RPM ("the early warning for the condition that once hung POST")
 * is the reading that must never be silently clipped.
 *
 * ### ⚠ What this is NOT — and what it still OWES
 *
 * No hover layer, no crosshair, no tooltip, and no table view. **That is a gap, not a
 * decision**: `SPEC.md` §6.2 (amended 2026-09-07) says in as many words that the earlier
 * silence about them *"made the silence read as a prohibition — **it was not one**"*, that
 * they are **defaults rather than requests**, and that *"the table view is an accessibility
 * floor, not a convenience"*; §9's *Chart interaction* row repeats it. They remain outside
 * §6.2's four dashboard controls, which is a statement about the *controls*, not a refusal.
 * The step-9 handoff §5 predates that amendment and its "do not invent an interaction the
 * spec does not ask for" no longer applies to these two — where the handoff disagrees with
 * `SPEC.md`, the spec wins. Step 9's scope was the primitives; **the hover layer and the
 * table view are owed work, recorded for step 10** (see
 * `pipeline/steps/09-ui-primitives/reconciliation.md`, finding H2). Do not read this file's
 * silence as the question having been settled.
 */

import { Fragment } from 'react';

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
  /**
   * Uniqueness for this instance's `<defs>` — several charts may render on one page.
   * ⚠ **Unenforced, and unenforceable here**: a leaf component cannot see its siblings, and
   * the only React API that could mint one (`useId`) is a hook this file must not hold
   * (`purity.test.ts`). Two charts given the same `id` emit two `<pattern>` nodes with the
   * same id and the second chart's `url(#…)` resolves to the first one's — harmless while
   * the patterns are identical, latent the moment one varies. **It is the caller's
   * obligation**, and step 10 renders at least three charts on one page.
   */
  readonly id: string;
  /**
   * ⚠ What a screen reader is told this chart IS. Required, and deliberately not defaulted:
   * this component serves COOLING *and* §6.1's ≥1600 px per-GPU-card line charts, so any
   * built-in sentence would announce two of the three charts on screen as the wrong one.
   */
  readonly ariaLabel: string;
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
/** A 9 px glyph's height, and the baseline offset a tick label normally sits at. */
const TICK_LABEL_HEIGHT = 9;
const TICK_LABEL_OFFSET = 2;
/** ⚠ No gap is ever narrower than this — an invisible hatch is an un-hatched line (§6.5). */
const MIN_GAP_WIDTH = 2;
/** Legend geometry. `.chart` sets the mono face, so a glyph is ~0.6em of the 9 px size. */
const LEGEND_SWATCH = 16;
const LEGEND_TEXT_GAP = 4;
const LEGEND_ENTRY_GAP = 14;
const MONO_CHAR_WIDTH = 5.4;

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

/**
 * The plot's own y-domain: explicit bounds win; otherwise derived from its series' data.
 *
 * ⚠ Two properties that are easy to lose:
 *
 * - **An explicit bound survives having nothing to draw.** Returning a fabricated `[0, 1]`
 *   the moment no value is readable would throw away a `yMin`/`yMax` the caller stated.
 * - **A flat series never fabricates a negative floor.** `[min − 1, max + 1]` around a fan
 *   reading `0` labels an axis `-1 RPM`, a value a tach cannot produce, and draws the dead
 *   fan §6.3 calls an alarm at the exact vertical centre — the same place a healthy flat
 *   4,300 RPM would land. A non-negative flat value keeps `0` as its floor instead.
 */
const yDomainOf = (plot: ChartPlot): readonly [number, number] => {
  const values = plot.series
    .flatMap((s) => s.points)
    .map((p) => p.v)
    .filter((v): v is number => v !== null && Number.isFinite(v));

  if (values.length === 0) {
    const lo = plot.yMin ?? 0;
    const hi = plot.yMax ?? lo + 1;
    return hi > lo ? [lo, hi] : [lo, lo + 1];
  }

  const min = plot.yMin ?? Math.min(...values);
  const max = plot.yMax ?? Math.max(...values);
  if (min > max) return [min, min + 1];
  if (min === max) {
    const lo = min - 1;
    return [min >= 0 ? Math.max(0, lo) : lo, max + 1];
  }
  return [min, max];
};

/** Evenly spaced values across `[min, max]` — used for the TIME axis, whose ends are the
 * window's own bounds and must be shown exactly. */
const ticksBetween = (min: number, max: number, count: number): readonly number[] =>
  Array.from({ length: count }, (_, i) => min + ((max - min) * i) / (count - 1));

const NICE_STEPS = [1, 2, 5] as const;

/** The smallest `{1,2,5}×10^k` at or above `ideal`. */
const niceStepAtLeast = (ideal: number): number => {
  if (!Number.isFinite(ideal) || ideal <= 0) return 1;
  const magnitude = Math.pow(10, Math.floor(Math.log10(ideal)));
  for (const s of NICE_STEPS) {
    if (s * magnitude >= ideal) return s * magnitude;
  }
  return 10 * magnitude;
};

/** Every multiple of `step` inside `[min, max]`, bounded so a pathological step cannot spin. */
const multiplesWithin = (min: number, max: number, step: number): readonly number[] => {
  const epsilon = step * 1e-9;
  const first = Math.ceil(min / step - 1e-9) * step;
  const out: number[] = [];
  for (let i = 0; i < 64; i += 1) {
    const v = first + i * step;
    if (v > max + epsilon) break;
    out.push(Math.abs(v) < epsilon ? 0 : v);
  }
  return out;
};

/**
 * ⚠ Y-axis ticks at ROUND values, and never two gridlines carrying the same label.
 *
 * `ticksBetween` divides the domain evenly and hands the raw values to the caller's
 * formatter, which rounds them: an idle box flat at 66 °C produced gridlines at 65.667 and
 * 66.333 **both labelled `66 °C`**, 36.7 px apart, neither of them at 66. Ticks are placed
 * on multiples of a `{1,2,5}×10^k` step instead, and the step escalates until every
 * formatted label is distinct — which is the only way to respect a formatter whose
 * resolution (integer RPM) is coarser than the domain a flat series produces.
 */
const yTicksFor = (
  min: number,
  max: number,
  count: number,
  formatTick: (v: number) => string,
): readonly number[] => {
  let step = niceStepAtLeast((max - min) / Math.max(1, count - 1));
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const ticks = multiplesWithin(min, max, step);
    const labels = ticks.map(formatTick);
    if (ticks.length >= 2 && new Set(labels).size === labels.length) return ticks;
    step = niceStepAtLeast(step * 1.5);
  }
  return [min, max];
};

/**
 * Push a sorted-by-`y` list of end-label rows apart so none sit closer than the min gap,
 * **without leaving the plot box**. The dataviz reference is explicit that nudging labels
 * apart "detaches them from their lines"; the caller draws a leader line for every row this
 * moved, and the block is shifted back up when it would otherwise overrun the plot's floor
 * and land on the next plot's legend. (Three 12 px rows inside a ≥94 px plot cannot exhaust
 * the box; a caller with enough series to do so gets a clamp, not a silent overflow.)
 */
const spaceApart = (ys: readonly number[], minGap: number, maxY: number): readonly number[] => {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const adjusted: number[] = [];
  order.forEach((entry, position) => {
    const previous = adjusted[position - 1];
    adjusted.push(previous === undefined ? entry.y : Math.max(entry.y, previous + minGap));
  });
  const overflow = (adjusted[adjusted.length - 1] ?? 0) - maxY;
  const shifted = overflow > 0 ? adjusted.map((y) => y - overflow) : adjusted;
  const out = new Array<number>(ys.length);
  order.forEach((entry, position) => {
    out[entry.i] = clamp(shifted[position] as number, 0, maxY);
  });
  return out;
};

export function StackedTimeSeriesChart({
  id,
  ariaLabel,
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
        aria-label={`${ariaLabel} — no time range to plot`}
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
      aria-label={ariaLabel}
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
          const fromMs = gap.fromMs;
          const toMs = gap.toMs ?? domainEndMs;
          if (toMs < fromMs) return null;
          if (toMs < domainStartMs || fromMs > domainEndMs) return null;
          const fromX = xFor(fromMs);
          const toX = xFor(toMs);
          const gapWidth = Math.max(MIN_GAP_WIDTH, toX - fromX);
          return (
            <rect
              key={i}
              x={Math.min(fromX, Math.max(0, plotWidth - gapWidth))}
              y={0}
              width={gapWidth}
              height={plotsHeight}
              fill={`url(#${hatchId})`}
              data-gap-reason={gap.reason}
            />
          );
        })}
      </g>

      {plots.map((plot, plotIndex) => {
        const top = plotTops[plotIndex] as number;
        // ⚠ A legend is also what identifies a SINGLE series that carries no end-label —
        // without one that plot has no text at all and identity falls back to colour alone,
        // which §6.3 forbids and §9 answers with "colour PLUS dash PLUS a direct label".
        const legendNeeded =
          plot.series.length >= 2 || plot.series.some((s) => s.endLabel == null);
        const chartTop = legendNeeded ? LEGEND_HEIGHT : 0;
        const chartHeight = plotHeight - chartTop;
        const [yMin, yMax] = yDomainOf(plot);
        // ⚠ Clamped, exactly as `xFor` is: a reading outside the caller's scale pegs at the
        // rail rather than being drawn off-canvas and cropped by the UA's default
        // `svg:not(:root) { overflow: hidden }` — or, with overflow visible, painted across
        // the plot above it.
        const yFor = (v: number): number =>
          clamp(chartHeight - ((v - yMin) / (yMax - yMin)) * chartHeight, 0, chartHeight);

        const endRows = plot.series
          .map((s) => {
            const runs = runsOf(s.points);
            const lastRun = runs[runs.length - 1];
            const lastPoint = lastRun?.points[lastRun.points.length - 1];
            return lastPoint === undefined || s.endLabel == null
              ? null
              : {
                  id: s.id,
                  color: s.color,
                  text: s.endLabel,
                  x: xFor(lastPoint.tMs),
                  y: yFor(lastPoint.v),
                };
          })
          .filter(
            (r): r is { id: string; color: string; text: string; x: number; y: number } =>
              r !== null,
          );
        const spacedYs = spaceApart(
          endRows.map((r) => r.y),
          END_LABEL_MIN_GAP,
          chartHeight,
        );

        let legendX = 0;

        return (
          <g key={plot.id} transform={`translate(0, ${top})`} data-role="plot">
            {legendNeeded && (
              <g data-role="legend">
                {plot.series.map((s) => {
                  // ⚠ Laid out by the label's own width, not a fixed pitch: `GPU 0
                  // temperature` is ~92 px at this size and overran a 90 px slot.
                  const entryX = legendX;
                  legendX +=
                    LEGEND_SWATCH +
                    LEGEND_TEXT_GAP +
                    s.label.length * MONO_CHAR_WIDTH +
                    LEGEND_ENTRY_GAP;
                  return (
                    <g key={s.id} transform={`translate(${entryX}, 0)`}>
                      <line
                        x1={0}
                        y1={LEGEND_HEIGHT / 2}
                        x2={LEGEND_SWATCH}
                        y2={LEGEND_HEIGHT / 2}
                        stroke={s.color}
                        strokeWidth={2}
                        strokeDasharray={s.dashed === true ? '4 3' : undefined}
                      />
                      <text
                        x={LEGEND_SWATCH + LEGEND_TEXT_GAP}
                        y={LEGEND_HEIGHT / 2 + 3}
                        className={styles.legendLabel}
                      >
                        {s.label}
                      </text>
                    </g>
                  );
                })}
              </g>
            )}

            <g transform={`translate(0, ${chartTop})`}>
              <g data-role="y-axis">
                {yTicksFor(yMin, yMax, Y_TICKS, plot.formatTick).map((v, i) => {
                  const y = yFor(v);
                  // The top gridline's label would otherwise sit at y = −2, entirely above
                  // the viewBox — the maximum of the scale, invisible. Drop it under its own
                  // line instead of off the canvas.
                  const labelY =
                    y - TICK_LABEL_OFFSET < TICK_LABEL_HEIGHT
                      ? y + TICK_LABEL_HEIGHT
                      : y - TICK_LABEL_OFFSET;
                  return (
                    <g key={i}>
                      <line x1={0} y1={y} x2={plotWidth} y2={y} className={styles.gridline} />
                      <text x={2} y={labelY} className={styles.tickLabel}>
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
                      // A Fragment, not a <g>: an extra group would nest inside
                      // `data-series` and change what that element contains.
                      <Fragment key={i}>
                        <polyline
                          className={styles.line}
                          stroke={s.color}
                          strokeDasharray={s.dashed === true ? '5 4' : undefined}
                          points={run.points.map((p) => `${xFor(p.tMs)},${yFor(p.v)}`).join(' ')}
                        />
                        {/* ⚠ A one-point run has no geometry: `<polyline points="277,55">`
                            paints nothing at all, so a window holding exactly one reading —
                            the first poll after a resume, or a channel that enumerated once
                            and vanished — drew an empty plot with a dot at "now". The
                            polyline still stands for the run; this dot is what is seen. */}
                        {run.points.length === 1 && (
                          <circle
                            className={styles.point}
                            cx={xFor((run.points[0] as { tMs: number; v: number }).tMs)}
                            cy={yFor((run.points[0] as { tMs: number; v: number }).v)}
                            r={2}
                            fill={s.color}
                            data-role="lone-point"
                          />
                        )}
                      </Fragment>
                    ))}
                  </g>
                ))}
              </g>

              <g data-role="end-labels">
                {endRows.map((row, i) => {
                  const labelY = spacedYs[i] as number;
                  const moved = Math.abs(labelY - row.y) > 0.5;
                  return (
                    <g key={row.id}>
                      <circle cx={row.x} cy={row.y} r={2.5} fill={row.color} className={styles.endDot} />
                      {moved && (
                        <line
                          x1={row.x + 2}
                          y1={row.y}
                          x2={row.x + 5}
                          y2={labelY - 3}
                          stroke={row.color}
                          className={styles.leader}
                        />
                      )}
                      <text x={row.x + 6} y={labelY} className={styles.endLabel}>
                        {row.text}
                      </text>
                    </g>
                  );
                })}
              </g>
            </g>
          </g>
        );
      })}

      <g transform={`translate(0, ${plotsHeight})`} data-role="x-axis">
        {ticksBetween(domainStartMs, domainEndMs, X_TICKS).map((t, i) => (
          <text
            key={i}
            x={xFor(t)}
            y={14}
            className={styles.tickLabel}
            // ⚠ `middle` at x = 0 hangs half the window's start time left of the viewBox,
            // where the UA's default overflow crops it. The ends anchor inward.
            textAnchor={i === 0 ? 'start' : i === X_TICKS - 1 ? 'end' : 'middle'}
          >
            {formatTime(t)}
          </text>
        ))}
      </g>
    </svg>
  );
}
