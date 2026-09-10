import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

/**
 * ⚠ CSS invariants the render tests structurally cannot see.
 *
 * `renderToStaticMarkup` emits class names; it does not lay anything out, so a declaration
 * that silently does nothing looks identical to one that works. This file asserts the CSS
 * text for the one class of mistake step 9 actually shipped.
 *
 * ### `flex-basis: 100%` only wraps inside a `flex-wrap: wrap` container
 *
 * `row.module.css` gave `.note` `flex-basis: 100%` to put an `errors[]` explanation on its
 * own line — in a container that was still `nowrap`, where `flex-basis` merely hands the item
 * a huge hypothetical size that then shrinks against its siblings. Every flex item's
 * `min-width: auto` floors it at min-content, so chip + label + value + a 34-character
 * monospace note stayed on ONE line whose min-content width exceeds the ~300 px a §6.1 2×2
 * small panel gives it, and neither `.row` nor `.panel` sets `overflow`. §6.2: *"Each row
 * carries its `errors[]` explanation beside it, and that is not decoration."*
 *
 * Written as a rule over the whole directory rather than as an assertion about `.row`, so it
 * covers step 10's stylesheets too — this is a general fact about flexbox, not a fact about
 * one file.
 *
 * ### ⚠ A scroll container only clips what it is the containing block of (10e-A1)
 *
 * Added by 10e's reconciliation, 2026-09-09, after F1's shipped fix was measured NOT to work.
 * `.sr-only` is `position: absolute`, and every `Chip` renders one; an absolutely-positioned
 * box is clipped by an ancestor scroller **only when that scroller is in its containing-block
 * chain**, which a `position: static` box never is. So the session event log's bounded 84px
 * well let 200 entries' hidden spans out and grew `documentElement.scrollHeight` to 5189 on a
 * 1024px viewport — the page acquiring a scrollbar at ~15 entries, which is exactly what
 * §6.1's promise forbids. `panel-shell.module.css`'s `.panel { position: relative }` does not
 * close it (`.panel` is `overflow: visible`, so the overflow propagates straight through);
 * only `position` on the clipping box itself does.
 *
 * The same shape reaches both chart table views: `stacked-time-series-chart.module.css`'s
 * `.tableView` holds one `<table>` per plot, and the SECOND table's `<caption class="sr-only">`
 * sits below the first table's ~361 rows.
 *
 * Written as a rule over the whole directory for the same reason as the one above: it is a
 * general fact about CSS positioning, and the next bounded box anyone adds will hit it.
 */

const stylesRoot = fileURLToPath(new URL('.', import.meta.url));

const cssFilesUnder = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.isDirectory()) {
      out.push(...cssFilesUnder(join(dir, entry.name)).map((f) => join(entry.name, f)));
      continue;
    }
    if (entry.name.endsWith('.css')) out.push(entry.name);
  }
  return out;
};

/** Declarations only — a rule quoted inside a comment must not satisfy or trip a guard. */
const declarationsOf = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, ' ');

const cssFiles = cssFilesUnder(stylesRoot);

describe('⚠ a stylesheet declaration that silently does nothing', () => {
  test('there are stylesheets to check at all', () => {
    expect(cssFiles.length).toBeGreaterThan(0);
  });

  test.each(cssFiles)(
    '⚠ a `flex-basis: 100%%` item needs a `flex-wrap: wrap` container, in %s',
    (file) => {
      const css = declarationsOf(readFileSync(join(stylesRoot, file), 'utf8'));
      if (!/flex-basis:\s*100%/.test(css)) return;
      expect(css).toMatch(/flex-wrap:\s*wrap/);
    },
  );

  test('the guard is not vacuous — some stylesheet really does ask for a full-basis item', () => {
    const asking = cssFiles.filter((f) =>
      /flex-basis:\s*100%/.test(declarationsOf(readFileSync(join(stylesRoot, f), 'utf8'))),
    );
    // ⚠ Re-aimed by 10f/Q12, not weakened. `row.module.css` was DELETED with the dead `Row`
    // primitive (owner's ruling 2026-09-09), and `status-row.module.css` — which took `Row`'s
    // shape and every one of its shipped callers in 10e — is where the same `flex-basis: 100%`
    // note now lives. The subject moved; the property is identical.
    expect(asking).toContain('panels/status-row.module.css');
  });
});

/** Every rule body in a stylesheet: the text between a `{` and its `}`, comments already
 *  stripped. A nested `@media` header contributes no declarations of its own, so taking the
 *  text after the LAST `{` in each chunk yields the inner rule's body. */
const ruleBodiesOf = (css: string): string[] =>
  css
    .split('}')
    .filter((chunk) => chunk.includes('{'))
    .map((chunk) => chunk.slice(chunk.lastIndexOf('{') + 1));

/** `overflow`/`overflow-x`/`overflow-y` set to a SCROLLING value. Deliberately not `hidden`:
 *  `.sr-only`, `.subtitle`, `.chanNote` and the meter track all clip for ellipsis or shape
 *  reasons and are not bounded panes with content behind them. Never matches
 *  `overflow-wrap`. */
const SCROLLS = /overflow(?:-[xy])?:\s*(?:auto|scroll)\b/;
const POSITIONED = /position:\s*(?:relative|absolute|sticky|fixed)\b/;

