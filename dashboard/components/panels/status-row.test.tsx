import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { StatusRow } from './status-row';

/**
 * `StatusRow` is `Row` plus one thing `Row` cannot do: colour its trailing note
 * `--status-watch` for S-B's stale-age text without touching step 9's own `row.module.css`.
 * See the component's own module doc for why it exists as a sibling rather than a `Row` edit.
 */

/**
 * ⚠ These are built with `new RegExp` over single-quoted strings rather than `/…/` literals,
 * and the reason is a real trap found by 10e's reconciliation (HANDOVER §0.9).
 * `lib/source-text.ts`'s `codeOnly` — the comment-stripper every `lib/*` guard runs over these
 * files — has no regex-literal state, so a regex containing an ODD number of `"` characters
 * leaves it stuck in string mode: it silently stops stripping comments for the rest of the
 * file, and a dangerous literal quoted in prose then reads as live code. `class="X[^"]*"` has
 * exactly three. A `'…'` string is read correctly whatever it contains.
 */
const NOTE_WATCH_AGE = new RegExp('class="_noteWatch[^"]*"[^>]*>last read 6:12 ago<');

describe('§6.2/§6.5 — StatusRow', () => {
  test('label, value and note all render', () => {
    const html = renderToStaticMarkup(
      <StatusRow label="fan 5" value="4,308 RPM" note="last read 6:12 ago" />,
    );
    expect(html).toContain('fan 5');
    expect(html).toContain('4,308 RPM');
    expect(html).toContain('last read 6:12 ago');
  });

  test('⚠ noteTone="watch" renders the note under a DIFFERENT class than noteTone="muted"', () => {
    const classBeforeText = (html: string, text: string): string | undefined =>
      /class="([^"]*)"[^>]*>[^<]*$/.exec(html.slice(0, html.indexOf(text)))?.[1];

    const watch = renderToStaticMarkup(
      <StatusRow label="fan 5" value="—" note="last read 6:12 ago" noteTone="watch" />,
    );
    const muted = renderToStaticMarkup(
      <StatusRow label="fan 5" value="—" note="last read 6:12 ago" noteTone="muted" />,
    );
    const watchClass = classBeforeText(watch, 'last read 6:12 ago');
    const mutedClass = classBeforeText(muted, 'last read 6:12 ago');
    expect(watchClass).toBeDefined();
    expect(mutedClass).toBeDefined();
    expect(watchClass).not.toBe(mutedClass);
  });

  test('omitting severity renders no chip at all', () => {
    const html = renderToStaticMarkup(<StatusRow label="power" value="249.8 W" />);
    expect(html).not.toContain('data-severity');
  });

  test('⚠ severity={null} renders the explicit no-band chip, distinct from omitting it', () => {
    const html = renderToStaticMarkup(<StatusRow label="x" value="—" severity={null} />);
    // ⚠ Scoped to an exact COUNT, not a loose `toContain`: the row's own div, the left-edge
    // glyph (`Chip sm`) and the value pill (`Chip md`, §2.0) all carry `data-severity="none"`
    // when severity is explicitly null — three occurrences. A loose `toContain` cannot tell
    // "the glyph rendered" from "only the row div's own (strict-equality) attribute happens to
    // say none too" — the gap that let a real mutation (loosening the glyph's own guard to
    // `== null`) pass unnoticed (10b-SR2, 10e reconciliation).
    expect((html.match(/data-severity="none"/g) ?? []).length).toBe(3);
  });

  test('a null/empty note renders no trailing note element at all', () => {
    const withNull = renderToStaticMarkup(<StatusRow label="x" value="—" note={null} />);
    const withEmpty = renderToStaticMarkup(<StatusRow label="x" value="—" note="" />);
    const withoutNote = renderToStaticMarkup(<StatusRow label="x" value="—" />);
    expect(withNull).toBe(withoutNote);
    expect(withEmpty).toBe(withoutNote);
  });
});

