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
 * pill (`formatCh5Pwm`) never carries a real `severity`: `EC auto` and `unavailable` are not
 * §6.3 bands (O13), so it is always `severity={null}` — identity text beside the headline
 * reading's own colour, never a second colour that could disagree with it.
 *
 * ⚠ **Invariant 4 — `fanN_input` is the only trustworthy fan telemetry.** Nothing here reads
 * `pwmN_enable` or `fanN_target`; neither is in `lib/types.ts`'s contract at all, so neither
 * can be reached by accident.
 *
 * ⚠ **A stale row keeps its LAST VALUE and BOTH its facts** (added 2026-09-08 by 10b's
 * reconciliation, adversarial F3/F4). §6.5 says in bold that a stale condition *"shows its LAST
 * VALUE, unchanged — not an em dash"*; the age no longer *displaces* the `errors[]` explanation
 * the way `note={age ?? message}` did — the age is the `note`, the message is the `detail`, and
 * the case where both exist is exactly the case where a source died, i.e. the one that matters.
 *
 * ⚠ **10e / invariant 7 — the headline `Hero` cannot use `staleValueOr` directly.** That helper
 * substitutes a `DisplayedCondition.value`, which `conditionsFrom` has ALREADY formatted into
 * one string (`'4,308 RPM'`) — exactly the shape O14 forbids a `Hero` from splitting back apart
 * into `{ value, unit }`. Recorded rather than guessed at silently: when the current reading is
 * unreadable AND the condition is confirmed stale, this file renders the condition's whole
 * formatted string as `Hero`'s `value` with an EMPTY `unit` — the unit is already inside that
 * string — rather than parsing it back into parts. This is a degraded-only path (0 px, 0
 * occurrences, in every healthy fixture `check-density.mjs` grades) and the visual cost is
 * cosmetic: the stale numeral and its unit share one type size instead of two.
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
 * project keeps paying to avoid).
 */

import { Fragment } from 'react';

import { conditionId } from '@/lib/conditions';
import { errorsForPanel } from '@/lib/client/observations';
import { traceFor } from '@/lib/client/series';
import { latestSample } from '@/lib/client/runtime';
import { EM_DASH, formatCh5Pwm, formatRpm, formatRpmParts, formatText } from '@/lib/format';
import { severityFan5, severityFanStopped, severityUnitState } from '@/lib/severity';
import { celsius, rpm } from '@/lib/types';
import type { Cooling, Rpm, Severity, TelemetrySnapshot } from '@/lib/types';
import { FAN_SERVICE_UNIT } from '@/lib/units';
import { formatCelsius } from '@/lib/format';

import { CHART_SIZE } from '../grid';
import { SERIES_COLORS } from '../palette';
import { PanelShell } from '../panel-shell';
import type { PanelProps } from '../panel-props';
import { Hero } from '../hero';
import { Chip } from '../chip';
import { StackedTimeSeriesChart } from '../stacked-time-series-chart';
import { chartDomainOf, formatTimeOfDayMs } from './panel-chart';
import { findDisplayed, staleAgeNote, staleValueOr } from './condition-lookup';
import { panelChip } from './panel-chip';
import { StatusRow } from './status-row';
import { PanelNotes } from './panel-notes';
import { ChartViewToggle } from './chart-view-toggle';

import styles from './cooling-panel.module.css';

const FAN_SERVICE_ID = conditionId('unit', FAN_SERVICE_UNIT);

/** Q2-S2's table toggle (10c1) — see `gpu-panel.tsx`'s identical field for the shape. */
export interface CoolingPanelProps extends PanelProps {
  readonly view?: 'chart' | 'table';
  readonly onToggleView?: () => void;
}

/** One row of the chan table (§2.0/§2.2): glyph, id, value (with invariant 1's two special
 *  inks), a trailing note. Inline here — this shape is COOLING-only. */
interface ChanRowSpec {
  readonly id: string;
  readonly value: Rpm | null;
  readonly severity: Severity | null;
  readonly note: string | null;
}

/** invariant 1's `--unk`/`--zero` inks (§2.0): unreadable is muted+spaced, a genuine zero is
 *  alarm-inked — the ordinary reading in between takes the row's own primary ink. */
const chanValueClass = (value: Rpm | null): string => {
  if (value === null || !Number.isFinite(value)) return styles.valueUnknown as string;
  if (value === 0) return styles.valueZero as string;
  return styles.value as string;
};

function ChanTable({ rows }: { rows: readonly ChanRowSpec[] }) {
  return (
    <div className={styles.chan}>
      {rows.map((row) => (
        <Fragment key={row.id}>
          <Chip severity={row.severity} size="sm" />
          <span className={styles.chanId}>{row.id}</span>
          <span className={chanValueClass(row.value)}>{formatRpm(row.value)}</span>
          <span className={styles.chanNote}>{row.note ?? ''}</span>
        </Fragment>
      ))}
    </div>
  );
}