describe('⚠ a scroll container only clips what it is the containing block of', () => {
  test.each(cssFiles)('⚠ a scrolling box is also a POSITIONED box — %s', (file) => {
    const bodies = ruleBodiesOf(declarationsOf(readFileSync(join(stylesRoot, file), 'utf8')));
    for (const body of bodies) {
      if (!SCROLLS.test(body)) continue;
      expect(body).toMatch(POSITIONED);
    }
  });

  test('the guard is not vacuous — the eight bounded panes this app really has are all found', () => {
    const scrolling = cssFiles.filter((f) =>
      ruleBodiesOf(declarationsOf(readFileSync(join(stylesRoot, f), 'utf8'))).some((b) =>
        SCROLLS.test(b),
      ),
    );
    // ⚠ 10f/Q1 added two: `panel-notes.module.css`'s `.notes` and `status-row.module.css`'s
    // `.note` are the bounded wells §6.1's ruling requires round every `errors[]` block. The
    // list GREW; nothing left it.
    // ⚠ 10g added two more, and again nothing left: `alarm-banner.module.css`'s `.rest` is
    // §6.4's fixed two-line banner (Q2) and `panels/panel-text.module.css`'s `.well` is the
    // GPU throttle line (Q3). Seven bounded panes now; the test name says five and is
    // rewritten with them rather than left naming a count that has moved twice.
    // ⚠⚠ 10h adds the EIGHTH, and it is the one the whole item is about:
    // `panel-shell.module.css`'s `.body`. §6.1's 2026-09-10 ruling makes every panel body the
    // scroller inside its row's cap, so this rule and the BOUNDED one below now cover the
    // mechanism that holds the no-scroll promise up, not just the wells inside it. The list
    // GREW for the third time; nothing has ever left it.
    expect(scrolling.sort()).toEqual(
      [
        'alarm-banner.module.css',
        'panel-shell.module.css',
        'panels/panel-notes.module.css',
        'panels/panel-text.module.css',
        'panels/session-event-log-panel.module.css',
        'panels/status-row.module.css',
        'sparkline.module.css',
        'stacked-time-series-chart.module.css',
      ].sort(),
    );
  });
});

/**
 * ⚠ 10f/Q1 — a scrolling box must also be a BOUNDED box (`SPEC.md` §6.1, ruled 2026-09-09).
 *
 * `overflow-y: auto` on a box with no `height`/`max-height` does exactly nothing: the box grows
 * to its content and the content is never scrolled, so the page grows instead. That is the
 * defect the ruling closes — a panel's `errors[]` block had `overflow` nowhere and no bound
 * either, and an all-collectors-failed page missed §6.1's fold by 27 px at 1280×1024 and 49 px
 * at 1600×1024 (92 and 115 with §6.4's banner pinned).
 *
 * Written as a rule over the whole directory, for the same reason as the two above: it is a
 * general fact about CSS, and it is the one-line revert that would silently un-fix Q1 while
 * leaving every render test green — `max-height: 18px` deleted from `.notes` costs nothing the
 * suite can see. `min-height` is deliberately NOT accepted: it bounds nothing.
 *
 * ⚠ Stated POSITIVELY — the value must begin with a digit or `calc(` — rather than as
 * `height:\s*(?!auto)`. A negative lookahead after `\s*` is defeated by backtracking: `\s*`
 * matches the empty string, the lookahead then reads ` auto`, which does not start with `auto`,
 * and `height: auto` scores as a bound. Measured here, first try.
 *
 * `var(...)` counts: `sparkline.module.css` and `stacked-time-series-chart.module.css` both
 * bound their table view with `height: var(--table-box-height)`, a real bound whose value each
 * chart primitive sets inline from the same number its `<svg>` is drawn at (10g/Q1). ⚠ That is
 * also why this rule is load-bearing in a second way now: the bound is the only part of the
 * table box that lives in CSS at all, so deleting the declaration would leave the height in a
 * JSX attribute this guard cannot see — and the un-capped table view is exactly what 10f-A1
 * measured at +851 px on a healthy page.
 */
const BOUNDED = /(?:^|[^-])(?:max-)?height:\s*(?:calc\(|var\(|[0-9])/;

describe('⚠ a scrolling box must also be a bounded box', () => {
  test.each(cssFiles)('⚠ a scrolling box is also a BOUNDED box — %s', (file) => {
    const bodies = ruleBodiesOf(declarationsOf(readFileSync(join(stylesRoot, file), 'utf8')));
    for (const body of bodies) {
      if (!SCROLLS.test(body)) continue;
      expect(body).toMatch(BOUNDED);
    }
  });

  test('the guard reads a real bound and refuses the three shapes that are not one', () => {
    expect('overflow-y: auto; max-height: 18px;').toMatch(BOUNDED);
    expect('overflow-y: auto; height: 84px;').toMatch(BOUNDED);
    expect('overflow-y: auto; height: var(--table-box-height);').toMatch(BOUNDED);
    // `line-height` is not a bound, and neither is a height that does not bound.
    expect('overflow-y: auto; line-height: 1.25;').not.toMatch(BOUNDED);
    expect('overflow-y: auto; height: auto;').not.toMatch(BOUNDED);
    expect('overflow-y: auto; min-height: 40px;').not.toMatch(BOUNDED);
  });
});
