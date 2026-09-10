import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { Strip } from './strip';

/**
 * §6.1's compact key/value line, as markup. A pure function of already-formatted `{ k, v }`
 * pairs — this component never formats a number.
 */

describe('every item renders, in order, as a key/value pair', () => {
  test('three items render three keys and three values', () => {
    const html = renderToStaticMarkup(
      <Strip
        items={[
          { k: 'util', v: '97.0 %' },
          { k: 'SM clk', v: '1,290 MHz' },
          { k: 'served by instance 0', v: 'qwen3.6-27b' },
        ]}
      />,
    );
    expect(html).toContain('util');
    expect(html).toContain('97.0 %');
    expect(html).toContain('SM clk');
    expect(html).toContain('1,290 MHz');
    expect(html).toContain('served by instance 0');
    expect(html).toContain('qwen3.6-27b');
    expect(html.indexOf('util')).toBeLessThan(html.indexOf('SM clk'));
    expect(html.indexOf('SM clk')).toBeLessThan(html.indexOf('served by instance 0'));
  });

  test('⚠ a value is never reformatted — an em dash passes straight through verbatim', () => {
    const html = renderToStaticMarkup(<Strip items={[{ k: 'load', v: '—' }]} />);
    expect(html).toContain('>—<');
  });

  test('an empty list renders the list element with no items', () => {
    const html = renderToStaticMarkup(<Strip items={[]} />);
    expect(html).toContain('<dl');
    expect(html).not.toContain('<dt');
  });
});

describe('⚠ semantics — a description list, dt/dd pairs, never a plain div soup', () => {
  // ⚠ STRENGTHENED BY 10e's TEST PHASE, 2026-09-09. The body rendered ONE item and asserted
  // only that the strings `<dt` and `<dd` occur — so it could not tell `<dt>{k}</dt><dd>{v}</dd>`
  // from the SWAPPED `<dt>{v}</dt><dd>{k}</dd>`, and "each" was untested with a single item.
  // Two items and an adjacency regex per pair close both.
  test('⚠ the wrapper is a <dl>, each key a <dt> and each value a <dd> — in that order', () => {
    const html = renderToStaticMarkup(
      <Strip items={[{ k: 'util', v: '97.0 %' }, { k: 'SM clk', v: '1,290 MHz' }]} />,
    );
    expect(html).toMatch(/<dl[^>]*>/);
    expect(html).toMatch(/<dt[^>]*>util<\/dt><dd[^>]*>97\.0 %<\/dd>/);
    expect(html).toMatch(/<dt[^>]*>SM clk<\/dt><dd[^>]*>1,290 MHz<\/dd>/);
  });
});

describe('⚠ 10e-A2 — a single long value WRAPS rather than overflowing the column', () => {
  /**
   * `renderToStaticMarkup` lays nothing out, so this asserts the CSS text — the same method
   * `components/styles.test.ts` uses, and the only one available for a property whose whole
   * effect is layout.
   *
   * `.strip`'s `flex-wrap: wrap` breaks BETWEEN items; it does nothing for ONE item wider than
   * the column. `.v` shipped as `white-space: nowrap` (the mock's `dd`) and re-created F5's
   * exact defect: GPU's third value is `formatText(instance.model)` and `instance.model` is
   * `/v1/models`'s `data[0].id`, which `llama-server` reports as the `-m` PATH unless
   * `--alias` is given — so `/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf` is a reachable value
   * on this box. Measured in Chrome with the shipped rules: `scrollWidth` 345 in the 285px GPU
   * column at the 1280 design target (and the same 345 at 262 and 200), returning to 285 with
   * the three declarations below — `status-row.module.css`'s `.value`, verbatim, which is F5's
   * own fix one primitive over.
   */
  test('⚠ .v can shrink and can break inside a value — F5’s three declarations, not `nowrap`', () => {
    const css = readFileSync(
      fileURLToPath(new URL('./strip.module.css', import.meta.url)),
      'utf8',
      // Declarations only: a rule quoted inside a comment must not satisfy the guard.
    ).replace(/\/\*[\s\S]*?\*\//g, ' ');
    const v = css.slice(css.indexOf('.v {'), css.indexOf('}', css.indexOf('.v {')));

    expect(v).toMatch(/min-width:\s*0/);
    expect(v).toMatch(/overflow-wrap:\s*anywhere/);
    expect(v).toMatch(/white-space:\s*normal/);
    expect(v).not.toMatch(/white-space:\s*nowrap/);
    // Not vacuous: `.strip`'s own between-items wrapping is still there and is a different rule.
    expect(css).toMatch(/flex-wrap:\s*wrap/);
  });

  /**
   * ⚠⚠ 10h/§3.4 — the raw reading behind a shortened `v`.
   *
   * `model` renders as its filename from 2026-09-10 (`lib/format.ts`'s `formatModelName`), and
   * the ruling requires the whole string to stay reachable. This item is the GPU card's half of
   * that: `served by instance N`.
   */
  test('⚠ an item’s title carries the whole reading, and an item without one gets no attribute', () => {
    const html = renderToStaticMarkup(
      <Strip
        items={[
          { k: 'util', v: '97.0 %' },
          {
            k: 'served by instance 0',
            v: 'Qwen3.6-27B-Q4_K_M.gguf',
            title: '/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf',
          },
        ]}
      />,
    );
    expect(html).toContain('title="/home/yorman/models/Qwen3.6-27B-Q4_K_M.gguf"');
    // ⚠ Exactly one — a `title` defaulted from `v` would repeat the visible text on every other
    // item, which is noise rather than a reading.
    expect((html.match(/title=/g) ?? []).length).toBe(1);
    // And the visible text is still the shortened one, not the title.
    expect(html).toContain('>Qwen3.6-27B-Q4_K_M.gguf<');
  });

  test('⚠ a null title renders NO attribute — `title=""` is a tooltip that says nothing', () => {
    const html = renderToStaticMarkup(<Strip items={[{ k: 'util', v: '97.0 %', title: null }]} />);
    expect(html).not.toContain('title=');
  });
});
