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
    expect(asking).toContain('row.module.css');
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
  test.each(cssFiles)('⚠ every scrolling box in %s is also a positioned box', (file) => {
    const bodies = ruleBodiesOf(declarationsOf(readFileSync(join(stylesRoot, file), 'utf8')));
    for (const body of bodies) {
      if (!SCROLLS.test(body)) continue;
      expect(body).toMatch(POSITIONED);
    }
  });

  test('the guard is not vacuous — the three bounded panes this app really has are all found', () => {
    const scrolling = cssFiles.filter((f) =>
      ruleBodiesOf(declarationsOf(readFileSync(join(stylesRoot, f), 'utf8'))).some((b) =>
        SCROLLS.test(b),
      ),
    );
    expect(scrolling.sort()).toEqual(
      [
        'panels/session-event-log-panel.module.css',
        'sparkline.module.css',
        'stacked-time-series-chart.module.css',
      ].sort(),
    );
  });
});
