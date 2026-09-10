import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { EM_DASH } from '@/lib/format';

import { PanelShell } from './panel-shell';

describe('title, subtitle and children render verbatim', () => {
  /*
   * ⚠ §6.2's own prose is internally inconsistent ("lower case: `GPU 0`"), so the resolved
   * reading is: the CALLER decides casing, and this component must not "fix" it either way.
   */
  test('⚠ "GPU 0" is rendered with its capitals intact — no lowercasing applied', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="GPU 0" subtitle="Tesla PG500-216 · 00000000:17:00.0" chip="normal">
        body
      </PanelShell>,
    );
    expect(html).toContain('>GPU 0<');
    expect(html).not.toContain('>gpu 0<');
  });

  test('a lower-case title stays lower case', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="cooling" subtitle="dell_smm · channel 5 = FAN_HDD (PCIe/GPU)" chip={null}>
        body
      </PanelShell>,
    );
    expect(html).toContain('>cooling<');
  });

  test('children render inside the body', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="cpu" subtitle="Xeon W-2135 · 6C / 12T" chip="watch">
        <span>a row</span>
      </PanelShell>,
    );
    expect(html).toContain('a row');
  });

  /*
   * ⚠ §6.2: "A GPU whose `name` failed to parse does not lose its subtitle; it shows what it
   * has." An em-dash subtitle must render, not disappear.
   */
  test('⚠ a subtitle of "—" still renders — it is not suppressed as "empty"', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="GPU 1" subtitle={EM_DASH} chip="normal">
        body
      </PanelShell>,
    );
    // Scoped to the <p> element itself — `chip=null` would also put an em dash in the
    // Chip's own glyph, which must not make this assertion pass for the wrong reason.
    const subtitleParagraph = /<p[^>]*>([^<]*)<\/p>/.exec(html)?.[1] ?? '';
    expect(subtitleParagraph).toBe(EM_DASH);
  });
});

describe('the chip carries the panel’s own severity', () => {
  test('a real band', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="safety" subtitle="4 checks" chip="alarm">
        body
      </PanelShell>,
    );
    expect(html).toContain('data-severity="alarm"');
  });

  /*
   * ⚠ O12: a panel with nothing that bands must not read as healthy. The section root and
   * the chip both carry the explicit "none" state, never "normal".
   */
  test('⚠ chip=null renders "none" on both the section and the chip, never "normal"', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="serving" subtitle="llama-server" chip={null}>
        body
      </PanelShell>,
    );
    const occurrences = html.match(/data-severity="none"/g) ?? [];
    expect(occurrences.length).toBe(2); // the <section> and the head Chip
    expect(html).not.toContain('data-severity="normal"');
  });
});

// ---------------------------------------------------------------------------------------
// 10e §2.0 — `chip` becomes OPTIONAL: omitting it is a THIRD state, distinct from `null`.
// OQ-4 (declined): SESSION EVENT LOG's head renders NO chip element at all — not the hatched
// `—`, not an invented debounce constant.
// ---------------------------------------------------------------------------------------

describe('⚠ 10e/OQ-4 — an OMITTED chip renders no chip element at all, distinct from chip={null}', () => {
  test('⚠ chip omitted: no Chip element anywhere in the head — zero data-severity occurrences on a chip', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="session event log" subtitle="state transitions since page load">
        body
      </PanelShell>,
    );
    // The <section> itself still carries the attribute (chip ?? 'none' — unaffected by
    // whether the prop was omitted or explicitly null; both are nullish). Exactly ONE
    // occurrence — the section's own — proves no <Chip> rendered at all.
    const occurrences = html.match(/data-severity="none"/g) ?? [];
    expect(occurrences.length).toBe(1);
  });

  test('⚠ chip={null} still renders the hatched no-band CHIP — the two states are not the same', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="serving" subtitle="llama-server" chip={null}>
        body
      </PanelShell>,
    );
    const occurrences = html.match(/data-severity="none"/g) ?? [];
    expect(occurrences.length).toBe(2); // section + the Chip that chip={null} DOES render
  });

  test('omitting chip still renders the title, subtitle and children normally', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="session event log" subtitle="state transitions since page load">
        <span>an entry</span>
      </PanelShell>,
    );
    expect(html).toContain('session event log');
    expect(html).toContain('state transitions since page load');
    expect(html).toContain('an entry');
  });
});

