/**
 * §6.1's grid — the authoritative ASCII layout, as nine named slots over a CSS grid.
 *
 * A pure layout shell: it takes nine already-built panels — the real ones, since 10c1 wired
 * them into `app/dashboard-shell.tsx` in place of `PanelPlaceholder` — and places each one by
 * NAME, not by array position. §6.1's layout is unusual enough (COOLING spans two rows; two 2-wide GPU
 * cards sit above a differently-shaped bottom row) that a positional `children[]` API would
 * make every call site re-derive the mapping this component exists to fix in one place.
 *
 * ⚠ **Sizing (2.5e/L9) is handed down from here, not decided by a panel.** `CHART_SIZE`
 * below is this decision, made once: the grid's own row heights are what a chart has to fit
 * inside, so the grid is what gets to say how big one may be. A panel (10b) that wants a
 * bigger or smaller chart than the default asks for a new named export here rather than
 * picking a number itself — same reasoning L9 already established for the sparkline.
 *
 * ⚠ CSS grid placement is not observable in jsdom (`grid-template-areas`, `grid-area`, a
 * media query breakpoint) — `grid.module.css` is asserted against §6.1's ASCII by authorship
 * and, ideally, by opening a real browser at each of the four breakpoints; this file's test
 * only proves each slot's content lands under the right CSS class, never that the class
 * paints where §6.1 says it should.
 */

import type { ReactNode } from 'react';

import styles from './grid.module.css';
import './tokens.css';

/**
 * The pixel box a chart primitive asks for at each of the two widths §6.1 names (the
 * 1280–1599px design target, and the ≥1600px "promoted" form). **The canonical answer to L9
 * stands**: a chart or sparkline primitive never picks its own size — it takes one as a prop,
 * and the value comes from exactly one of the named exports below, so a future panel asking
 * "how big should my chart be" has one place to look rather than a literal to invent or copy.
 *
 * ⚠ **The ≥1600px "sparklines promoted to full line charts" rule is a SIZE, not a component
 * change (10e).** Earlier drafts of this file used a different primitive at ≥1600px
 * (`StackedTimeSeriesChart`); 10e replaces that with the SAME `Sparkline` primitive at a
 * bigger size, carrying `refs`/`timeLabels` (§3.2) — so the "promoted" entries below are
 * `Sparkline` boxes, not a second chart component's. The mechanism is unchanged: both sizes
 * render in the DOM and a `min-width: 1600px` media query in the panel's own stylesheet shows
 * one and hides the other, so no viewport-tracking state crosses the hook boundary.
 */
/**
 * ⚠ **10e — every entry below is REPLACED, not tuned.** `10e-match-the-mock.md` §3.2 measured
 * the mock's own chart boxes in real headless Chrome and none of the built sizes survive: the
 * plain `sparkline` entry (220×44) and `gpuPromoted` (480×140/160 painted) are gone, replaced
 * by four entries carrying the mock's own measured boxes at the design width (1280) and the
 * ≥1600px promoted width, for both GPU and CPU. `cooling` is unchanged in shape (still
 * `plotHeight` PER PLOT, still 480 wide) but its plot height moves to 72 — the mock's own
 * `padTop 6 + hTemp 84 + gap 10 + hFan 46 + axis 14 = 160` painted total, plus the 14.8px HTML
 * legend line already inside the chart's own SVG legend, giving **174px** total (§2.2).
 *
 * **Widths are fixed at the 1280 design width and leave slack at 1600/1920** (10e §3.2): a
 * `viewBox` + `width:100%` would scale height with width and break every budget in §2, and
 * `components/` cannot measure its own container (no `ResizeObserver`, no state —
 * `purity.test.ts` forbids the hook that would need). One constant per chart, sized for the
 * design target, is what this file has always done; the four entries below are simply the
 * mock's own measured numbers instead of the pre-10e placeholders.
 */
export const CHART_SIZE = {
  /** GPU card, 1280–1599px — fills the hero row beside the 34px figure and the power block
   *  (10e §3.2: 601 − 59 − 67 − 28 = 447 available; 440 leaves a small margin). */
  gpuSparkline: { width: 440, height: 38 },
  /** GPU card, ≥1600px — §6.1's "promoted" form: the SAME `Sparkline` primitive, 50px tall,
   *  with the time axis and §6.3's two reference lines (607px available at 1600). */
  gpuPromoted: { width: 600, height: 50 },
  /** CPU's two traces (temperature AND utilisation, OQ-7), 1280–1599px — a 307px column has
   *  285px of content. */
  cpuSparkline: { width: 280, height: 38 },
  /** CPU's two traces, ≥1600px (365px available). */
  cpuPromoted: { width: 360, height: 50 },
  /** COOLING, PER PLOT. Two plots paint 2 × 72 + 10 (gap) + 20 (axis) = 174px total (the
   *  mock's 160 + its 14.8px legend line, drawn inside the chart's own SVG legend). */
  cooling: { width: 480, plotHeight: 72 },
} as const;

export interface GridProps {
  readonly gpu0: ReactNode;
  readonly gpu1: ReactNode;
  readonly cpu: ReactNode;
  readonly memory: ReactNode;
  readonly cooling: ReactNode;
  readonly safety: ReactNode;
  readonly storageAndNetwork: ReactNode;
  readonly serving: ReactNode;
  readonly sessionEventLog: ReactNode;
}

export function Grid({
  gpu0,
  gpu1,
  cpu,
  memory,
  cooling,
  safety,
  storageAndNetwork,
  serving,
  sessionEventLog,
}: GridProps) {
  return (
    <div className={styles.grid}>
      <div className={styles.gpu0} data-slot="gpu0">
        {gpu0}
      </div>
      <div className={styles.gpu1} data-slot="gpu1">
        {gpu1}
      </div>
      <div className={styles.cooling} data-slot="cooling">
        {cooling}
      </div>
      <div className={styles.cpu} data-slot="cpu">
        {cpu}
      </div>
      <div className={styles.memory} data-slot="memory">
        {memory}
      </div>
      <div className={styles.safety} data-slot="safety">
        {safety}
      </div>
      <div className={styles.storage} data-slot="storage-and-network">
        {storageAndNetwork}
      </div>
      <div className={styles.serving} data-slot="serving">
        {serving}
      </div>
      <div className={styles.log} data-slot="session-event-log">
        {sessionEventLog}
      </div>
    </div>
  );
}
