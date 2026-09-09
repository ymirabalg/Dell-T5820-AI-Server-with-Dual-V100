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
 * The default pixel box a chart primitive should ask for at the design breakpoint
 * (1280–1599px). §6.1 gives COOLING two rows for its shared-time chart, so it gets a taller
 * box than the sparkline living in a one-row card; the sparkline default matches
 * `Sparkline`'s own optional default closely enough that a panel may simply omit `width`/
 * `height` there; COOLING's stacked chart should pass this explicitly since 210px is well
 * short of that primitive's own default `plotHeight` for two stacked plots.
 *
 * ⚠ **The ≥1600px "sparklines promoted to full line charts" rule is deliberately NOT a size
 * here.** §6.1 changes which CHART COMPONENT a GPU card uses at that width, not merely its
 * size — a decision this file leaves to 10b's panel body. The recommended mechanism (recorded
 * for 10b, not mandated): render both the sparkline and the promoted chart and let a
 * `min-width: 1600px` media query in the panel's own stylesheet show one and hide the other,
 * so no viewport-tracking state has to be invented on either side of the hook boundary.
 *
 * ### ⚠ L9, closed by 10c-3 — `gpuPromoted` replaces a literal that had drifted out of this file
 *
 * 10b built the ≥1600px promotion (see `gpu-panel.tsx`'s module doc) and gave it a defensible
 * default — 480×140 — but wrote it as bare literals at the call site instead of a named export
 * here, so the ONE place sizing is supposed to live had a silent second copy of a size
 * decision the moment that code was written. This entry is that default, moved to where every
 * other chart size already lives, with nothing about the number changed: 480px wide (matching
 * `cooling.width`, so a promoted GPU card and COOLING's own chart do not disagree about how
 * wide a "big" chart is on this page) and 140px per plot (see the A7 correction on `CHART_SIZE`
 * itself: 140 vs COOLING's 210 is NOT explained by "COOLING stacks two plots", since both
 * numbers are per-plot). **The canonical answer to L9 is this file**: a
 * chart or sparkline primitive never picks its own size — it takes one as a prop, and the
 * value comes from exactly one of these three named exports, so a future panel asking "how big
 * should my chart be" has one place to look rather than a literal to invent or copy.
 */
/**
 * ⚠ **10c-3 reconciliation / A7 — `height` and `plotHeight` are NOT the same measurement, and
 * this object used to spell both `height`.** `Sparkline`'s `height` is the whole rendered
 * `<svg>`. `StackedTimeSeriesChart`'s `plotHeight` is **per plot**:
 * `plotsHeight = plots.length * plotHeight + (plots.length - 1) * PLOT_GAP`, plus
 * `AXIS_HEIGHT`. Measured, rendered:
 *
 * | entry | declared | actually painted |
 * |---|---|---|
 * | `sparkline` | 220 x 44 | 220 x **44** |
 * | `cooling` | 480 x 210 | 480 x **450** (two stacked plots + gap + axis) |
 * | `gpuPromoted` | 480 x 140 | 480 x **160** (one plot + axis) |
 *
 * L9's deliverable is *"the one place a future panel gets a chart's pixel box from"*, and a
 * panel asking this file how tall COOLING's chart is was told 210 for a 450px element — under
 * a key named `height`, beside an entry where `height` does mean height. The field is now named
 * for what it is, so the type checker refuses the confusion at every call site.
 *
 * ⚠ **And the reasoning recorded for `gpuPromoted` was derived from that misreading** — see
 * `10c3-build.md` §1's correction. *"140, shorter than COOLING's 210 because COOLING stacks two
 * plots and this is one"* is not a valid derivation: if 210 is per-plot, stacking two plots is a
 * reason for COOLING's TOTAL to be larger and says nothing about its per-plot box; taken at face
 * value that argument would give `gpuPromoted` the same **210**. The NUMBER is unchanged from
 * 10b and nothing regressed — what is corrected is the justification, which L9 explicitly asked
 * for ("say what computes it and where"). The honest statement is below.
 *
 * **What actually computes these numbers.** Nothing does: they are AUTHORED here, once, in the
 * module that owns layout, and every chart-bearing panel asks for one rather than inventing it.
 * A live, measured size would need `ResizeObserver` + `useState`, which `purity.test.ts` forbids
 * anywhere under `components/`. `gpuPromoted`'s real justification is empirical: 480 wide to
 * match `cooling` (so a "big" chart is one width on this page) and a 160px painted total, which
 * is what fits a GPU card's remaining height beside its headline row, toggle, meter and rows.
 */
export const CHART_SIZE = {
  /** Total `<svg>` height — `Sparkline` draws no axis. */
  sparkline: { width: 220, height: 44 },
  /** PER PLOT. COOLING stacks two, so it paints 450px in total. */
  cooling: { width: 480, plotHeight: 210 },
  /** PER PLOT. One plot, so it paints 160px in total (140 + the 20px axis). */
  gpuPromoted: { width: 480, plotHeight: 140 },
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
