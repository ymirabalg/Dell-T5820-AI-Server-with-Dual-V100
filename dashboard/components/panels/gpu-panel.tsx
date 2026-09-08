/**
 * §6.2's GPU card — mounted twice, at `gpu0` and `gpu1`, by `index`.
 *
 * Temperature is the dominant figure with a 30-minute trace behind it, power against the
 * 250 W cap, VRAM as a bar with absolute MiB, utilisation, SM clock, and the model currently
 * served on this card. Every trap named in the handoff is handled at the one place it can be
 * gotten wrong:
 *
 * - ⚠ **The name and bus are the driver's raw strings, never prettified.** `formatText` only
 *   trims whitespace and blanks-to-`—`; it does not rename, truncate or look anything up.
 *   `nvidia-smi` returns `Tesla PG500-216` on this box — the board code, not "V100" — and the
 *   bus renders in full domain form, `00000000:17:00.0`. `MOCK.html` gets both wrong and is a
 *   reference, never a source (SPEC.md §6.2).
 * - ⚠ **Throttle reasons render only when `decodeThrottleMask(...).notable` is true** — i.e.
 *   something other than `0x4` (the routine power cap) is active. A mask of `0` or `0x4` alone
 *   renders NO throttle row at all, so the normal power cap is never styled as a warning.
 * - ⚠ **The GPU↔instance join is `gpu.index === serving.instance`** (SPEC.md §6.2) — not
 *   derivable from anything else on the snapshot. The row is labelled "served by instance N",
 *   never "on this card", because that is the claim the data actually supports.
 * - **`gpus: null`** (nvidia-smi absent, or no poll has landed yet) takes over the whole body
 *   with §6.5's "no GPUs enumerated" message and whatever `errorsForPanel` has to say about it.
 *   Every other panel is unaffected (§6.5) — that is `dashboard-shell.tsx`'s and the header's
 *   concern, not this component's; this file only has to not blank anything it does not own.
 * - ⚠ **A card ABSENT from a `gpus` that WAS read is its own branch** — §6.5's *retired* case,
 *   *"the subject has left the machine, and that is an answer"*. See `absent` below.
 *
 * ### ⚠ The ≥1600px promotion (§6.1), and the size it was given
 *
 * `grid.tsx`'s own doc records the mechanism as "recommended, not mandated": render BOTH the
 * sparkline and the promoted `StackedTimeSeriesChart`, and let a `min-width: 1600px` media
 * query in this file's own stylesheet show one and hide the other — so no viewport-tracking
 * state has to cross the hook boundary `purity.test.ts` enforces. **Size is a defensible
 * default, recorded rather than assumed** (L9's canonical value is 10c's, per the handoff):
 * 480px wide, matching `grid.tsx`'s `CHART_SIZE.cooling` width so a promoted GPU card and the
 * COOLING panel's own chart do not disagree about how wide a "big" chart is on this page, and
 * 140px tall — shorter than COOLING's 210px, because COOLING stacks two plots and this is one.
 *
 * ⚠ **CSS media-query behaviour is not observable from `renderToStaticMarkup`** (HANDOVER §6:
 * "CSS and layout are not observable in jsdom"). This file's tests can prove both elements
 * render with the right content and that exactly one of the two wrapper classes is meant to be
 * visible at a time by construction; they cannot prove the breakpoint paints correctly in a
 * real browser.
 */

import { formatTimeOfDayMs, chartDomainOf } from './panel-chart';
import { StackedTimeSeriesChart } from '../stacked-time-series-chart';
import { Sparkline } from '../sparkline';
import { PanelShell } from '../panel-shell';
import { Meter } from '../meter';
import { Row } from '../row';
import { CHART_SIZE } from '../grid';
import { SERIES_COLORS } from '../palette';
import type { PanelProps } from '../panel-props';
import { decodeThrottleMask } from '@/lib/throttle';
import { errorsForPanel } from '@/lib/client/observations';
import { traceFor } from '@/lib/client/series';
import { latestSample } from '@/lib/client/runtime';
import {
  formatCelsius,
  formatMHz,
  formatMiBPair,
  formatPercent,
  formatText,
  formatWatts,
} from '@/lib/format';
import { severityGpuTemp, severityVram, worstSeverity } from '@/lib/severity';
import { celsius } from '@/lib/types';
import type { Gpu, ServingInstance, TelemetrySnapshot } from '@/lib/types';

import { PanelNotes } from './panel-notes';

import styles from './gpu-panel.module.css';

/**
 * ⚠ **`panelId` is narrowed here, and `index` is DERIVED from it** (10b-reconcile, adversarial
 * F12). The first draft carried `index` as a second, independent prop, so
 * `<GpuPanel panelId="gpu1" index={0} />` typechecked and rendered GPU 0's card, titled
 * `GPU 0`, into the `gpu1` grid slot — with correct, unique SVG ids, so nothing collided and
 * nothing went red. `panel-props.ts` exists precisely so *"which instance am I"* is typed once;
 * a second copy of one fact is a state that should not be representable, and the wiring diff
 * 10c has to write is exactly where it would be mis-typed.
 */
export interface GpuPanelProps extends Omit<PanelProps, 'panelId'> {
  /** This mount's grid slot — and, through it, which of the two known cards this is. */
  readonly panelId: 'gpu0' | 'gpu1';
}

