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
 * This file imports exactly one thing from `lib/format.ts`: {@link EM_DASH}, the fixed
 * null-marker invariant 1 requires — never a formatter, and never `Intl` or `toFixed`
 * called directly. Every UNIT-BEARING label — a y-tick's value, a time tick, a series'
 * end-of-line value, a hover tooltip's or table cell's reading — is produced by a
 * caller-supplied formatter (`ChartPlot.formatTick`, `StackedTimeSeriesChartProps.formatTime`,
 * `ChartSeries.endLabel`), so the chart stays generic over what unit it is drawing.
 * `formatTick` is called only on a **readable** number; a `null` reading renders `EM_DASH`
 * without ever reaching it, exactly as `formatTick` is already used for axis ticks (which are
 * never `null`).
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
 * ### ⚠ Q2 — the hover layer and the table view, both CSS/SVG-native, no hook
 *
 * `SPEC.md` §6.2 (amended 2026-09-07, per §9's *Chart interaction* row) makes both **defaults
 * rather than requests**: "a crosshair + tooltip on a line or area plot … and a table view so
 * the numbers are reachable without reading pixels." `components/purity.test.ts` forbids
 * every React hook in this directory, so neither is built the way a typical chart library
 * would — no `pointermove` handler, no hover-position state, no `useId`. Both are expressed as
 * **props plus markup**, and the view TOGGLE is the caller's state (`view`, a prop — see
 * `StackedTimeSeriesChartProps.view`), matching the sparkline's own "a primitive that picked
 * its own size would be deciding layout from a leaf" reasoning one level up: a primitive that
 * owned its own view toggle would be deciding page behaviour from a leaf the same way.
 *
 * **The crosshair is CSS-only, using an adjacent-sibling reveal.** For every distinct instant
 * any series has a point at, a transparent, full-height `<rect class="hoverZone">` sits over
 * that instant's pixel span (bounded by the midpoints to its neighbours — a Voronoi partition
 * of the x-axis, so whichever zone the pointer is over IS the nearest data position, with no
 * JS computing "nearest"). Immediately after it in the same `<g>`, an adjacent
 * `<g class="crosshairGroup">` holds the vertical line; `.hoverZone:hover + .crosshairGroup`
 * reveals it. No id, no `useState`, no listener — CSS does the entire "snap to nearest"
 * behaviour through the geometry of the zones themselves.
 *
 * **The tooltip is a native SVG `<title>`**, a child of the same `<rect>`, listing the
 * instant and every series' reading AT THAT EXACT `tMs` — never a nearest-neighbour guess
 * across series. A series with no point at that instant renders `EM_DASH` in the tooltip
 * rather than borrowing a neighbour's value and mislabelling it with a timestamp it was not
 * read at (invariant 1, extended across series). The same `<title>` treatment is on the two
 * discrete marks the chart already draws — a lone-point run's dot and an end-label's dot.
 *
 * ⚠ **Those two mark titles are OCCLUDED, and §6.2's "per-mark tooltip on bars and dots" is
 * NOT delivered by them.** The hover layer is painted LAST and its rects carry
 * `pointer-events: all` across the whole plot body, so SVG hit-testing hands the pointer to the
 * zone, never to the circle beneath it. The only reachable remnant is the ~2.5px crescent of
 * the end dot that protrudes past `plotWidth`. The titles are kept because the markup is
 * correct and becomes reachable again if paint order ever changes — but what a user actually
 * reads at a mark is the hover column's tooltip, which carries the same instant and every
 * series' value at it. §6.2's bar/dot clause is an OPEN SPEC QUESTION (Q2 reconciliation, F2):
 * `components/` has no bar or dot CHART TYPE to attach it to (Meter is a single
 * already-labelled bar, not a per-mark series), and on a line chart a full-body crosshair layer
 * necessarily shadows the marks it covers — the two requirements are in tension.
 *
 * **Cost, stated per §6.7's per-series budget:** in the case every real caller in this project
 * produces — every series in one chart sharing a single sample clock (`state.ring`) — the
 * distinct-instant count is bounded by max(series length) ≈ 600, not 600×N. In the adversarial
 * case (independently decimated series whose buckets never land on the same instant), it is
 * bounded above by 600×N, and the hover layer costs one `<rect>` + one `<title>` + one `<line>`
 * per instant — linear, not quadratic, and still small next to the chart's own point count at
 * that N. See the build notes for the full worked figures.
 *
 * **The table view renders ONE `<table>` per plot**, not one merged table across plots: a
 * merged table would put two different units in adjacent cells of one row, which is the same
 * mistake §9 already rejects for a chart's y-axis ("never a dual y-axis on one plot") one level
 * removed — one table, one scale. Cell text reuses the SAME `formatTick`/`formatTime` as the
 * chart (§6.6: use `lib/format.ts`'s formatters via the caller, never a component's own). A
 * `null` reading renders `EM_DASH`, matching the chart's broken polyline. **Gaps get their own
 * row**, spanning every column, so a table reader learns time passed with nothing sampled
 * rather than seeing two readings sit on adjacent lines as if nothing happened between them —
 * the tabular equivalent of the hatched rectangle §6.7 requires in the chart.
 *
 * ⚠ **Keyboard/AT parity is intentionally NOT via making 600 hover zones focusable.** Tabbing
 * through hundreds of stops to read one chart is worse than the table view it exists beside;
 * dataviz's "same details on keyboard focus as on hover" is honoured by the table view being a
 * full, always-available substitute for every value the hover layer can show — not by cloning
 * the hover interaction onto a focus ring. Recorded as a decision, not an oversight — see the
 * build notes.
 */

