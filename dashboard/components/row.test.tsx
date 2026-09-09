import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { EM_DASH } from '@/lib/format';

import { Row } from './row';

describe('label and value render verbatim', () => {
  test('a plain fact row — no severity, no note', () => {
    const html = renderToStaticMarkup(<Row label="link" value="up" />);
    expect(html).toContain('link');
    expect(html).toContain('up');
    expect(html).not.toContain('data-severity');
  });

  test('⚠ the value is never reformatted — an em dash passes straight through', () => {
    const html = renderToStaticMarkup(<Row label="fan3" value={EM_DASH} />);
    expect(html).toContain(`>${EM_DASH}<`);
  });
});

describe('the optional severity chip', () => {
  test('omitted entirely when the prop is omitted', () => {
    const html = renderToStaticMarkup(<Row label="fan1" value="1,005 RPM" />);
    expect(html).not.toContain('data-severity');
  });

  /*
   * ⚠ `severity={null}` (no band, O12) is a DIFFERENT thing from omitting the prop — it
   * still renders a chip, in the explicit no-band state, rather than rendering nothing.
   */
  test('⚠ severity={null} still renders a chip, in the no-band state — it is not the same as omitting the prop', () => {
    const html = renderToStaticMarkup(<Row label="fan3" value={EM_DASH} severity={null} />);
    // ⚠ Scoped to an exact COUNT, not a loose `toContain`: the row's own div, the left-edge
    // glyph (`Chip sm`) and the value pill (`Chip md`, §2.0) all carry `data-severity="none"`
    // when severity is explicitly null — three occurrences. A `toContain` alone cannot tell
    // "the glyph rendered" from "only the row div's own attribute happens to say none too" —
    // exactly the gap that let a real mutation (dropping the glyph) pass unnoticed.
    expect((html.match(/data-severity="none"/g) ?? []).length).toBe(3);
  });

  test('a real band renders that band', () => {
    const html = renderToStaticMarkup(<Row label="fan5" value="4,308 RPM" severity="alarm" />);
    expect(html).toContain('data-severity="alarm"');
  });
});

describe('the optional trailing note', () => {
  test('absent when omitted', () => {
    const html = renderToStaticMarkup(<Row label="fan3" value="740 RPM" />);
    expect(html.match(/<span/g)?.length).toBe(2); // label + value only
  });

  test('absent when explicitly null or empty, not rendered as an empty element', () => {
    expect(renderToStaticMarkup(<Row label="fan3" value="740 RPM" note={null} />).match(/<span/g)?.length).toBe(2);
    expect(renderToStaticMarkup(<Row label="fan3" value="740 RPM" note="" />).match(/<span/g)?.length).toBe(2);
  });

  /*
   * ⚠ §6.5's "already shown beside it" exception is a decision about WHICH rows to compose
   * together, made where the panel is assembled (step 10) — not a policy Row invents for
   * itself by looking at whether `value` happens to already be an em dash.
   */
  test('⚠ a note renders even beside a value that is already an em dash — Row does not suppress it', () => {
    const html = renderToStaticMarkup(
      <Row label="fan5" value={EM_DASH} severity={null} note="dell-smm: no pwm5 on hwmon dell_smm" />,
    );
    expect(html).toContain('dell-smm: no pwm5 on hwmon dell_smm');
  });

  test('rendered verbatim when given, alongside a real value', () => {
    const html = renderToStaticMarkup(<Row label="fan stopped:3" value="0 RPM" severity="alarm" note="since 14:02:11" />);
    expect(html).toContain('since 14:02:11');
  });
});

// ---------------------------------------------------------------------------------------
// 10e §2.0 — the mock's `chip(sev, state)`: when severity is given, the value becomes a
// Chip md PILL rather than plain text; without severity, it stays plain text.
// ---------------------------------------------------------------------------------------

describe('⚠ 10e — the value becomes a pill exactly when severity is given', () => {
  // ⚠ RENAMED BY 10e's TEST PHASE, 2026-09-09: the name said "(uppercase text-transform
  // hook)" and nothing here checks any text-transform — that is CSS, and `styles.test.ts` does
  // not cover it either. `data-size="md"` is the real, sound claim, so the name says that.
  test('⚠ severity present: the value renders inside a Chip md pill, not as bare text', () => {
    const html = renderToStaticMarkup(<Row label="ufw enforcing" value="yes" severity="normal" />);
    // `Chip` always renders its glyph and sr-only word alongside the label — a bare
    // `<span>{value}</span>` never would. Two Chips exist on this row (the sm glyph and the
    // md pill), so "normal" (the sr-only word) appears, and the visible label text is the
    // value, not a duplicate of the glyph's own accessible word.
    expect(html).toContain('class="sr-only"');
    expect(html).toContain('yes');
    expect(html).toContain('data-size="md"');
  });

  test('⚠ severity absent: the value stays plain text, never wrapped in a pill', () => {
    const html = renderToStaticMarkup(<Row label="link" value="up" />);
    expect(html).not.toContain('data-size="md"');
    expect(html).not.toContain('class="sr-only"');
  });

  test('⚠ severity={null} (no band) still renders the value as a pill, in the no-band hatch', () => {
    const html = renderToStaticMarkup(<Row label="mode" value="unavailable" severity={null} />);
    expect(html).toContain('data-size="md"');
    expect(html).toContain('data-severity="none"');
  });
});
