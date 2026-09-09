/**
 * §6.1's COOLING card (spans rows 2–3, columns 1–2) — `fan5` RPM as the headline, the derived
 * mode, `fan2` and the rest smaller, the fan service state, and *"the single most useful thing
 * this panel can do"*: the GPU temperature trace and the fan RPM trace on shared time, so the
 * engage/release behaviour (§6.3's engaged band, `AUTO_BELOW=55`/`HYSTERESIS=4` from
 * `CLAUDE.md`) is legible at a glance.
 *
 * Both GPU cards' temperature traces are drawn, not one — the spec names "the GPU temperature
 * trace" in the singular, but this box has two cards and no reading that says which one drives
 * the fan curve; drawing both is the conservative reading and costs nothing at this budget
 * (§6.7: 600 points **per series**, so three series here is 1,800, matching §6.2's own stacked
 * chart precedent).
 *
 * ⚠ **Invariant 3 — `ENODATA` from `pwm5` is `EC auto`, and it is HEALTHY.** The derived-mode
 * row (`formatCh5Pwm`) never carries a `severity` prop: `EC auto` and `unavailable` are not
 * §6.3 bands (O13), so this row renders as identity text beside the headline reading's own
 * chip, never a second colour that could disagree with it.
 *
 * ⚠ **Invariant 4 — `fanN_input` is the only trustworthy fan telemetry.** Nothing here reads
 * `pwmN_enable` or `fanN_target`; neither is in `lib/types.ts`'s contract at all, so neither
 * can be reached by accident.
 *
 * ⚠ **A stale row keeps its LAST VALUE and BOTH its facts** (added 2026-09-08 by 10b's
 * reconciliation, adversarial F3/F4). §6.5 says in bold that a stale condition *"shows its LAST
 * VALUE, unchanged — not an em dash"*; `staleValueOr` supplies it, so this row and
 * `components/alarm-banner.tsx` can no longer print two different numbers for one condition in
 * one frame. And the stale age no longer *displaces* the `errors[]` explanation the way
 * `note={age ?? message}` did — the age is the `note`, the message is the `detail`, and the
 * case where both exist is exactly the case where a source died, i.e. the one that matters.
 *
 * The fan service row is the one place in this panel §6.5's stale treatment is reachable: its
 * severity function (`severityUnitState`) returns `null` for an unreadable input, so a D-Bus
 * outage can make `conditionsFrom` drop the observation on successive polls and `observePoll`
 * confirm it stale. `fan5`'s absolute row can too, via the same mechanism when `dell-smm`
 * itself stops answering, so both carry `condition-lookup.ts`'s treatment.
 *
 * ⚠ **S11/G5, settled 2026-09-08 (widened while this loop was building): a `fan5` em dash next
 * to the "unavailable" mode neighbour needs NO entry of its own.** §6.5's "no second
 * explanation" exception now reaches a neighbour that names a documented absent state, not only
 * one that carries a severity — `unavailable` is exactly that state (O13: it is not itself a
 * severity), so `pwm5Present: true` with `ch5Mode: null` and `fan5Rpm: null` is a normal,
 * explained state and gets no fallback text here. **Two things this file must NOT do**, both
 * rejected alternatives named in the ruling: write a fallback sentence for this case (§3.7
 * requires explanation text to come from the `errors[]` source match, never copy written in the
 * UI), or expect an `errors[]` entry to exist for it (the collector deliberately files none —
 * reporting a failure for a documented-normal state would be the fabricated-alarm mistake this
 * project keeps paying to avoid). The fan5 row's two note slots are therefore exactly
 * `note={fan5Age}` and `detail={dellSmmError}` — nothing appended, nothing defaulted — so when
 * neither is present **the row renders no note element at all**, and "unavailable" on the row
 * below is the whole explanation. That last sentence is what `10b-CO5`'s ⚠ test now asserts:
 * the *absence of the element*, not the absence of three particular words (10b-reconcile,
 * adversarial F6 — a fallback sentence with different wording passed the old guard).
 */

