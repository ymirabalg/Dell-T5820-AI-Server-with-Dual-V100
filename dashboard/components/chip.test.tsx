import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import type { Severity } from '@/lib/types';

import { Chip } from './chip';

/**
 * §6.2/§6.3's chip, as markup — the pattern `login-form.test.tsx` set: `react-dom/server`'s
 * `renderToStaticMarkup` in plain Node, no jsdom, no testing library. `Chip` is a pure
 * function of a `Severity | null`, so every band renders without a DOM.
 */

const glyphOf = (html: string): string => /<span aria-hidden="true"[^>]*>([^<]*)<\/span>/.exec(html)?.[1] ?? '';

describe('the three bands and the no-band case', () => {
  test('normal renders data-severity="normal" and a check glyph', () => {
    const html = renderToStaticMarkup(<Chip severity="normal" />);
    expect(html).toContain('data-severity="normal"');
    expect(glyphOf(html)).toBe('✓');
  });

  test('watch renders data-severity="watch" and ▲', () => {
    const html = renderToStaticMarkup(<Chip severity="watch" />);
    expect(html).toContain('data-severity="watch"');
    expect(glyphOf(html)).toBe('▲');
  });

  test('⚠ alarm renders data-severity="alarm" and a glyph distinct from watch’s', () => {
    const html = renderToStaticMarkup(<Chip severity="alarm" />);
    expect(html).toContain('data-severity="alarm"');
    expect(glyphOf(html)).toBe('✕');
    expect(glyphOf(html)).not.toBe(glyphOf(renderToStaticMarkup(<Chip severity="watch" />)));
  });

  /*
   * ⚠ O12: "a reading with no §6.3 band is invisible to §9's dot. Do not invent a band —
   * report it." `null` must never fall back to the good colour.
   */
  test('⚠ null severity renders data-severity="none", never "normal"', () => {
    const html = renderToStaticMarkup(<Chip severity={null} />);
    expect(html).toContain('data-severity="none"');
    expect(html).not.toContain('data-severity="normal"');
  });
});

describe('accessibility — the glyph is never the only carrier', () => {
  test.each([
    ['normal', 'normal'],
    ['watch', 'watch'],
    ['alarm', 'alarm'],
  ] satisfies [Severity, string][])(
    '⚠ the visually-hidden word survives even with colour and glyph removed: %s',
    (severity, word) => {
      const html = renderToStaticMarkup(<Chip severity={severity} />);
      expect(html).toContain('class="sr-only"');
      expect(html).toContain(`>${word}<`);
    },
  );

  test('the no-band case names itself "no reading", not a blank', () => {
    const html = renderToStaticMarkup(<Chip severity={null} />);
    expect(html).toContain('>no reading<');
  });
});

describe('the optional visible label', () => {
  test('omitted by default — no label span at all', () => {
    const html = renderToStaticMarkup(<Chip severity="normal" />);
    // root + glyph + the sr-only word, and nothing else — no fourth (label) span.
    expect(html.match(/<span/g)).toHaveLength(3);
  });

  test('rendered verbatim when given', () => {
    const html = renderToStaticMarkup(<Chip severity="alarm" label="80 °C" />);
    expect(html).toContain('80 °C');
  });
});

describe('size', () => {
  test('defaults to md', () => {
    expect(renderToStaticMarkup(<Chip severity="normal" />)).toContain('data-size="md"');
  });

  test('sm is carried as a data attribute, not silently ignored', () => {
    expect(renderToStaticMarkup(<Chip severity="normal" size="sm" />)).toContain('data-size="sm"');
  });
});
