/**
 * L11 (ANCHOR §8, HANDOVER §9) — "no guard stops a component hard-coding `' RPM'` instead of
 * calling a formatter." Step 9 deferred it for a real reason: there was no canonical
 * unit-name constant in `lib/` to point a guard at, and a guard checking a component's output
 * STRING for `/RPM$/` cannot tell a formatted `'4,308 RPM'` from a component that typed the
 * suffix itself and got the number wrong right next to it — the failure this rule exists to
 * catch is in the SOURCE, not the rendered text.
 *
 * ### Piece one: the constant (a design decision, recorded per invariant 7)
 *
 * `lib/format.ts` now exports `UNIT_CELSIUS`, `UNIT_WATTS`, `UNIT_MIB`, `UNIT_GIB`,
 * `UNIT_RPM`, `UNIT_MHZ`, `UNIT_PERCENT`, `UNIT_MB_PER_S` and `UNIT_KB_PER_S` — §6.6's nine
 * unit suffixes, in the strings the formatters themselves now build from (not a second,
 * possibly-drifting copy: this guard imports the very values `formatRpm` etc. use).
 *
 * **Not `lib/units.ts`.** That module already exists and is a different concept entirely —
 * the two SYSTEMD UNIT names (`gpu-fan-control.service`, `llama-server@<i>.service`) §6.4's
 * condition ids are built from. Putting a measurement's unit suffix there would make one file
 * answer two unrelated questions and every future `grep -n unit` return both. `lib/format.ts`
 * — already "the §6.6 formatters" module by its own doc comment — is the natural home instead,
 * and the constants live beside the functions that are their only legitimate consumer.
 *
 * ### Piece two: the guard
 *
 * Every non-test `.ts`/`.tsx` file under `components/` and `app/` is scanned, comment-blind
 * (`codeOnly`, same discipline as the other two 10c-2 guards — a doc comment quoting `' RPM'`
 * as an example must not trip this), for a §6.6 unit suffix spelled AROUND A VALUE: a complete
 * literal segment equal to the suffix, or a post-interpolation segment (template literal OR
 * JSX text) beginning with it. A component has no legitimate reason to spell one: every
 * reading reaches it as a COMPLETE formatted string from `lib/format.ts`, never as a bare
 * number needing a suffix appended.
 *
 * ⚠ **Two corrections applied by 10c-2's RECONCILIATION; the text they replace overstated
 * this guard's reach, which is this project's most-repeated defect shape.**
 *
 * - The scan said `.tsx` only, and *was* `.tsx` only — ten non-test `.ts` files sit under the
 *   same roots, two of which format values (adversarial F5). It now takes both.
 * - The rule was described as "the text right after the LAST interpolation is exactly the
 *   suffix". The code neither required *last* (any segment counted) nor tolerated anything
 *   after the suffix (`` `${n} RPM (fan 5)` `` and `` `${n} RPM.` `` both escaped), and JSX
 *   text — `<td>{fan2Rpm} RPM</td>`, the most natural hand-spelling of all — was invisible
 *   entirely (adversarial F3). The rule above is what the code now does, stated once.
 *
 * ### What this guard found on 2026-09-08
 *
 * No live bug — but its FIRST implementation (a bare `codeOnly(text).includes(unit)` search)
 * found two false positives on the real tree the moment it ran, both instructive:
 *
 * - `header.tsx` — `' W'` matched inside `readonly windowMinutes: WindowMinutes;`, a TYPE
 *   name, not a string at all.
 * - `cooling-panel.tsx` — `' RPM'` matched inside
 *   `ariaLabel="GPU temperature and fan 5 RPM over the selected window"`, a descriptive label
 *   that mentions the unit as an English word, building no value at all.
 *
 * Both are why the rule is anchored to a literal segment, and to the START of a POST-VALUE
 * segment rather than to any text anywhere. With that anchoring the guard is clean on today's
 * tree — including after the two widenings above, re-measured 2026-09-08: no component and no
 * `.ts` module under the roots hard-codes a unit suffix around a value. So this is a preventive
 * guard, not one that closed a live bug, and the fixtures below (plus a live mutation,
 * `10c2-build.md` §4) prove it can still fail rather than being vacuous.
 *
 * ### What it cannot catch
 *
 * - A unit suffix built by CONCATENATING code points instead of writing the string literal
 *   (`' R' + 'PM'`, `String.fromCharCode(...)`) — a text scanner cannot evaluate that without
 *   becoming a partial interpreter, and nothing in this project does this today.
 * - A WRONG but still-formatter-sourced unit — a component calling `formatRpm` where it meant
 *   `formatMHz` typechecks (both take a `number | null`) and prints a plausible-looking wrong
 *   unit; this guard only forbids hand-spelling, never misrouting between two formatters that
 *   both exist for a reason.
 * - ⚠ **A percentage spelled `` `${pct}%` `` with no space** — `UNIT_PERCENT` is `' %'`, so the
 *   bare `%` is outside the vocabulary. REJECTED deliberately, with evidence: the one live
 *   `}%` in the tree is `meter.tsx`'s CSS `width`, a length and not a reading, so adding `%`
 *   would produce a false positive immediately (fixtured below). Whoever revisits this needs a
 *   way to tell a CSS length from a displayed value, not a bigger vocabulary.
 * - A tenth unit §6.6 might add later that has no `UNIT_*` constant at all — the vocabulary is
 *   now DERIVED from `lib/format.ts`'s `UNIT_*` exports (adversarial F4), so a tenth constant
 *   is picked up automatically; a tenth formatter that inlines its suffix instead of exporting
 *   one is still invisible, and nothing forces that other than remembering L11 exists.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import * as format from './format';
import { UNIT_CELSIUS, UNIT_RPM } from './format';
import { codeOnly, projectRoot } from './source-text';

/**
 * §6.6's unit suffixes — **DERIVED from `lib/format.ts`'s own exports, not listed here.**
 *
 * ⚠ **Changed by 10c-2's RECONCILIATION (adversarial F4).** What stood here imported the nine
 * constants by name and re-listed them in a hand-written array, under a comment claiming it was
 * "never a second, hand-typed copy that could drift". The VALUES could not drift; the
 * MEMBERSHIP could — a tenth `UNIT_*` added beside `formatKelvin` would have been silently
 * outside the vocabulary while the guard reported green, and the author would reasonably have
 * concluded it was covered. `purity.test.ts` had already solved this once by matching a SHAPE
 * rather than a list; this is the same move, one line.
 */