export function CoolingPanel({ state, nowMs, panelId, view = 'chart', onToggleView }: CoolingPanelProps) {
  const snapshot: TelemetrySnapshot | null = latestSample(state)?.snapshot ?? null;
  const cooling: Cooling | null = snapshot?.cooling ?? null;

  const fan5Severity = cooling === null ? null : severityFan5(cooling);
  const serviceSeverity = cooling === null ? null : severityUnitState(cooling.serviceState);
  const fan1Severity = severityFanStopped(cooling?.fan1Rpm ?? null);
  const fan2Severity = severityFanStopped(cooling?.fan2Rpm ?? null);
  const fan3Severity = severityFanStopped(cooling?.fan3Rpm ?? null);
  const fan4Severity = severityFanStopped(cooling?.fan4Rpm ?? null);
  // ⚠ 10b-S-F: `panelChip`, not `worstSeverity` — a panel that would read `normal` while one
  // of the four fan1-4 LEAVES is `null` shows no band instead. See `panel-chip.ts`'s module
  // doc. `fan5Severity` is passed whole: it is `severityFan5`'s own documented job not to lose
  // a `null` this way.
  const chip = panelChip(fan5Severity, fan1Severity, fan2Severity, fan3Severity, fan4Severity, serviceSeverity);

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

  // ⚠ 10e/invariant 7 — see the module doc: `Hero` cannot take `staleValueOr`'s combined
  // string apart again, so a confirmed-stale, currently-unreadable fan5 renders that whole
  // string as the VALUE with an empty unit instead. The ordinary path (reading present, or no
  // stale condition yet) is unaffected — `parts` exactly as every other Hero.
  const fan5Parts = formatRpmParts(cooling?.fan5Rpm ?? null);
  const fan5Stale =
    fan5Condition !== undefined && fan5Condition.stale && fan5Parts.value === EM_DASH;
  const heroValue = fan5Stale ? fan5Condition.value : fan5Parts.value;
  const heroUnit = fan5Stale ? '' : fan5Parts.unit;

  const toggle =
    onToggleView === undefined ? undefined : (
      <ChartViewToggle view={view} onToggle={onToggleView} label="GPU temperature and fan 5 RPM" />
    );

  return (
    <PanelShell title="cooling" subtitle="dell_smm · channel 5 = FAN_HDD (PCIe/GPU)" chip={chip} headControl={toggle}>
      <div className={styles.heroRow}>
        {/* ⚠ 10e-A8 — VISIBLE, not an `aria-label`. See `.heroKey` in this panel's stylesheet
            for why the label had to come back, and `hero.tsx`'s `ariaLabel` doc for why the
            attribute it replaces could not carry it. `Hero` takes no `ariaLabel` here now:
            this span is adjacent visible text and a second, identical accessible name on the
            group beside it would only announce "fan 5" twice. */}
        <span className={styles.heroKey}>fan 5</span>
        <Hero value={heroValue} unit={heroUnit} severity={fan5Severity} />
        {/* invariant 3/O13 — the derived mode is never a severity: `severity={null}`
            unconditionally, whatever `formatCh5Pwm` prints (`HIGH pwm 255` / `EC auto` /
            `unavailable`), so it can never disagree in colour with the headline reading. */}
        <Chip severity={null} size="md" label={cooling === null ? formatText(null) : formatCh5Pwm(cooling)} />
      </div>
      {/* Degraded only (0 px healthy): S-B's stale age is a fact the operator must see even
          though the hero row itself has no note slot. */}
      {fan5Age === null ? null : <p className={styles.staleCaption}>{fan5Age}</p>}
      <div className={styles.chart}>
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
          plotHeight={CHART_SIZE.cooling.plotHeight}
          view={view}
        />
      </div>
      <ChanTable
        rows={[
          { id: 'fan 2', value: cooling?.fan2Rpm ?? null, severity: fan2Severity, note: null },
          { id: 'fan 1', value: cooling?.fan1Rpm ?? null, severity: fan1Severity, note: null },
          { id: 'fan 3', value: cooling?.fan3Rpm ?? null, severity: fan3Severity, note: null },
          { id: 'fan 4', value: cooling?.fan4Rpm ?? null, severity: fan4Severity, note: null },
        ]}
      />
      <div className={styles.rows}>
        <StatusRow
          label="fan service"
          value={staleValueOr(serviceCondition, formatText(cooling?.serviceState ?? null))}
          severity={serviceSeverity}
          note={serviceAge}
          noteTone={serviceAge === null ? 'muted' : 'watch'}
          detail={dbusError}
        />
      </div>
      <PanelNotes messages={dellSmmError === null ? [] : [{ source: 'dell-smm', message: dellSmmError }]} />
    </PanelShell>
  );
}
