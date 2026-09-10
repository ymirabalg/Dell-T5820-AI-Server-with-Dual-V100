import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { Caption } from './caption';

/**
 * 10e §2.0's shared caption line — GPU's throttle row, STORAGE's link row. A pure layout
 * wrapper: it formats nothing and decides no severity.
 */

describe('an optional bold lead label, and arbitrary children', () => {
  test('a label renders as its own bold element, ahead of the children', () => {
    const html = renderToStaticMarkup(
      <Caption label="throttle">
        <span>0x20 sw thermal slowdown</span>
      </Caption>,
    );
    expect(html).toContain('<b');
    expect(html).toContain('throttle');
    expect(html).toContain('0x20 sw thermal slowdown');
    expect(html.indexOf('throttle')).toBeLessThan(html.indexOf('0x20 sw thermal slowdown'));
  });

  test('⚠ omitted label renders no <b> element at all', () => {
    const html = renderToStaticMarkup(
      <Caption>
        <span>up</span>
      </Caption>,
    );
    expect(html).not.toContain('<b');
    expect(html).toContain('up');
  });

  test('renders with no children at all, without throwing', () => {
    expect(() => renderToStaticMarkup(<Caption label="link" />)).not.toThrow();
  });
});

// ---------------------------------------------------------------------------------------
// ⚠ 10g/Q3 — `well` bounds the caption's children to ONE LINE (SPEC §6.1, ruled 2026-09-09:
// "the GPU card's throttle line is a one-line well like the notes blocks, its chips scroll
// within it, so a notable mask costs a fixed height rather than +44 px per card").
//
// Measured on this tree before the change: two notable bits are one 17 px line and a THIRD
// takes the caption to 44 px — three lines on the row that sets the page's first term.
// ---------------------------------------------------------------------------------------

describe('⚠ 10g/Q3 — the bounded one-line well', () => {
  const wellTag = (html: string): string => /<span[^>]*data-role="caption-well"[^>]*>/.exec(html)?.[0] ?? '';

  test('⚠ `well` makes the children a NAMED, keyboard-reachable group — all three on one tag', () => {
    const html = renderToStaticMarkup(
      <Caption label="throttle" well="GPU 0 throttle">
        <span>0x20 sw thermal slowdown</span>
      </Caption>,
    );
    const tag = wellTag(html);
    expect(tag).toContain('role="group"');
    expect(tag).toContain('aria-label="GPU 0 throttle"');
    expect(tag).toContain('tabindex="0"');
  });

  test('⚠ the LABEL stays outside the well — a well that scrolls its own name away says nothing', () => {
    const html = renderToStaticMarkup(
      <Caption label="throttle" well="GPU 0 throttle">
        <span>0x20 sw thermal slowdown</span>
      </Caption>,
    );
    // `throttle` is this line's equivalent of §6.4's pinned count.
    expect(html.indexOf('throttle</b>')).toBeLessThan(html.indexOf('data-role="caption-well"'));
    expect(html.indexOf('data-role="caption-well"')).toBeLessThan(html.indexOf('0x20 sw thermal slowdown'));
  });

  test('⚠ the name is the CALLER’s — two cards must not announce the same well', () => {
    // `PanelShell` renders a `<section>`, which ARIA maps to `generic`, so the well's own name
    // is the whole announcement and GPU 0's and GPU 1's would otherwise be identical (10f-A6).
    const zero = renderToStaticMarkup(<Caption label="throttle" well="GPU 0 throttle"><span>x</span></Caption>);
    const one = renderToStaticMarkup(<Caption label="throttle" well="GPU 1 throttle"><span>x</span></Caption>);
    expect(zero).toContain('aria-label="GPU 0 throttle"');
    expect(one).toContain('aria-label="GPU 1 throttle"');
    expect(zero.replace('GPU 0 throttle', 'X')).toBe(one.replace('GPU 1 throttle', 'X'));
  });

  test('⚠ OMITTING `well` renders no well at all — STORAGE’s link line is not boxed', () => {
    // The default must be the un-boxed one: a well round a single state pill and an age is
    // chrome spent on nothing, and an accidental one would be an unnamed box (10f-A6 again).
    const html = renderToStaticMarkup(<Caption label="link"><span>up</span></Caption>);
    expect(html).not.toContain('data-role="caption-well"');
    expect(html).not.toContain('role="group"');
    expect(html).toContain('up');
  });

  test('⚠ the stylesheet bounds the well to one measured line, positioned and border-box', () => {
    const css = readFileSync(
      fileURLToPath(new URL('./panel-text.module.css', import.meta.url)),
      'utf8',
    ).replace(/\/\*[\s\S]*?\*\//g, ' ');
    const body = css.slice(css.indexOf('.well {'), css.indexOf('}', css.indexOf('.well {')));
    // 17 px is MEASURED — one `md` chip line in this caption at all three §6.1 widths.
    expect(body).toMatch(/max-height:\s*17px/);
    expect(body).toMatch(/overflow-y:\s*auto/);
    expect(body).toMatch(/position:\s*relative/);
    expect(body).toMatch(/box-sizing:\s*border-box/);
    // The chips wrapped in the caption's own flex line before this and must keep wrapping —
    // inside the well now, which is what makes them scroll instead of growing the card.
    expect(body).toMatch(/flex-wrap:\s*wrap/);
    // ⚠ ADDED 2026-09-10 by 10g's RECONCILIATION (adversarial A2). The bound above makes the
    // WELL one line; this declaration is what keeps the CAPTION one line. `.caption` wraps, and
    // a wrapping flex container breaks on each item's HYPOTHETICAL main size — computed before
    // any shrinking — so with `flex-basis: auto` the well's own max-content width (839 px at
    // §6.3's five-bit mask) pushed it onto a second line and the caption measured 41.2 px at
    // 1280 and 1600, not the 17 the ruling and `10g-build.md` §3.1 both claim. `1 1 0` makes
    // that hypothetical size zero. Measured A/B in `10g-reconciliation.md` §2.
    expect(body).toMatch(/flex:\s*1 1 0\s*;/);
    expect(body).not.toMatch(/flex:\s*1 1 auto/);
    // ⚠ 10g/Q4 — and it draws the continuation fade, like every other bounded well.
    expect(body).toMatch(/background-attachment:\s*local,\s*scroll/);
    // ⚠ ADDED 2026-09-10 by 10g's RECONCILIATION (adversarial A3/R3). Only the attachment pair
    // was asserted here, so `background-position: bottom` -> `top` moved this well's fade to
    // the wrong edge — it then marks the edge the text does NOT continue past — with the whole
    // suite and all nine harnesses green. `panel-notes.module.css`'s position was asserted;
    // this file's was not, and the two rules are copies of each other.
    expect(body).toMatch(/background-position:\s*bottom/);
    expect(body).toMatch(/background-image:\s*var\(--well-fade-cover\),\s*var\(--well-fade-edge\)/);
    expect(body).toMatch(/background-size:\s*100% var\(--well-fade-height\)/);
    expect(body).toMatch(/background-repeat:\s*no-repeat/);
  });
});
