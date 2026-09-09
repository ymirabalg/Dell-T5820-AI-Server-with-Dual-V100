/**
 * Q1-F4 (HANDOVER §0.1, §9) — the cross-harness runner Q1 deferred.
 *
 * > "Nothing anywhere asserts that a test file carrying ⚠ marks is in *some* step's
 * > `LEDGER_FILES`. Measured: 65 test files, 63 are; the two that are not
 * > (`lib/throttle.test.ts`, `lib/contract.test.ts`) carry **0** ⚠ marks, so nothing is lost
 * > today. … No harness knows the union of the eight ledgers, and every approximation needs
 * > a hand-maintained exemption list — which is why this is deferred to the step that next
 * > adds a harness rather than closed with a partial guard."
 *
 * Q1 explicitly rejected the cheap fix: *"a hardcoded orphan guard would be a check green
 * over a subset of the real set — Q1's own defect wearing a different hat."* **That reasoning
 * still binds.** This file hardcodes nothing: every `LEDGER_FILES` list is read from the nine
 * `pipeline/steps/<step>/regressions.py` files that exist TODAY, and every test file on disk is
 * found by walking the tree, also today. Run this again after a tenth harness is added and it
 * re-derives the whole union from scratch rather than trusting this comment or an old count.
 *
 * ### Re-measured 2026-09-08, and the union has changed since Q1's measurement
 *
 * `Q1-F4`'s note above is dated 2026-09-07, before step 10 existed. Re-deriving rather than
 * trusting it (the handoff's own instruction) finds:
 *
 * | | Q1 (2026-09-07, 8 harnesses) | today (9 harnesses) |
 * |---|---:|---:|
 * | ⚠-bearing test files | 63 | (see the guard's own count below) |
 * | orphan test files | `lib/throttle.test.ts`, `lib/contract.test.ts` | **the same two** |
 * | orphan ⚠ marks | 0 | **1** |
 *
 * **`lib/contract.test.ts` now carries a ⚠ mark it did not have on 2026-09-07**:
 * `'⚠ errors[].instance crosses the wire as a present key when set, and an ABSENT key when
 * not'`, added by 10b-S-G's work on `TelemetryError.instance`. `lib/throttle.test.ts` still
 * carries none — its one `⚠` is inside a doc comment, not a test name, so it is invisible to
 * this guard exactly as it is invisible to every per-step ledger (10a's F3 lesson: a comment
 * quoting the marker is not a mark). **This guard fires on today's tree** — see
 * `10c2-build.md` §2 for the fix (`lib/contract.test.ts` was added to step 3's
 * `LEDGER_FILES`, since `lib/contract.ts` — the module it tests — is a step-1/3 artifact and
 * step 3 already owns the adjacent `collect.test.ts`).
 *
 * ### What this guard checks, precisely
 *
 * 1. **The union.** Every `LEDGER_FILES` list in `pipeline/steps/<step>/regressions.py`, resolved
 *    the same way the harnesses themselves do it — a top-level `NAME = "path"` constant per
 *    entry (or, for step 2's harness, a bare string literal directly in the list).
 * 2. **The real set.** Every `*.test.ts`/`*.test.tsx` file in the repository, `pipeline/`
 *    itself excluded (a harness's OWN test files, if any existed, are not telemetry-contract
 *    test files this rule is about) and `node_modules`/`.next`/`out` excluded.
 * 3. **The check.** Every file in (2) but not in (1) — an ORPHAN — must carry no ⚠-marked
 *    test. A ⚠ mark on an orphan means some property is believed load-bearing by the person
 *    who wrote the test, and NO per-mutation ledger anywhere can ever prove it can fail.
 *
 * The ⚠-scanner is the same paren-balanced, comment- and string-aware, `.each`-generic-aware
 * one step 9/Q1 corrected (`marked_tests()` in every `regressions.py`), ported here rather
 * than re-invented — this guard's whole point is to trust the SAME notion of "marked" the
 * ledgers use, not a second, possibly looser one.
 *
 * ### What this guard CANNOT catch
 *
 * - ⚠ **CORRECTED 2026-09-08 by 10c-2's RECONCILIATION (adversarial F2/F8) — this bullet is
 *   now HALF closed.** It used to read: *"a test file that IS in some `LEDGER_FILES` list but
 *   whose harness never actually runs it (a typo'd path, a file renamed on one side and not
 *   the other) … this guard trusts that a listed path is real."* It no longer trusts that: the
 *   population check below asserts every union entry is a file this walk actually found, so a
 *   typo'd or one-sidedly-renamed path fails HERE. What remains uncaught is only the case
 *   where the path is real and present but the harness still never exercises it (a mutation
 *   list that names no test in it) — this guard runs no harness.
 * - A ⚠ mark that IS covered by ITS OWN step's ledger but happens to ALSO be redundantly
 *   listed nowhere else — this guard is purely about ORPHANS, never about double-coverage.
 * - ⚠ **A ⚠ mark on a `describe(...)` title — added as a note 2026-09-08 by 10c-2's
 *   RECONCILIATION (adversarial F11).** `marked_tests()`'s `CALL` regex is
 *   `(?:test|it)(\.each)?`, so a mark on a `describe` is invisible to every per-step ledger
 *   AND to this guard, exactly as a mark inside a doc comment is. That is long-standing
 *   practice here (20+ files, including `header.test.tsx` and `purity.test.ts`) and is NOT a
 *   defect — but it means `grep -c ⚠ <file>` is not the number of ledger-covered marks, and
 *   the four 10c-2 guard files carry 3–5 apiece where their build note says "exactly one".
 *   Count `test`/`it` marks, never `grep -c`, when auditing coverage.
 * - The ⚠-scanner's own known blind spot, inherited rather than re-solved: a `test`/`it` call
 *   shaped in a way the scanner cannot read at all (Q1's own finding — five such calls exist
 *   project-wide today, all unmarked). The per-step scanners each print an explicit
 *   `!!! <file>:<line>: a test/it call the ⚠-scanner cannot read` diagnostic for this; this
 *   guard does not re-implement that half (it only needs to know whether an ORPHAN file
 *   carries a mark, not to audit the scanner's own completeness — that audit already runs
 *   nine times, once per harness, every time `regressions.py` runs).
 */

