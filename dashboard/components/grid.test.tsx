import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { Grid } from './grid';
import styles from './grid.module.css';

/**
 * §6.1's grid, guarded in **three tiers, each named as exactly the claim it makes** — the
 * shape 10a's reconciliation settled after the adversarial phase showed the first tier alone
 * was the only one that existed (F1/F2/F3):
 *
 * 1. **The content lands in the right slot** (`data-slot`). A test-only marker attribute; no
 *    stylesheet reads it. It catches a copy-paste join bug and nothing else.
 * 2. **The slot carries the class the stylesheet keys on** (`className={styles.X}`). This is
 *    what actually binds a cell to a `grid-area`, and before this file asserted it, changing
 *    one line to `className={styles.log} data-slot="cooling"` painted COOLING in the log's
 *    cell with **19/19 green and `tsc` clean**. CSS modules give each key a distinct generated
 *    identifier, so this is a true statement about the DOM — *"the node holding COOLING's
 *    content carries the class `.cooling`"* — and it is **not** a claim that COOLING spans
 *    rows 2–3.
 * 3. **The stylesheet declares §6.1's area map and breakpoints** — a *source-text* test over
 *    `grid.module.css`, named as one. It catches a dropped `cooling` row, a reordered <900px
 *    priority list, a breakpoint typo (`950px` for `900px`), and a class renamed out from
 *    under `grid.tsx`. It does **not** prove a browser paints any of it.
 *
 * ⚠ **What no tier proves, and no test in jsdom can.** There is no layout engine here, no
 * injected stylesheet and no `matchMedia` (re-derived three ways by 10a's test phase), so
 * "COOLING spans rows 2–3 at 1280px" is only ever established by measuring a real browser.
 * That was done once by hand (`10a-test.md` §1.2) and is recorded as owed to **10c** as a
 * repeatable step (adversarial F4). Nothing here is a substitute for it.
 */

const CSS = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'grid.module.css'), 'utf8');

const SLOTS = {
  gpu0: 'GPU-0-MARKER',
  gpu1: 'GPU-1-MARKER',
  cpu: 'CPU-MARKER',
  memory: 'MEMORY-MARKER',
  cooling: 'COOLING-MARKER',
  safety: 'SAFETY-MARKER',
  storageAndNetwork: 'STORAGE-MARKER',
  serving: 'SERVING-MARKER',
  sessionEventLog: 'LOG-MARKER',
} as const;

const render = () =>
  renderToStaticMarkup(
    <Grid
      gpu0={SLOTS.gpu0}
      gpu1={SLOTS.gpu1}
      cpu={SLOTS.cpu}
      memory={SLOTS.memory}
      cooling={SLOTS.cooling}
      safety={SLOTS.safety}
      storageAndNetwork={SLOTS.storageAndNetwork}
      serving={SLOTS.serving}
      sessionEventLog={SLOTS.sessionEventLog}
    />,
  );

describe('all nine panels render, each exactly once', () => {
  test.each(Object.values(SLOTS))('⚠ the panel marker %s appears somewhere in the rendered grid', (marker) => {
    expect(render()).toContain(marker);
  });

  test('⚠ no marker is duplicated — each slot renders its content exactly once', () => {
    const html = render();
    for (const marker of Object.values(SLOTS)) {
      expect(html.split(marker).length - 1).toBe(1);
    }
  });
});

describe('⚠ each slot wraps its OWN content under its own marker attribute', () => {
  test.each([
    ['gpu0', SLOTS.gpu0],
    ['gpu1', SLOTS.gpu1],
    ['cpu', SLOTS.cpu],
    ['memory', SLOTS.memory],
    ['cooling', SLOTS.cooling],
    ['safety', SLOTS.safety],
    ['storage-and-network', SLOTS.storageAndNetwork],
    ['serving', SLOTS.serving],
    ['session-event-log', SLOTS.sessionEventLog],
  ] as const)('data-slot="%s" wraps its own marker, not another slot’s', (slot, marker) => {
    const html = render();
    const re = new RegExp(`data-slot="${slot}"[^>]*>${marker}<`);
    expect(html).toMatch(re);
  });
});

/**
 * ⚠ Tier 2 (F1/F3). The describe above used to be named *"each slot carries the data-slot the
 * layout CSS keys on"* — and the layout CSS keys on **no attribute at all**: every placement
 * rule in `grid.module.css` is `.cooling { grid-area: cooling }`. The name asserted a
 * relationship that does not exist, and the bug that relationship would have excluded is
 * exactly the one that shipped green. These tests make the missing claim directly.
 */