import { Fragment } from 'react';

import { EM_DASH } from '@/lib/format';
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
  /**
   * §6.2's chart/table default — a PROP, not internal state (`purity.test.ts` forbids the
   * hook a self-toggling primitive would need). `'chart'` is the default so an existing
   * caller that never sets this keeps drawing exactly what it drew before Q2. The stateful
   * owner of the actual toggle control is step 10's, per the handoff.
   */
  readonly view?: 'chart' | 'table';
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

// ---------------------------------------------------------------------------
// Q2 — hover layer helpers
// ---------------------------------------------------------------------------

/** `tMs -> v` for one series, so a hover lookup at an arbitrary instant is O(1) rather than
 * an O(points) scan repeated once per hover column. */
const pointMapFor = (points: readonly SeriesPoint[]): Map<number, number | null> => {
  const m = new Map<number, number | null>();
  for (const p of points) m.set(p.tMs, p.v);
  return m;
};

/**
 * Every distinct instant ANY series across ANY plot has a point at, ascending.
 *
 * ⚠ §6.7's per-series budget means this can reach 600 × (total series across every plot) in
 * the adversarial case where no two series' decimation lands on the same instant. In the case
 * every caller in this project actually produces — every series drawn from one poll of
 * `state.ring` — the series share a sample clock and this collapses to ~600. See the module
 * doc's cost note.
 */
