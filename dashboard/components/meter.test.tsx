import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { EM_DASH } from '@/lib/format';

import { Meter } from './meter';

const widthOf = (html: string): string => /width:\s*([^;"]+)/.exec(html)?.[1]?.trim() ?? '';

describe('the fill percentage — a rendering computation, never a formatted numeral', () => {
  test('a normal fraction fills proportionally', () => {
    const html = renderToStaticMarkup(
      <Meter label="/" formattedValue="116.3 / 232.6 GiB" used={116.3} total={232.6} severity="normal" />,
    );
    expect(widthOf(html)).toBe('50%');
  });

  /*
   * ⚠ Fixture symmetry (HANDOVER §5.1): the clamp has two sides. 100% (exactly full) must
   * not be a special case, and anything past it must not overflow the track.
   */
  test('⚠ exactly full renders 100%, not clamped away or overflowed', () => {
    const html = renderToStaticMarkup(
      <Meter label="/" formattedValue="232.6 / 232.6 GiB" used={232.6} total={232.6} severity="alarm" />,
    );
    expect(widthOf(html)).toBe('100%');
  });

  test('⚠ used greater than total clamps to 100%, never past it', () => {
    const html = renderToStaticMarkup(
      <Meter label="/" formattedValue="300 / 232.6 GiB" used={300} total={232.6} severity="alarm" />,
    );
    expect(widthOf(html)).toBe('100%');
  });

  /*
   * ⚠ Invariant 1's "zero is a reading" applies to the fill geometry too: a genuinely idle
   * card draws a real, zero-width fill on an otherwise fully-drawn track — it is not the
   * same rendering as "no reading" (below), even though both are visually a flat track.
   */
  test('⚠ used=0 is a real reading and colours the track by its severity', () => {
    const html = renderToStaticMarkup(
      <Meter label="VRAM" formattedValue="0 / 32,768 MiB" used={0} total={32768} severity="normal" />,
    );
    expect(widthOf(html)).toBe('0%');
    expect(html).toContain('data-severity="normal"');
  });

  test('⚠ a null total renders an empty track, never a NaN width', () => {
    const html = renderToStaticMarkup(
      <Meter label="VRAM" formattedValue={EM_DASH} used={12} total={null} severity={null} />,
    );
    expect(widthOf(html)).toBe('0%');
    expect(html).not.toContain('NaN');
  });

  test('a null used renders an empty track', () => {
    const html = renderToStaticMarkup(
      <Meter label="VRAM" formattedValue={EM_DASH} used={null} total={32768} severity={null} />,
    );
    expect(widthOf(html)).toBe('0%');
  });

  test('a total of exactly 0 is treated the same as no total — never a division by zero', () => {
    const html = renderToStaticMarkup(
      <Meter label="VRAM" formattedValue={EM_DASH} used={0} total={0} severity={null} />,
    );
    expect(widthOf(html)).toBe('0%');
    expect(html).not.toContain('Infinity');
  });
});

describe('no invented band', () => {
  test('⚠ severity=null renders data-severity="none", never "normal"', () => {
    const html = renderToStaticMarkup(
      <Meter label="VRAM" formattedValue={EM_DASH} used={null} total={null} severity={null} />,
    );
    expect(html).toContain('data-severity="none"');
    expect(html).not.toContain('data-severity="normal"');
  });
});

describe('label and value render verbatim', () => {
  test('the pre-formatted pair passes straight through', () => {
    const html = renderToStaticMarkup(
      <Meter label="VRAM" formattedValue="26,452 / 32,768 MiB" used={26452} total={32768} severity="watch" />,
    );
    expect(html).toContain('VRAM');
    expect(html).toContain('26,452 / 32,768 MiB');
  });
});

// ---------------------------------------------------------------------------------------
// Step 9 RECONCILIATION — L7, and the colour-only encoding found underneath it.
// ---------------------------------------------------------------------------------------

describe('⚠ the band is a word as well as a colour, and nothing is announced twice', () => {
  /*
   * ⚠ `Meter` paired its band with NO glyph and NO word — the fill colour was the only
   * carrier, which is exactly what §6.3 ("distinguishable without relying on colour alone")
   * and the dataviz reference ("status colours … always ship with an icon + label, never
   * colour alone") forbid. `Chip` had this right from the start; the meter did not.
   */
  test.each([
    ['normal', 'normal'],
    ['watch', 'watch'],
    ['alarm', 'alarm'],
  ] as const)('⚠ the band travels as text, not only as a fill colour: %s', (severity, word) => {
    const html = renderToStaticMarkup(
      <Meter label="VRAM" formattedValue="31,000 / 32,768 MiB" used={31000} total={32768} severity={severity} />,
    );
    expect(html).toContain('class="sr-only"');
    expect(html).toContain(`>${word}<`);
  });

  test('⚠ severity=null adds no word — there is no band to name (the other side)', () => {
    const html = renderToStaticMarkup(
      <Meter label="VRAM" formattedValue={EM_DASH} used={null} total={null} severity={null} />,
    );
    expect(html).not.toContain('class="sr-only"');
  });

  test('⚠ the bar does not repeat the label and value a screen reader has already read', () => {
    const html = renderToStaticMarkup(
      <Meter label="/" formattedValue="116.3 / 232.6 GiB" used={116.3} total={232.6} severity="normal" />,
    );
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('aria-label');
    // the visible text is still there, exactly once
    expect((html.match(/116\.3 \/ 232\.6 GiB/g) ?? []).length).toBe(1);
  });
});

// ---------------------------------------------------------------------------------------
// 10e §2.0 — the optional tick mark (VRAM 90, RAM 85, disk-free 15). Fixture symmetry
// (HANDOVER §5.1): omitted vs given, and the given position is independent of the fill.
// ---------------------------------------------------------------------------------------

describe('⚠ 10e — the optional tick mark, a fixed threshold position independent of the fill', () => {
  test('omitted by default — no left: style appears anywhere in the markup', () => {
    const html = renderToStaticMarkup(
      <Meter label="VRAM" formattedValue="26,452 / 32,768 MiB" used={26452} total={32768} severity="normal" />,
    );
    expect(html).not.toMatch(/left:\s*\d/);
  });

  test('⚠ tickPercent renders a mark at that exact position, distinct from the fill percentage', () => {
    const html = renderToStaticMarkup(
      <Meter
        label="VRAM"
        formattedValue="26,452 / 32,768 MiB"
        used={26452}
        total={32768}
        severity="normal"
        tickPercent={90}
      />,
    );
    expect(html).toMatch(/left:\s*90%/);
    // the fill's own width is 80.7% here — a DIFFERENT number — so the tick is not merely an
    // alias for the fill, and a mutation that aliased the two would be caught by this.
    expect(widthOf(html)).not.toBe('90%');
  });
});