import { conditionId } from '@/lib/conditions';
import { errorsForPanel } from '@/lib/client/observations';
import { traceFor } from '@/lib/client/series';
import { latestSample } from '@/lib/client/runtime';
import { formatCh5Pwm, formatRpm, formatText } from '@/lib/format';
import { severityFan5, severityFanStopped, severityUnitState } from '@/lib/severity';
import { celsius, rpm } from '@/lib/types';
import type { Cooling, TelemetrySnapshot } from '@/lib/types';
import { FAN_SERVICE_UNIT } from '@/lib/units';
import { formatCelsius } from '@/lib/format';

import { CHART_SIZE } from '../grid';
import { SERIES_COLORS } from '../palette';
import { PanelShell } from '../panel-shell';
import type { PanelProps } from '../panel-props';
import { Row } from '../row';
import { StackedTimeSeriesChart } from '../stacked-time-series-chart';
import { chartDomainOf, formatTimeOfDayMs } from './panel-chart';
import { findDisplayed, staleAgeNote, staleValueOr } from './condition-lookup';
import { panelChip } from './panel-chip';
import { StatusRow } from './status-row';
import { ChartViewToggle } from './chart-view-toggle';

import styles from './cooling-panel.module.css';

const FAN_SERVICE_ID = conditionId('unit', FAN_SERVICE_UNIT);

/** Q2-S2's table toggle (10c1) — see `gpu-panel.tsx`'s identical field for the shape. */
export interface CoolingPanelProps extends PanelProps {
  readonly view?: 'chart' | 'table';
  readonly onToggleView?: () => void;
}