import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { codeOnly, projectRoot } from './source-text';

const STEPS_DIR = join(projectRoot, 'pipeline/steps');

/** Every `pipeline/steps/<step>/regressions.py` that exists today — walked, not enumerated. */
function harnessFiles(): string[] {
  return readdirSync(STEPS_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => join(STEPS_DIR, e.name, 'regressions.py'))
    .filter((f) => {
      try {
        readFileSync(f);
        return true;
      } catch {
        return false;
      }
    })
    .sort();
}

/**
 * Python `#`-to-end-of-line comments removed, quote-aware (single, double AND triple quoted —
 * every harness carries docstrings, and four of them triple-single-quoted blocks).
 *
 * ⚠ **Added by 10c-2's RECONCILIATION (adversarial F9).** Without this, `ledgerFilesOf` split
 * the list body on `,` and silently DROPPED the first entry after any `#` comment inside
 * `LEDGER_FILES`, and dropped the WHOLE list if a path constant carried a trailing comment
 * (`A_TEST = "lib/a.test.ts"  # the a file` no longer matches an end-anchored assignment).
 * Latent on all nine harnesses when found — no `#` appears inside any `LEDGER_FILES` body
 * today — but the failure it produced was maximally confusing: the suite goes red naming a
 * file that is VISIBLY PRESENT in the list the reader is looking at, and the cheapest wrong
 * reading is "the guard is broken, delete the assertion".
 */
