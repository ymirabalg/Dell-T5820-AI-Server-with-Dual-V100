/**
 * 10b-F1-guard (HANDOVER §9) — the mechanical half of *"a document-wide `toContain` is a weak
 * assertion wearing a strong name."* Four loops shipped one inert assertion apiece, all the
 * same shape: `expect(html).toContain(X)` where `html` is an ENTIRE rendered document and `X`
 * is a value the document produces from more than one place — `toContain('paused')` satisfied
 * by `data-mode="paused"`, `toContain('refresh')` satisfied by the cadence control's own
 * "refresh cadence" label, `toContain('—')` satisfied by `Chip`'s own no-band glyph, and
 * `toContain('data-severity="none"')` the same way. HANDOVER §0.4's rule: *"assert over the
 * element that carries the claim, never over the document that contains it."*
 *
 * ### The rule this file enforces, stated precisely (read this before extending it)
 *
 * A whole-document `toContain` is NOT flagged just because it is whole-document — the
 * candidate discriminator SCOPE.md offers ("subject is `renderToStaticMarkup(...)`
 * unscoped") has an unusably high false-positive rate on this tree: 198 such calls exist
 * today and the overwhelming majority are sound (a primitive rendered alone, so the "whole
 * document" IS the element under test; or a smoke test whose own name says it is checking
 * for a thrown exception, not a specific reading). Flagging all of them would be exactly the
 * failure this loop's own defect class warns about — a lint the next person silences.
 *
 * So this guard narrows on BOTH axes at once, and each is load-bearing on its own:
 *
 * 1. **Scope: composite panels only.** A `data-severity` attribute or the {@link EM_DASH}
 *    glyph is dangerous to check unscoped only where MORE THAN ONE independently-computed
 *    element in the same render can carry it. That is exactly what `PanelShell` creates:
 *    every panel that imports it renders a HEAD chip (`<section data-severity={chip}>`)
 *    that is a REDUCTION over its children's own leaf severities, so the head and a leaf can
 *    independently succeed or fail — the CPU-panel proof below shows the head alone can mask
 *    a broken leaf. A primitive rendered by itself (`Chip`, `Meter`, `Row`, `StatusRow`,
 *    `PanelShell` itself, `Header` — which stamps `data-severity` in exactly one place, its
 *    aggregate dot) has no second element to be confused with, so whole-document IS
 *    element-scoped there. This is computed by WALKING `components/panels/*.tsx` and
 *    checking each file's own import line for `panel-shell` — never a hand-typed file list
 *    (ANCHOR §7's "a guard over a hard-coded list is defeated by adding a file", one more
 *    time), so a tenth panel added later is covered automatically as long as it too composes
 *    through `PanelShell`.
 * 2. **Shape: two proven-dangerous literals, not any string.** `data-severity="…"` (bare,
 *    the WHOLE argument) and the bare {@link EM_DASH} glyph (optionally wrapped in a single
 *    matching HTML tag or a couple of bracket characters, since `` `<td>${EM_DASH}</td>` ``
 *    and `` `>${EM_DASH}<` `` are the two live spellings). A string that adds real content
 *    around either — `'paused · 6 alarms'`, `'— / 61.0 GiB'` — is specific enough that this
 *    guard does not touch it; that specificity is *why* those two are safe today, and is
 *    what the ORIGINAL bugs lacked.
 *
 * ### What survives both narrowings and is still exempted: the "does not throw" smoke test
 *
 * Every panel has a `'before the first poll, … renders — rather than throwing'`-shaped test
 * (`emptyState()`, nothing readable). Its own name states the claim: prove the component does
 * not throw on an all-null snapshot, not that one particular field is blank — `EM_DASH`
 * appearing ANYWHERE is sufficient evidence nothing crashed, which whole-document `toContain`
 * answers correctly. Exempted by checking the OWNING test's name for `'throwing'` — a
 * mechanical, visible marker rather than a silent carve-out.
 *
 * ⚠ **NARROWED 2026-09-08 by 10c-2's RECONCILIATION (adversarial F10): the exemption now
 * applies ONLY to an em-dash literal, never to `data-severity`.** Its justification is "an em
 * dash anywhere proves nothing crashed" — which says nothing about a BAND — while the
 * exemption itself attached to the whole test BODY. That was not hypothetical:
 * `safety-panel.test.tsx`'s `'every row renders — rather than throwing, **and the three total
 * checks read watch**'` carried an unscoped `toContain('data-severity="watch"')` that
 * `SafetyPanel`'s own head chip satisfied by itself, so the second half of the test's name was
 * never asserted. Narrowing the exemption found it; it is now scoped to the three rows.
 *
 * ### What this guard reads that it used to skip (10c-2's reconciliation, adversarial F1/F10)
 *
 * - The bare `EM_DASH` **identifier** — the project's own live idiom
 *   (`components/sparkline.test.tsx:217`) — and any file-local `const NAME = '<literal>'`, both
 *   resolved before classification. Either shape used to return `null` and be dropped in
 *   silence, which is the WORST outcome: bypassed AND unreported.
 * - An argument it still cannot evaluate is now COUNTED and named
 *   ({@link unreadableToContainArguments}), asserted zero across the composite panels. The
 *   sibling guard in this same loop already counted what it could not read
 *   (`dynamicAccessCount`); this one had the opposite policy and did not say so.
 * - `let`-bound renders and `expect.soft(...)`, two one-word bypasses.
 *
 * ### The eight real hits this guard found on 2026-09-08, and how each was closed
 *
 * `cpu-panel.test.tsx`, `memory-panel.test.tsx` (×2), `safety-panel.test.tsx`,
 * `storage-network-panel.test.tsx` (×2), `serving-panel.test.tsx` and
 * `session-event-log-panel.test.tsx` each had one whole-document check of exactly this shape;
 * all eight are now scoped to the row/meter/entry that carries the claim (most files already
 * had a `rowContaining`/`rootMeterOf`-style helper defined for a DIFFERENT test in the same
 * file and simply had not used it here — see each file's own diff). The CPU one is proven
 * live below by direct mutation (`10c2-1`); the other seven are the identical mechanism,
 * confirmed by reading each panel's source rather than by a from-scratch mutation each
 * (`10c2-build.md` §1 has the per-file reasoning).
 *
 * ### What this guard CANNOT catch — stated once, honestly
 *
 * - ⚠ **CORRECTED 2026-09-08 by 10c-2's test phase — this is not a hypothetical third case,
 *   it is TWO of the four founding failures, already realised, and this guard does not close
 *   them.** A bare non-attribute WORD — `'paused'`, `'refresh'` — is the exact shape of the
 *   first two bugs named in this file's own opening paragraph, both in `components/header.tsx`
 *   / `header.test.tsx` (confirmed 2026-09-08: neither imports `panel-shell`, and both live
 *   outside `components/panels/` entirely, so they are excluded from this guard TWICE
 *   over — by directory scope, via {@link compositePanelSourceFiles}'s `readdirSync`, which
 *   never walks `components/` itself; and independently by vocabulary, since
 *   `isDangerousLiteral('paused')` and `isDangerousLiteral('refresh')` are both `false` — a
 *   bare word matches neither `DATA_SEVERITY` nor either em-dash pattern). Both are fixed on
 *   TODAY'S tree (`header.test.tsx` now asserts the literal joined string), but nothing stops
 *   either shape from regressing, in `header.test.tsx` or a tenth panel's test file, and this
 *   guard would report clean either way. A bare `data-role="…"`/`data-mode="…"` attribute IS a
 *   genuinely un-bitten third case and remains out of scope for the false-positive reason
 *   below; do not conflate the two — one is proven-dangerous and already excluded, the other is
 *   merely plausible. It is a closed, two-member vocabulary by design, not a general "any
 *   attribute"/"any bare word" lint, because the general version's false-positive rate on this
 *   tree is prohibitive (`role="alert"`, `class="sr-only"`, `aria-hidden="true"` and a dozen
 *   more all appear as legitimate whole-document checks today) — the trade-off is defensible,
 *   but it means this guard is a partial answer to §0.4/§0.5's "toContain is weak" pattern, not
 *   the general fix its name and this loop's framing can otherwise suggest.
 *
 *   ⚠ **AND THE BOUND ABOVE IS NARROWER THAN IT SOUNDS — corrected 2026-09-08 by 10c-2's
 *   RECONCILIATION (adversarial F7, MEASURED).** "The general version's false-positive rate is
 *   prohibitive" is true of a SOURCE LINT and false in general. Overriding `toContain` in a
 *   vitest setup file and flagging *"the needle occurs MORE THAN ONCE in the subject"* catches
 *   **all four** founding failures, not two (`'paused'` ×2 in a paused header, `'refresh'` ×3
 *   in every header render, both em-dash shapes ≥2), at a measured **43/454 calls (9.5 %)**
 *   across `components/` — 7 of them already covered by the `"throwing"` rule, leaving 36,
 *   against the 198 the source-lint discriminator would have flagged. It is a runtime rule (it
 *   sees only the fixtures the suite renders) and it needs its own mutation coverage and a
 *   staged report-then-gate adoption, which is why it is a DEFERRED work item and not part of
 *   this file — see `HANDOVER.md`. Do not repeat "the bare-word case cannot be mechanised": it
 *   cannot be mechanised HERE, at ~9.5 % adjudication cost elsewhere.
 * - A composite render reached through a component that does NOT itself import
 *   `panel-shell` but assembles one that does — `app/dashboard-shell.tsx` renders all nine
 *   panels together (the single most dangerous multi-carrier context in the project) and is
 *   OUT of this guard's scope, because it imports panel COMPONENTS, not `PanelShell`
 *   directly. Untested today only because `dashboard-shell.ssr.test.tsx` happens not to
 *   assert either literal shape; the gap is real and is recorded rather than silently
 *   accepted (invariant 7).
 * - A single-fixture false negative in the other direction: a test built with only one
 *   subject in play (`serving-panel.test.tsx`'s identity-only-instance fixture,
 *   `session-event-log-panel.test.tsx`'s one-entry fixture, both scoped anyway here for
 *   cleanliness) cannot be told apart, BY SHAPE, from a two-subject fixture that is
 *   genuinely ambiguous — the guard flags both alike, and only reading the fixture answers
 *   which.
 * - Duplicate-occurrence bugs that do not use either literal at all (HANDOVER §0.5's
 *   `namesInstance`-printed-twice finding) — that is `toContain`'s more general "cannot
 *   count" weakness, unrelated to which literal is checked, and is a different guard.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { EM_DASH } from './format';
import { codeOnly, projectRoot } from './source-text';

const PANELS_DIR = join(projectRoot, 'components/panels');

/**
 * `components/panels/*.tsx` (non-test) that import `PanelShell` — computed by reading every
 * file's own text, never a hand-typed list. Sorted so the reported order is stable.
 */