const UNIT_SUFFIXES: readonly string[] = Object.entries(format)
  .filter(([name, value]) => name.startsWith('UNIT_') && typeof value === 'string')
  .map(([, value]) => value as string);

// `lib/format.ts` — where these strings are legitimately spelled — never enters this scan:
// it is not under either scan root. (The `.ts`-vs-`.tsx` half of that sentence used to be
// carrying the argument and no longer can — see the walk below.)
const SCAN_ROOTS = ['components', 'app'].map((d) => join(projectRoot, d));
const SKIP_DIRS = new Set(['node_modules', '.next', 'out']);

/**
 * Every non-test SOURCE file under the scan roots — **`.ts` as well as `.tsx`.**
 *
 * ⚠ **Widened by 10c-2's RECONCILIATION (adversarial F5).** This walk took `.tsx` only, which
 * excluded ten non-test `.ts` files sitting under the very same roots — including
 * `components/panels/condition-lookup.ts`, whose own doc says its values are *"already
 * formatted (`'4,308 RPM'`)"*, and `components/panels/panel-chart.ts`, which imports
 * `lib/format` and builds tick labels. A hand-written `` `${v} °C` `` axis suffix belongs in
 * that file by construction, and the guard could not see it.
 */
function componentSourceFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.tsx?$/.test(entry.name) && !entry.name.includes('.test.')) out.push(full);
    }
  };
  for (const root of SCAN_ROOTS) walk(root);
  return out.sort();
}