export function stripPyComments(pySource: string): string {
  const TRIPLES = ['"""', "'''"];
  let out = '';
  let i = 0;
  while (i < pySource.length) {
    const ch = pySource[i] as string;
    const triple = TRIPLES.find((t) => pySource.startsWith(t, i));
    if (triple !== undefined) {
      const end = pySource.indexOf(triple, i + 3);
      const stop = end === -1 ? pySource.length : end + 3;
      out += pySource.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === "'" || ch === '"') {
      let j = i + 1;
      while (j < pySource.length && pySource[j] !== ch && pySource[j] !== '\n') {
        if (pySource[j] === '\\') j += 1;
        j += 1;
      }
      const stop = Math.min(j + 1, pySource.length);
      out += pySource.slice(i, stop);
      i = stop;
      continue;
    }
    if (ch === '#') {
      while (i < pySource.length && pySource[i] !== '\n') i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** The text between the FIRST unmatched `[` after `LEDGER_FILES =` and its balanced `]`. */
function ledgerListBody(pySource: string): string | null {
  const m = /LEDGER_FILES\s*=\s*\[/.exec(pySource);
  if (!m) return null;
  const start = m.index + m[0].length;
  let depth = 1;
  let i = start;
  while (i < pySource.length && depth > 0) {
    if (pySource[i] === '[') depth += 1;
    else if (pySource[i] === ']') depth -= 1;
    i += 1;
  }
  return depth === 0 ? pySource.slice(start, i - 1) : null;
}

/**
 * `LEDGER_FILES`, resolved to real relative paths — a bare `NAME = "path"` constant
 * (per-line, the shape every harness uses) or a direct string literal in the list itself
 * (step 2's harness, which never introduced names for its two files).
 */
export function ledgerFilesOf(rawPySource: string): string[] {
  const pySource = stripPyComments(rawPySource);
  const constants = new Map<string, string>();
  const ASSIGN = /^([A-Z][A-Z0-9_]*)\s*=\s*(['"])((?:\\.|(?!\2).)*)\2\s*$/gm;
  for (const m of pySource.matchAll(ASSIGN)) {
    if (m[1] !== undefined && m[3] !== undefined) constants.set(m[1], m[3]);
  }

  const body = ledgerListBody(pySource);
  if (body === null) return [];

  const resolved: string[] = [];
  for (const rawEntry of body.split(',')) {
    const entry = rawEntry.trim();
    if (entry === '') continue;
    const quoted = /^(['"])((?:\\.|(?!\1).)*)\1$/.exec(entry);
    if (quoted?.[2] !== undefined) {
      resolved.push(quoted[2]);
      continue;
    }
    const known = constants.get(entry);
    if (known !== undefined) resolved.push(known);
  }
  return resolved;
}

/** Every `LEDGER_FILES` entry across every harness that exists today, deduplicated. */
export function ledgerUnion(): Set<string> {
  const union = new Set<string>();
  for (const harness of harnessFiles()) {
    for (const entry of ledgerFilesOf(readFileSync(harness, 'utf8'))) union.add(entry);
  }
  return union;
}

const SKIP_DIRS = new Set(['node_modules', '.next', 'out', '.git', 'pipeline']);

/** Every `*.test.ts`/`*.test.tsx` in the repo, `pipeline/` (a harness's own scripts, not the
 *  contract's test suite) excluded — walked from the repo root, never listed. */
export function allTestFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(entry.name)) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (/\.test\.tsx?$/.test(entry.name)) out.push(full);
    }
  };
  walk(projectRoot);
  return out.sort();
}

// ---------------------------------------------------------------------------
// The ⚠-scanner — ported from `marked_tests()` in every `pipeline/steps/<step>/regressions.py`,
// same regexes, same paren-balanced `.each` handling. Kept here rather than imported: the
// source of truth is Python (the harnesses run under `python3`), so there is nothing to
// import from — porting the same two regexes is the honest alternative to a second,
// divergent implementation growing by accident.
// ---------------------------------------------------------------------------

const CALL = /(?:^|\s)(?:test|it)(\.each)?(?:\s*<[^;{}()]*>)?\s*\(/g;
const FIRST_STRING = /\s*(['"])((?:\\.|(?!\1).)*)\1/y;

function skipBalanced(text: string, i: number): number | null {
  let depth = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch;
      i += 1;
      while (i < text.length) {
        if (text[i] === '\\') {
          i += 2;
          continue;
        }
        if (text[i] === quote) break;
        i += 1;
      }
    } else if (ch === '(') depth += 1;
    else if (ch === ')') {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return null;
}

/** Every ⚠-marked test NAME in `text` (raw source — comments are handled the same way the
 *  Python scanner handles them: it does not strip them either, and relies on a marked test
 *  name being inside a real `test(`/`it(` call's first string argument). */
export function warningMarkedTestNames(rawText: string): string[] {
  const text = codeOnly(rawText);
  const names: string[] = [];
  for (const m of text.matchAll(CALL)) {
    let at = m.index + m[0].length - 1; // the `(` of either `test(` or `test.each(`
    if (m[1]) {
      const after = skipBalanced(text, at);
      if (after === null) continue;
      let a = after;
      while (a < text.length && /\s/.test(text[a] ?? '')) a += 1;
      if (text[a] !== '(') continue;
      at = a;
    }
    FIRST_STRING.lastIndex = at + 1;
    const s = FIRST_STRING.exec(text);
    if (s === null || s.index !== at + 1) continue;
    const name = s[2] ?? '';
    if (name.includes('⚠')) names.push(m[1] ? name.split('%')[0]?.trim() ?? name : name);
  }
  return names;
}

// ---------------------------------------------------------------------------

const union = ledgerUnion();
const orphans = allTestFiles().filter((f) => !union.has(f.slice(projectRoot.length + 1)));
const orphanFindings = orphans.map((f) => ({
  file: f,
  marks: warningMarkedTestNames(readFileSync(f, 'utf8')),
}));

describe('⚠ Q1-F4 — every ⚠-marked test file belongs to SOME step’s LEDGER_FILES', () => {
  test('harnesses and test files both actually exist to check', () => {
    expect(harnessFiles().length).toBeGreaterThan(0);
    expect(allTestFiles().length).toBeGreaterThan(0);
    expect(union.size).toBeGreaterThan(0);
  });

  test.each(orphanFindings.map((f) => [f.file.slice(projectRoot.length), f] as const))(
    '⚠ orphan test file %s carries no ⚠-marked test',
    (_label, finding) => {
      expect(finding.marks, JSON.stringify(finding.marks)).toEqual([]);
    },
  );

  /**
   * ⚠ **REPLACED by 10c-2's RECONCILIATION (adversarial F2/F8).** What stood here was
   * `expect(orphans.length).toBeGreaterThan(0)` — a guard that went RED the moment the project
   * reached ZERO orphans, i.e. the moment it succeeded. Exactly one orphan
   * (`lib/throttle.test.ts`) stood between the green suite and a red one; adopting it into any
   * harness — the outcome this guard exists to drive toward — would have failed the suite with
   * `expected 0 to be greater than 0`, whose cheapest wrong reading is "delete the assertion",
   * which removes the file's only vacuity net.
   *
   * It was also not a vacuity check. The vacuity risk is `allTestFiles()` silently NARROWING
   * (a new `SKIP_DIRS` entry, a changed extension test, a walk that throws on one subtree) so
   * the `test.each` above iterates over a shrunken population — and `orphans.length > 0` does
   * not see that at all: a walk narrowed to one file that happens to be an orphan passes.
   *
   * The honest check asserts the INPUTS, never the output (lines above already do half of it):
   * every path any harness claims to cover must be a file THIS WALK ACTUALLY FOUND. Today that
   * is 96 union entries inside 97 walked files, so a walk that collapsed to 1 would report 95+
   * missing rather than passing quietly. It also closes, for free, the first entry in this
   * file's own "CANNOT catch" list — a `LEDGER_FILES` path that is typo'd, or renamed on one
   * side only, now fails here instead of being trusted.
   *
   * **Zero orphans is the SUCCESS state and this suite stays green in it** — verified by
   * re-running the adversarial's own experiment (a throwaway tenth harness adopting
   * `lib/throttle.test.ts`) against this version: 0 orphans, file green.
   */
  test('the guard looked at everything — every LEDGER_FILES path is a file this walk found', () => {
    const walked = new Set(allTestFiles().map((f) => f.slice(projectRoot.length + 1)));
    const unwalked = [...union].filter((entry) => !walked.has(entry)).sort();
    expect(
      unwalked,
      `LEDGER_FILES entries that are not test files this walk found: ${unwalked.join(', ')}`,
    ).toEqual([]);
    expect(union.size).toBeGreaterThan(0);
  });
});

/*
 * ⚠ The guard's own vocabulary (HANDOVER §5.1).
 */
describe('⚠ ledgerFilesOf resolves both shapes every harness actually uses', () => {
  test('a bare string-literal list (step 2’s own shape)', () => {
    const py = 'LEDGER_FILES = [\n    "lib/format.test.ts", "lib/severity.test.ts",\n]\n';
    expect(ledgerFilesOf(py)).toEqual(['lib/format.test.ts', 'lib/severity.test.ts']);
  });

  test('a named-constant list (every other harness’s shape)', () => {
    const py = [
      'FOO_TEST = "lib/foo.test.ts"',
      'BAR_TEST = "lib/bar.test.ts"',
      'LEDGER_FILES = [',
      '    FOO_TEST, BAR_TEST,',
      ']',
    ].join('\n');
    expect(ledgerFilesOf(py)).toEqual(['lib/foo.test.ts', 'lib/bar.test.ts']);
  });

  test('a missing LEDGER_FILES list resolves to empty, not a crash', () => {
    expect(ledgerFilesOf('# nothing here\n')).toEqual([]);
  });

  test('an unresolvable name (no matching constant) is dropped, not fabricated as a path', () => {
    const py = 'LEDGER_FILES = [\n    MYSTERY,\n]\n';
    expect(ledgerFilesOf(py)).toEqual([]);
  });

  /*
   * ⚠ Added by 10c-2's RECONCILIATION (adversarial F9) — both directions of the comment
   * stripper. The failure these prevent is a FALSE orphan: a listed file reported as
   * unlisted, which reads as "the guard is broken" rather than "the ledger is wrong".
   */
  test('a # comment INSIDE the list does not swallow the entry after it', () => {
    const py = [
      'FOO_TEST = "lib/foo.test.ts"',
      'BAR_TEST = "lib/bar.test.ts"',
      'LEDGER_FILES = [',
      '    # step 9 primitives',
      '    FOO_TEST, BAR_TEST,',
      ']',
    ].join('\n');
    expect(ledgerFilesOf(py)).toEqual(['lib/foo.test.ts', 'lib/bar.test.ts']);
  });

  test('a trailing comment on a path constant does not lose the whole list', () => {
    const py = ['FOO_TEST = "lib/foo.test.ts"  # the foo file', 'LEDGER_FILES = [FOO_TEST]'].join(
      '\n',
    );
    expect(ledgerFilesOf(py)).toEqual(['lib/foo.test.ts']);
  });

  test('a # inside a quoted path is not a comment', () => {
    const py = ['FOO_TEST = "lib/od#d.test.ts"', 'LEDGER_FILES = [FOO_TEST]'].join('\n');
    expect(ledgerFilesOf(py)).toEqual(['lib/od#d.test.ts']);
  });

  test('a docstring survives stripping, so a # inside one cannot truncate the file', () => {
    const docstring = '"""a mutation table with a # inside it"""';
    const py = [docstring, 'FOO_TEST = "lib/foo.test.ts"', 'LEDGER_FILES = [FOO_TEST]'].join('\n');
    expect(stripPyComments(py)).toContain('# inside it');
    expect(ledgerFilesOf(py)).toEqual(['lib/foo.test.ts']);
  });
});

describe('⚠ warningMarkedTestNames finds a mark through every shape the real harnesses parse', () => {
  test('a plain test()', () => {
    expect(warningMarkedTestNames("test('⚠ a marked test', () => {});")).toEqual(['⚠ a marked test']);
  });

  test('a plain it()', () => {
    expect(warningMarkedTestNames("it('⚠ a marked test', () => {});")).toEqual(['⚠ a marked test']);
  });

  test('an unmarked test is not reported', () => {
    expect(warningMarkedTestNames("test('a plain test', () => {});")).toEqual([]);
  });

  test('a mark inside a COMMENT quoting a test name is not a live mark', () => {
    // The 10a F3 lesson, at this guard: `codeOnly` blanks the comment before the scanner
    // ever sees it, so a doc comment describing "the ⚠ test named X" cannot forge a mark.
    expect(
      warningMarkedTestNames("// see the ⚠ test named 'temperature'\ntest('temperature', () => {});"),
    ).toEqual([]);
  });

  test('a test.each(...) with a %-templated name reports the prefix, matching the harnesses’ own convention', () => {
    const src = "test.each([1, 2])('⚠ case %s', (n) => { expect(n).toBeGreaterThan(0); });";
    expect(warningMarkedTestNames(src)).toEqual(['⚠ case']);
  });

  test('a generic test.each<[string, number]>(...) is still read, not silently dropped', () => {
    const src = "test.each<[string, number]>([['a', 1]])('⚠ %s', (s) => {});";
    expect(warningMarkedTestNames(src)).toEqual(['⚠']);
  });
});
