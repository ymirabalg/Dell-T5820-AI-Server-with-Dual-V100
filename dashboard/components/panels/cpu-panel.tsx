/**
 * §6.2's CPU card — package temperature (dominant, with a 30-minute trace), aggregate
 * utilisation (its own trace), and load average.
 *
 * **Model and core/thread count are the subtitle, not body rows** (§6.2): `<cpuModel> ·
 * <cores>C / <threads>T`, identity rather than measurement, so it does not change on a poll
 * unless the box itself changes. `formatCpuModel` does the §3.2 trimming
 * (`Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz` → `Xeon W-2135`); cores/threads are plain numbers on
 * the wire (not a branded unit — `lib/types.ts`'s `Host.cores`/`.threads`), so they are
 * rendered with a bare `—` fallback rather than through `lib/format.ts`, matching how every
 * other plain-number field on this contract is handled.
 *
 * ⚠ **Two traces, not one colour reused across both — OWNER'S RULING, 2026-09-09 (OQ-7).**
 * 10e's own reading of §6.2 attaches the trace to utilisation alone and would have removed the
 * temperature trace the built panel already carried; the owner ruled to KEEP BOTH. So this
 * panel draws two independent `Sparkline`s — temperature and utilisation — each with its own
 * ≥1600px promotion, the same two-wrapper mechanism the GPU card uses. `components/palette.ts`
 * reserves its three hex values for series that share ONE frame (GPU 0 / GPU 1 / fan 5 on the
 * COOLING chart) and explicitly forbids adding a fourth "without a design decision" — recorded
 * here rather than invented silently: CPU's two traces never share a frame with each other or
 * with the GPU/fan traces, so reusing `SERIES_COLORS.gpu0` (temperature) and `.gpu1`
 * (utilisation) costs nothing and needs no new hex. Neither reading is banded by §6.3 except
 * temperature. Height cost of the ruling: CPU is 10e's spec-only budget plus one sparkline and
 * its gap — 216.1 / 240.1 / 240.1 (`check-density.mjs`'s `cpu` row already carries this).
 */

import { PanelShell } from '../panel-shell';
import { Hero } from '../hero';
import { Meter } from '../meter';
import { Strip } from '../strip';
import { Sparkline } from '../sparkline';
import { CHART_SIZE } from '../grid';
import { SERIES_COLORS } from '../palette';
import type { PanelProps } from '../panel-props';
import { formatTimeOfDayMs } from './panel-chart';
import { PanelNotes } from './panel-notes';
import { ChartViewToggle } from './chart-view-toggle';
import { errorsForPanel } from '@/lib/client/observations';
import { traceFor } from '@/lib/client/series';
import { latestSample } from '@/lib/client/runtime';
import { EM_DASH, formatCelsius, formatCelsiusParts, formatCpuModel, formatLoadAverage, formatPercent } from '@/lib/format';
import { severityCpuTemp } from '@/lib/severity';
import { celsius, percent } from '@/lib/types';
import type { Host, TelemetrySnapshot } from '@/lib/types';

import styles from './cpu-panel.module.css';

const coreThread = (n: number | null): string => (n === null ? EM_DASH : String(n));

/**
 * Q2-S2's table toggle (10c1) — see `gpu-panel.tsx`'s identical field for the optional/default
 * shape and `chart-view-toggle.tsx` for why one toggle governs BOTH of this panel's sparklines
 * (temperature and utilisation) rather than one each.
 */
export interface CpuPanelProps extends PanelProps {
  readonly view?: 'chart' | 'table';
  readonly onToggleView?: () => void;
}

