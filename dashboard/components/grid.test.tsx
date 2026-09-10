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
    // ⚠ 10h — re-aimed to read the WHOLE prelude, not the `min-width` prefix of it, because
    // this file now carries three `@media` rules and two of them start `(min-width: 1280px)`.
    // Strictly stronger: it pins §6.1's OTHER bound too — *"the promise holds at >=1280px wide
    // and >=1024px tall … a 1280x800 display does scroll"* — which is the condition the row
    // caps below must be behind and which the old `(\d+)` shape could not have seen.
    expect([...CSS.matchAll(/@media ([^{]+)\{/g)].map((m) => m[1]!.trim())).toEqual([
      '(min-width: 900px)',
      '(min-width: 1280px)',
      '(min-width: 1280px) and (min-height: 1024px)',
    ]);
  });

  /**
   * ⚠⚠ 10h — §6.1's 2026-09-10 ruling: *"every panel has a maximum height derived from its
   * grid row, and its body scrolls inside that height when the content exceeds it … the row
   * model still governs, so a max-height is per panel, computed from its row's share, not one
   * global number."*
   *
   * These are CSS-text assertions because the paint is not observable in jsdom (this file's
   * own module doc), and they are the one-line reverts nothing else in the suite could see:
   * deleting a `max-height` here un-bounds a whole row and every render test stays green.
   */
  describe('⚠ every slot is bounded by its own grid row', () => {
    /**
     * ⚠ 10h TEST — DECLARATIONS ONLY, and this is not tidiness. Read against the RAW file,
     * every assertion below passed with the rule it names wrapped in a CSS comment: putting
     * the `.serving, .log` cap between slash-star and star-slash left this file green at 121
     * tests, and SERVING is the panel that hides the most on the graded hostile page. That is
     * `10h-GR10`'s finding (`align-items: start` → `stretch` stayed green because the module
     * doc quotes the rule) one guard over — the same convention `styles.test.ts` has carried
     * since 10c-2, applied here to the caps as well as to the query they sit in.
     */
    const DECLARATIONS = CSS.replace(/\/\*[\s\S]*?\*\//g, ' ');
    /**
     * ⚠ 10h RECONCILE (`10h-A8`) — the caps query's OWN BODY, found by matching braces, and
     * everything outside it. This used to be `DECLARATIONS.slice(at)`: *everything from the
     * query to end of file*, which is satisfied by a cap that has fallen **out** of the query
     * and still sits below it. Measured: moving the media block's closing `}` up by one rule
     * (one character's worth of edit) made `.cooling { max-height: var(--row23-max) }`
     * unconditional — a 1280×800 display then computes a 385.4 px cap on COOLING and its body
     * hides 37 px — with `pnpm exec vitest run` at 101 files / 3056 tests / 0 failed. Its
     * companion assertion had the mirror hole: it asked only that no `max-height` appear
     * BEFORE the query.
     *
     * Brace matching, not a regex: a `@media` body contains nested rules, so `[^}]*` stops at
     * the first inner `}` and `slice(at)` never stops at all.
     */
    const capsQuery = (): { body: string; outside: string } => {
      const at = DECLARATIONS.indexOf('@media (min-width: 1280px) and (min-height: 1024px)');
      expect(at).toBeGreaterThan(-1);
      const open = DECLARATIONS.indexOf('{', at);
      expect(open).toBeGreaterThan(-1);
      let depth = 0;
      let close = -1;
      for (let i = open; i < DECLARATIONS.length; i += 1) {
        if (DECLARATIONS[i] === '{') depth += 1;
        else if (DECLARATIONS[i] === '}') {
          depth -= 1;
          if (depth === 0) {
            close = i;
            break;
          }
        }
      }
      expect(close).toBeGreaterThan(open);
      return {
        body: DECLARATIONS.slice(open + 1, close),
        outside: `${DECLARATIONS.slice(0, at)}\n${DECLARATIONS.slice(close + 1)}`,
      };
    };
    const capsBlock = (): string => capsQuery().body;

    test.each([
      ['gpu0', 'row1'],
      ['gpu1', 'row1'],
      ['cpu', 'row2'],
      ['memory', 'row2'],
      ['safety', 'row3'],
      ['storage', 'row3'],
      ['serving', 'row4'],
      ['log', 'row4'],
    ])('⚠ a grid slot takes its max-height from its own row share — %s / --%s-max', (slot, row) => {
      const block = capsBlock();
      const rule = new RegExp(`\\.${slot}[^{}]*\\{[^}]*max-height:\\s*var\\(--${row}-max\\)`);
      expect(block).toMatch(rule);
    });

    test('⚠ COOLING is bounded at rows 2 + gap + 3, the cell it actually spans', () => {
      // Its `align-self: stretch` is what makes the slot the two rows; without a bound of its
      // own a tall COOLING pushes rows 2-3 past their combined budget, since a spanning item's
      // contribution is distributed across the tracks it spans.
      expect(capsBlock()).toMatch(/\.cooling\s*\{[^}]*max-height:\s*var\(--row23-max\)/);
      // ⚠ Declarations, not the raw file: the module doc quotes this rule too.
      expect(DECLARATIONS).toMatch(/\.cooling\s*\{[^}]*align-self:\s*stretch/);
    });

    test('⚠ the caps are inside the >=1280 AND >=1024 query, never at every size', () => {
      // §6.1 conditions the promise on both bounds, so below either one the panels keep their
      // intrinsic heights and the page scrolls. A cap that leaked out of this query would
      // clip a 1280x800 display, where legibility is what the spec says wins.
      // ⚠ Declarations only — a rule quoted inside a comment must not trip a guard
      // (`styles.test.ts`'s own convention).
      // ⚠ 10h RECONCILE (`10h-A8`): OUTSIDE is now everything on BOTH sides of the query's own
      // braces, not just what precedes it. The old form asked "does a `max-height` appear
      // before the query", which a cap that has fallen out of the query — below it, at every
      // size — satisfies perfectly.
      const { body, outside } = capsQuery();
      expect(outside).not.toMatch(/max-height/);
      expect(body).toMatch(/max-height/);
    });

    /**
     * ⚠ A token's VALUE needs its own assertion (10g's lesson, paid for once already): every
     * rule above reads `var(--rowN-max)`, so all of them follow these definitions anywhere they
     * go. `--rows-available: 0px` — one line in one file — deletes §6.1's whole promise in the
     * other direction, collapsing all nine panels, with the entire suite green.
     */
    describe('⚠ the row shares themselves — the four numbers the caps are', () => {
      const TOKENS = readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), 'tokens.css'),
        'utf8',
      ).replace(/\/\*[\s\S]*?\*\//g, ' ');

      /**
       * ⚠⚠ 10h RECONCILE (`10h-A2`) — **the SOLE declaration of a custom property, and its
       * value.** Every assertion in this block used to be `toMatch(/--x:\s*value;/)`, which
       * asks *does this text appear somewhere in the file* — not *is this what the browser
       * computes*. In CSS the LAST declaration in a rule wins, so a duplicate five lines below
       * the pinned one satisfies every one of them. Measured: adding `--band-reserve: 43px;`
       * immediately after the pinned `102px` left `pnpm exec vitest run` at 101 files /
       * 3056 tests / 0 failed and put the hostile page **21 px over** the fold at 1600×1024,
       * with all four caps grown past their budget. Every token in this block had the same
       * exposure, not only the reserve.
       *
       * ⚠ This is deliberately strict: it refuses a SECOND declaration anywhere in the file,
       * including one inside a media query or an attribute selector. That is not an oversight
       * — the row arithmetic is a single constant subtracted from `100vh`, and a term that is
       * conditional on anything is a term this file's assertions cannot follow. A future loop
       * making `--band-reserve` conditional on the banner's presence (`10h-build.md` §6's
       * silence 6) has to change this guard on purpose, which is the whole point.
       */
      const soleDeclaration = (name: string): string => {
        const all = [...TOKENS.matchAll(new RegExp(`--${name}:\\s*([^;]*);`, 'g'))];
        expect(all).toHaveLength(1);
        return (all[0]?.[1] ?? '').trim();
      };

      test('⚠ the band, the padding and the gaps are the measured terms, not round guesses', () => {
        // 102 = the 43 px header plus §6.4's banner, which 10g made a FIXED 58.8 px at any
        // count (measured band 43 without a banner and 101.8 with one). The MAXIMUM is
        // reserved unconditionally because §6.1's promise is unconditional on the banner.
        expect(soleDeclaration('band-reserve')).toBe('102px');
        // `.grid`'s own `padding: 9px 12px 12px` and its three 9 px row gaps.
        expect(soleDeclaration('grid-pad-v')).toBe('21px');
        expect(soleDeclaration('grid-row-gaps')).toBe('27px');
        expect(soleDeclaration('rows-available')).toBe(
          'calc(100vh - var(--band-reserve) - var(--grid-pad-v) - var(--grid-row-gaps))',
        );
      });

      /**
       * ⚠ 10h TEST — the two terms above are COPIES of numbers that live in another file, and
       * nothing tied the copy to the original. `--grid-pad-v: 21px` is `.grid`'s own
       * `padding: 9px 12px 12px` and `--grid-row-gaps: 27px` is three of its `gap: 9px`, both
       * re-typed in `tokens.css`. Change `.grid { gap: 9px }` back to the `12px` it was before
       * 10e and the tokens go stale by 9 px: `--rows-available` over-states the room by exactly
       * that, the four shares still sum to 1, every assertion in this file still passes, and
       * §6.1's promise is quietly false at the viewport it is measured at.
       *
       * So this derives both from the stylesheet rather than restating them. §6.1's ≥1280px
       * layout is four rows, hence three row gaps — the same count `grid-template-areas`
       * declares above and the arithmetic in `tokens.css` names.
       */
      test('⚠ the padding and gap tokens are DERIVED from .grid’s own declarations, not re-typed', () => {
        // ⚠ 10h RECONCILE (`10h-A1`) — EVERY `.grid` block, not the first one `exec` returns.
        // This file declares `.grid` four times (the base rule and one inside each of the three
        // breakpoint queries), and the one that governs at §6.1's own design width is the LAST
        // of them. Measured: adding `gap: 12px;` to the `.grid` rule inside
        // `@media (min-width: 1280px)` left `pnpm exec vitest run` at 101 files / 3056 tests /
        // 0 failed and put the hostile page 5 px over the fold at 1600×1024, with `row-gap`
        // computing to 12px and three bodies clipping further. A `padding` declaration in that
        // block is equally invisible to a first-match read.
        //
        // The rule asserted is stronger than "the first block agrees": each of the two terms
        // must be declared EXACTLY ONCE across every `.grid` block, so a per-breakpoint
        // override cannot exist at all without this test being changed on purpose. In CSS the
        // last declaration wins, and a token in another file cannot track a value that is
        // conditional on a media query.
        const blocks = [...DECLARATIONS.matchAll(/\.grid\s*\{([^{}]*)\}/g)].map((m) => m[1] ?? '');
        // One base rule plus one per breakpoint query — if this file ever declares `.grid`
        // fewer times than §6.1 has layouts, the sweep below is reading the wrong thing.
        expect(blocks.length).toBeGreaterThanOrEqual(3);
        const paddings = blocks
          .map((b) => /(?:^|[^-\w])padding:\s*([\d.]+)px\s+[\d.]+px\s+([\d.]+)px/.exec(b))
          .filter((m) => m !== null);
        // ⚠ `row-gap` counts too: it overrides the row axis alone, which is the only axis
        // `--grid-row-gaps` is about, and a guard that only knew the shorthand would be
        // defeated by the more precise spelling.
        const gaps = blocks
          .map((b) => /(?:^|[^-\w])(?:row-)?gap:\s*([\d.]+)px/.exec(b))
          .filter((m) => m !== null);
        expect(paddings).toHaveLength(1);
        expect(gaps).toHaveLength(1);
        const padV = Number(paddings[0]?.[1]) + Number(paddings[0]?.[2]);
        const rowGaps = Number(gaps[0]?.[1]) * 3;
        expect(soleDeclaration('grid-pad-v')).toBe(`${padV}px`);
        expect(soleDeclaration('grid-row-gaps')).toBe(`${rowGaps}px`);
      });

      // ⚠ The four numbers, each `healthy + surplus x growth / 163` over `--rows-available`
      // (874.2 px at 1024 tall) — 199.8 / 263.9 / 242.3 / 168.1 px. `tokens.css` carries the
      // derivation; this pins the result, because a share is exactly the kind of constant that
      // gets "tidied" to a round number by someone who does not know it was computed.
      test.each([
        ['row1', '0.2286'],
        ['row2', '0.3019'],
        ['row3', '0.2772'],
        ['row4', '0.1923'],
      ])('⚠ the row-share token is the derived fraction of the height left — --%s-max is %s', (row, share) => {
        expect(soleDeclaration(`${row}-max`)).toBe(`calc(var(--rows-available) * ${share})`);
      });

      test('⚠ the four shares sum to exactly 1 — which is why the page fits by construction', () => {
        // ⚠ THE property, not a spot check of one number: band 102 + padding 21 + gaps 27 +
        // sum(rows) <= 100vh holds only if the shares total the whole of `--rows-available`.
        // Under it, a page whose rows all sit at their caps still ends exactly at the fold.
        const shares = ['row1', 'row2', 'row3', 'row4'].map((row) =>
          Number(/\* ([0-9.]+)\)$/.exec(soleDeclaration(`${row}-max`))?.[1]),
        );
        expect(shares).toHaveLength(4);
        expect(shares.every((s) => Number.isFinite(s))).toBe(true);
        expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
      });

      test('⚠ every share leaves the panel its HEALTHY measured height, with room over', () => {
        // ⚠ The acceptance that a bound must not shrink a panel that already fits
        // (`check-density.mjs` grades the same thing in a browser). Measured healthy heights at
        // 1600x1024, this tree: GPU 176, CPU 240.1, SAFETY 159.4, LOG 129.8 — and the caps are
        // computed against the tightest viewport §6.1 names, 1024 px tall.
        const share = (row: string): number =>
          Number(/\* ([0-9.]+)\)$/.exec(soleDeclaration(`${row}-max`))?.[1]);
        const available = 1024 - 102 - 21 - 27;
        const healthy: Record<string, number> = { row1: 176, row2: 240.1, row3: 159.4, row4: 129.8 };
        for (const [row, measured] of Object.entries(healthy)) {
          expect(share(row) * available).toBeGreaterThan(measured);
        }
      });

      test('⚠ COOLING’s cap is rows 2 + the 9 px gap + row 3, never a fifth share', () => {
        expect(soleDeclaration('row23-max')).toBe('calc(var(--row2-max) + 9px + var(--row3-max))');
      });
    });

    test('⚠ align-items: start is untouched — a short panel is still its own height', () => {
      // Named by the ruling itself. If this became `stretch`, MEMORY would grow to CPU's
      // height and STORAGE to SAFETY's, which is a density regression the caps must not smuggle
      // in: `10e §3.1` measured and chose `start`.
      // ⚠ Declarations only. Read against the raw file this assertion passed with
      // `align-items: stretch` in force, because this file's own module doc QUOTES the rule —
      // `10h-GR10` DID NOT BITE, and that is the guard failing at exactly its own job.
      expect(CSS.replace(/\/\*[\s\S]*?\*\//g, ' ')).toMatch(/align-items:\s*start/);
    });
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