const gpuAt = (snapshot: TelemetrySnapshot | null, index: number): Gpu | null =>
  snapshot?.gpus?.find((g) => g.index === index) ?? null;

const servingFor = (snapshot: TelemetrySnapshot | null, index: number): ServingInstance | null =>
  snapshot?.serving?.find((s) => s.instance === index) ?? null;

export function GpuPanel({ state, panelId }: GpuPanelProps) {
  const index: 0 | 1 = panelId === 'gpu0' ? 0 : 1;
  const snapshot = latestSample(state)?.snapshot ?? null;
  const gpu = gpuAt(snapshot, index);
  const instance = servingFor(snapshot, index);
  // ⚠ §3.1's *retired* case, at the panel (10b-reconcile, adversarial F7). `gpus` was READ and
  // this card is not in it — the card has left the machine, which §6.5 calls an answer — and
  // that is a different fact from "the card is here and every reading failed". Without this
  // branch the two rendered BYTE-IDENTICALLY, and the join below still printed
  // `served by instance 1  gemma-4-12b` for a card the enumeration says is not there: §6.2's
  // own named failure mode, *"getting it wrong prints the wrong model on a card rather than
  // failing visibly"*.
  const absent = snapshot !== null && snapshot.gpus !== null && gpu === null;
  const decode = decodeThrottleMask(gpu?.throttleReasons ?? null);

  const chip = worstSeverity(
    severityGpuTemp(gpu?.tempC ?? null),
    decode?.severity ?? null,
    severityVram(gpu?.memUsedMiB ?? null, gpu?.memTotalMiB ?? null),
  );

  const subtitle = `${formatText(gpu?.name ?? null)} · ${formatText(gpu?.bus ?? null)}`;
  const color = index === 0 ? SERIES_COLORS.gpu0 : SERIES_COLORS.gpu1;
  const seriesId = index === 0 ? 'gpu0' : 'gpu1';
  const trace = traceFor(state, (s) => s.gpus?.find((g) => g.index === index)?.tempC ?? null);
  const domain = chartDomainOf(state);
  const ariaLabel = `GPU ${index} temperature over the selected window`;

  return (
    <PanelShell title={`GPU ${index}`} subtitle={subtitle} chip={chip}>
      {absent ? (
        <div>
          <p className={styles.takeover}>card not enumerated</p>
        </div>
      ) : snapshot !== null && snapshot.gpus === null ? (
        <div>
          <p className={styles.takeover}>no GPUs enumerated</p>
          {errorsForPanel(snapshot, 'gpu').map((e) => (
            <p key={e.source} className={styles.takeoverNote}>
              {e.message}
            </p>
          ))}
        </div>
      ) : (
        <>
          <div className={styles.headline}>
            <Row label="temperature" value={formatCelsius(gpu?.tempC ?? null)} severity={severityGpuTemp(gpu?.tempC ?? null)} />
          </div>
          <div className={styles.sparklineWrap}>
            <Sparkline
              points={trace}
              ariaLabel={ariaLabel}
              color={color}
              width={CHART_SIZE.sparkline.width}
              height={CHART_SIZE.sparkline.height}
              formatValue={(v) => formatCelsius(celsius(v))}
              formatTime={formatTimeOfDayMs}
            />
          </div>
          <div className={styles.fullChartWrap}>
            <StackedTimeSeriesChart
              id={`${panelId}-temp-chart`}
              ariaLabel={ariaLabel}
              plots={[
                {
                  id: 'temp',
                  series: [{ id: seriesId, label: `GPU ${index}`, color, points: trace }],
                  formatTick: (v) => formatCelsius(celsius(v)),
                },
              ]}
              gaps={state.gaps}
              domainStartMs={domain.startMs}
              domainEndMs={domain.endMs}
              formatTime={formatTimeOfDayMs}
              width={480}
              plotHeight={140}
            />
          </div>
          <Row label="power" value={`${formatWatts(gpu?.powerW ?? null)} of ${formatWatts(gpu?.powerCapW ?? null)} cap`} />
          <Meter
            label="VRAM"
            formattedValue={formatMiBPair(gpu?.memUsedMiB ?? null, gpu?.memTotalMiB ?? null)}
            used={gpu?.memUsedMiB ?? null}
            total={gpu?.memTotalMiB ?? null}
            severity={severityVram(gpu?.memUsedMiB ?? null, gpu?.memTotalMiB ?? null)}
          />
          <Row label="utilisation" value={formatPercent(gpu?.utilPct ?? null)} />
          <Row label="SM clock" value={formatMHz(gpu?.smClockMHz ?? null)} />
          {decode !== null && decode.notable ? (
            <Row
              label="throttle"
              value={decode.reasons.map((r) => r.label).join(', ')}
              severity={decode.severity}
            />
          ) : null}
          <Row
            label={`served by instance ${index}`}
            value={formatText(instance?.model ?? null)}
          />
          {/* §6.5's "is available" half on the NON-takeover branch too. `nvidia-smi` is this
              panel's only source and it blanks every figure at once, so it renders once under
              them; before this, an enumerated card whose readings all failed showed four em
              dashes with the message reachable only when `gpus` was null entirely
              (10b-reconcile, adversarial F5). */}
          <PanelNotes messages={snapshot === null ? [] : errorsForPanel(snapshot, 'gpu')} />
        </>
      )}
    </PanelShell>
  );
}