describe('⚠ §6.5/§3.7 — the stale age and the errors[] explanation are BOTH facts', () => {
  test('⚠ a row given both renders both, the age watch-toned and the explanation muted', () => {
    // `note={age ?? message}` displaced the explanation exactly when a source died — the case
    // that produces one (10b-reconcile, adversarial F3).
    const html = renderToStaticMarkup(
      <StatusRow
        label="fan 5"
        value="4,308 RPM"
        note="last read 6:12 ago"
        noteTone="watch"
        detail="no hwmon named dell_smm"
      />,
    );
    expect(html).toContain('last read 6:12 ago');
    expect(html).toContain('no hwmon named dell_smm');
    expect(html).toMatch(NOTE_WATCH_AGE);
    expect(html).toMatch(/class="_note[^W"][^"]*">no hwmon named dell_smm</);
  });

  test('an empty or absent detail renders no second element at all', () => {
    const bare = renderToStaticMarkup(<StatusRow label="fan 5" value="—" />);
    const empty = renderToStaticMarkup(<StatusRow label="fan 5" value="—" detail="" />);
    expect(bare).not.toMatch(/class="_note/);
    expect(empty).not.toMatch(/class="_note/);
  });
});

// ---------------------------------------------------------------------------------------
// 10e §2.7 — SERVING's three extra slots: a second name span, inline (non-full-width)
// supplementary text, and a prefix inside `.end` ahead of the value/pill. Every other caller
// (SAFETY, COOLING, STORAGE) omits all three, so their absence must change nothing.
// ---------------------------------------------------------------------------------------

describe('⚠ 10e §2.7 — secondaryLabel, inline and endPrefix (SERVING-only, optional)', () => {
  test('omitted entirely: none of the three render anything extra', () => {
    const withExtras = renderToStaticMarkup(
      <StatusRow label="llama-server@0" value="active" severity="normal" />,
    );
    expect(withExtras).not.toContain(':8080');
    expect(withExtras).not.toContain('qwen3.6-27b');
    expect(withExtras).not.toContain('health ok');
  });

  test('⚠ secondaryLabel renders right after the label, distinct from it', () => {
    const html = renderToStaticMarkup(
      <StatusRow label="llama-server@0" secondaryLabel=":8080" value="active" severity="normal" />,
    );
    expect(html).toContain('llama-server@0');
    expect(html).toContain(':8080');
    expect(html.indexOf('llama-server@0')).toBeLessThan(html.indexOf(':8080'));
  });

  // ⚠ 10e-test, 2026-09-09: this name used to read "without being null/empty-suppressed like
  // note" — the exact OPPOSITE of what the body asserts (`nullInline` must equal `omitted`,
  // i.e. it IS suppressed, by the same `shown()` helper `note`/`detail` use). What actually
  // distinguishes `inline` from `note` is CSS, not suppression: `inline` is never forced onto
  // its own full-width line. The mutation that backs this mark (`10e-SR2`) carried the same
  // wrong words and is renamed with it.
  test('⚠ inline renders the supplementary text, and null or empty renders nothing at all', () => {
    const shown = renderToStaticMarkup(
      <StatusRow label="llama-server@0" inline="qwen3.6-27b · ctx 131,072" value="active" severity="normal" />,
    );
    expect(shown).toContain('qwen3.6-27b · ctx 131,072');

    const nullInline = renderToStaticMarkup(
      <StatusRow label="llama-server@0" inline={null} value="active" severity="normal" />,
    );
    const omitted = renderToStaticMarkup(<StatusRow label="llama-server@0" value="active" severity="normal" />);
    expect(nullInline).toBe(omitted);
  });

  // ⚠ STRENGTHENED BY 10e's TEST PHASE, 2026-09-09. The body asserted only
  // `indexOf('health ok') < indexOf('active')`, which an implementation emitting `endPrefix`
  // at the START of the row also satisfies — so the name's "inside .end" was unproven, and
  // being inside `.end` is the entire reason the slot exists (`.end` is the `margin-left:auto`
  // group). The slice below starts at the `.end` span's own class (`_end_` cannot be confused
  // with `_endPrefix_`, which the module-proxy spells with the longer key).
  test('⚠ endPrefix renders inside .end, BEFORE the value pill', () => {
    const html = renderToStaticMarkup(
      <StatusRow label="llama-server@0" endPrefix="health ok" value="active" severity="normal" />,
    );
    expect(html).toContain('health ok');
    const endAt = html.indexOf('class="_end_');
    expect(endAt).toBeGreaterThan(-1);
    const end = html.slice(endAt);
    expect(end).toContain('health ok');
    expect(end.indexOf('health ok')).toBeLessThan(end.indexOf('active'));
    // ...and the label is OUTSIDE it, so the slice is really the trailing group.
    expect(end).not.toContain('llama-server@0');
  });
});
