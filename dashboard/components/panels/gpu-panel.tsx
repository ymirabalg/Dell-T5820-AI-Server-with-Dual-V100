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
 * ### 10e §2.1 — the mock's density, at 10e's §3.2 chart sizes
 *
 * Temperature moves from a `Row` into the dominant `Hero` figure; power moves into a `Figure`
 * block beside it (the SAME `powerW` reading the meter below draws against the cap — the
 * mock's form, 0 extra px); utilisation/SM clock/served-by collapse into one `Strip` line.
 * The GPU↔instance join, the `gpus: null` takeover, the *retired*-card branch, `panelChip` and
 * `decodeThrottleMask(...).notable` are ALL UNCHANGED — 10e touches density, never data or
 * rules (`ANCHOR.md` §9).
 *
 * ### ⚠ The ≥1600px promotion (§6.1), and the size it was given
 *
 * `grid.tsx`'s own doc records the mechanism: render BOTH sizes of the sparkline and let a
 * `min-width: 1600px` media query in this file's own stylesheet show one and hide the other,
 * so no viewport-tracking state has to cross the hook boundary `purity.test.ts` enforces. 10e
 * replaces the ≥1600px `StackedTimeSeriesChart` with the SAME `Sparkline` primitive at a
 * bigger size (`CHART_SIZE.gpuPromoted`), carrying `domain`/`refs`/`timeLabels` (§3.2) — no
 * second chart component, no second geometry to keep in sync with the small form.
 *
 * ⚠ **CSS media-query behaviour is not observable from `renderToStaticMarkup`** (HANDOVER §6:
 * "CSS and layout are not observable in jsdom"). This file's tests can prove both elements
 * render with the right content and that exactly one of the two wrapper classes is meant to be
 * visible at a time by construction; they cannot prove the breakpoint paints correctly in a
 * real browser.
 */

import { formatTimeOfDayMs } from './panel-chart';
import { Sparkline } from '../sparkline';
import { PanelShell } from '../panel-shell';
import { Hero, Figure } from '../hero';
import { Strip } from '../strip';
import { Meter } from '../meter';
import { Caption } from './caption';
import { Chip } from '../chip';
import { CHART_SIZE } from '../grid';
import { SERIES_COLORS } from '../palette';
import type { PanelProps } from '../panel-props';
import { decodeThrottleMask } from '@/lib/throttle';
import { errorsForPanel } from '@/lib/client/observations';
import { traceFor } from '@/lib/client/series';
import { latestSample } from '@/lib/client/runtime';
import {
  formatCelsius,
  formatCelsiusParts,
  formatMHz,
  formatMiBPair,
  formatPercent,
  formatText,
  formatWatts,
  formatWattsParts,
} from '@/lib/format';
import { GPU_TEMP_ALARM_C, GPU_TEMP_WATCH_C, severityGpuTemp, severityVram, usedPercent } from '@/lib/severity';
import { celsius } from '@/lib/types';
import type { Gpu, ServingInstance, TelemetrySnapshot } from '@/lib/types';

import { PanelNotes } from './panel-notes';
import { panelChip } from './panel-chip';
import { ChartViewToggle } from './chart-view-toggle';

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
  /**
   * Q2-S2's table toggle, now shell-owned (10c1). Optional and defaulted to `'chart'` so a
   * caller with nothing to toggle — every existing test in this file — renders exactly as
   * before; `dashboard-shell.tsx` is the one production caller and always supplies both.
   * Governs BOTH chart elements this panel draws (the sparkline and its ≥1600px promotion):
   * only one is ever visible at a time by CSS, so one `view` value covers whichever is shown
   * (`chart-view-toggle.tsx`'s module doc has the granularity reasoning).
   */
  readonly view?: 'chart' | 'table';
  /** Present only when the caller owns toggle state. The control renders only when this is
   *  given — a panel with nothing wired must not invent a button that does nothing. */
  readonly onToggleView?: () => void;
}

const gpuAt = (snapshot: TelemetrySnapshot | null, index: number): Gpu | null =>
  snapshot?.gpus?.find((g) => g.index === index) ?? null;

const servingFor = (snapshot: TelemetrySnapshot | null, index: number): ServingInstance | null =>
  snapshot?.serving?.find((s) => s.instance === index) ?? null;

