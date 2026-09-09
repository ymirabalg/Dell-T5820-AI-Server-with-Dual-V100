import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { EM_DASH } from '@/lib/format';

import { Figure, Hero } from './hero';

/**
 * §6.1's dominant figure, as markup — the `renderToStaticMarkup` pattern every other
 * `components/` primitive uses. `Hero`/`Figure` are pure functions of already-formatted
 * `parts` (O14): neither formats a number, and neither ever sees a raw `Celsius`/`Rpm`/etc.
 */

describe('value and unit render verbatim, from a parts formatter', () => {
  test('a readable value renders both pieces', () => {
    const html = renderToStaticMarkup(<Hero value="66" unit="°C" severity="normal" />);
    expect(html).toContain('66');
    expect(html).toContain('°C');
  });

  test('⚠ zero is a real reading, drawn at the normal size, never the unavailable form', () => {
    const zero = renderToStaticMarkup(<Hero value="0" unit="RPM" severity="alarm" />);
    const known = renderToStaticMarkup(<Hero value="4,308" unit="RPM" severity="normal" />);
    const unknown = renderToStaticMarkup(<Hero value={EM_DASH} unit="RPM" severity={null} />);
    expect(zero).toContain('>0<');
    expect(zero).not.toContain(EM_DASH);
    // The class carrying "0" must be the NORMAL-size class — the same one a readable value
    // like 4,308 gets — never the hatched unavailable form's class. A falsy-looking string
    // ("0") is exactly where a naive `!value` check would misclassify it.
    const firstSpanClass = (html: string): string | undefined => /<span class="([^"]+)"/.exec(html)?.[1];
    expect(firstSpanClass(zero)).toBe(firstSpanClass(known));
    expect(firstSpanClass(zero)).not.toBe(firstSpanClass(unknown));
  });
});

describe('⚠ invariant 1 — an unavailable reading gets its own hatched form, not the normal one', () => {
  test('⚠ value=EM_DASH renders the unknown form; a readable value does not', () => {
    const unknown = renderToStaticMarkup(<Hero value={EM_DASH} unit="RPM" severity={null} />);
    const known = renderToStaticMarkup(<Hero value="4,308" unit="RPM" severity="normal" />);
    // The FIRST span in each render is the value element — a shared class between the two
    // would mean the hatch and the normal 34px form are the same rule, which is exactly the
    // ambiguity (`—` at the same weight as a real numeral) this form exists to avoid.
    const firstSpanClass = (html: string): string | undefined => /<span class="([^"]+)"/.exec(html)?.[1];
    const unknownClass = firstSpanClass(unknown);
    const knownClass = firstSpanClass(known);
    expect(unknownClass).toBeDefined();
    expect(knownClass).toBeDefined();
    expect(unknownClass).not.toBe(knownClass);
  });

  test('⚠ the unit still renders beside an unavailable value — it is a fact, not a reading', () => {
    const html = renderToStaticMarkup(<Hero value={EM_DASH} unit="RPM" severity={null} />);
    expect(html).toContain(EM_DASH);
    expect(html).toContain('RPM');
  });
});

describe('severity recolours the numeral only on watch/alarm', () => {
  test.each(['normal', null] as const)('%s carries data-severity but is otherwise unrecoloured by the API', (severity) => {
    const html = renderToStaticMarkup(<Hero value="66" unit="°C" severity={severity} />);
    expect(html).toContain(`data-severity="${severity ?? 'none'}"`);
  });

  // ⚠ NOT marked — no plausible wrong implementation is distinct from what `10e-H3` already
  // covers (`data-severity`'s `?? 'none'` fallback is the ONE line of logic in this component
  // that a severity value passes through at all); this is a corroborating fixture, not an
  // independent guard.
  test('alarm and watch both carry their own attribute, distinct from normal', () => {
    const alarm = renderToStaticMarkup(<Hero value="83" unit="°C" severity="alarm" />);
    const watch = renderToStaticMarkup(<Hero value="75" unit="°C" severity="watch" />);
    const normal = renderToStaticMarkup(<Hero value="66" unit="°C" severity="normal" />);
    expect(alarm).toContain('data-severity="alarm"');
    expect(watch).toContain('data-severity="watch"');
    expect(normal).toContain('data-severity="normal"');
    expect(alarm).not.toContain('data-severity="normal"');
    expect(watch).not.toContain('data-severity="normal"');
  });

  test('severity omitted defaults to the no-band attribute, never a claimed band', () => {
    const html = renderToStaticMarkup(<Hero value="—" unit="RPM" />);
    expect(html).toContain('data-severity="none"');
  });
});

describe('an optional accessible name', () => {
  // ⚠ 10e-A8, reconciliation. This used to assert the attribute alone, and the attribute alone
  // did NOTHING: a `<div>` with no role maps to ARIA's `generic`, for which *ARIA in HTML*
  // lists `aria-label` as PROHIBITED — assistive technology is not required to expose it and
  // generally does not (axe-core's `aria-prohibited-attr`). Two mutations were reddening a
  // test that defended an inert attribute, which reads as coverage. The name and the role must
  // be asserted together or the guard is back where it started.
  test('⚠ rendered as aria-label AND a role that permits naming — the attribute is inert without one', () => {
    const html = renderToStaticMarkup(<Hero value="66" unit="°C" severity="normal" ariaLabel="GPU 0 temperature" />);
    expect(html).toContain('aria-label="GPU 0 temperature"');
    expect(html).toContain('role="group"');
    // `group`, not `img`: `img` would replace the figure's own numeral and unit with the label.
    expect(html).not.toContain('role="img"');
    // Both on the SAME element, not the label on the div and the role on a child.
    expect(html).toMatch(/<div[^>]*role="group"[^>]*aria-label="GPU 0 temperature"[^>]*>/);
  });

  test('⚠ omitted by default — no aria-label AND no role, rather than a role naming nothing', () => {
    const html = renderToStaticMarkup(<Hero value="66" unit="°C" severity="normal" />);
    expect(html).not.toContain('aria-label');
    expect(html).not.toContain('role=');
  });
});

describe('Figure — the GPU hero row’s power block', () => {
  // ⚠ STRENGTHENED BY 10e's TEST PHASE, 2026-09-09 — HANDOVER §0.4's shape, TENTH instance,
  // and the first one found in a file this loop created. `toContain('W')` was satisfied by the
  // CAPTION's own `cap 250.0 W`: deleting `<span className={styles.figureUnit}>{unit}</span>`
  // from `hero.tsx` left this test green while its name claims the unit renders. Measured, not
  // argued — the needle occurs twice in a 206-character subject. `>W<` can only be the unit's
  // own element, matching the `>0<`/`>55<` form the rest of this loop adopted.
  test('value, unit and an optional caption all render verbatim', () => {
    const html = renderToStaticMarkup(<Figure value="231.0" unit="W" caption="cap 250.0 W" />);
    expect(html).toContain('>231.0<');
    expect(html).toContain('>W<');
    expect(html).toContain('cap 250.0 W');
  });

  test('no caption element at all when omitted', () => {
    const html = renderToStaticMarkup(<Figure value="231.0" unit="W" />);
    expect(html).not.toContain('cap ');
    expect(html).not.toContain('<p');
  });
});