export function compositePanelSourceFiles(): string[] {
  return readdirSync(PANELS_DIR)
    .filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))
    .filter((f) => /from\s+['"][^'"]*panel-shell['"]/.test(readFileSync(join(PANELS_DIR, f), 'utf8')))
    .sort();
}

const DATA_SEVERITY = /^data-severity="(?:normal|watch|alarm|none)"$/;
const BARE_DASH = /^[<>]{0,2}—[<>]{0,2}$/;
const TAG_WRAPPED_DASH = /^<([a-zA-Z][\w-]*)(?:\s[^<>]*)?>—<\/\1>$/;
/** `` `…${EM_DASH}…` `` with exactly one interpolation, itself the bare `EM_DASH` identifier. */
const TEMPLATE_EM_DASH = /^`([^`$]*)\$\{\s*EM_DASH\s*\}([^`$]*)`$/;

/**
 * Identifiers whose string value this guard knows without reading the file that defines them.
 *
 * ⚠ **Added by 10c-2's RECONCILIATION (adversarial F1).** `expect(html).toContain(EM_DASH)` —
 * the project's OWN live idiom (`components/sparkline.test.tsx:217`) — returned `null` from
 * {@link literalContent} and was therefore bypassed AND not reported. The value is imported
 * from `lib/format.ts` rather than spelled here, so it cannot drift from the glyph the
 * components actually render.
 */
const KNOWN_LITERAL_IDENTIFIERS: ReadonlyMap<string, string> = new Map([['EM_DASH', EM_DASH]]);

/**
 * The literal string content a `toContain` argument would render, if this guard can work it
 * out statically — a plain quoted string, a template literal whose only interpolation is
 * `EM_DASH`, or an identifier whose value is known (`EM_DASH`, plus any file-local
 * `const NAME = '<literal>'` the caller passes in). Anything else (a computed template, a
 * helper call) returns `null`: this guard is a NECESSARY-condition text lint, not a partial
 * evaluator — but a call it cannot read is now COUNTED as unreadable rather than dropped in
 * silence, see {@link unreadableToContainArguments}.
 */
export function literalContent(
  arg: string,
  constants: ReadonlyMap<string, string> = KNOWN_LITERAL_IDENTIFIERS,
): string | null {
  const trimmed = arg.trim();
  if (trimmed.length >= 2 && (trimmed[0] === "'" || trimmed[0] === '"') && trimmed.at(-1) === trimmed[0]) {
    return trimmed.slice(1, -1);
  }
  const m = TEMPLATE_EM_DASH.exec(trimmed);
  if (m) return `${m[1]}—${m[2]}`;
  return constants.get(trimmed) ?? null;
}

/** `'data-severity="alarm"'` or a bare/tag-wrapped em dash — the two proven-dangerous shapes. */
export function isDangerousLiteral(content: string): boolean {
  return DATA_SEVERITY.test(content) || BARE_DASH.test(content) || TAG_WRAPPED_DASH.test(content);
}

/** The em-dash half of the vocabulary — the only half the `"throwing"` exemption can defend. */
function isEmDashLiteral(content: string): boolean {
  return BARE_DASH.test(content) || TAG_WRAPPED_DASH.test(content);
}

/** The text of the argument list starting just after an already-consumed `(`. Paren/quote
 *  balanced, same discipline as `lib/guardrails.test.ts`'s `lastArgumentOf`. */
function firstArgumentOf(text: string, openParenEnd: number): string {
  let depth = 1;
  let i = openParenEnd;
  while (i < text.length && depth > 0) {
    const ch = text[i];
    if (ch === '(' || ch === '{' || ch === '[') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(openParenEnd, i);
    } else if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < text.length) {
        if (text[i] === '\\') i += 1;
        else if (text[i] === quote) break;
        i += 1;
      }
    }
    i += 1;
  }
  return text.slice(openParenEnd, i);
}

