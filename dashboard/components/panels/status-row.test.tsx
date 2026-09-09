import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { EM_DASH } from '@/lib/format';

import { StatusRow } from './status-row';

/**
 * §6.2's `label · value · chip` line — every row on every panel. It began as a sibling of step
 * 9's `Row`, to colour its trailing note `--status-watch` for S-B's stale-age text without
 * touching that already-reconciled primitive; the owner ruled `Row` DELETED on 2026-09-09
 * (10e-Q12) once 10e had converted all seven of its call sites here, so this is now the only
 * row. See the component's own module doc.
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
const NOTE_MUTED_DELL_SMM = new RegExp('class="_note[^W"][^"]*"[^>]*>no hwmon named dell_smm<');

describe('§6.2/§6.5 — StatusRow', () => {
  test('label, value and note all render', () => {
    const html = renderToStaticMarkup(
      <StatusRow panel="safety" label="fan 5" value="4,308 RPM" note="last read 6:12 ago" />,
    );
    expect(html).toContain('fan 5');
    expect(html).toContain('4,308 RPM');
    expect(html).toContain('last read 6:12 ago');
  });

  test('⚠ noteTone="watch" renders the note under a DIFFERENT class than noteTone="muted"', () => {
    const classBeforeText = (html: string, text: string): string | undefined =>
      /class="([^"]*)"[^>]*>[^<]*$/.exec(html.slice(0, html.indexOf(text)))?.[1];

    const watch = renderToStaticMarkup(
      <StatusRow panel="safety" label="fan 5" value="—" note="last read 6:12 ago" noteTone="watch" />,
    );
    const muted = renderToStaticMarkup(
      <StatusRow panel="safety" label="fan 5" value="—" note="last read 6:12 ago" noteTone="muted" />,
    );
    const watchClass = classBeforeText(watch, 'last read 6:12 ago');
    const mutedClass = classBeforeText(muted, 'last read 6:12 ago');
    expect(watchClass).toBeDefined();
    expect(mutedClass).toBeDefined();
    expect(watchClass).not.toBe(mutedClass);
  });

  test('omitting severity renders no chip at all', () => {
    const html = renderToStaticMarkup(<StatusRow panel="safety" label="power" value="249.8 W" />);
    expect(html).not.toContain('data-severity');
  });

  test('⚠ severity={null} renders the explicit no-band chip, distinct from omitting it', () => {
    const html = renderToStaticMarkup(<StatusRow panel="safety" label="x" value="—" severity={null} />);
    // ⚠ Scoped to an exact COUNT, not a loose `toContain`: the row's own div, the left-edge
    // glyph (`Chip sm`) and the value pill (`Chip md`, §2.0) all carry `data-severity="none"`
    // when severity is explicitly null — three occurrences. A loose `toContain` cannot tell
    // "the glyph rendered" from "only the row div's own (strict-equality) attribute happens to
    // say none too" — the gap that let a real mutation (loosening the glyph's own guard to
    // `== null`) pass unnoticed (10b-SR2, 10e reconciliation).
    expect((html.match(/data-severity="none"/g) ?? []).length).toBe(3);
  });

  /*
   * ⚠ 10f/Q12 — the two properties PORTED from `row.test.tsx` when the owner ruled `Row`
   * deleted (2026-09-09). Every other ⚠ mark that file carried has an equivalent already on
   * this component (`10b-SR2` for `severity === undefined` vs `null`, `10e-SR4`/`SR5` for both
   * directions of the pill branch); these two did not, and a retirement that quietly drops a
   * property is exactly what the harness's retirement rule exists to prevent. Backed by
   * `10f-SR1` and `10f-SR2` in step 10's harness — this file's owner (ledger ownership follows
   * the FILE) — not by the step-9 ids they replace.
   */
  test('⚠ the value is never reformatted — an em dash passes straight through', () => {
    const html = renderToStaticMarkup(<StatusRow panel="safety" label="fan3" value={EM_DASH} />);
    expect(html).toContain(`>${EM_DASH}<`);
  });

  test('⚠ a detail renders even beside a value that is already an em dash — StatusRow does not suppress it', () => {
    // §6.5's "already shown beside it" exception is a decision about WHICH rows to compose
    // together, made where the panel is assembled — never a policy this component invents for
    // itself by looking at whether `value` happens to already be an em dash.
    const html = renderToStaticMarkup(
      <StatusRow panel="safety" label="fan5" value={EM_DASH} severity={null} detail="dell-smm: no pwm5 on hwmon dell_smm" />,
    );
    expect(html).toContain('dell-smm: no pwm5 on hwmon dell_smm');
  });

  test('a null/empty note renders no trailing note element at all', () => {
    const withNull = renderToStaticMarkup(<StatusRow panel="safety" label="x" value="—" note={null} />);
    const withEmpty = renderToStaticMarkup(<StatusRow panel="safety" label="x" value="—" note="" />);
    const withoutNote = renderToStaticMarkup(<StatusRow panel="safety" label="x" value="—" />);
    expect(withNull).toBe(withoutNote);
    expect(withEmpty).toBe(withoutNote);
  });
});

