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
 * ⚠ **Two traces, not one colour reused across both.** §6.2 asks for temperature AND
 * utilisation traces. `components/palette.ts` reserves its three hex values for series that
 * share ONE frame (GPU 0 / GPU 1 / fan 5 on the COOLING chart) and explicitly forbids adding a
 * fourth "without a design decision" — recorded here rather than invented silently: CPU's two
 * traces never share a frame with each other or with the GPU/fan traces, so reusing
 * `SERIES_COLORS.gpu0` (temperature) and `.gpu1` (utilisation) costs nothing and needs no new
 * hex. Neither reading is banded by §6.3 except temperature.
 */

import { PanelShell } from '../panel-shell';
import { Row } from '../row';
import { Sparkline } from '../sparkline';
import { CHART_SIZE } from '../grid';
import { SERIES_COLORS } from '../palette';
import type { PanelProps } from '../panel-props';
import { formatTimeOfDayMs } from './panel-chart';
import { PanelNotes } from './panel-notes';
import { errorsForPanel } from '@/lib/client/observations';
import { traceFor } from '@/lib/client/series';
import { latestSample } from '@/lib/client/runtime';
import { EM_DASH, formatCelsius, formatCpuModel, formatLoadAverage, formatPercent } from '@/lib/format';
import { severityCpuTemp } from '@/lib/severity';
import { celsius, percent } from '@/lib/types';
import type { Host, TelemetrySnapshot } from '@/lib/types';

const coreThread = (n: number | null): string => (n === null ? EM_DASH : String(n));

// ⚠ `panelId` is not read: `Sparkline` (this panel's only chart primitive) mints no SVG ids at
// all (unlike `StackedTimeSeriesChart`'s `id` prop), so there is nothing here for the
// namespace to prefix. Still required by `PanelProps` — a future promotion to a full chart
// (matching GPU's ≥1600px treatment) would need it, and the type keeps that honest.
export function CpuPanel({ state }: PanelProps) {
  const snapshot: TelemetrySnapshot | null = latestSample(state)?.snapshot ?? null;
  const host: Host | null = snapshot?.host ?? null;

  // §6.5's "its `errors` entry is available" half. `lib/client/observations.ts` routes CPU's
  // four sources here BY THE FIGURE EACH BLANKS — that split is the reason `collectHost` files
  // nine sources for one crash — so each message goes on the row it explains, and
  // `proc-cpuinfo` (which blanks the SUBTITLE, a head element with no note slot) renders under
  // the rows. ⚠ LAST per source, matching `events.ts` (10b-reconcile, adversarial F5/F10).
  const cpuErrors = snapshot === null ? [] : errorsForPanel(snapshot, 'cpu');
  const messageFor = (source: string): string | null =>
    cpuErrors.findLast((e) => e.source === source)?.message ?? null;
  const identityErrors = cpuErrors.filter((e) => e.source === 'proc-cpuinfo');
  // ⚠ 10b-S-F does not reach this panel, deliberately left as `severityCpuTemp` alone rather
  // than routed through `panelChip`. CPU's chip has exactly ONE §6.3-banded leaf — temperature;
  // utilisation and load average are unbanded (this file's own module doc: "neither reading is
  // banded by §6.3 except temperature"). A single-leaf chip can never be `'normal'` while a
  // DIFFERENT leaf of its own is `null`, because there is no different leaf: if `cpuTempC` is
  // `null` the chip is already `null`, not a false `'normal'`. `panelChip(chip)` would be a
  // no-op here — recorded per invariant 7 rather than added as inert wrapping.
  const chip = severityCpuTemp(host?.cpuTempC ?? null);
  const subtitle = `${formatCpuModel(host?.cpuModel ?? null)} · ${coreThread(host?.cores ?? null)}C / ${coreThread(host?.threads ?? null)}T`;

  const tempTrace = traceFor(state, (s) => s.host.cpuTempC);
  const utilTrace = traceFor(state, (s) => s.host.cpuPct);

  return (
    <PanelShell title="cpu" subtitle={subtitle} chip={chip}>
      <Row
        label="temperature"
        value={formatCelsius(host?.cpuTempC ?? null)}
        severity={chip}
        note={messageFor('coretemp')}
      />
      <Sparkline
        points={tempTrace}
        ariaLabel="CPU temperature over the selected window"
        color={SERIES_COLORS.gpu0}
        width={CHART_SIZE.sparkline.width}
        height={CHART_SIZE.sparkline.height}
        formatValue={(v) => formatCelsius(celsius(v))}
        formatTime={formatTimeOfDayMs}
      />
      <Row
        label="utilisation"
        value={formatPercent(host?.cpuPct ?? null)}
        note={messageFor('proc-stat')}
      />
      <Sparkline
        points={utilTrace}
        ariaLabel="CPU utilisation over the selected window"
        color={SERIES_COLORS.gpu1}
        width={CHART_SIZE.sparkline.width}
        height={CHART_SIZE.sparkline.height}
        formatValue={(v) => formatPercent(percent(v))}
        formatTime={formatTimeOfDayMs}
      />
      <Row
        label="load average"
        value={formatLoadAverage(host?.loadAvg ?? null)}
        note={messageFor('proc-loadavg')}
      />
      <PanelNotes messages={identityErrors} />
    </PanelShell>
  );
}