interface Hit {
  readonly line: number;
  readonly literal: string;
}

interface Scan {
  readonly hits: Hit[];
  /** Whole-document `toContain` arguments this guard could not evaluate — reported, never
   *  silently passed. Mirrors `dangling-css-class.test.ts`'s `dynamicAccessCount`. */
  readonly unreadable: { readonly line: number; readonly argument: string }[];
}

/**
 * Every `expect(<var>).toContain(<literal>)` / `expect.soft(...)` — `<var>` bound directly to a
 * top-level `const`/`let` `renderToStaticMarkup(...)`, or the inline
 * `expect(renderToStaticMarkup(...)).toContain(…)` form — whose literal is one of the two
 * dangerous shapes, plus the arguments it could not read at all.
 *
 * ⚠ **Three changes by 10c-2's RECONCILIATION.** (F1) file-local `const NAME = '<literal>'`
 * bindings and the imported `EM_DASH` identifier are now resolved, and unreadable arguments are
 * COUNTED rather than dropped — the sibling guard in this same loop already counted what it
 * could not read, and this one applied the opposite policy without saying so. (F10) `let` and
 * `expect.soft` are accepted, two one-word bypasses. (F10) the `"throwing"` exemption now
 * applies ONLY to an em-dash literal: its justification is "any em dash anywhere proves nothing
 * crashed", which says nothing about `data-severity`, and the exemption attaches to a whole
 * test body — so `'a paused dashboard renders the alarm band without throwing'` would have
 * exempted a genuine band check.
 *
 * Operates on `codeOnly(text)` throughout so a comment quoting the dangerous shape — this
 * very file does, in its own module doc above — is never mistaken for a live call. This is
 * 10a's F3 lesson (in-comment matches are the recurring false-positive source) applied here.
 */