describe('⚠ each slot carries the CSS-module class the stylesheet binds to a grid-area', () => {
  test.each([
    ['gpu0', 'gpu0', SLOTS.gpu0],
    ['gpu1', 'gpu1', SLOTS.gpu1],
    ['cpu', 'cpu', SLOTS.cpu],
    ['memory', 'memory', SLOTS.memory],
    ['cooling', 'cooling', SLOTS.cooling],
    ['safety', 'safety', SLOTS.safety],
    ['storage-and-network', 'storage', SLOTS.storageAndNetwork],
    ['serving', 'serving', SLOTS.serving],
    ['session-event-log', 'log', SLOTS.sessionEventLog],
  ] as const)(
    '⚠ the element holding %s’s content carries styles.%s, not another slot’s class',
    (slot, cssKey, marker) => {
      const html = render();
      const expected = (styles as Record<string, string>)[cssKey];
      // Distinct keys resolve to distinct generated identifiers, so this fails if the element
      // is given ANY other slot's class — which is the mutation `data-slot` cannot see.
      expect(html).toContain(`class="${expected}" data-slot="${slot}">${marker}<`);
    },
  );

  // Deliberately UNMARKED. This is a vacuity check on the TECHNIQUE above, not a property of
  // any source file — no mutation of `grid.tsx` or `grid.module.css` can redden it, because it
  // reads only the CSS-module namespace itself. `purity.test.ts`'s own "the guard is not
  // vacuous" checks are unmarked for the same reason, and the red-test ledger correctly
  // expects no mutation to cover it.
  test('the nine slot classes are nine distinct identifiers, so tier 2 is not vacuous', () => {
    const keys = ['gpu0', 'gpu1', 'cpu', 'memory', 'cooling', 'safety', 'storage', 'serving', 'log'];
    const values = keys.map((k) => (styles as Record<string, string>)[k]);
    expect(new Set(values).size).toBe(keys.length);
  });
});

/**
 * ⚠ Tier 3 (F2) — **a source-text test, and named as one.** `grid.module.css` had no coverage
 * of any kind: `styles.test.ts` checks one unrelated rule, jsdom injects no stylesheet, and
 * the harness had no CSS mutation. Every assertion below is *"the stylesheet declares X"*,
 * never *"a browser paints X"*.
 */
describe('⚠ grid.module.css declares §6.1’s area map — the stylesheet’s text, not its paint', () => {
  /** The `grid-template-areas` values, in file order: base (<900), ≥900, ≥1280. */
  const areaMaps = (): string[][] =>
    [...CSS.matchAll(/grid-template-areas:([^;]*);/g)].map((m) =>
      [...(m[1] ?? '').matchAll(/'([^']*)'/g)].map((r) => (r[1] ?? '').trim().replace(/\s+/g, ' ')),
    );

  test('⚠ exactly three configurations — ≥1600 and 1280–1599 share one, deliberately', () => {
    expect(areaMaps()).toHaveLength(3);
  });

  test('⚠ <900px is §6.1’s priority order: GPUs → cooling → safety → serving → host → storage', () => {
    // One column, nine rows. SESSION EVENT LOG last is 10a's own recorded decision (§6.1
    // names six stops for nine panels); everything before it is the spec's order verbatim.
    expect(areaMaps()[0]).toEqual([
      'gpu0', 'gpu1', 'cooling', 'safety', 'serving', 'cpu', 'memory', 'storage', 'log',
    ]);
  });

  test('⚠ 900–1279px is the recorded two-column decision', () => {
    expect(areaMaps()[1]).toEqual([
      'gpu0 gpu1', 'cooling cooling', 'cpu memory', 'safety storage', 'serving serving', 'log log',
    ]);
  });

  test('⚠ ≥1280px is §6.1’s ASCII verbatim — COOLING spans rows 2–3 in columns 1–2', () => {
    // The settled correction, and the one that was wrong in earlier drafts. Deleting either
    // `cooling` row here is the edit F2 named that nothing could see.
    expect(areaMaps()[2]).toEqual([
      'gpu0 gpu0 gpu1 gpu1',
      'cooling cooling cpu memory',
      'cooling cooling safety storage',
      'serving serving log log',
    ]);
  });

  test('⚠ the two breakpoints are exactly 900px and 1280px, not near them', () => {
    expect([...CSS.matchAll(/@media \(min-width: (\d+)px\)/g)].map((m) => m[1])).toEqual([
      '900',
      '1280',
    ]);
  });

  test('⚠ every class grid.tsx binds declares the grid-area of the same name', () => {
    // Closes F2's last row: a class renamed in the CSS alone degrades to a `styles.X` the
    // module proxy still resolves, so tier 2 cannot see it — the element simply falls out of
    // the area map with no error anywhere.
    for (const name of ['gpu0', 'gpu1', 'cpu', 'memory', 'cooling', 'safety', 'storage', 'serving', 'log']) {
      expect(CSS).toMatch(new RegExp(`\\.${name}\\s*\\{\\s*grid-area:\\s*${name};`));
    }
  });
});