describe('⚠ 10e §2.0 — headControl renders in the head, costing nothing in the body', () => {
  test('⚠ headControl renders between the subtitle and the chip', () => {
    const html = renderToStaticMarkup(
      <PanelShell
        title="gpu0"
        subtitle="Tesla PG500-216 · 00000000:17:00.0"
        chip="normal"
        headControl={<button type="button">table</button>}
      >
        body
      </PanelShell>,
    );
    expect(html).toContain('<button');
    expect(html).toContain('>table<');
    // Order: subtitle text, then the control, then the chip's own data-severity attribute.
    const subtitleAt = html.indexOf('Tesla PG500-216');
    const controlAt = html.indexOf('<button');
    const chipAt = html.indexOf('data-severity="normal"', controlAt);
    expect(subtitleAt).toBeLessThan(controlAt);
    expect(controlAt).toBeLessThan(chipAt);
  });

  test('omitted by default — no extra element between subtitle and chip', () => {
    const withControl = renderToStaticMarkup(
      <PanelShell title="cpu" subtitle="Xeon W-2135 · 6C / 12T" chip="normal" headControl={<i>x</i>}>
        body
      </PanelShell>,
    );
    const without = renderToStaticMarkup(
      <PanelShell title="cpu" subtitle="Xeon W-2135 · 6C / 12T" chip="normal">
        body
      </PanelShell>,
    );
    expect(withControl).not.toBe(without);
    expect(without).not.toContain('<i>x</i>');
  });
});

/**
 * ⚠⚠ 10h — §6.1's 2026-09-10 ruling, the half this component owns: *"every panel has a maximum
 * height derived from its grid row, and its BODY scrolls inside that height … the head of a
 * panel never scrolls away: title, subtitle and chip stay pinned."*
 *
 * The cap itself is `grid.module.css`'s (per row, `grid.test.tsx` asserts it). What is asserted
 * here is the shape that makes a capped panel survivable, in the two places it lives: the DOM
 * (the head is not inside the scroller, and the scroller is named and reachable) and the CSS
 * text (the five declarations that make the scroll real, none of which any render test can
 * see — deleting `overflow-y: auto` or `min-height: 0` leaves markup that is byte-identical).
 */