export function scanWholeDocumentChecks(rawText: string): Scan {
  const text = codeOnly(rawText);
  const hits: Hit[] = [];
  const unreadable: { line: number; argument: string }[] = [];

  // Every `test('name', …)`/`it('name', …)` call's start offset and name, in file order —
  // used only to find the nearest ENCLOSING test for a hit (files here never nest tests).
  const testStarts: { at: number; name: string }[] = [];
  const TEST_CALL = /\b(?:test|it)\s*\(\s*(['"])((?:\\.|(?!\1).)*)\1/g;
  for (const m of text.matchAll(TEST_CALL)) {
    testStarts.push({ at: m.index ?? 0, name: m[2] ?? '' });
  }
  const ownerOf = (pos: number): string => {
    let owner = '';
    for (const t of testStarts) {
      if (t.at > pos) break;
      owner = t.name;
    }
    return owner;
  };

  const constants = new Map(KNOWN_LITERAL_IDENTIFIERS);
  for (const m of text.matchAll(/\bconst\s+(\w+)\s*=\s*(['"])((?:\\.|(?!\2).)*)\2\s*;/g)) {
    if (m[1] !== undefined && m[3] !== undefined) constants.set(m[1], m[3]);
  }

  const wholeDocVars = new Set<string>();
  for (const m of text.matchAll(/\b(?:const|let)\s+(\w+)\s*=\s*renderToStaticMarkup\s*\(/g)) {
    if (m[1]) wholeDocVars.add(m[1]);
  }

  const lineOf = (at: number): number => rawText.slice(0, at).split('\n').length;

  const record = (matchStart: number, argStart: number): void => {
    const arg = firstArgumentOf(text, argStart);
    const content = literalContent(arg, constants);
    if (content === null) {
      unreadable.push({ line: lineOf(matchStart), argument: arg.trim() });
      return;
    }
    if (!isDangerousLiteral(content)) return;
    if (isEmDashLiteral(content) && ownerOf(matchStart).toLowerCase().includes('throwing')) return;
    hits.push({ line: lineOf(matchStart), literal: content });
  };

  for (const m of text.matchAll(/\bexpect(?:\.soft)?\(\s*(\w+)\s*\)\.toContain\(/g)) {
    if (m[1] !== undefined && wholeDocVars.has(m[1])) record(m.index ?? 0, m.index! + m[0].length);
  }
  for (const m of text.matchAll(/\bexpect(?:\.soft)?\(\s*renderToStaticMarkup\(/g)) {
    // Skip the balanced renderToStaticMarkup(...) call, then require `).toContain(`.
    // `innerArgStart` is one past that call's OWN `(`; `firstArgumentOf` returns the text up
    // to (not including) its matching `)`, so the `)` itself sits at `innerArgStart + len`.
    const innerArgStart = (m.index ?? 0) + m[0].length;
    const innerArgLen = firstArgumentOf(text, innerArgStart).length;
    const after = innerArgStart + innerArgLen + 1; // one past renderToStaticMarkup(...)'s `)`
    const tail = /^\)\.toContain\(/.exec(text.slice(after));
    if (tail) record(m.index ?? 0, after + tail[0].length);
  }

  hits.sort((a, b) => a.line - b.line);
  unreadable.sort((a, b) => a.line - b.line);
  return { hits, unreadable };
}

/** The dangerous hits alone — the shape every existing caller and fixture expects. */
export function dangerousWholeDocumentChecks(rawText: string): Hit[] {
  return scanWholeDocumentChecks(rawText).hits;
}

/** Whole-document `toContain` arguments this guard could not evaluate (Q1's "report what you
 *  cannot read" rule, applied to the same class of input the sibling CSS guard reports). */
export function unreadableToContainArguments(rawText: string): { line: number; argument: string }[] {
  return scanWholeDocumentChecks(rawText).unreadable;
}

describe('⚠ 10b-F1-guard — no whole-document toContain of the two proven-dangerous shapes', () => {
  /**
   * ⚠ **Strengthened by 10c-2's RECONCILIATION (adversarial F8).** The floor and the named
   * member used to live in a FIXTURE test at the bottom of this file, which the adversarial
   * correctly called "an accident of style, not a designed defence" — this file happened to be
   * the strongest of the four nets for a reason nobody had written down. It is written down now
   * and it is in the net itself.
   */
  test('composite panels actually exist to check — a guard over an empty list proves nothing', () => {
    const composites = compositePanelSourceFiles();
    expect(composites.length).toBeGreaterThanOrEqual(8);
    expect(composites).toContain('cpu-panel.tsx');
  });

  test.each(compositePanelSourceFiles())(
    '⚠ every data-severity/em-dash check in %s is scoped past its PanelShell head',
    (sourceFile) => {
      const testFile = sourceFile.replace(/\.tsx$/, '.test.tsx');
      const text = readFileSync(join(PANELS_DIR, testFile), 'utf8');
      const hits = dangerousWholeDocumentChecks(text);
      expect(hits, JSON.stringify(hits)).toEqual([]);
    },
  );

  /**
   * ⚠ **Added by 10c-2's RECONCILIATION (adversarial F1).** Q1's rule — *a scanner must REPORT
   * what it cannot read rather than silently pass it* — was already obeyed by this loop's
   * sibling CSS guard (`dynamicAccessCount`) and quietly inverted here: an argument
   * {@link literalContent} could not evaluate was dropped without a word. Today's tree has
   * none, which is exactly when the strict version is cheapest to adopt: a future
   * `expect(html).toContain(SOME_HELPER())` fails HERE, naming itself, instead of being
   * bypassed in silence.
   */
  test('no whole-document toContain argument is unreadable to this guard', () => {
    const unreadable = compositePanelSourceFiles().flatMap((sourceFile) => {
      const testFile = sourceFile.replace(/\.tsx$/, '.test.tsx');
      const text = readFileSync(join(PANELS_DIR, testFile), 'utf8');
      return unreadableToContainArguments(text).map((u) => `${testFile}:${u.line} ${u.argument}`);
    });
    expect(unreadable, unreadable.join(' | ')).toEqual([]);
  });
});

/*
 * ⚠ The guard's own vocabulary, both directions (HANDOVER §5.1) — the classifier is the guard;
 * an untested classifier is an untested guard wearing a describe block.
 */
describe('⚠ isDangerousLiteral matches the two proven shapes and nothing else', () => {
  test.each([
    'data-severity="normal"',
    'data-severity="watch"',
    'data-severity="alarm"',
    'data-severity="none"',
    '—',
    '>—<',
    '<td>—</td>',
    '<span>—</span>',
  ])('dangerous: %s', (content) => {
    expect(isDangerousLiteral(content)).toBe(true);
  });

  test.each([
    'data-severity="ALARM"', // wrong case is a different literal, not the one the bug used
    'data-size="md"', // a real attribute this project checks whole-document, safely
    '— / 61.0 GiB', // specificity added around the dash is exactly the fix, not the bug
    'paused · 6 alarms',
    '<td>0 u</td>',
    '<div>—</div><div>x</div>', // more than the dash alone
    '',
  ])('not dangerous: %s', (content) => {
    expect(isDangerousLiteral(content)).toBe(false);
  });
});

describe('⚠ literalContent evaluates a plain string and an EM_DASH-only template, nothing else', () => {
  test('a single-quoted string', () => {
    expect(literalContent("'data-severity=\"alarm\"'")).toBe('data-severity="alarm"');
  });
  test('a double-quoted string', () => {
    expect(literalContent('"—"')).toBe('—');
  });
  test('a template with exactly one ${EM_DASH} interpolation', () => {
    expect(literalContent('`>${EM_DASH}<`')).toBe('>—<');
    expect(literalContent('`<td>${EM_DASH}</td>`')).toBe('<td>—</td>');
  });
  test('a template interpolating anything else is not evaluated — reported as unreadable, not misread', () => {
    expect(literalContent('`>${word}<`')).toBeNull();
    expect(literalContent('`${total} active alarm${total === 1 ? \'\' : \'s\'}`')).toBeNull();
  });
  test('a bare identifier is not a literal', () => {
    expect(literalContent('r.label')).toBeNull();
  });
});

/*
 * ⚠ The "throwing" exemption and the composite-scope walk, each proven by a fixture rather
 * than assumed — HANDOVER §5.1 again, at the level of `dangerousWholeDocumentChecks` itself
 * rather than only its two sub-predicates.
 */
describe('⚠ dangerousWholeDocumentChecks — scope and exemption, proven by fixture', () => {
  test('a bare data-severity check on a var-bound render is flagged', () => {
    const src = `
      test('a real band', () => {
        const html = renderToStaticMarkup(<X />);
        expect(html).toContain('data-severity="alarm"');
      });
    `;
    expect(dangerousWholeDocumentChecks(src)).toEqual([{ line: 4, literal: 'data-severity="alarm"' }]);
  });

  test('the identical check is flagged in the inline renderToStaticMarkup(...) form too', () => {
    const src = `
      test('a real band', () => {
        expect(renderToStaticMarkup(<X severity="alarm" />)).toContain('data-severity="alarm"');
      });
    `;
    expect(dangerousWholeDocumentChecks(src)).toEqual([{ line: 3, literal: 'data-severity="alarm"' }]);
  });

  test('a test whose name contains "throwing" is exempt', () => {
    const src = `
      test('before the first poll, renders — rather than throwing', () => {
        const html = renderToStaticMarkup(<X />);
        expect(html).toContain('—');
      });
    `;
    expect(dangerousWholeDocumentChecks(src)).toEqual([]);
  });

  test('a specific, non-bare literal is never flagged, inside or outside a throwing test', () => {
    const src = `
      test('a real band', () => {
        const html = renderToStaticMarkup(<X />);
        expect(html).toContain('paused · 6 alarms');
        expect(html).toContain('— / 61.0 GiB');
      });
    `;
    expect(dangerousWholeDocumentChecks(src)).toEqual([]);
  });

  test('a scoped assertion (over a slice, not the render var) is never flagged', () => {
    const src = `
      test('a real band', () => {
        const html = renderToStaticMarkup(<X />);
        const row = rowContaining(html, 'temperature');
        expect(row).toContain('data-severity="alarm"');
      });
    `;
    expect(dangerousWholeDocumentChecks(src)).toEqual([]);
  });

  test('a match inside a comment is never flagged — the 10a F3 lesson, at this guard', () => {
    const src = `
      test('a real band', () => {
        const html = renderToStaticMarkup(<X />);
        // expect(html).toContain('data-severity="alarm"') — the OLD, wrong version
        expect(html).toContain('the real value');
      });
    `;
    expect(dangerousWholeDocumentChecks(src)).toEqual([]);
  });

  test('compositePanelSourceFiles finds PanelShell importers by walking, not a fixed count', () => {
    // All eight of today's non-primitive panel bodies import PanelShell, including
    // `session-event-log-panel.tsx` — its own head chip is a hardcoded `null` (no §6.3 band
    // for this panel), but it still renders THROUGH PanelShell, so it is still in scope: a
    // future edit that gave it a real chip would need no change here to be covered.
    expect(compositePanelSourceFiles().length).toBeGreaterThanOrEqual(8);
    expect(compositePanelSourceFiles()).toContain('cpu-panel.tsx');
    expect(compositePanelSourceFiles()).not.toContain('status-row.tsx'); // a primitive, no PanelShell
  });
});

/*
 * ⚠ Added by 10c-2's RECONCILIATION — the four bypasses closed (adversarial F1, F10) and the
 * one policy change, each with the negative that keeps it honest.
 */
describe('⚠ the identifier bypasses — a bare EM_DASH and a hoisted constant', () => {
  test('a bare EM_DASH identifier is resolved and flagged — the project’s own live idiom', () => {
    const src = `
      test('a null reading', () => {
        const html = renderToStaticMarkup(<X />);
        expect(html).toContain(EM_DASH);
      });
    `;
    expect(dangerousWholeDocumentChecks(src)).toEqual([{ line: 4, literal: '—' }]);
  });

  test('a hoisted const literal is resolved and flagged', () => {
    const src = `
      const ALARM = 'data-severity="alarm"';
      test('a real band', () => {
        const html = renderToStaticMarkup(<X />);
        expect(html).toContain(ALARM);
      });
    `;
    expect(dangerousWholeDocumentChecks(src)).toEqual([{ line: 5, literal: 'data-severity="alarm"' }]);
  });

  test('a hoisted const holding a SPECIFIC string is still not dangerous', () => {
    const src = `
      const LABEL = 'paused · 6 alarms';
      test('a real band', () => {
        const html = renderToStaticMarkup(<X />);
        expect(html).toContain(LABEL);
      });
    `;
    expect(dangerousWholeDocumentChecks(src)).toEqual([]);
  });

  test('an argument this guard cannot evaluate is REPORTED, not silently dropped', () => {
    const src = `
      test('a real band', () => {
        const html = renderToStaticMarkup(<X />);
        expect(html).toContain(bandFor(row));
      });
    `;
    expect(dangerousWholeDocumentChecks(src)).toEqual([]);
    expect(unreadableToContainArguments(src)).toEqual([{ line: 4, argument: 'bandFor(row)' }]);
  });
});

describe('⚠ the binding and matcher bypasses, and the narrowed "throwing" exemption', () => {
  test('a let-bound render is in scope, not only a const-bound one', () => {
    const src = `
      test('a real band', () => {
        let html = renderToStaticMarkup(<X />);
        expect(html).toContain('data-severity="alarm"');
      });
    `;
    expect(dangerousWholeDocumentChecks(src)).toEqual([{ line: 4, literal: 'data-severity="alarm"' }]);
  });

  test('expect.soft is the same assertion and is in scope too', () => {
    const src = `
      test('a real band', () => {
        const html = renderToStaticMarkup(<X />);
        expect.soft(html).toContain('data-severity="alarm"');
      });
    `;
    expect(dangerousWholeDocumentChecks(src)).toEqual([{ line: 4, literal: 'data-severity="alarm"' }]);
  });

  test('the "throwing" exemption no longer covers a BAND check hidden in a smoke test', () => {
    // The exemption's justification is "an em dash anywhere proves nothing crashed". It says
    // nothing about a severity band — and it attached to the whole test BODY, so a name like
    // this one exempted both claims. `safety-panel.test.tsx` carried exactly this shape.
    const src = `
      test('every row renders — rather than throwing, and the checks read watch', () => {
        const html = renderToStaticMarkup(<X />);
        expect(html).toContain('—');
        expect(html).toContain('data-severity="watch"');
      });
    `;
    expect(dangerousWholeDocumentChecks(src)).toEqual([{ line: 5, literal: 'data-severity="watch"' }]);
  });

  test('the em-dash half of the exemption still stands — a pure non-crash smoke test', () => {
    const src = `
      test('before the first poll, renders — rather than throwing', () => {
        const html = renderToStaticMarkup(<X />);
        expect(html).toContain('—');
        expect(html).toContain(EM_DASH);
      });
    `;
    expect(dangerousWholeDocumentChecks(src)).toEqual([]);
  });
});
