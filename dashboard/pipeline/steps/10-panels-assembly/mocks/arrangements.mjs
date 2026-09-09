/**
 * 10d — the candidate arrangements, as CSS injected over the live app by
 * `measure-arrangements.mjs`. Selectors are written to OUT-SPECIFY `grid.module.css`
 * (`div:has(> [data-slot="gpu0"])` is (0,1,1) against `.grid`'s (0,1,0)) so no `!important`
 * is needed and the cascade is not fought. Slot selectors `[data-slot=…]` tie with the module's
 * `.gpu0` etc. at (0,1,0) and win on source order (the override `<style>` is appended last).
 *
 * Chart boxes: `CHART_SIZE` is a TypeScript constant and cannot be changed in-page, so a
 * different `plotHeight`/`width` is EMULATED by fixing the chart `<svg>`'s CSS box to what
 * that value would paint (`plots * plotHeight + (plots-1) * 10 + 20` tall). The BOX is exact —
 * that is all the grid measurement depends on; the interior is letterboxed in the mock. The
 * builder spec states the `CHART_SIZE` values, not this CSS.
 *
 * An arrangement may carry `dom`, a function body run in the page BEFORE measuring, for the
 * variants that move panels out of the grid (a strip in the sticky band, a disclosure below
 * it). The harness reloads the page after any arrangement that has one.
 */

const GRID = 'div:has(> [data-slot="gpu0"])';
const COOLING_SVG = '[data-slot="cooling"] svg[role="img"]';
const GPU_FULL_SVG = '[data-role="gpu-full-chart-wrap"] svg[role="img"]';
const SPARK_SVG = '[data-role="gpu-sparkline-wrap"] svg[role="img"], [data-slot="cpu"] svg[role="img"]';

/** Paint box for `StackedTimeSeriesChart` given plots and plotHeight. */
const stacked = (plots, plotHeight) => plots * plotHeight + (plots - 1) * 10 + 20;

const hideServingAndLog = `
  [data-slot="serving"], [data-slot="session-event-log"] { display: none; }
`;

/**
 * Arrangement B's grid — the shape every B-variant shares.
 *
 *   ≥1600      | GPU 0 | COOLING | CPU    | MEMORY  |
 *              | GPU 1 | COOLING | SAFETY | STORAGE |
 *   1280–1599  same areas; GPU column may be narrow (sparkline, 220px) so the tracks differ.
 */
const B_GRID = `
  @media (min-width: 1280px) {
    ${GRID} {
      grid-template-columns: minmax(252px, 1fr) minmax(432px, 1.5fr) 1fr 1fr;
      grid-template-rows: auto auto;
      grid-template-areas:
        'gpu0 cooling cpu memory'
        'gpu1 cooling safety storage';
    }
  }
  @media (min-width: 1600px) {
    ${GRID} {
      grid-template-columns: minmax(432px, 1.5fr) minmax(432px, 1.5fr) 1fr 1fr;
    }
  }
`;

/** CHART_SIZE for B: big charts 400 wide; COOLING keeps plotHeight 210; GPU promoted 100. */
const B_CHARTS = `
  ${COOLING_SVG} { width: 400px; height: ${stacked(2, 210)}px; }
  ${GPU_FULL_SVG} { width: 400px; height: ${stacked(1, 100)}px; }
`;

/** B's tracks with a wider GPU column at 1280–1599, paid for by a 200px sparkline. */
const B_GRID_W = `
  @media (min-width: 1280px) {
    ${GRID} {
      grid-template-columns: minmax(300px, 1fr) minmax(432px, 1.5fr) 1fr 1fr;
      grid-template-rows: auto auto;
      grid-template-areas:
        'gpu0 cooling cpu memory'
        'gpu1 cooling safety storage';
    }
  }
  @media (min-width: 1600px) {
    ${GRID} {
      grid-template-columns: minmax(432px, 1.5fr) minmax(432px, 1.5fr) 1fr 1fr;
    }
  }
  ${SPARK_SVG} { width: 200px; }
`;

