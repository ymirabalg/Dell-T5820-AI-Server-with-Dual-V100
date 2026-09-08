/**
 * The two small pieces of glue every chart-bearing panel repeats — GPU 0, GPU 1, CPU and
 * COOLING (§6.2's stacked chart) — factored out once so the composition cannot drift between
 * them the way `lib/client/series.ts`'s own module doc warns `samplesWithin → seriesFrom →
 * decimateSeries` would if written out per call site.
 *
 * Neither function formats a number (`Sparkline`/`StackedTimeSeriesChart` never do either —
 * see HANDOVER §3.5 point 3) and neither reads a clock: `nowMs` is not an input here, because
 * a chart's DOMAIN is positioned by the ring's own `ts` (§6.7), never by the browser's clock.
 */

import { windowMs } from '@/lib/client/prefs';
import { newestSample } from '@/lib/client/ring';
import type { RuntimeState } from '@/lib/client/runtime';
import { formatTimeOfDay } from '@/lib/format';
import { isoTimestamp } from '@/lib/types';

/** `StackedTimeSeriesChart.formatTime` / a hover tooltip's time column, from a plain `tMs`. */
export const formatTimeOfDayMs = (ms: number): string =>
  formatTimeOfDay(isoTimestamp(new Date(ms).toISOString()));

export interface ChartDomain {
  readonly startMs: number;
  readonly endMs: number;
}

/**
 * The window a trace's chart should be drawn against — `[newest.tsMs − windowMs, newest.tsMs]`
 * (§6.7: "anchored on the newest sample's `ts`, never on the browser's clock").
 *
 * ⚠ **Before the first accepted poll this returns an EMPTY domain (`0 → 0`), and the doc that
 * used to sit here was measurably false** (10b-reconcile, adversarial F8). It claimed a domain
 * ending at epoch 0 was "never wrong to look at" because an empty ring draws no points — but
 * `StackedTimeSeriesChart` only recognises `domainEndMs <= domainStartMs` as empty, and
 * `0 − windowMs → 0` is a perfectly ordinary half-hour range. Rendered, it drew a full axis of
 * plausible local times (`18:30:00 … 19:00:00`, epoch 0 in the browser's zone) under a
 * fabricated `0 °C … 1 °C` scale — the first thing on a wall panel after a reload, and it
 * looks like real data from a real half hour. `Sparkline` was correct all along (it takes no
 * domain and renders `data-empty="true"`); this is the sibling-case defect, fixed in the
 * one place both chart callers share.
 *
 * A degenerate `0 → 0` is what the primitive already treats as "no time range to plot", so
 * this reuses its existing empty branch rather than adding a second empty state or new copy.
 */
export const chartDomainOf = (state: RuntimeState): ChartDomain => {
  const newest = newestSample(state.ring);
  if (newest === null) return { startMs: 0, endMs: 0 };
  const endMs = newest.tsMs;
  return { startMs: endMs - windowMs(state.preferences.windowMinutes), endMs };
};