interface Segment {
  readonly text: string;
  /** True when this run of literal text sits immediately AFTER a `${…}` interpolation — i.e.
   *  it is the text a VALUE is being given a suffix by, which is the whole shape L11 forbids. */
  readonly afterInterpolation: boolean;
}

/**
 * Every STATIC segment of every string/template literal in `text`, each tagged with whether it
 * follows an interpolation — a plain string's whole body is one segment (never post-
 * interpolation); a template literal contributes one segment per run of literal text between
 * its `${…}`s. Comments are already blanked by the caller via `codeOnly`.
 *
 * Nested strings inside a `${…}` expression are skipped rather than recursed into — good
 * enough here, since this guard only cares about a literal built AROUND a value
 * (`` `${n} RPM` ``, `n + ' RPM'`), never about a string buried inside the interpolated
 * expression itself.
 */
function literalSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "'" || c === '"') {
      let j = i + 1;
      let seg = '';
      while (j < text.length && text[j] !== c) {
        if (text[j] === '\\') {
          j += 2;
          continue;
        }
        seg += text[j];
        j += 1;
      }
      segments.push({ text: seg, afterInterpolation: false });
      i = j + 1;
    } else if (c === '`') {
      let j = i + 1;
      let seg = '';
      let after = false;
      while (j < text.length) {
        const cj = text[j];
        if (cj === '\\') {
          j += 2;
          continue;
        }
        if (cj === '`') {
          segments.push({ text: seg, afterInterpolation: after });
          j += 1;
          break;
        }
        if (cj === '$' && text[j + 1] === '{') {
          segments.push({ text: seg, afterInterpolation: after });
          seg = '';
          after = true;
          let depth = 1;
          j += 2;
          while (j < text.length && depth > 0) {
            const cd = text[j];
            if (cd === '{') depth += 1;
            else if (cd === '}') depth -= 1;
            else if (cd === "'" || cd === '"' || cd === '`') {
              const q = cd;
              j += 1;
              while (j < text.length && text[j] !== q) {
                if (text[j] === '\\') j += 1;
                j += 1;
              }
            }
            j += 1;
          }
          continue;
        }
        seg += cj;
        j += 1;
      }
      i = j;
    } else {
      i += 1;
    }
  }
  return segments;
}

/**
 * ⚠ **Added by 10c-2's RECONCILIATION (adversarial F3).** JSX children are not a string
 * literal, a template or anything else `literalSegments` can see — `<td>{cooling.fan2Rpm} RPM</td>`
 * yielded NOTHING at all, and that is the most natural way a table-shaped panel would hand-write
 * a unit. This reads the text between an interpolation's closing `}` and the next tag.
 *
 * It is a text heuristic, deliberately: a `}` that closes a code block rather than a JSX
 * interpolation contributes a segment too, but such a segment has to BEGIN with a §6.6 unit at
 * a word boundary to be reported, which no code shape here does.
 */