describe('⚠ 10h — the head is pinned and the body is the scroller', () => {
  const css = readFileSync(
    fileURLToPath(new URL('./panel-shell.module.css', import.meta.url)),
    'utf8',
  ).replace(/\/\*[\s\S]*?\*\//g, ' ');
  const ruleBody = (selector: string): string => {
    const at = css.indexOf(selector);
    expect(at).toBeGreaterThan(-1);
    return css.slice(css.indexOf('{', at) + 1, css.indexOf('}', at));
  };

  test('⚠ the head is a SIBLING of the scrolling body, never inside it', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="cpu" subtitle="Xeon W-2135" chip="watch">
        <p>a reading</p>
      </PanelShell>,
    );
    const head = /<header[\s\S]*?<\/header>/.exec(html)?.[0] ?? '';
    // Everything §6.1 requires to stay pinned is in the head, and the head closes before the
    // body opens — so no scroll position inside the body can take any of it off screen.
    expect(head).toContain('cpu');
    expect(head).toContain('Xeon W-2135');
    expect(head).toContain('watch');
    expect(head).not.toContain('data-role="panel-body"');
    expect(html.indexOf('</header>')).toBeLessThan(html.indexOf('data-role="panel-body"'));
  });

  test('⚠ the body is a NAMED, keyboard-reachable group — all four attributes on one tag', () => {
    const html = renderToStaticMarkup(
      <PanelShell title="storage & network" subtitle="—" chip={null}>
        <p>a reading</p>
      </PanelShell>,
    );
    const tag = /<div[^>]*data-role="panel-body"[^>]*>/.exec(html)?.[0] ?? '';
    expect(tag).toContain('role="group"');
    expect(tag).toContain('tabindex="0"');
    // ⚠ The name carries the PANEL's title, so nine bodies never announce the same words
    // (10f-A6 measured seven wells that did).
    expect(tag).toContain('aria-label="storage &amp; network readings"');
  });

  test('⚠ the body’s five scroll declarations — the reverts no render test can see', () => {
    const body = ruleBody('.body {');
    // Shrink ONLY: `flex: 1 1 auto` would make every body fill its panel and move COOLING,
    // which stretches to its two spanned rows, on a page that already fits.
    expect(body).toMatch(/flex:\s*0\s+1\s+auto/);
    // A flex item's automatic minimum size is its content; without this the body refuses to
    // shrink and the panel overflows its cap instead of scrolling inside it.
    expect(body).toMatch(/min-height:\s*0/);
    expect(body).toMatch(/overflow-y:\s*auto/);
    // ⚠ A scroll container clips an absolutely-positioned descendant only when it is in that
    // descendant's containing-block chain (10e-A1, measured) — and every `Chip` renders one.
    expect(body).toMatch(/position:\s*relative/);
    // The bound `components/styles.test.ts` requires of any scrolling box.
    expect(body).toMatch(/max-height:\s*100%/);
  });

  test('⚠ the head cannot be shrunk to buy the body room', () => {
    // ⚠ 10h RECONCILE (`10h-A9`) — this comment used to say a shrinkable head would lose its 6px
    // padding-bottom first. Measured, it would not: a flex item's automatic minimum size already
    // refuses to shrink the head below its content (slot 199.78 / head 25.81 / body 150, identical
    // with `0 1 auto`). What this pins is therefore an INTENT — the head is not a shrink target —
    // at the one declaration a future `min-height: 0` on `.head` would silently make it one.
    // Named honestly rather than renamed: the assertion is right, only its old reason was wrong.
    expect(ruleBody('.head {')).toMatch(/flex:\s*0\s+0\s+auto/);
  });

  test('⚠ the body carries the continuation fade, in the PANEL’s ground', () => {
    const body = ruleBody('.body {');
    // The same two-layer scroll-shadow every bounded well carries (`tokens.css`), except that
    // the cover must be painted in THIS box's ground — `--surface-1`, not `--surface-sunken` —
    // or it paints a permanent bar instead of vanishing when nothing is hidden.
    expect(body).toMatch(/background-image:\s*var\(--panel-fade-cover\),\s*var\(--well-fade-edge\)/);
    expect(body).toMatch(/background-attachment:\s*local,\s*scroll/);
    expect(body).toMatch(/background-position:\s*bottom/);
    expect(body).toMatch(/background-size:\s*100%\s*var\(--well-fade-height\)/);
    expect(body).toMatch(/background-repeat:\s*no-repeat/);
  });

  /**
   * ⚠⚠ 10h RECONCILE (`10h-A6`) — the focus ring inside the scroller, which this loop clipped.
   *
   * An outline is ink overflow and never contributes to scrollable overflow, so `overflow-y:
   * auto` on a box with no padding erases the ring of any child flush with its padding edge.
   * `tokens.css` paints the app-wide ring 2-4px OUTSIDE the border box (`outline-offset: 2px`);
   * measured, the strip just outside CPU's first focusable well is byte-identical focused and
   * unfocused, and 10 of the 15 focusable children inside scrolling bodies sit at margin 0 from
   * a clip edge. Those tab stops were added by 10f/10g/10h so that clipped content stays
   * reachable — losing the indicator on them is this change's own accessibility regression.
   *
   * ⚠ NEGATIVE, and asserted as such rather than as "some offset": `outline-offset: 2px` is
   * exactly the value that fails here, and it is also the value this rule inherits if it is
   * deleted, so a guard reading only "an offset is declared" would pass on the defect.
   */
  test('⚠ a focus ring inside the scrolling body is INSET, or overflow clips it away', () => {
    expect(ruleBody('.body :focus-visible {')).toMatch(/outline-offset:\s*-[0-9]/);
  });

  test('⚠ --panel-fade-cover is the panel ground, and that VALUE is the whole mechanism', () => {
    // ⚠ 10g's lesson, applied one token later: every assertion above reads the `var()`, so all
    // of them follow this token anywhere it goes. Pointed at `--surface-sunken` it would paint
    // a dark bar across the bottom of every panel; set to `none` it deletes the affordance from
    // all nine at once, with the whole suite green.
    const tokens = readFileSync(fileURLToPath(new URL('./tokens.css', import.meta.url)), 'utf8');
    expect(tokens).toMatch(
      /--panel-fade-cover:\s*linear-gradient\(to top, var\(--surface-1\), transparent\);/,
    );
  });
});
