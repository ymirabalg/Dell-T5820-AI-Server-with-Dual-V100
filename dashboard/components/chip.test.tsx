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

  /*
   * ⚠ The no-band case names itself "no severity band", NOT "no reading". §6.3 is full of
   * readings that exist and carry no band — `/health: null` is "not probed this cycle",
   * `ch5Mode: null` renders `unavailable` (§6.6), and invariant 3 says "`EC auto` and
   * `unavailable` are not severities". A `Row` with `value="unavailable" severity={null}`
   * announced "no reading" beside a value that is a reading.
   */
  test('⚠ the no-band case names the missing BAND, never claims the reading is missing', () => {
    const html = renderToStaticMarkup(<Chip severity={null} />);
    expect(html).toContain('>no severity band<');
    expect(html).not.toContain('no reading');
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

/*
 * ⚠ 10e §2.0 — the mock's `.chip--code`, for a throttle reason printed as data. Both sides of
 * the boundary (HANDOVER §5.1): omitted vs `code`.
 */
describe('⚠ 10e — the code modifier, for a throttle reason that must never be shouted uppercase', () => {
  test('omitted by default — no data-code attribute at all', () => {
    const html = renderToStaticMarkup(<Chip severity="alarm" label="0x20 sw thermal slowdown" />);
    expect(html).not.toContain('data-code');
  });

  test('⚠ code renders data-code="true", the hook the stylesheet drops uppercase for', () => {
    const html = renderToStaticMarkup(
      <Chip severity="alarm" label="0x20 sw thermal slowdown" code />,
    );
    expect(html).toContain('data-code="true"');
    // The label itself is passed through verbatim — this component never transforms case in
    // either direction, so a caller relying on the CSS `text-transform: none` is not betrayed
    // by a JS-side `.toUpperCase()` hiding in here too.
    expect(html).toContain('0x20 sw thermal slowdown');
    expect(html).not.toContain('0X20');
  });
});
