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
 * at that size, so this positions its points by their order rather than carrying `tMs` or a
 * domain through a second code path. **This is a recorded decision, not an oversight**:
 * SPEC.md does not fix a sparkline's internal geometry, and index-positioning is the
 * conservative reading, since it cannot mis-locate a spike in TIME (there is no time axis to
 * get wrong).
 *
 * ### ⚠ 10c-3 / F14b — `gaps` IS now a prop, closing the failure index-positioning left open
 *
 * §6.1 promotes the sparkline to `StackedTimeSeriesChart` only at ≥1600px; 1280–1599px (the
 * design target) draws THIS component, which took no `gaps` prop at all until this loop. The
 * failure that left open was measured, not assumed: `traceFor`'s output has NO entry for a
 * span the client was not sampling — the ring simply holds no sample there — so the point
 * immediately before a hidden-tab/paused/failed-poll gap and the point immediately after it
 * are ADJACENT in the array `runsOf` walks. Index-positioning then draws one unbroken
 * polyline straight across them: not a hole with no hatch, but a smooth line that reads as a
 * genuine continuous reading over ground nobody measured — the worse of the two failures named
 * in the 10c-3 handoff ("a hole in a series that looks like a reading is worse than a visible
 * hatch"), because this shipped with no hole at all.
 *
 * The fix stays inside this component's own contract rather than adopting the full chart's
 * time-domain machinery: `gaps` is optional, structurally compatible with `lib/client/gaps.ts`'s
 * `Gap` (this file still does not import it — see the sibling note on `SparklinePoint` for why
 * a structural type is preferred here) but comparable against each pair of ADJACENT points by
 * their own real `tMs`, which every point already carries regardless of its compressed x. A
 * gap that falls between two consecutive rendered points now breaks the run there — same
 * mechanism as a `null` reading, so `runsOf` grew one more reason to flush — and a `<rect>`
 * marks the pixel span between them, in the table view as a `colSpan={2}` row using the same
 * `gap (reason) — from to` wording as the full chart's.
 *
 * **Why a flat tint, not the full chart's diagonal hatch.** A `<pattern>` needs an `id`, and
 * an SVG `id` is only unique if something assigns one per instance — `StackedTimeSeriesChart`
 * takes an explicit `id` prop for exactly this reason (2.5d), and this component has never
 * needed one because it draws no `<pattern>`, no `<clipPath>`, nothing an id could collide
 * over. Adding a required `id` prop here to support a decoration that would be a handful of
 * diagonal lines across 2–8px of a 44px-tall box — narrower than the hatch's own 6px repeat —
 * is a worse trade than a solid, muted `<rect>`: at this scale a weave is noise, not signal,
 * and the flat tint is still strictly more honest than the smooth line it replaces. A future
 * reviewer who wants the identical hatch here is free to add that id; it is not free today.
 *
 * **What this does NOT attempt.** A gap that opens after the LAST point in the window (the
 * client is still not sampling as the window ends) draws nothing past that point, which is
 * already correct — it is §6.5's "the trace freezes rather than plotting zeros", the same
 * behaviour a trailing null already produced here. Only a gap that falls strictly BETWEEN two
 * points still inside the window is a new case, and it is the only case that was ever silently
 * wrong.
 *
 * **No separate domain filtering is needed, unlike the full chart's `tableRowsFor`.** That
 * component draws hatches against a fixed pixel domain independent of which points exist, so
 * `state.gaps` (which legitimately holds entries up to 110 minutes older than a 30-minute
 * default window — `lib/client/runtime.ts` prunes only against the LONGEST selectable window)
 * needs an explicit domain-bounds filter there or a stale gap paints on an axis that does not
 * span it. Here a gap only ever matters between two points that are BOTH already in the
 * caller's windowed `points` array — a CLOSED gap entirely outside the window has no such pair
 * to fall between — so it is excluded by construction, not by a second check.
 *
 * ⚠ **10c-3/A9 — that argument covers two of the three shapes a `Gap` can take, and the doc
 * used to claim all three.** An OPEN gap (`toMs: null`) extends to `+Infinity`, so it is never
 * outside any window: one that opened before the first rendered point overlaps EVERY pair. It
 * is not excluded, and it should not be — the client genuinely is not sampling, and every
 * reading in view landed inside it (§6.7's rule 3). What was wrong was the per-pair drawing
 * that fact produced (a mark and a table row between every pair); {@link gapSpansFor} now
 * collapses each gap to ONE mark and ONE row spanning the range it covers, which is what
 * `StackedTimeSeriesChart` draws for the identical input. So the claim stands as "no domain
 * filter is needed", but not for the reason it gave, and the open case is handled by the
 * collapse rather than by an exclusion.
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
 * - **⚠ CORRECTED by 10c-3/F14b: the table now HAS a gap row.** This used to read "the table
 *   has no gap column" on the ground that the chart form did not represent gaps either, so a
 *   table claiming to would say more than the chart it stands in for. That symmetry argument
 *   flips the moment the chart side gains gap-awareness (see the module doc's F14b section
 *   above) — leaving the table silent would then make the table say LESS than the chart it is
 *   supposed to be a complete substitute for, the exact failure §6.2's table-as-accessibility-
 *   floor reasoning exists to prevent. A gap row spans both columns (`colSpan={2}`), reusing
 *   `StackedTimeSeriesChart`'s own `gap (reason) — from to` wording so a reader does not learn
 *   two different vocabularies for the same fact. Nulls still render `EM_DASH`, matching the
 *   broken polyline — that part is unchanged.
 *
 * ### ⚠ Q2-S2 -- the table view SCROLLS within its own container, and every row stays in the DOM
 *
 * `SPEC.md` §6.2 (ruled 2026-09-08): the same ruling as `StackedTimeSeriesChart`'s, applied
 * here at this component's own scale -- "the table view scrolls within its own container:
 * `max-height` plus `overflow-y`." Capping or decimating rows was considered and REJECTED for
 * the same reason as the full chart's: a decimated table stops being the chart's complete
 * substitute, which is the ground the table stands on as an accessibility floor.
 *
 * - **A new wrapping `<div>` is the scroll container**, since this table previously had none --
 *   unlike `StackedTimeSeriesChart`, whose `.tableView` `<div role="group" aria-label=...>`
 *   already existed for F3's sake. It carries `role="group"`, the same required `ariaLabel`
 *   prop (no new prop, no per-instance `id` to collide across the three sparklines on one
 *   page -- see this file's own note above on why `ariaLabel` is required and un-defaulted),
 *   and `tabIndex={0}` for keyboard reachability. The inner `<table>`'s own `<caption>` still
 *   carries the identical text; a screen reader hearing the group's name and then the table's
 *   own name once more is the accepted, documented shape for a keyboard-scrollable table (the
 *   WCAG "scrollable data table" pattern), not an oversight -- it is not a SECOND, DIFFERENT
 *   name competing with the first.
 * - **The box is the CHART'S OWN, and `--table-scroll-max` is RETIRED** (10g/Q1, `SPEC.md`
 *   §6.1 ruled 2026-09-09). This bullet used to describe a `max-height: 40vh` stopgap shared
 *   with the full chart's table view; five table views are reachable on one page, so that
 *   bound was 200vh against a 100vh promise. `.tableView` now carries
 *   `height: var(--table-box-height)`, set inline from the SAME `height` prop the `<svg>`
 *   below is drawn at (`tableBoxStyle`), so toggling the view moves nothing.
 * - **A sticky header**, `position: sticky` on `thead th`, `border-collapse: separate` for the
 *   same WebKit reliability reason as the full chart's -- see that component's identical note.
 * - **None of this is observable from `renderToStaticMarkup`.** The scrolling and sticking are
 *   CSS-only; this suite never touches a DOM at all. The ⚠ test below asserts only the
 *   structural part: `tabindex="0"` on the group's own opening tag.
 */

import { Fragment } from 'react';
import type { CSSProperties } from 'react';

import { EM_DASH } from '@/lib/format';

import styles from './sparkline.module.css';
import './tokens.css';

export interface SparklinePoint {
  readonly tMs: number;
  readonly v: number | null;
}

/**
 * 10c-3/F14b. Structurally identical to `lib/client/gaps.ts`'s `Gap` (`fromMs`, `toMs`,
 * `reason`) but, like {@link SparklinePoint} above, its own type rather than an import — same
 * reasoning: this file does not pull the client runtime in for a shape it can state itself.
 * `state.gaps` (a `readonly Gap[]`) typechecks here directly; `Gap`'s `reason: GapReason` is a
 * string-literal union, assignable to this field's plain `string`.
 */
export interface SparklineGap {
  readonly fromMs: number;
  /** `null` while the gap is still open — see `Gap`'s own doc. */
  readonly toMs: number | null;
  readonly reason: string;
}

/** 10e §3.2 — a fixed y-scale, so two cards (or two sizes of the same card) share one scale
 *  and a threshold line is always on screen rather than only when the window happens to touch
 *  it. See {@link SparklineProps.domain}. */
export interface SparklineDomain {
  readonly min: number;
  readonly max: number;
}

/** 10e §3.2 — a dashed threshold line with an end label. See {@link SparklineProps.refs}. */
export interface SparklineRef {
  readonly v: number;
  readonly label: string;
  /** `true` draws the alarm hue; omitted/`false` draws the muted "watch"-register hue. */
  readonly alarm?: boolean;
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
  /**
   * 10c-3/F14b, OPTIONAL and defaulted to none — a caller with nothing to hatch (every test in
   * this file before this loop) renders exactly as before. `state.gaps`, typically. See the
   * module doc's F14b section for what this closes: without it, two rendered points straddling
   * a real sampling gap draw one smooth, unbroken line between them.
   */
  readonly gaps?: readonly SparklineGap[];
  /**
   * 10e §3.2 — the ≥1600px "promoted" form's three optional additions. All default to the
   * primitive's existing behaviour: with none of the three given the scale autoscales exactly
   * as before and neither the `sparkline-refs` nor the `sparkline-time-labels` group is
   * emitted at all.
   *
   * ⚠ **"byte-identical to the pre-10e output" is NOT the claim, and an earlier draft of this
   * comment made it** (corrected by 10e's test phase, 2026-09-09). Two 10e changes are
   * UNCONDITIONAL — the area `<path data-role="area">` per run and the end dot's `r` going
   * 2.5 → 4.5 with a 2px stroke — and `yFor` was rewritten from `height - ((v-min)/(max-min))
   * *height` to a `padT`/`padB` form which is algebraically equal at `padT=padB=0` but not
   * bit-equal in IEEE754 (`h=38, min=30, max=90, v=66` → `15.2` before, `15.200000000000001`
   * after; those digits land in the emitted `points=` attribute). The honest claim is the one
   * above: these three props are inert when omitted.
   *
   * A fixed y-scale. GPU cards pass `{ min: 30, max: 90 }` at BOTH sizes — the mock's own
   * choice — so the two cards share one scale and the alarm/watch reference lines below are
   * always on screen rather than only when the window happens to touch 70/80. Values outside
   * the domain are CLAMPED for their y-position only (the same magnitude clamp
   * `StackedTimeSeriesChart` already does — §6.3's Y-axis clamp, never the X-position drop
   * Q2-F9 rejected): the mark stays at its real x (its real time), pegged to the nearer rail.
   */
  readonly domain?: SparklineDomain;
  /**
   * Dashed threshold lines with a right-hand label, drawn ONLY when `timeLabels` also reserves
   * room and the caller is the ≥1600px promoted form — this primitive draws whatever it is
   * given regardless of size, so gating "only at ≥1600px" is the CALLER's job (the same
   * CSS-media-query mechanism that already shows/hides the two wrapper `<svg>`s), not this
   * component's. GPU cards pass §6.3's own two boundaries, read from the exported
   * `GPU_TEMP_WATCH_C`/`GPU_TEMP_ALARM_C` constants so the line on the chart and the colour of
   * the cell cannot disagree. Reserves 26px on the right for the label.
   */
  readonly refs?: readonly SparklineRef[];
  /**
   * Draws `formatTime(points[0].tMs)` at the left edge and `formatTime(last.tMs)` anchored
   * `end` at the right, 8.5px muted text at the bottom. Reserves 4px at the top and 10px at
   * the bottom (vs. 0/0 without it) — the same padding the reference-line labels need, so the
   * two never fight for the same strip.
   */
  readonly timeLabels?: boolean;
}

interface IndexedPoint {
  readonly index: number;
  readonly v: number;
}

/**
 * Does a gap fall strictly between two adjacent, REAL instants? An open gap (`toMs === null`)
 * extends to `+Infinity`, matching `StackedTimeSeriesChart`'s `g.toMs ?? domainEndMs` at this
 * component's own scale (no domain here, so no upper bound to clamp to).
 */
const gapBetween = (
  a: SparklinePoint,
  b: SparklinePoint,
  gaps: readonly SparklineGap[],
): SparklineGap | null =>
  gaps.find((g) => g.fromMs < b.tMs && (g.toMs ?? Number.POSITIVE_INFINITY) > a.tMs) ?? null;

/**
 * Maximal runs of consecutive readable points, each becoming one polyline — carrying each
 * point's position in the ORIGINAL array, so a run extracted after filtering nulls out still
 * places its points at their true x-position rather than a compacted one.
 *
 * ⚠ 10c-3/F14b: a run ALSO breaks between two readable points whose real `tMs` straddles a
 * `gaps` entry — the same flush this function already does for a `null` reading, at one more
 * trigger. `previous` is the immediately preceding ARRAY entry, not "the last point still in
 * the current run": when that entry is itself `null`, `current` is already empty from the
 * null-triggered flush, so the gap check below is a no-op there — nothing to double-break.
 */
const runsOf = (
  points: readonly SparklinePoint[],
  gaps: readonly SparklineGap[] = [],
): (readonly IndexedPoint[])[] => {
  const runs: IndexedPoint[][] = [];
  let current: IndexedPoint[] = [];
  points.forEach((p, index) => {
    const readable = p.v !== null && Number.isFinite(p.v);
    const previous = index > 0 ? points[index - 1] : undefined;
    const gapBreak = readable && previous !== undefined && gapBetween(previous, p, gaps) !== null;
    if (!readable || gapBreak) {
      if (current.length > 0) runs.push(current);
      current = [];
    }
    if (readable) current.push({ index, v: p.v as number });
  });
  if (current.length > 0) runs.push(current);
  return runs;
};

/**
 * The index span one GAP covers — the first and last adjacent point-pair its interval overlaps.
 *
 * ⚠ **10c-3 reconciliation (A4/A5): one span per GAP, not one per PAIR.** The first
 * implementation walked adjacent pairs and emitted a mark for each pair a gap straddled, which
 * produced two defects with one cause:
 *
 * - **A5 — a gap spanning several pairs was drawn N times**, and its table listed N identical
 *   rows for one outage. §6.7's blessed case produces exactly that: paused at t=1 s, two
 *   *refresh now* readings kept inside the gap, resumed at 60 s is ONE `Gap`, and the spec says
 *   in as many words that a reading landing inside a gap leaves it *"neither closed nor split"*.
 *   The sparkline split it three ways; `StackedTimeSeriesChart` (`gaps.map`, one `<rect>` per
 *   entry) drew one. An operator counting outages in the table read three on a 1280px display
 *   and one on a 1600px display, for the same data.
 * - **A4 — a gap was drawn ZERO times when a `null` reading abutted it.** The per-pair walk
 *   required both endpoints readable, on the reasoning that *"the null already breaks the
 *   line"*. True of the chart form; **false of the table**, where nothing breaks, no row is
 *   emitted, and the reader cannot tell "one poll failed" from "thirty minutes were never
 *   sampled". The table is §6.2's accessibility floor and must not say LESS than the chart it
 *   substitutes for — and the promoted chart hatches and lists that gap.
 *
 * Readability is therefore not consulted here at all: a gap is a fact about *time nobody
 * sampled*, and whether the readings on its shoulders happened to parse is a different fact,
 * carried by the polyline break and the em dash. {@link runsOf} still consults it, correctly —
 * it is deciding where a LINE may be drawn, not where ground went unmeasured.
 */
interface GapSpan {
  readonly gap: SparklineGap;
  /** The array index at whose left edge this gap starts — always ≥ 1. */
  readonly firstIndex: number;
  /** The array index at whose position it ends. `>= firstIndex`. */
  readonly lastIndex: number;
}

/**
 * One span per gap that overlaps at least one adjacent pair, in `gaps` order.
 *
 * ⚠ **10c-3/A9 corrects the module doc's "excluded by construction" claim for the OPEN case.**
 * A closed gap outside the window overlaps no pair and is dropped here, exactly as documented.
 * An **open** gap (`toMs: null`) extends to `+Infinity`, so one that opened before the window
 * overlaps *every* pair — it is not excluded, and under the per-pair implementation it drew a
 * mark between every pair of points. It now collapses to ONE mark spanning the whole rendered
 * range, which is what `StackedTimeSeriesChart` draws for the same input (`toMs ?? domainEndMs`,
 * one hatch across the domain, points drawn on top). The two forms agree.
 */
const gapSpansFor = (points: readonly SparklinePoint[], gaps: readonly SparklineGap[]): readonly GapSpan[] => {
  const spans: GapSpan[] = [];
  for (const gap of gaps) {
    let firstIndex = -1;
    let lastIndex = -1;
    for (let index = 1; index < points.length; index += 1) {
      const a = points[index - 1] as SparklinePoint;
      const b = points[index] as SparklinePoint;
      if (gapBetween(a, b, [gap]) === null) continue;
      if (firstIndex < 0) firstIndex = index;
      lastIndex = index;
    }
    if (firstIndex >= 0) spans.push({ gap, firstIndex, lastIndex });
  }
  return spans;
};

/**
 * 10e §3.2 — the mock's `areaFrom`: one filled path per run, closed against the plot's own
 * baseline. Drawn UNDER the polyline (see the render order below), `opacity: .1` in the
 * stylesheet — form only, 0px of layout height, and it breaks at exactly the same points the
 * line itself breaks at (one area per run, matching invariant 1's "never bridge a null").
 */
const areaPathFor = (
  run: readonly IndexedPoint[],
  xFor: (index: number) => number,
  yFor: (v: number) => number,
  baselineY: number,
): string => {
  if (run.length === 0) return '';
  const first = run[0] as IndexedPoint;
  const parts = [`M${xFor(first.index)},${baselineY}`];
  for (const p of run) parts.push(`L${xFor(p.index)},${yFor(p.v)}`);
  const last = run[run.length - 1] as IndexedPoint;
  parts.push(`L${xFor(last.index)},${baselineY}`, 'Z');
  return parts.join(' ');
};

/** One marker per gap — see {@link GapSpan} for why it is per gap and not per point-pair. */
interface GapMark {
  readonly key: string;
  readonly x: number;
  readonly width: number;
}

/** ⚠ No hatch below this width at this scale is legible — see the module doc's F14b section
 *  on why a flat tint, not a pattern, is drawn here. Smaller than `StackedTimeSeriesChart`'s
 *  own `MIN_GAP_WIDTH` (6) because this canvas is itself a fraction of that chart's width. */
const MIN_GAP_MARK_WIDTH = 2;

const gapMarksFor = (
  spans: readonly GapSpan[],
  xFor: (index: number) => number,
): readonly GapMark[] =>
  spans.map(({ gap, firstIndex, lastIndex }) => {
    const x0 = xFor(firstIndex - 1);
    const x1 = xFor(lastIndex);
    return {
      key: `${gap.fromMs}-${gap.toMs ?? 'open'}-${firstIndex}`,
      x: Math.min(x0, x1),
      width: Math.max(MIN_GAP_MARK_WIDTH, Math.abs(x1 - x0)),
    };
  });

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

/** 10c-3/F14b — a gap row between two sample rows, or a sample row itself. See `tableRowsFor`. */
type TableRow =
  | { readonly kind: 'sample'; readonly point: SparklinePoint }
  | {
      readonly kind: 'gap';
      readonly key: string;
      readonly reason: string;
      readonly fromMs: number;
      readonly toMs: number | null;
    };

/**
 * 10c-3/F14b: one row per point, plus a gap row wherever the chart form now draws a hatch
 * (the SAME {@link gapSpansFor} spans, so the two forms cannot disagree about how many gaps
 * there were or where they fell — the table is the chart's accessibility floor and a reader
 * switching views must see the same gaps in both).
 */
const tableRowsFor = (
  points: readonly SparklinePoint[],
  gaps: readonly SparklineGap[],
): readonly TableRow[] => {
  const spans = gapSpansFor(points, gaps);
  const rows: TableRow[] = [];
  points.forEach((p, index) => {
    // ⚠ 10c-3/A5: `firstIndex`, so ONE row per gap — the chart form draws one `<rect>` for the
    // same span, and the table must agree with it. Emitting a row per straddled pair listed one
    // outage three times, identically worded, which an operator counting outages reads as three.
    for (const { gap, firstIndex } of spans) {
      if (firstIndex !== index) continue;
      rows.push({
        kind: 'gap',
        key: `gap-${gap.fromMs}-${gap.toMs ?? 'open'}`,
        reason: gap.reason,
        fromMs: gap.fromMs,
        toMs: gap.toMs,
      });
    }
    rows.push({ kind: 'sample', point: p });
  });
  return rows;
};

/**
 * ⚠ 10g/Q1 — the box the table view renders in, as a style object.
 *
 * `SPEC.md` §6.1, ruled 2026-09-09: *"a table view replaces its chart inside the chart's own
 * box and scrolls there"*. `height` is the SAME prop the `<svg>` below is drawn at, so the two
 * views of this trend are exactly the same size and toggling between them moves nothing on the
 * page. Written as a custom property rather than an inline `height` so the stylesheet still
 * carries the `height:` declaration `components/styles.test.ts`'s bounded-box rule reads — a
 * scrolling box whose bound lives only in a JSX attribute is a bound no CSS guard can see.
 */
const tableBoxStyle = (height: number): CSSProperties =>
  ({ '--table-box-height': `${height}px` }) as CSSProperties;

/** §6.2's table view. 10c-3/F14b: now WITH a gap row — see the module doc's correction. */
function SparklineTableView({
  points,
  ariaLabel,
  formatValue,
  formatTime,
  gaps = [],
  height = 24,
}: Pick<SparklineProps, 'points' | 'ariaLabel' | 'formatValue' | 'formatTime' | 'gaps' | 'height'>) {
  const rows = points.length === 0 ? [] : tableRowsFor(points, gaps);
  return (
    // Q2-S2: this div is the scroll container AND the keyboard tab stop (see the module doc's
    // Q2-S2 section) — `role="group"`/`aria-label` name it, `tabIndex={0}` makes it reachable
    // without a mouse. The inner `<table>`'s own `<caption>` (below) still carries its own
    // name; that is not a duplicate introduced by this div, it is the documented shape for a
    // keyboard-scrollable table.
    // ⚠ 10g/Q1: the EMPTY case renders inside this same box rather than as a bare `<p>` beside
    // it. An empty series still paints an `<svg>` of exactly `height` in chart view, so a
    // shorter empty table would be the one state in which toggling the view moved the page.
    <div
      className={styles.tableView}
      style={tableBoxStyle(height)}
      role="group"
      aria-label={ariaLabel}
      tabIndex={0}
      data-role="table-view"
    >
      {points.length === 0 ? (
        <p className={styles.tableEmpty}>{`${ariaLabel} — no readings in the selected window`}</p>
      ) : (
        <table className={styles.table}>
          <caption className="sr-only">{ariaLabel}</caption>
          <thead>
            <tr>
              <th scope="col">time</th>
              <th scope="col">value</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) =>
              row.kind === 'gap' ? (
                <tr key={row.key} className={styles.gapRow} data-role="gap-row">
                  <td colSpan={2}>
                    {`gap (${row.reason}) — ${formatTime(row.fromMs)} to `}
                    {row.toMs === null ? 'ongoing' : formatTime(row.toMs)}
                  </td>
                </tr>
              ) : (
                <tr key={row.point.tMs}>
                  {/* ⚠ A row HEADER, not a data cell — see the identical note in
                      `stacked-time-series-chart.tsx` (Q2 reconciliation, F4). */}
                  <th scope="row">{formatTime(row.point.tMs)}</th>
                  {/* ⚠ `Number.isFinite` matches this file's OWN chart-path guard in `runsOf`: a
                      non-finite reading is a break in the polyline, so it must not be a printed
                      `NaN` in the table beside it (Q2 reconciliation, F6). */}
                  <td>{row.point.v !== null && Number.isFinite(row.point.v) ? formatValue(row.point.v) : EM_DASH}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>
      )}
    </div>
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
  gaps = [],
  domain,
  refs,
  timeLabels = false,
}: SparklineProps) {
  if (view === 'table') {
    return (
      <SparklineTableView
        points={points}
        ariaLabel={ariaLabel}
        formatValue={formatValue}
        formatTime={formatTime}
        gaps={gaps}
        // ⚠ 10g/Q1 — the chart's own painted height, so the table is the same box.
        height={height}
      />
    );
  }

  const runs = runsOf(points, gaps);
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

  // 10e §3.2 — the three optional additions. `hasRefs` gates BOTH the padding they need and
  // whether anything is drawn from `refs`, so an empty array behaves exactly like `undefined`
  // rather than silently reserving 26px for nothing. `padT`/`padB` are reserved only by
  // `timeLabels`, independent of `refs` — CPU's promoted form takes the axis with no refs.
  const hasRefs = refs !== undefined && refs.length > 0;
  const padT = timeLabels ? 4 : 0;
  const padB = timeLabels ? 10 : 0;
  const padR = hasRefs ? 26 : 0;
  const plotWidth = width - padR;

  const values = readable.map((p) => p.v);
  // A fixed domain wins when given (GPU cards, both sizes); otherwise autoscale exactly as
  // before — the values ARE the domain, so the clamp below is a no-op on that path.
  const domainMin = domain ? domain.min : Math.min(...values);
  const domainMax = domain ? domain.max : Math.max(...values);
  // ⚠ A flat series (or a degenerate domain) has no span to place anything within, and
  // `(v - min) / 1` is 0 for every point — which put the whole line on `y = height`, the
  // BOTTOM edge, the one position that everywhere else in the same trace means "coldest
  // reading in the window". A card idling at a constant 66 °C is not at the bottom of
  // anything. Draw it on the centre line instead, which is where `StackedTimeSeriesChart`
  // puts the identical input, so the two primitives cannot be read against each other and
  // disagree.
  const flat = domainMax - domainMin === 0;

  const n = points.length;
  // A single point has nowhere to span; anchor it at the left edge rather than dividing by 0.
  const xFor = (index: number): number => (n <= 1 ? 0 : (index / (n - 1)) * plotWidth);
  // §6.3's Y-axis clamp (never Q2-F9's rejected X-position drop): a reading outside a FIXED
  // domain is pegged to the nearer rail for its magnitude only — its x (its real time) is
  // untouched. ⚠ TWO rails, and each needs its own fixture: every `domain` test in this
  // component's file sat above the max until 10e's test phase added one below the min, and a
  // one-sided `Math.min(domainMax, v)` passed the whole suite (`10e-SP12`/`SP13` now cover the
  // rails separately). With no `domain` given, `values` already bound `domainMin`/`domainMax`,
  // so the clamp never fires — the prop is inert when omitted, which is a weaker and TRUE
  // statement than the "byte-identical to pre-10e" this comment used to make: see the prop's
  // own doc above for the three unconditional 10e changes that make byte-identity false.
  const yFor = (v: number): number => {
    if (flat) return padT + (height - padT - padB) / 2;
    const clamped = Math.min(domainMax, Math.max(domainMin, v));
    return padT + (1 - (clamped - domainMin) / (domainMax - domainMin)) * (height - padT - padB);
  };

  const last = readable[readable.length - 1];
  const hoverColumns = hoverColumnsFor(n, xFor, plotWidth);
  const gapMarks = gapMarksFor(gapSpansFor(points, gaps), xFor);
  const areaBaselineY = height - padB;

  return (
    <svg
      className={styles.sparkline}
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      role="img"
      aria-label={ariaLabel}
    >
      {/* 10e §3.2 — §6.3's own boundaries, drawn first so the data reads on top of them
          (matching the mock's paint order). Only present when the caller passes `refs`, which
          is the CALLER's decision (the ≥1600px promoted form only) — this primitive draws
          whatever it is handed regardless of its own size. */}
      {!hasRefs ? null : (
        <g data-role="sparkline-refs">
          {(refs as readonly SparklineRef[]).map((r) => (
            <g key={r.label} data-role="sparkline-ref">
              <line
                x1={0}
                x2={plotWidth}
                y1={yFor(r.v)}
                y2={yFor(r.v)}
                className={r.alarm === true ? styles.refAlarm : styles.refLine}
              />
              <text x={plotWidth + 3} y={yFor(r.v) + 3} className={styles.refLabel}>
                {r.label}
              </text>
            </g>
          ))}
        </g>
      )}
      {/* 10c-3/F14b — painted under the polylines: a hatched-ground rect would be
          nothing to hatch here (see the module doc), so this is a flat, muted tint instead.
          `pointer-events: none` so it never competes with the hover layer painted last. */}
      <g data-role="sparkline-gaps">
        {gapMarks.map((mark) => (
          <rect
            key={mark.key}
            className={styles.gap}
            data-role="gap"
            x={mark.x}
            y={padT}
            width={mark.width}
            height={height - padT - padB}
          />
        ))}
      </g>
      {runs.map((run, i) => (
        <Fragment key={i}>
          {/* 10e §3.2 — the mock's `areaFrom`: one filled path per run, under its own
              polyline, opacity .1 (form only, 0px of layout height). */}
          <path
            className={styles.area}
            data-role="area"
            fill={color}
            d={areaPathFor(run, xFor, yFor, areaBaselineY)}
          />
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
        // 10e §3.2 — the mock's end dot: r 4.5, a 2px ground-coloured stroke (was 2.5 / 1).
        <circle className={styles.end} cx={xFor(last.index)} cy={yFor(last.v)} r={4.5} fill={color}>
          <title>
            {`${formatTime((points[last.index] as SparklinePoint).tMs)}\n${formatValue(last.v)}`}
          </title>
        </circle>
      )}

      {/* 10e §3.2 — the promoted form's time axis: the window's first and last real instants,
          8.5px muted text at the bottom edge. */}
      {!timeLabels || n === 0 ? null : (
        <g data-role="sparkline-time-labels">
          <text x={0} y={height - 1} className={styles.timeLabel}>
            {formatTime((points[0] as SparklinePoint).tMs)}
          </text>
          <text x={plotWidth} y={height - 1} textAnchor="end" className={styles.timeLabel}>
            {formatTime((points[n - 1] as SparklinePoint).tMs)}
          </text>
        </g>
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
