/**
 * §6.1's grid — the authoritative ASCII layout, as nine named slots over a CSS grid.
 *
 * A pure layout shell: it takes nine already-built panels (or, until 10b lands, nine
 * `PanelPlaceholder`s — see the step notes on that decision) and places each one by NAME, not
 * by array position. §6.1's layout is unusual enough (COOLING spans two rows; two 2-wide GPU
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
 */
export const CHART_SIZE = {
  sparkline: { width: 220, height: 44 },
  cooling: { width: 480, height: 210 },
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
