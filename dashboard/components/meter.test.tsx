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
