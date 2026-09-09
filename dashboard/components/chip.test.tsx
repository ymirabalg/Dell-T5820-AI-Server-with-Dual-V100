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

/**
 * ⚠ 10f/Q3 — `band={false}`, §6.2's *"neutral, unbanded code chip (no colour, no glyph)"*.
 *
 * Both sides of the boundary (HANDOVER §5.1): the default must still band, and the unbanded
 * form must differ from `severity={null}` in every one of the three channels a band travels
 * on. That last point is the one worth asserting hardest — `severity={null}` is O12's "this
 * reading has NO §6.3 row to band it" and paints a hatched `--nodata` ground under an em dash
 * announced as *"no severity band"*, which is the vocabulary of a reading that could not be
 * judged. `0x4` was read, is known, and is simply not a state claim.
 */
describe('⚠ 10f/Q3 — the neutral, unbanded chip', () => {
  test('band defaults to true — every existing caller still gets its band', () => {
    const omitted = renderToStaticMarkup(<Chip severity="normal" label="0x4 sw power cap" code />);
    const explicit = renderToStaticMarkup(
      <Chip severity="normal" label="0x4 sw power cap" code band />,
    );
    expect(omitted).toBe(explicit);
    expect(omitted).toContain('data-severity="normal"');
  });

  test('⚠ band={false} drops the band attribute, the glyph AND the announced word — all three', () => {
    const html = renderToStaticMarkup(
      <Chip severity="normal" label="0x4 sw power cap" code band={false} />,
    );
    expect(html).not.toContain('data-severity');
    expect(html).not.toContain('✓');
    expect(html).not.toContain('normal');
    // It is still the same code pill, in the same place, carrying the same text.
    expect(html).toContain('data-code="true"');
    expect(html).toContain('data-size="md"');
    expect(html).toContain('0x4 sw power cap');
  });

  test('⚠ 10f-A8 — an sm chip is banded WHATEVER band says: unbanding it leaves an empty 11 px box', () => {
    // An `sm` chip has no `label` at any call site, so the glyph IS its visible content and the
    // `sr-only` word IS its announced content; `.chip[data-size='sm']` fixes `width: 11px`.
    // `band={false}` there would render a severity indicator that says nothing, in the four
    // places `sm` is used. No caller does it today — `band` is passed at exactly one site in the
    // tree — which is why nothing else in the suite can see it.
    const forced = renderToStaticMarkup(<Chip severity="alarm" size="sm" band={false} />);
    const plain = renderToStaticMarkup(<Chip severity="alarm" size="sm" />);
    expect(forced).toBe(plain);
    expect(forced).toContain('data-severity="alarm"');
    expect(forced).toContain('alarm');

    // ...and the md side is untouched, or the rule would be a blanket ignore of Q3's own prop.
    const md = renderToStaticMarkup(<Chip severity="normal" size="md" label="0x4 sw power cap" code band={false} />);
    expect(md).not.toContain('data-severity');
  });

  test('⚠ unbanded is NOT the same rendering as severity={null} — O12 says something else', () => {
    const unbanded = renderToStaticMarkup(<Chip severity="normal" label="0x4 sw power cap" code band={false} />);
    const noBand = renderToStaticMarkup(<Chip severity={null} label="0x4 sw power cap" code />);
    expect(unbanded).not.toBe(noBand);
    // `severity={null}`'s three carriers, none of which an unbanded chip may borrow.
    expect(noBand).toContain('data-severity="none"');
    expect(noBand).toContain('—');
    expect(noBand).toContain('no severity band');
    expect(unbanded).not.toContain('—');
    expect(unbanded).not.toContain('no severity band');
  });
});