// ⚠ `panelId` is not read: `Sparkline` (this panel's only chart primitive) mints no SVG ids at
// all (unlike `StackedTimeSeriesChart`'s `id` prop), so there is nothing here for the
// namespace to prefix. Still required by `PanelProps` — a future promotion to a full chart
// (matching GPU's ≥1600px treatment) would need it, and the type keeps that honest.
export function CpuPanel({ state, view = 'chart', onToggleView }: CpuPanelProps) {
  const snapshot: TelemetrySnapshot | null = latestSample(state)?.snapshot ?? null;
  const host: Host | null = snapshot?.host ?? null;

  // §6.5's "its `errors` entry is available" half. `lib/client/observations.ts` routes CPU's
  // four sources here BY THE FIGURE EACH BLANKS — that split is the reason `collectHost` files
  // nine sources for one crash. 10e §2.3: the hero and the strip have no note slot of their
  // own, so every CPU source's message is rendered together, once, under the whole card
  // (S-H: "the panel satisfies 'beside it'").
  const cpuErrors = snapshot === null ? [] : errorsForPanel(snapshot, 'cpu');
  const chip = severityCpuTemp(host?.cpuTempC ?? null);
  const subtitle = `${formatCpuModel(host?.cpuModel ?? null)} · ${coreThread(host?.cores ?? null)}C / ${coreThread(host?.threads ?? null)}T`;
  const tempParts = formatCelsiusParts(host?.cpuTempC ?? null);

  const tempTrace = traceFor(state, (s) => s.host.cpuTempC);
  const utilTrace = traceFor(state, (s) => s.host.cpuPct);
  const tempAriaLabel = 'CPU temperature over the selected window';
  // ⚠ 10e-A8: the hero is a POINT reading — see the identical note in `gpu-panel.tsx`.
  const heroAriaLabel = 'CPU package temperature';
  const utilAriaLabel = 'CPU utilisation over the selected window';

  const toggle =
    onToggleView === undefined ? undefined : (
      <ChartViewToggle view={view} onToggle={onToggleView} label="CPU charts" />
    );

  return (
    <PanelShell title="cpu" subtitle={subtitle} chip={chip} headControl={toggle}>
      {/* §6.2's "package" word — the mock's unit form, composed from the parts formatter's own
          unit rather than a second, disagreeing formatter (O14). */}
      <Hero value={tempParts.value} unit={`${tempParts.unit} pkg`} severity={chip} ariaLabel={heroAriaLabel} />
      <div className={styles.sparklineWrap} data-role="cpu-sparkline-wrap">
        <Sparkline
          points={tempTrace}
          ariaLabel={tempAriaLabel}
          color={SERIES_COLORS.gpu0}
          width={CHART_SIZE.cpuSparkline.width}
          height={CHART_SIZE.cpuSparkline.height}
          view={view}
          formatValue={(v) => formatCelsius(celsius(v))}
          formatTime={formatTimeOfDayMs}
          gaps={state.gaps}
        />
        <Sparkline
          points={utilTrace}
          ariaLabel={utilAriaLabel}
          color={SERIES_COLORS.gpu1}
          width={CHART_SIZE.cpuSparkline.width}
          height={CHART_SIZE.cpuSparkline.height}
          view={view}
          formatValue={(v) => formatPercent(percent(v))}
          formatTime={formatTimeOfDayMs}
          gaps={state.gaps}
        />
      </div>
      <div className={styles.fullChartWrap} data-role="cpu-full-chart-wrap">
        <Sparkline
          points={tempTrace}
          ariaLabel={tempAriaLabel}
          color={SERIES_COLORS.gpu0}
          width={CHART_SIZE.cpuPromoted.width}
          height={CHART_SIZE.cpuPromoted.height}
          view={view}
          formatValue={(v) => formatCelsius(celsius(v))}
          formatTime={formatTimeOfDayMs}
          gaps={state.gaps}
          timeLabels
        />
        <Sparkline
          points={utilTrace}
          ariaLabel={utilAriaLabel}
          color={SERIES_COLORS.gpu1}
          width={CHART_SIZE.cpuPromoted.width}
          height={CHART_SIZE.cpuPromoted.height}
          view={view}
          formatValue={(v) => formatPercent(percent(v))}
          formatTime={formatTimeOfDayMs}
          gaps={state.gaps}
          timeLabels
        />
      </div>
      <Meter
        label="utilisation"
        formattedValue={formatPercent(host?.cpuPct ?? null)}
        used={host?.cpuPct ?? null}
        total={100}
        severity={null}
      />
      <Strip items={[{ k: 'load', v: formatLoadAverage(host?.loadAvg ?? null) }]} />
      <PanelNotes subject="cpu" messages={cpuErrors} />
    </PanelShell>
  );
}