describe('⚠ §6.5/§3.7 — the stale age and the errors[] explanation are BOTH facts', () => {
  test('⚠ a row given both renders both, the age watch-toned and the explanation muted', () => {
    // `note={age ?? message}` displaced the explanation exactly when a source died — the case
    // that produces one (10b-reconcile, adversarial F3).
    const html = renderToStaticMarkup(
      <StatusRow panel="safety"
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
    // ⚠ 10f/Q1 re-aimed, NOT loosened: the detail span gained `role`/`tabindex`/`aria-label`
    // between its class and its text, so `class="_note…">` no longer sits against the message.
    // `[^>]*` spans the new attributes and the assertion still pins the CLASS — the muted one,
    // `_note` and not `_noteWatch`, which is the property this line is about.
    expect(html).toMatch(NOTE_MUTED_DELL_SMM);
  });

  test('an empty or absent detail renders no second element at all', () => {
    const bare = renderToStaticMarkup(<StatusRow panel="safety" label="fan 5" value="—" />);
    const empty = renderToStaticMarkup(<StatusRow panel="safety" label="fan 5" value="—" detail="" />);
    expect(bare).not.toMatch(/class="_note/);
    expect(empty).not.toMatch(/class="_note/);
  });
});

/**
 * ⚠ 10f/Q1 — `SPEC.md` §6.1's last ⚠ paragraph, ruled 2026-09-09: a row's `errors[]`
 * explanation is a **bounded scroll box**, because the text is the collector's own and nothing
 * capped it. This box's documented DKMS failure is 152 characters and measured **65.6 px** in
 * the 285 px SAFETY column against §2.11's 14.2 px budget; four explained SAFETY rows measured
 * **+143 px** and the page missed §6.1's fold.
 *
 * Two halves, and the render tests can only see one of them, so both are asserted here: the
 * MARKUP half (the well is a named, keyboard-reachable group) below, and the CSS half (the four
 * declarations that actually bound it) in the CSS-text test after it — `renderToStaticMarkup`
 * emits class names and lays nothing out, so `max-height` deleted from the stylesheet is
 * invisible to every other test in this file.
 */
describe('⚠ 10f/Q1 — the errors[] explanation is a bounded, reachable scroll box', () => {
  test('⚠ the detail well is a NAMED, keyboard-reachable group — a scroll box no one can scroll hides §3.7’s text', () => {
    const html = renderToStaticMarkup(
      <StatusRow panel="safety" label="DKMS for running kernel" value="no" severity="alarm" detail="/lib/modules/7.0.0-31-generic/updates/dkms: does not exist" />,
    );
    const at = html.indexOf('/lib/modules');
    const well = html.slice(html.lastIndexOf('<span', at), html.indexOf('</span>', at));
    expect(well).toContain('role="group"');
    expect(well).toContain('tabindex="0"');
    expect(well).toContain('aria-label="safety DKMS for running kernel explanation"');
  });

  test('⚠ 10f-A4/R1 — a MUTED note is a well too: named, reachable, and named DIFFERENTLY from detail', () => {
    // The muted branch had neither a test nor a mutation: `role`/`tabIndex`/`aria-label` could
    // be deleted from it with `pnpm verify` and all nine harnesses green, leaving a bounded box
    // whose scrolled-away text nothing could reach. No caller renders it today — every call
    // site passes `note` as S-B's age with `noteTone="watch"` — which is exactly why nothing
    // noticed. ⚠ And the two wells must not share a name: a row carrying BOTH would otherwise
    // put two identically-announced groups side by side (10f-A6).
    const html = renderToStaticMarkup(
      <StatusRow panel="safety" label="fan service" value="—" note="dbus: connection refused" noteTone="muted" detail="dkms: no module for 7.0.0-31-generic" />,
    );
    const wellAround = (text: string): string => {
      const at = html.indexOf(text);
      return html.slice(html.lastIndexOf('<span', at), html.indexOf('</span>', at));
    };
    const noteWell = wellAround('dbus: connection refused');
    expect(noteWell).toContain('role="group"');
    expect(noteWell).toContain('tabindex="0"');
    expect(noteWell).toContain('aria-label="safety fan service note"');
    expect(wellAround('dkms: no module')).toContain('aria-label="safety fan service explanation"');
  });

  test('⚠ 10f-A6 — the well carries the PANEL as well as the label: two panels have a `fan service` row', () => {
    // COOLING's `gpu-fan-control.service` row and SAFETY's own row are both labelled
    // `fan service` and both explained by `dbus` at the same time, so `${label} explanation`
    // named two different units identically on the degraded page (measured).
    const at = (panel: string): string => {
      const html = renderToStaticMarkup(
        <StatusRow panel={panel} label="fan service" value="—" severity="alarm" detail="dbus: connection refused" />,
      );
      return /aria-label="([^"]*)"/.exec(html)?.[1] ?? '';
    };
    expect(at('cooling')).toBe('cooling fan service explanation');
    expect(at('safety')).toBe('safety fan service explanation');
    expect(at('cooling')).not.toBe(at('safety'));
  });

  test('⚠ the WATCH-toned stale age is deliberately NOT a well — it is bounded by its own construction', () => {
    const html = renderToStaticMarkup(
      <StatusRow panel="safety" label="fan service" value="active" note="last read 6:12 ago" noteTone="watch" />,
    );
    const at = html.indexOf('last read 6:12 ago');
    const well = html.slice(html.lastIndexOf('<span', at), html.indexOf('</span>', at));
    expect(well).not.toContain('role="group"');
    expect(well).not.toContain('tabindex="0"');
  });

  test('⚠ .note is a bounded, positioned, border-box well — Q1, in CSS text', () => {
    const css = readFileSync(
      fileURLToPath(new URL('./status-row.module.css', import.meta.url)),
      'utf8',
      // Declarations only: a rule quoted inside a comment must not satisfy the guard.
    ).replace(/\/\*[\s\S]*?\*\//g, ' ');
    const note = css.slice(css.indexOf('.note {'), css.indexOf('}', css.indexOf('.note {')));

    // `max-height` bounds the PAGE; without it the row grows with the message's length.
    expect(note).toMatch(/max-height:\s*14px/);
    // ...and one line, not two: SAFETY carries four of these rows (see the stylesheet's sum).
    expect(note).not.toMatch(/max-height:\s*(?:2[0-9]|[3-9][0-9])px/);
    // `overflow-y` is what keeps the message WHOLE rather than truncated (§3.7).
    expect(note).toMatch(/overflow-y:\s*auto/);
    // `position` is what makes the box actually clip an absolutely-positioned descendant (10e-A1).
    expect(note).toMatch(/position:\s*relative/);
    // `border-box` is what puts the padding INSIDE the 14px rather than beside it.
    expect(note).toMatch(/box-sizing:\s*border-box/);
    // ⚠ 10f-A4/R5, 2026-09-09 — `overflow-wrap: anywhere` was asserted by neither CSS-text
    // test, and it is the declaration that keeps an unbroken 600-character path INSIDE the
    // well: measured overhang past the panel 0.0 px at all three viewports with it, and this
    // is the only rule providing it for a row's explanation.
    expect(note).toMatch(/overflow-wrap:\s*anywhere/);
    // Not vacuous: `.noteWatch` — the same shape minus the bound — really is left unbounded.
    const watch = css.slice(css.indexOf('.noteWatch {'), css.indexOf('}', css.indexOf('.noteWatch {')));
    expect(watch).not.toMatch(/max-height/);
    expect(watch).not.toMatch(/overflow-y/);
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
      <StatusRow panel="safety" label="llama-server@0" value="active" severity="normal" />,
    );
    expect(withExtras).not.toContain(':8080');
    expect(withExtras).not.toContain('qwen3.6-27b');
    expect(withExtras).not.toContain('health ok');
  });

  test('⚠ secondaryLabel renders right after the label, distinct from it', () => {
    const html = renderToStaticMarkup(
      <StatusRow panel="safety" label="llama-server@0" secondaryLabel=":8080" value="active" severity="normal" />,
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
      <StatusRow panel="safety" label="llama-server@0" inline="qwen3.6-27b · ctx 131,072" value="active" severity="normal" />,
    );
    expect(shown).toContain('qwen3.6-27b · ctx 131,072');

    const nullInline = renderToStaticMarkup(
      <StatusRow panel="safety" label="llama-server@0" inline={null} value="active" severity="normal" />,
    );
    const omitted = renderToStaticMarkup(<StatusRow panel="safety" label="llama-server@0" value="active" severity="normal" />);
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
      <StatusRow panel="safety" label="llama-server@0" endPrefix="health ok" value="active" severity="normal" />,
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
