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