export function CoolingPanel({ state, nowMs, panelId, view = 'chart', onToggleView }: CoolingPanelProps) {
  const snapshot: TelemetrySnapshot | null = latestSample(state)?.snapshot ?? null;
  const cooling: Cooling | null = snapshot?.cooling ?? null;

  const fan5Severity = cooling === null ? null : severityFan5(cooling);
  const serviceSeverity = cooling === null ? null : severityUnitState(cooling.serviceState);
  // ⚠ 10b-S-F: `panelChip` over the four fan1-4 LEAVES directly, not a pre-combined
  // `worstSeverity` of them (the old `fan1234Severity`) — a lone `null` among the four would
  // otherwise be thrown away by that inner combination before `panelChip` ever saw it. See
  // `panel-chip.ts`'s module doc. `fan5Severity` is passed whole: it is `severityFan5`'s own
  // documented job not to lose a `null` this way.
  const chip = panelChip(
    fan5Severity,
    severityFanStopped(cooling?.fan1Rpm ?? null),
    severityFanStopped(cooling?.fan2Rpm ?? null),
    severityFanStopped(cooling?.fan3Rpm ?? null),
    severityFanStopped(cooling?.fan4Rpm ?? null),
    serviceSeverity,
  );

  const fan5Condition = findDisplayed(state.displayed, 'fan5_absolute');
  const serviceCondition = findDisplayed(state.displayed, FAN_SERVICE_ID);
  const fan5Age = staleAgeNote(fan5Condition, nowMs);
  const serviceAge = staleAgeNote(serviceCondition, nowMs);

  const coolingErrors = snapshot === null ? [] : errorsForPanel(snapshot, 'cooling');
  // ⚠ LAST, not first (10b-reconcile, adversarial F10). `lib/client/events.ts:400` folds
  // `errors[]` into a `Map` keyed by source, so the log shows the LAST message a source filed;
  // a panel reading the FIRST shows a different sentence for the same fault in the same
  // session — `errorsForPanel`'s own doc names that hazard, and multi-entry-per-source is
  // routine (`collectCooling` accumulates a `problems: string[]` into one `tag('dell-smm', …)`).
  const dellSmmError = coolingErrors.findLast((e) => e.source === 'dell-smm')?.message ?? null;
  // ⚠ 10b-S-G's reconciliation (adversarial A2). `panelsForSource('dbus')` fans out to
  // COOLING, SERVING and SAFETY, and an entry carrying an `instance` (§3.7) names ONE
  // `llama-server` instance — a subject this panel has no row for. Without this filter the
  // `fan service` row prints `llama-server@1.service: NoSuchUnit: systemd has no record`
  // beside a healthy `gpu-fan-control.service`, which is F2's disease in a second panel:
  // an explanation attached to a row it is not about. The entry is not lost — SERVING
  // renders it on the row it names. An entry with NO instance still lands here, because
  // that is either the bus-wide failure or `collectSafety`'s own per-unit one, which this
  // field cannot yet tell apart (A8, recorded as open).
  const dbusError =
    coolingErrors.findLast((e) => e.source === 'dbus' && e.instance === undefined)?.message ?? null;

  const domain = chartDomainOf(state);
  const gpu0Trace = traceFor(state, (s) => s.gpus?.find((g) => g.index === 0)?.tempC ?? null);
  const gpu1Trace = traceFor(state, (s) => s.gpus?.find((g) => g.index === 1)?.tempC ?? null);
  const fan5Trace = traceFor(state, (s) => s.cooling.fan5Rpm);

  return (
    <PanelShell title="cooling" subtitle="dell_smm · channel 5 = FAN_HDD (PCIe/GPU)" chip={chip}>
      <div className={styles.headline}>
        <StatusRow
          label="fan 5"
          value={staleValueOr(fan5Condition, formatRpm(cooling?.fan5Rpm ?? null))}
          severity={fan5Severity}
          note={fan5Age}
          noteTone={fan5Age === null ? 'muted' : 'watch'}
          detail={dellSmmError}
        />
      </div>
      <Row label="mode" value={cooling === null ? formatText(null) : formatCh5Pwm(cooling)} />
      <StatusRow
        label="fan service"
        value={staleValueOr(serviceCondition, formatText(cooling?.serviceState ?? null))}
        severity={serviceSeverity}
        note={serviceAge}
        noteTone={serviceAge === null ? 'muted' : 'watch'}
        detail={dbusError}
      />
      <div className={styles.chart}>
        {onToggleView === undefined ? null : (
          <ChartViewToggle
            view={view}
            onToggle={onToggleView}
            label="GPU temperature and fan 5 RPM"
          />
        )}
        <StackedTimeSeriesChart
          id={`${panelId}-chart`}
          ariaLabel="GPU temperature and fan 5 RPM over the selected window"
          plots={[
            {
              id: 'temp',
              series: [
                { id: 'gpu0', label: 'GPU 0', color: SERIES_COLORS.gpu0, points: gpu0Trace },
                {
                  id: 'gpu1',
                  label: 'GPU 1',
                  color: SERIES_COLORS.gpu1,
                  dashed: true,
                  points: gpu1Trace,
                },
              ],
              formatTick: (v) => formatCelsius(celsius(v)),
            },
            {
              id: 'fan',
              series: [
                { id: 'fan5', label: 'fan 5', color: SERIES_COLORS.fan5, points: fan5Trace },
              ],
              formatTick: (v) => formatRpm(rpm(v)),
            },
          ]}
          gaps={state.gaps}
          domainStartMs={domain.startMs}
          domainEndMs={domain.endMs}
          formatTime={formatTimeOfDayMs}
          width={CHART_SIZE.cooling.width}
          plotHeight={CHART_SIZE.cooling.height}
          view={view}
        />
      </div>
      <div className={styles.smaller}>
        <Row
          label="fan 2"
          value={formatRpm(cooling?.fan2Rpm ?? null)}
          severity={severityFanStopped(cooling?.fan2Rpm ?? null)}
        />
        <Row
          label="fan 1"
          value={formatRpm(cooling?.fan1Rpm ?? null)}
          severity={severityFanStopped(cooling?.fan1Rpm ?? null)}
        />
        <Row
          label="fan 3"
          value={formatRpm(cooling?.fan3Rpm ?? null)}
          severity={severityFanStopped(cooling?.fan3Rpm ?? null)}
        />
        <Row
          label="fan 4"
          value={formatRpm(cooling?.fan4Rpm ?? null)}
          severity={severityFanStopped(cooling?.fan4Rpm ?? null)}
        />
      </div>
    </PanelShell>
  );
}