/** The log's cap for a wall-visible log: ~6 entries, plus the containing-block fix (see doc §F1). */
const LOG_CAP = `
  [data-slot="session-event-log"] [role="group"] { max-height: 110px; position: relative; }
`;
const FILL_LOG = `
  const ul = document.querySelector('[data-slot="session-event-log"] ul');
  const li = ul && ul.querySelector('li');
  if (li) for (let i = 0; i < 200; i++) ul.appendChild(li.cloneNode(true));
`;

/** The disclosure exactly as the builder spec states it (§5 of the report). */
const DISCLOSURE_CSS = `
  #tend-details { margin: 0 0.75rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #898781; }
  #tend-details > summary { cursor: pointer; padding: 0.25em 0; font-size: 0.85em; }
  #tend-details > div { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; padding: 0.75rem 0; }
  #tend-details [data-slot] { display: flex; min-width: 0; }
  #tend-details [data-slot] > * { flex: 1 1 auto; min-width: 0; }
  #tend-details [data-slot="session-event-log"] [role="group"] { position: relative; }
`;
const DISCLOSURE_DOM = (open) => `
  const grid = document.querySelector('[data-slot="gpu0"]').parentElement;
  const details = document.createElement('details');
  details.id = 'tend-details';
  const summary = document.createElement('summary');
  summary.textContent = 'serving · session event log';
  const wrap = document.createElement('div');
  wrap.appendChild(document.querySelector('[data-slot="serving"]'));
  wrap.appendChild(document.querySelector('[data-slot="session-event-log"]'));
  details.appendChild(summary); details.appendChild(wrap);
  grid.insertAdjacentElement('afterend', details);
  const ul = document.querySelector('[data-slot="session-event-log"] ul');
  const li = ul && ul.querySelector('li');
  if (li) for (let i = 0; i < 200; i++) ul.appendChild(li.cloneNode(true));
  details.open = ${open};
`;

/** Force every chart table view to its `--table-scroll-max` cap — a 600-sample ring's table. */
const FULL_TABLES = `
  [data-slot]:not([data-slot="session-event-log"]) div[tabindex="0"] { min-height: var(--table-scroll-max); }
`;

/** D as the builder spec's stage 2 states it: bounded grid, positioned panels, disclosure below. */
const D_CSS = `
  @media (min-width: 1280px) {
    body { display: flex; flex-direction: column; height: 100vh; margin: 0; }
    ${GRID} { flex: 1 1 0; min-height: 0; grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); }
    ${GRID} > [data-slot] > section { overflow-y: auto; position: relative; }
    #tend-details { flex: 0 0 auto; }
  }
`;