/** §6.3's own boundaries, on the ≥1600px promoted sparkline only (OQ-6: leave the rest out). */
const TEMP_REFS = [
  { v: GPU_TEMP_ALARM_C, label: String(GPU_TEMP_ALARM_C), alarm: true },
  { v: GPU_TEMP_WATCH_C, label: String(GPU_TEMP_WATCH_C) },
];

/** The mock's shared GPU scale (§3.2): both cards, both sizes, so the reference lines are
 *  always on screen rather than only when the window happens to touch them. */
const TEMP_DOMAIN = { min: 30, max: 90 };

export function GpuPanel({ state, panelId, view = 'chart', onToggleView }: GpuPanelProps) {
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

  // ⚠ 10b-S-F: `panelChip`, not `worstSeverity` — a panel that would read `normal` while one
  // of these three LEAF readings (temperature, throttle, VRAM) is `null` shows no band instead.
  // See `panel-chip.ts`'s module doc for why these three specifically, and why passing something
  // pre-combined would be too late to catch it.
  const tempSeverity = severityGpuTemp(gpu?.tempC ?? null);
  const chip = panelChip(
    tempSeverity,
    decode?.severity ?? null,
    severityVram(gpu?.memUsedMiB ?? null, gpu?.memTotalMiB ?? null),
  );

  const subtitle = `${formatText(gpu?.name ?? null)} · ${formatText(gpu?.bus ?? null)}`;
  const color = index === 0 ? SERIES_COLORS.gpu0 : SERIES_COLORS.gpu1;
  const trace = traceFor(state, (s) => s.gpus?.find((g) => g.index === index)?.tempC ?? null);
  const ariaLabel = `GPU ${index} temperature over the selected window`;
  // ⚠ 10e-A8: the HERO is a point reading, so it must not be named with the CHART's
  // window sentence — `ariaLabel` above is already the accessible name of both `<svg
  // role="img">` mounts and of `ChartViewToggle`, and announcing "over the selected
  // window" over a single instantaneous numeral is wrong three times over.
  const heroAriaLabel = `GPU ${index} temperature`;
  const tempParts = formatCelsiusParts(gpu?.tempC ?? null);
  const powerParts = formatWattsParts(gpu?.powerW ?? null);

  const toggle =
    onToggleView === undefined ? undefined : (
      <ChartViewToggle view={view} onToggle={onToggleView} label={ariaLabel} />
    );

  return (
    <PanelShell title={`GPU ${index}`} subtitle={subtitle} chip={chip} headControl={toggle}>
      {absent ? (
        <div>
          <p className={styles.takeover}>card not enumerated</p>
        </div>
      ) : snapshot !== null && snapshot.gpus === null ? (
        <div>
          <p className={styles.takeover}>no GPUs enumerated</p>
          {/* ⚠ 10f/Q1 — this was a second, bespoke copy of `PanelNotes` (`.takeoverNote`, one
              `<p>` per source) and so a second UNBOUNDED `errors[]` block. The ruling is
              "bound every notes block"; rendering it through the one primitive that owns the
              bounded well is how it stays bound as that well changes. `roomy` costs the page
              nothing here — this branch draws no chart, so the card is far under the 176 px
              its healthy form sets row 1 to. */}
          <PanelNotes subject={`GPU ${index}`} bound="roomy" messages={errorsForPanel(snapshot, 'gpu')} />
        </div>
      ) : (
        <>
          <div className={styles.heroRow}>
            <Hero value={tempParts.value} unit={tempParts.unit} severity={tempSeverity} ariaLabel={heroAriaLabel} />
            <div className={styles.sparklineArea}>
              {/* ⚠ 10c-3/A2: the two wrappers carry a stable `data-role` so a browser measurement
                  identifies them BY NAME. `measure-breakpoints.mjs` used to take `svgs[0]` and
                  `svgs[1]` inside this card positionally, which held only while these two files
                  were the only `<svg>` emitters in the tree — one icon or badge added here and the
                  measurement silently checked the wrong pair, in the direction that PASSES. */}
              <div className={styles.sparklineWrap} data-role="gpu-sparkline-wrap">
                <Sparkline
                  points={trace}
                  ariaLabel={ariaLabel}
                  color={color}
                  width={CHART_SIZE.gpuSparkline.width}
                  height={CHART_SIZE.gpuSparkline.height}
                  view={view}
                  formatValue={(v) => formatCelsius(celsius(v))}
                  formatTime={formatTimeOfDayMs}
                  gaps={state.gaps}
                  domain={TEMP_DOMAIN}
                />
              </div>
              <div className={styles.fullChartWrap} data-role="gpu-full-chart-wrap">
                <Sparkline
                  points={trace}
                  ariaLabel={ariaLabel}
                  color={color}
                  width={CHART_SIZE.gpuPromoted.width}
                  height={CHART_SIZE.gpuPromoted.height}
                  view={view}
                  formatValue={(v) => formatCelsius(celsius(v))}
                  formatTime={formatTimeOfDayMs}
                  gaps={state.gaps}
                  domain={TEMP_DOMAIN}
                  refs={TEMP_REFS}
                  timeLabels
                />
              </div>
            </div>
            {/* The mock's `.gpuTop__pw` — the SAME `powerW` reading the meter below draws
                against the cap; this is its 0px-extra form, not a second reading. */}
            <Figure value={powerParts.value} unit={powerParts.unit} caption={`cap ${formatWatts(gpu?.powerCapW ?? null)}`} />
          </div>
          <Meter
            label="power"
            formattedValue={`${formatWatts(gpu?.powerW ?? null)} / ${formatWatts(gpu?.powerCapW ?? null)}`}
            used={gpu?.powerW ?? null}
            total={gpu?.powerCapW ?? null}
            severity={null}
          />
          <Meter
            label="VRAM"
            // §6.3's own VRAM percentage — the same figure the severity bands on
            // (`usedPercent`, `lib/severity.ts`), printed here because the mock does and it
            // costs no height (it lives in the meter's own label line): never a second,
            // independently-computed division.
            formattedValue={`${formatMiBPair(gpu?.memUsedMiB ?? null, gpu?.memTotalMiB ?? null)} · ${formatPercent(
              usedPercent(gpu?.memUsedMiB ?? null, gpu?.memTotalMiB ?? null),
            )}`}
            used={gpu?.memUsedMiB ?? null}
            total={gpu?.memTotalMiB ?? null}
            severity={severityVram(gpu?.memUsedMiB ?? null, gpu?.memTotalMiB ?? null)}
            tickPercent={90}
          />
          <Strip
            items={[
              { k: 'util', v: formatPercent(gpu?.utilPct ?? null) },
              { k: 'SM clk', v: formatMHz(gpu?.smClockMHz ?? null) },
              { k: `served by instance ${index}`, v: formatText(instance?.model ?? null) },
            ]}
          />
          {decode !== null && decode.notable ? (
            <Caption label="throttle">
              {/* ⚠ 10f/Q3, owner's ruling 2026-09-09 (§6.2): the routine `0x4 sw power cap` is
                  listed beside a notable bit as a NEUTRAL, UNBANDED code chip — no colour, no
                  glyph — and only the notable bits carry their severity band. It used to paint
                  a green `✓ NORMAL` pill: not a warning, which §6.2 forbids, but a VERDICT
                  asserting the routine 250 W cap is healthy (10e-A11). `lib/throttle.ts`'s
                  severities are untouched — this is presentation, and `r.severity` is still
                  what decides which chips are banded. */}
              {decode.reasons.map((r) => (
                <Chip
                  key={r.label}
                  severity={r.severity}
                  size="md"
                  code
                  band={r.severity !== 'normal'}
                  label={r.label}
                />
              ))}
            </Caption>
          ) : null}
          {/* §6.5's "is available" half on the NON-takeover branch too. `nvidia-smi` is this
              panel's only source and it blanks every figure at once, so it renders once under
              them; before this, an enumerated card whose readings all failed showed four em
              dashes with the message reachable only when `gpus` was null entirely
              (10b-reconcile, adversarial F5). */}
          <PanelNotes subject={`GPU ${index}`} messages={snapshot === null ? [] : errorsForPanel(snapshot, 'gpu')} />
        </>
      )}
    </PanelShell>
  );
}