function jsxTextAfterInterpolation(text: string): string[] {
  return [...text.matchAll(/\}([^<>{}`'"]*)</g)].map((m) => m[1] ?? '');
}

/** `' RPM'` at the START of a post-value segment, ending at a non-alphanumeric boundary — so
 *  `` `${n} RPM (fan 5)` `` and `<td>{n} RPM</td>` are caught while ` RPMish` is not. */
function startsWithUnit(segment: string, unit: string): boolean {
  if (!segment.startsWith(unit)) return false;
  const next = segment[unit.length];
  return next === undefined || !/[A-Za-z0-9]/.test(next);
}

/**
 * Every §6.6 unit suffix hard-coded around a value. Two shapes, and the second was added by
 * 10c-2's reconciliation:
 *
 * 1. A COMPLETE literal segment equal to the suffix — `n + ' RPM'`, `` `${n} RPM` ``.
 * 2. ⚠ A segment that FOLLOWS an interpolation and BEGINS with the suffix, whether that
 *    segment is inside a template literal (`` `${n} RPM (fan 5)` ``, `` `${n} RPM.` ``) or is
 *    JSX text (`<span>{n} RPM</span>`). Adversarial F3 measured all three escaping the
 *    equality-only rule, and the wired mutation `10c-G4` uses the one shape that did not,
 *    so the ledger never exercised the others.
 *
 * Deliberately NOT "the suffix appears somewhere in the file": a descriptive
 * `ariaLabel="…fan 5 RPM over the selected window"` contains the word but builds no value
 * (`cooling-panel.tsx`'s own chart label, proven below to be correctly ignored) — and an
 * unscoped substring search catches `WindowMinutes` on `' W'` (`header.tsx`'s own type, proven
 * the same way). Both false positives are why shape 2 requires the suffix at the START of a
 * POST-VALUE segment rather than anywhere in any text.
 */
export function unitSuffixLiterals(text: string): string[] {
  const code = codeOnly(text);
  const segments = literalSegments(code);
  const whole = new Set(segments.map((s) => s.text));
  const tails = [
    ...segments.filter((s) => s.afterInterpolation).map((s) => s.text),
    ...jsxTextAfterInterpolation(code),
  ];
  return UNIT_SUFFIXES.filter(
    (unit) => whole.has(unit) || tails.some((tail) => startsWithUnit(tail, unit)),
  );
}

const files = componentSourceFiles();
const findings = files.map((f) => ({ file: f, hits: unitSuffixLiterals(readFileSync(f, 'utf8')) }));

describe('⚠ L11 — no component hard-codes a §6.6 unit suffix instead of calling a formatter', () => {
  /**
   * ⚠ **Strengthened by 10c-2's RECONCILIATION (adversarial F8).** The net used to be
   * `files.length > 0` here plus a `> 15` tucked into the exemption test below — a narrowing
   * from 35 files to 16 would have passed both. A floor plus two NAMED members (the file the
   * wired mutation `10c-G4` targets, and the `.ts` file F5 added) is the designed defence the
   * `tocontain` guard only had by accident of style.
   */
  test('there are component files to check at all, and the walk still reaches the ones it must', () => {
    expect(files.length).toBeGreaterThanOrEqual(30);
    const names = files.map((f) => f.slice(projectRoot.length + 1));
    expect(names).toContain('components/panels/cooling-panel.tsx');
    expect(names).toContain('components/panels/panel-chart.ts');
  });

  test.each(findings.map((f) => [f.file.slice(projectRoot.length), f] as const))(
    '⚠ no §6.6 unit suffix is hard-coded anywhere in %s',
    (_label, finding) => {
      expect(finding.hits, JSON.stringify(finding.hits)).toEqual([]);
    },
  );

  test('the scan never reaches lib/format.ts — it is outside both scan roots', () => {
    // ⚠ The reason narrowed 2026-09-08 (adversarial F5): the walk now takes `.ts` too, so the
    // extension no longer excludes anything. Only the scan ROOTS keep `lib/format.ts` out.
    expect(files.some((f) => f === join(projectRoot, 'lib/format.ts'))).toBe(false);
  });
});

/*
 * ⚠ The guard's own vocabulary (HANDOVER §5.1).
 */
describe('⚠ unitSuffixLiterals — both directions, and the two live false positives it must clear', () => {
  test('a template literal built around a value is found (the shape L11 exists for)', () => {
    expect(unitSuffixLiterals("const s = `${n} RPM`;")).toEqual([UNIT_RPM]);
  });

  test('a plain-string concatenation is found too, not only the template form', () => {
    expect(unitSuffixLiterals("const s = n + ' RPM';")).toEqual([UNIT_RPM]);
  });

  test('more than one suffix in the same file is all reported', () => {
    const hits = unitSuffixLiterals("const a = `${x} RPM`;\nconst b = `${y} °C`;");
    expect(hits).toEqual(expect.arrayContaining([UNIT_RPM, UNIT_CELSIUS]));
  });

  test('a value that ALREADY includes its unit (the correct shape) is not flagged', () => {
    expect(unitSuffixLiterals('<Row value={formatRpm(v)} />')).toEqual([]);
  });

  test('a descriptive label that merely MENTIONS the unit word is not flagged — cooling-panel.tsx’s own ariaLabel, reproduced', () => {
    // The false positive this guard's first real run produced: no value is being built here,
    // so there is nothing for a formatter to have replaced.
    expect(
      unitSuffixLiterals('ariaLabel="GPU temperature and fan 5 RPM over the selected window"'),
    ).toEqual([]);
  });

  test('the unit substring appearing OUTSIDE any string at all is not flagged — header.tsx’s own type, reproduced', () => {
    // `WindowMinutes` contains the literal characters " W" but is a TYPE, not a string.
    expect(unitSuffixLiterals('readonly windowMinutes: WindowMinutes;')).toEqual([]);
  });

  test('a unit mentioned only in a comment is not flagged — the 10a F3 lesson, at this guard', () => {
    expect(unitSuffixLiterals('// a fan reading 0 RPM is a dead fan\nconst ok = formatRpm(v);')).toEqual(
      [],
    );
  });

  test('a unit mentioned only in a JSDoc example is not flagged', () => {
    expect(unitSuffixLiterals('/** e.g. `4,308 RPM` */\nexport const x = 1;')).toEqual([]);
  });

  test('a template literal with no interpolation at all is prose, never flagged merely for containing the word', () => {
    expect(
      unitSuffixLiterals('const label = `fan RPM over the selected window`;'),
    ).toEqual([]);
  });

  /*
   * ⚠ Added by 10c-2's RECONCILIATION (adversarial F3) — the three shapes that escaped the
   * equality-only rule, each with the negative that keeps the widening honest.
   */
  test('JSX text after an interpolation is found — the shape a table-shaped panel would write', () => {
    expect(unitSuffixLiterals('<td>{cooling.fan2Rpm} RPM</td>')).toEqual([UNIT_RPM]);
    expect(unitSuffixLiterals('<span className={styles.v}>{gpu.tempC} °C</span>')).toEqual([
      UNIT_CELSIUS,
    ]);
  });

  test('a suffix with anything AFTER it is still found (the equality rule missed both)', () => {
    expect(unitSuffixLiterals('const s = `${n} RPM (fan 5)`;')).toEqual([UNIT_RPM]);
    expect(unitSuffixLiterals('const s = `${n} RPM.`;')).toEqual([UNIT_RPM]);
  });

  test('a longer WORD starting with the suffix is not a unit — the boundary rule', () => {
    expect(unitSuffixLiterals('const s = `${n} RPMish`;')).toEqual([]);
    expect(unitSuffixLiterals('<p>{power} Watts of headroom</p>')).toEqual([]);
  });

  test('a closing code brace before a less-than is not JSX text', () => {
    expect(unitSuffixLiterals('const f = () => { doIt(); }\nconst ok = a < b;')).toEqual([]);
  });

  test('a percentage used as a CSS LENGTH is not a §6.6 reading — meter.tsx’s own width, reproduced', () => {
    // ⚠ Deliberate, measured limit (adversarial F3's third escape, REJECTED with evidence):
    // `UNIT_PERCENT` is `' %'`, so `${pct}%` is invisible to this guard. Adding a bare `%` to
    // the vocabulary would flag this line — the ONE live `}%` in the whole tree, a CSS width,
    // not a displayed reading — on a loop whose declared defect class is the false positive.
    expect(
      unitSuffixLiterals("style={{ width: fillPercent === null ? '0%' : `${fillPercent}%` }}"),
    ).toEqual([]);
  });
});