const hoverInstantsFor = (plots: readonly ChartPlot[]): readonly number[] => {
  const set = new Set<number>();
  for (const plot of plots) {
    for (const s of plot.series) {
      for (const p of s.points) set.add(p.tMs);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
};

interface HoverColumn {
  readonly atMs: number;
  readonly x: number;
  readonly xStart: number;
  readonly xEnd: number;
}

/**
 * A 1-D partition of `[0, plotWidth]` by nearest instant — each column's bounds sit at the
 * midpoint to its neighbours, so whichever `<rect>` the pointer lands on IS the nearest data
 * position. This is what lets "the crosshair … snaps to the nearest data position" (dataviz)
 * happen with no JS computing a nearest-neighbour: the geometry already encodes it.
 */
const hoverColumnsFor = (
  instants: readonly number[],
  xFor: (tMs: number) => number,
  plotWidth: number,
): readonly HoverColumn[] =>
  instants
    .map((atMs, i) => {
      const x = xFor(atMs);
      const prev = instants[i - 1];
      const next = instants[i + 1];
      const xStart = prev === undefined ? 0 : (xFor(prev) + x) / 2;
      const xEnd = next === undefined ? plotWidth : (x + xFor(next)) / 2;
      return { atMs, x, xStart: clamp(xStart, 0, plotWidth), xEnd: clamp(xEnd, 0, plotWidth) };
    })
    // ⚠ `xFor` CLAMPS, so two instants that both fall outside the domain collapse onto the
    // same edge and yield xStart === xEnd — a zero-width, unhoverable `<rect>` that still
    // emits its own crosshair `<g>`. Every count assertion (`hoverZoneCount === crosshairCount`)
    // is satisfied by such dead nodes, which is exactly why they must not be emitted. This does
    // NOT make the component safe against a domain that excludes its own points — the last
    // out-of-domain instant still owns the span up to the first in-domain midpoint (Q2
    // reconciliation, F9, deferred to step 10): the caller must supply a domain containing the
    // points it passes, as `traceFor` does by windowing the ring before decimating.
    .filter((col) => col.xEnd > col.xStart);

/**
 * The native `<title>` text for one hover column — every plot's every series, at exactly
 * `atMs`. A series with no point at that instant renders {@link EM_DASH} rather than a
 * neighbouring reading wearing a timestamp it was not read at (invariant 1, extended across
 * series — see the module doc).
 */
const hoverTooltipFor = (
  plots: readonly ChartPlot[],
  maps: readonly (readonly Map<number, number | null>[])[],
  atMs: number,
  formatTime: (ms: number) => string,
): string => {
  const lines = [formatTime(atMs)];
  plots.forEach((plot, plotIndex) => {
    plot.series.forEach((s, seriesIndex) => {
      const v = maps[plotIndex]?.[seriesIndex]?.get(atMs);
      // ⚠ `Number.isFinite` matches the CHART path's own guard (`runsOf`, `yDomainOf`): a
      // NaN reaching this chart from a caller's derived `pick` (a rate, a ratio over a zero
      // denominator) is a silent BREAK in the polyline, so it must not be a printed
      // `NaN °C` in the tooltip beside it. Written as one positive test rather than three
      // negative clauses, since `Number.isFinite` already rejects `null` and `undefined`
      // and a redundant clause is a mutation nothing can distinguish.
      lines.push(`${s.label}: ${typeof v === 'number' && Number.isFinite(v) ? plot.formatTick(v) : EM_DASH}`);
    });
  });
  return lines.join('\n');
};

// ---------------------------------------------------------------------------
// Q2 — table view
// ---------------------------------------------------------------------------

interface SampleRow {
  readonly kind: 'sample';
  readonly sortMs: number;
  readonly tMs: number;
  readonly cells: readonly string[];
}

interface GapRow {
  readonly kind: 'gap';
  readonly sortMs: number;
  readonly reason: Gap['reason'];
  readonly fromMs: number;
  readonly toMs: number | null;
}

type TableRow = SampleRow | GapRow;

/**
 * One plot's table rows: every distinct instant its OWN series report, formatted through
 * `plot.formatTick` exactly as the chart's axis and tooltip are — plus a gap row wherever a
 * hatch would be drawn, spanning every column, so a table reader learns time passed with
 * nothing sampled rather than reading two rows as if they were adjacent polls.
 */
const tableRowsFor = (
  plot: ChartPlot,
  gaps: readonly Gap[],
  domainStartMs: number,
  domainEndMs: number,
): readonly TableRow[] => {
  const maps = plot.series.map((s) => pointMapFor(s.points));
  const instants = Array.from(new Set(plot.series.flatMap((s) => s.points.map((p) => p.tMs))));
  instants.sort((a, b) => a - b);

  const sampleRows: TableRow[] = instants.map((tMs) => ({
    kind: 'sample',
    sortMs: tMs,
    tMs,
    cells: maps.map((m) => {
      const v = m.get(tMs);
      // ⚠ Same guard as the tooltip's, for the same reason — see `hoverTooltipFor`.
      return typeof v === 'number' && Number.isFinite(v) ? plot.formatTick(v) : EM_DASH;
    }),
  }));

  // ⚠ The SAME two filters the chart branch applies to its hatch rectangles, and they must
  // stay the same two: `lib/client/runtime.ts` prunes gaps against `LONGEST_WINDOW_MS`
  // (120 min) while the selectable window is 10/30/120 min, so `gaps` legitimately holds
  // entries up to 110 minutes older than a default 30-minute domain. Without this the table
  // view claims a gap the chart correctly does not hatch, at two times that are not on the
  // axis — the table asserting MORE than the chart, which is the inverse of the symmetry the
  // sparkline's missing gap column is argued from. (Q2 reconciliation, F5/F5a.)
  const gapRows: TableRow[] = gaps
    .filter((g) => {
      const toMs = g.toMs ?? domainEndMs;
      if (toMs < g.fromMs) return false;
      return toMs >= domainStartMs && g.fromMs <= domainEndMs;
    })
    .map((g) => ({
      kind: 'gap',
      sortMs: g.fromMs,
      reason: g.reason,
      fromMs: g.fromMs,
      toMs: g.toMs,
    }));

  return [...sampleRows, ...gapRows].sort((a, b) => a.sortMs - b.sortMs);
};

/**
 * §6.2's table view — one `<table>` per plot (see the module doc for why not one merged
 * table). A pure function of the same props the chart branch reads; not exported, since the
 * `view` prop on {@link StackedTimeSeriesChart} is the only public entry point.
 */
function ChartTableView({
  ariaLabel,
  plots,
  gaps,
  domainStartMs,
  domainEndMs,
  formatTime,
}: Pick<
  StackedTimeSeriesChartProps,
  'ariaLabel' | 'plots' | 'gaps' | 'domainStartMs' | 'domainEndMs' | 'formatTime'
>) {
  if (plots.length === 0) {
    return <p className={styles.tableEmpty}>{ariaLabel} — no time range to plot</p>;
  }

  return (
    <div className={styles.tableView} role="group" aria-label={ariaLabel} data-role="table-view">
      {plots.map((plot) => {
        const rows = tableRowsFor(plot, gaps, domainStartMs, domainEndMs);
        return (
          <table key={plot.id} className={styles.table} data-role="plot-table">
            <caption className="sr-only">{plot.series.map((s) => s.label).join(', ')}</caption>
            <thead>
              <tr>
                <th scope="col">time</th>
                {plot.series.map((s) => (
                  <th scope="col" key={s.id}>
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {/* ⚠ `plots.length === 0` is the empty case a caller essentially never produces —
                  COOLING always passes its two `ChartPlot`s. The one it DOES produce is a plot
                  whose series reported nothing for the whole window (a collector failing
                  throughout, §6.5's degraded state), and that used to render a header row over
                  an empty `<tbody>`: silence, with no `—` and no sentence, where the sparkline
                  says so in words. (Q2 reconciliation, F7.) */}
              {rows.length === 0 && (
                <tr data-role="empty-row">
                  <td colSpan={plot.series.length + 1}>no readings in the selected window</td>
                </tr>
              )}
              {rows.map((row) =>
                row.kind === 'gap' ? (
                  <tr key={`gap-${row.fromMs}`} className={styles.gapRow} data-role="gap-row">
                    <td colSpan={plot.series.length + 1}>
                      {`gap (${row.reason}) — ${formatTime(row.fromMs)} to `}
                      {row.toMs === null ? 'ongoing' : formatTime(row.toMs)}
                    </td>
                  </tr>
                ) : (
                  <tr key={row.tMs}>
                    {/* ⚠ A row HEADER, not a data cell: a screen reader arrowing across a row
                        announces the column header plus the cell, so with a plain `<td>` here a
                        reading is announced as "GPU 0, 66 °C" with no way to learn WHICH of the
                        several hundred instants it belongs to without arrowing back to column 1.
                        The chart's crosshair binds a reading to its instant; this is how the
                        table — which §6.2 makes the accessibility floor, and which this build
                        leans on in place of keyboard parity — binds the same two together.
                        (Q2 reconciliation, F4.) */}
                    <th scope="row">{formatTime(row.tMs)}</th>
                    {row.cells.map((c, i) => (
                      <td key={plot.series[i]?.id ?? i}>{c}</td>
                    ))}
                  </tr>
                ),
              )}
            </tbody>
          </table>
        );
      })}
    </div>
  );
}

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
  view = 'chart',
}: StackedTimeSeriesChartProps) {
  if (view === 'table') {
    return (
      <ChartTableView
        ariaLabel={ariaLabel}
        plots={plots}
        gaps={gaps}
        domainStartMs={domainStartMs}
        domainEndMs={domainEndMs}
        formatTime={formatTime}
      />
    );
  }

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

  // Q2's hover layer — see the module doc for the cost analysis and the "why exact-match,
  // never nearest-neighbour across series" reasoning.
  const hoverInstants = hoverInstantsFor(plots);
  const hoverColumns = hoverColumnsFor(hoverInstants, xFor, plotWidth);
  const hoverMaps = plots.map((plot) => plot.series.map((s) => pointMapFor(s.points)));

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
                  label: s.label,
                  color: s.color,
                  text: s.endLabel,
                  tMs: lastPoint.tMs,
                  x: xFor(lastPoint.tMs),
                  y: yFor(lastPoint.v),
                };
          })
          .filter(
            (r): r is {
              id: string;
              label: string;
              color: string;
              text: string;
              tMs: number;
              x: number;
              y: number;
            } => r !== null,
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
                          >
                            {/* §6.2's per-mark tooltip, for the one discrete DOT mark this
                                chart draws today (see the module doc). */}
                            <title>{`${formatTime((run.points[0] as { tMs: number }).tMs)}\n${s.label}: ${plot.formatTick((run.points[0] as { v: number }).v)}`}</title>
                          </circle>
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
                      <circle cx={row.x} cy={row.y} r={2.5} fill={row.color} className={styles.endDot}>
                        <title>{`${formatTime(row.tMs)}\n${row.label}: ${row.text}`}</title>
                      </circle>
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

      {/* Q2's crosshair — CSS-only, adjacent-sibling reveal (see the module doc). Drawn LAST
          so its (invisible) hit-target rects sit on top of every mark and catch the pointer
          anywhere in the plot area, not only on a 2px line. */}
      <g data-role="hover">
        {hoverColumns.map((col) => (
          <Fragment key={col.atMs}>
            <rect
              className={styles.hoverZone}
              data-role="hover-zone"
              x={col.xStart}
              y={0}
              width={Math.max(0, col.xEnd - col.xStart)}
              height={plotsHeight}
            >
              <title>{hoverTooltipFor(plots, hoverMaps, col.atMs, formatTime)}</title>
            </rect>
            <g className={styles.crosshairGroup} data-role="crosshair" aria-hidden="true">
              <line
                x1={col.x}
                y1={0}
                x2={col.x}
                y2={plotsHeight}
                className={styles.crosshairLine}
              />
            </g>
          </Fragment>
        ))}
      </g>
    </svg>
  );
}