export const ARRANGEMENTS = {
  /** Stage 2 of the recommendation: B-final bounded to the viewport. */
  'D-final': {
    title: 'D-final — B-final bounded to the viewport (stage 2)',
    css: `${B_GRID_W}${D_CSS}${B_CHARTS}${DISCLOSURE_CSS}`,
    dom: DISCLOSURE_DOM(false),
  },
  'D-final-tables': {
    title: 'D-final-tables — stage 2 with every table at its cap',
    css: `${B_GRID_W}${D_CSS}${B_CHARTS}${DISCLOSURE_CSS}${FULL_TABLES}`,
    dom: DISCLOSURE_DOM(false),
  },

  /** The recommendation with every chart toggled to a FULL table (worst case, laptop viewer). */
  'B-final-tables': {
    title: 'B-final-tables — the recommendation, tables forced to their 40vh cap',
    css: `${B_GRID_W}${B_CHARTS}${DISCLOSURE_CSS}${FULL_TABLES}`,
    dom: DISCLOSURE_DOM(false),
  },
  /** D (bounded) with full tables — does the page still not scroll? `position: relative` on the
   *  panel is F1's fix generalised: the sparkline table's `.sr-only` caption otherwise escapes. */
  'D-tables': {
    title: 'D-tables — bounded grid, panels position:relative, tables forced to their 40vh cap',
    css: `
      @media (min-width: 1280px) {
        body { display: flex; flex-direction: column; height: 100vh; margin: 0; }
        ${GRID} { flex: 1 1 0; min-height: 0; }
        ${GRID} > [data-slot] > section { overflow-y: auto; position: relative; }
      }
      ${B_GRID_W}
      @media (min-width: 1280px) {
        ${GRID} { grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); }
      }
      ${B_CHARTS}
      ${hideServingAndLog}
      ${FULL_TABLES}
    `,
  },

  /** THE RECOMMENDATION: B-w's grid and charts, SERVING + LOG in a closed disclosure below. */
  'B-final': {
    title: 'B-final — B-w grid + CHART_SIZE, SERVING and LOG in a closed <details> below the grid',
    css: `${B_GRID_W}${B_CHARTS}${DISCLOSURE_CSS}`,
    dom: DISCLOSURE_DOM(false),
  },
  /** The same, with the disclosure OPEN — the laptop viewer's state. */
  'B-final-open': {
    title: 'B-final-open — the recommendation with the disclosure open (200 log entries)',
    css: `${B_GRID_W}${B_CHARTS}${DISCLOSURE_CSS}`,
    dom: DISCLOSURE_DOM(true),
  },

  /** B with the 1280–1599 width fix. */
  'B-w': {
    title: 'B-w — B with GPU column >=300px at 1280–1599 and a 200px sparkline',
    css: `
      ${B_GRID_W}
      ${B_CHARTS}
      ${hideServingAndLog}
    `,
  },

  /**
   * C2 — B's grid with a THIRD right-hand row: GPU 1 spans rows 2–3, SERVING and the LOG sit
   * under SAFETY/STORAGE in the slack the right block already has. Log capped at 110px.
   */
  C2: {
    title: 'C2 — B plus SERVING and LOG in a third right-hand row (GPU 1 spans rows 2–3, log capped 110px)',
    css: `
      @media (min-width: 1280px) {
        ${GRID} {
          grid-template-columns: minmax(252px, 1fr) minmax(432px, 1.5fr) 1fr 1fr;
          grid-template-rows: auto auto auto;
          grid-template-areas:
            'gpu0 cooling cpu memory'
            'gpu1 cooling safety storage'
            'gpu1 cooling serving log';
        }
      }
      @media (min-width: 1600px) {
        ${GRID} {
          grid-template-columns: minmax(432px, 1.5fr) minmax(432px, 1.5fr) 1fr 1fr;
        }
      }
      ${B_CHARTS}
      ${LOG_CAP}
    `,
    dom: FILL_LOG,
  },

  /** C2 with the 1280–1599 width fix. */
  'C2-w': {
    title: 'C2-w — C2 with GPU column >=300px at 1280–1599 and a 200px sparkline',
    css: `
      ${B_GRID_W}
      @media (min-width: 1280px) {
        ${GRID} {
          grid-template-rows: auto auto auto;
          grid-template-areas:
            'gpu0 cooling cpu memory'
            'gpu1 cooling safety storage'
            'gpu1 cooling serving log';
        }
      }
      ${B_CHARTS}
      ${LOG_CAP}
    `,
    dom: FILL_LOG,
  },

  /** §6.1 exactly as `grid.module.css` ships it — the control. */
  baseline: {
    title: 'baseline — §6.1 as built (control)',
    css: '',
  },

  /** §6.1 with only row 4 removed — the owner's ruling alone, to show it is not enough. */
  'row4-off': {
    title: '§6.1 minus SERVING and LOG only (the ruling alone)',
    css: `
      @media (min-width: 1280px) {
        ${GRID} {
          grid-template-areas:
            'gpu0 gpu0 gpu1 gpu1'
            'cooling cooling cpu memory'
            'cooling cooling safety storage';
        }
      }
      ${hideServingAndLog}
    `,
  },

  /**
   * A — §6.1's SHAPE, compressed until it fits: same areas as `row4-off`, every chart cut.
   * COOLING plotHeight 210 → 100 (450 → 230 painted), GPU promoted 140 → 100, sparklines
   * 44 → 32. This is the "keep the picture, shrink the charts" arrangement.
   */
  A: {
    title: 'A — §6.1 shape compressed: cooling ph 100, gpu ph 100, sparkline 32',
    css: `
      @media (min-width: 1280px) {
        ${GRID} {
          grid-template-areas:
            'gpu0 gpu0 gpu1 gpu1'
            'cooling cooling cpu memory'
            'cooling cooling safety storage';
        }
      }
      ${hideServingAndLog}
      ${COOLING_SVG} { height: ${stacked(2, 100)}px; }
      ${GPU_FULL_SVG} { height: ${stacked(1, 100)}px; }
      ${SPARK_SVG} { height: 32px; }
    `,
  },

  /** B0 — the COOLING-column grid with CHART_SIZE untouched, to price the chart change in B. */
  B0: {
    title: 'B0 — COOLING column, CHART_SIZE unchanged (480 wide, gpu ph 140)',
    css: `
      ${B_GRID}
      @media (min-width: 1280px) {
        ${GRID} { grid-template-columns: minmax(252px, 1fr) minmax(512px, 1.5fr) 1fr 1fr; }
      }
      @media (min-width: 1600px) {
        ${GRID} { grid-template-columns: minmax(512px, 1.5fr) minmax(512px, 1.5fr) 1fr 1fr; }
      }
      ${hideServingAndLog}
    `,
  },

  /** B — the recommendation candidate. */
  B: {
    title: 'B — COOLING column; big charts 400 wide; cooling ph 210 kept; gpu promoted ph 100',
    css: `
      ${B_GRID}
      ${B_CHARTS}
      ${hideServingAndLog}
    `,
  },

  /**
   * C — B, but SERVING and the LOG stay on the wall as a third row of the right-hand block,
   * on a six-row grid (each GPU card spans three rows, COOLING all six). The log is capped to
   * ~6 lines (110px) so it cannot grow the row; `dom` fills it with 200 cloned entries to
   * prove the cap holds. Measures whether the ruling's premise ("they do not fit") is true.
   */
  C: {
    title: 'C — B plus SERVING and LOG kept in a third right-hand row (six-row grid, log capped 110px)',
    css: `
      @media (min-width: 1280px) {
        ${GRID} {
          grid-template-columns: minmax(252px, 1fr) minmax(432px, 1.5fr) 1fr 1fr;
          grid-template-rows: auto auto auto auto auto auto;
          grid-template-areas:
            'gpu0 cooling cpu memory'
            'gpu0 cooling cpu memory'
            'gpu0 cooling safety storage'
            'gpu1 cooling safety storage'
            'gpu1 cooling serving log'
            'gpu1 cooling serving log';
        }
      }
      @media (min-width: 1600px) {
        ${GRID} {
          grid-template-columns: minmax(432px, 1.5fr) minmax(432px, 1.5fr) 1fr 1fr;
        }
      }
      ${B_CHARTS}
      [data-slot="session-event-log"] [role="group"] { max-height: 110px; position: relative; }
    `,
    dom: `
      const ul = document.querySelector('[data-slot="session-event-log"] ul');
      const li = ul && ul.querySelector('li');
      if (li) for (let i = 0; i < 200; i++) ul.appendChild(li.cloneNode(true));
    `,
  },

  /**
   * B-strip — B, with SERVING's two instance rows moved into a compact one-line strip inside
   * the sticky band (genuine rows, tightened), so the per-instance state stays on the wall at
   * the price of band height. LOG hidden.
   */
  'B-strip': {
    title: 'B-strip — B plus a compact SERVING strip in the sticky band',
    css: `
      ${B_GRID}
      ${B_CHARTS}
      [data-slot="serving"], [data-slot="session-event-log"] { display: none; }
      #tend-strip {
        display: flex; flex-wrap: wrap; gap: 0 1.5em; align-items: baseline;
        padding: 0.25em 1em; font: 0.85em ui-monospace, SFMono-Regular, Menlo, monospace;
        background: #1a1a19; border-bottom: 1px solid rgba(255,255,255,.1); color: #c3c2b7;
      }
      #tend-strip > div { display: flex; gap: 0.5em; align-items: baseline; padding: 0; }
      #tend-strip > div > span:first-child { display: none; }
    `,
    dom: `
      const band = [...document.body.children].find((el) => getComputedStyle(el).position === 'sticky');
      const strip = document.createElement('div');
      strip.id = 'tend-strip';
      const rows = document.querySelectorAll('[data-slot="serving"] section > div:last-child > div');
      const lead = document.createElement('span'); lead.textContent = 'serving'; lead.style.color = '#898781';
      strip.appendChild(lead);
      for (const r of rows) strip.appendChild(r.cloneNode(true));
      band.appendChild(strip);
    `,
  },

  /**
   * B-disclosure — B, with SERVING and LOG moved into a closed <details> BELOW the grid, on
   * the same page (so the wall's own event history is reachable there and nowhere else —
   * decision 4 makes a second route's log empty). Measures the closed summary's cost.
   */
  'B-disclosure': {
    title: 'B-disclosure — B plus a closed <details> below the grid holding SERVING and LOG',
    css: `
      ${B_GRID}
      ${B_CHARTS}
      #tend-details { margin: 0 0.75rem 0.75rem; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; color: #898781; }
      #tend-details > summary { cursor: pointer; padding: 0.25em 0; font-size: 0.85em; }
      #tend-details > div { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; padding-top: 0.75rem; }
      #tend-details [data-slot] { display: flex; min-width: 0; }
      #tend-details [data-slot] > * { flex: 1 1 auto; min-width: 0; }
      #tend-details [data-slot="session-event-log"] [role="group"] { position: relative; }
    `,
    dom: `
      const grid = document.querySelector('[data-slot="gpu0"]').parentElement;
      const details = document.createElement('details');
      details.id = 'tend-details';
      const summary = document.createElement('summary');
      summary.textContent = 'serving · session event log';
      const wrap = document.createElement('div');
      wrap.appendChild(document.querySelector('[data-slot="serving"]'));
      wrap.appendChild(document.querySelector('[data-slot="session-event-log"]'));
      details.appendChild(summary); details.appendChild(wrap);
      grid.insertAdjacentElement('afterend', details);
      const ul = document.querySelector('[data-slot="session-event-log"] ul');
      const li = ul && ul.querySelector('li');
      if (li) for (let i = 0; i < 200; i++) ul.appendChild(li.cloneNode(true));
    `,
  },

  /**
   * D — B, bounded: the grid takes exactly the viewport remainder under the band (whatever the
   * band's height, banner or not) and its two rows split it. A panel then has a definite box,
   * which is what `tokens.css` says the table view's `40vh` stopgap has been waiting for; the
   * panel scrolls within its cell instead of growing the page. Measured for per-cell FIT.
   */
  D: {
    title: 'D — B, bounded to the viewport (rows 1fr 1fr; panels scroll within their cell)',
    css: `
      @media (min-width: 1280px) {
        body { display: flex; flex-direction: column; height: 100vh; margin: 0; }
        ${GRID} { flex: 1 1 0; min-height: 0; }
        ${GRID} > [data-slot] > section { overflow-y: auto; }
      }
      ${B_GRID}
      @media (min-width: 1280px) {
        ${GRID} { grid-template-rows: minmax(0, 1fr) minmax(0, 1fr); }
      }
      ${B_CHARTS}
      ${hideServingAndLog}
    `,
  },
};
