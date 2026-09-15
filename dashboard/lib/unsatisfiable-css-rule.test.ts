/**
 * ⚠⚠ 12a/RECONCILE (`12a-A5`/`12a-Q10`) — **the mirror image of `dangling-css-class.test.ts`.**
 *
 * That guard catches a `styles.X` naming a class no rule declares. Nothing caught the other
 * direction: a rule written for an element that cannot satisfy it. `header.module.css` carried
 *
 *     .status[data-mode='paused'], .status[data-mode='stale'] { background: var(--nodata), … }
 *
 * while `header.tsx` stamps `data-mode` on the CHILD `.dot`. Both selectors matched nothing,
 * in every commit: `data-mode` moved to `.dot` on 2026-09-08 and the rule was written on
 * 2026-09-09. §6.2's paused/stale hatch has therefore never painted, and neither the compiler,
 * the render suite, `dangling-css-class.test.ts` (it resolves `.chip[data-size='sm']` to the
 * CLASS `.chip` and asks only whether `.chip` exists) nor a browser measurement could see it.
 *
 * ### The rule, stated narrowly on purpose
 *
 * For every selector of the form `.<class>[<attr>…]` — an attribute qualifying the class
 * TOKEN ITSELF, not a descendant — in a `*.module.css`, at least one JSX element in a
 * component that imports that stylesheet and sets `className={styles.<class>}` must also carry
 * `<attr>`. Attributes on a descendant compound (`.controls button[aria-pressed='true']`) are
 * out of scope: the attribute belongs to `button` there, and this scanner has no way to know
 * which `button` that is.
 *
 * ### What it does NOT check, and why each is out of scope rather than forgotten
 *
 * - **The VALUE.** `.dot[data-severity='alarm']` is satisfiable if `data-mode`… sorry, if
 *   `data-severity` is stamped at all; whether the component can ever produce the literal
 *   `'alarm'` is a question about a union type, not about text, and a scanner that guessed at
 *   it would be noisy in exactly the way this one must not be.
 * - **Descendant and sibling combinators.** `.hoverZone:hover + .crosshairGroup` is a claim
 *   about DOM shape, which text cannot decide.
 * - **Conditional attributes.** An element that stamps `data-mode={cond ? 'paused' : undefined}`
 *   counts as stamping it. React omits the attribute when the value is `undefined`; that is a
 *   runtime fact and the rendering tests own it.
 *
 * ### Why it is worth having at exactly one finding
 *
 * The adversarial swept all 22 CSS modules by hand and found precisely one unsatisfiable rule
 * — the one above, now removed. So this guard's steady-state output is zero findings and its
 * cost is one scan; the argument for writing it is that the finding it would have made was
 * six days and sixteen commits old, invisible to every other guard in the tree, and cost a
 * phase an afternoon to find by reading.
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { codeOnly, projectRoot } from './source-text';

const SCAN_ROOTS = ['components', 'app'].map((d) => join(projectRoot, d));
const SKIP_DIRS = new Set(['node_modules', '.next', 'out']);

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

interface CssModuleImport {
  readonly localName: string;
  readonly cssPath: string;
}

/** Same import shapes `dangling-css-class.test.ts` reads — default or namespace, either quote. */
function cssModuleImports(text: string, fromDir: string): CssModuleImport[] {
  const found: CssModuleImport[] = [];
  const IMPORT = /import\s+(?:\*\s+as\s+)?(\w+)\s+from\s+(['"])(\.[^'"]+\.module\.css)\2/g;
  for (const m of text.matchAll(IMPORT)) {
    const localName = m[1];
    const rel = m[3];
    if (localName === undefined || rel === undefined) continue;
    found.push({ localName, cssPath: join(fromDir, rel) });
  }
  return found;
}

export interface QualifiedSelector {
  /** The class the attribute qualifies. */
  readonly className: string;
  /** The attribute NAME, without its value (`data-mode`, `aria-pressed`). */
  readonly attribute: string;
}

/**
 * Every `.class[attr…]` in `css` — the attribute bracket must immediately follow the class
 * token, which is what makes it a claim about THAT element.
 *
 * ⚠ Comments are stripped first, for the same reason `declaredClasses` strips them: a comment
 * quoting a removed rule (`header.module.css` now carries exactly that) is prose, not CSS, and
 * a guard that read it would report the finding it was written to retire.
 */
export function qualifiedSelectors(css: string): QualifiedSelector[] {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, ' ');
  const out: QualifiedSelector[] = [];
  for (const m of text.matchAll(/\.([A-Za-z_-][\w-]*)((?:\[[^\]]*\])+)/g)) {
    const className = m[1];
    const brackets = m[2];
    if (className === undefined || brackets === undefined) continue;
    for (const attr of brackets.matchAll(/\[\s*([A-Za-z_:][\w:.-]*)/g)) {
      const attribute = attr[1];
      if (attribute !== undefined) out.push({ className, attribute });
    }
  }
  return out;
}

/**
 * The text of every JSX tag in `code` that sets `className={<localName>.<className>}`.
 *
 * A tag runs from its `<` to the `>` that closes it at brace depth 0, so an attribute value
 * containing `>` (`data-x={a > b}`) does not end it early. Template literals are handled by
 * the same depth counter — `` className={`${styles.dot} ${x}`} `` is one expression.
 */
export function tagsUsing(code: string, localName: string, className: string): string[] {
  const needle = `${localName}.${className}`;
  const tags: string[] = [];
  for (let at = code.indexOf(needle); at !== -1; at = code.indexOf(needle, at + 1)) {
    // ⚠ `styles.statusText` must not count as a use of `styles.status`.
    const after = code[at + needle.length];
    if (after !== undefined && /[\w$]/.test(after)) continue;
    const open = code.lastIndexOf('<', at);
    if (open === -1) continue;
    let depth = 0;
    let end = -1;
    for (let i = open; i < code.length; i += 1) {
      const ch = code[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      else if (ch === '>' && depth === 0) {
        end = i;
        break;
      }
    }
    if (end === -1) continue;
    tags.push(code.slice(open, end + 1));
  }
  return tags;
}

export interface Finding {
  readonly file: string;
  readonly cssFile: string;
  readonly selector: string;
}

/** Every `.class[attr]` rule in the stylesheets `absPath` imports that no element there can satisfy. */
export function auditFile(absPath: string): { readonly findings: Finding[]; readonly checked: number } {
  const code = codeOnly(readFileSync(absPath, 'utf8'));
  const dir = dirname(absPath);
  const findings: Finding[] = [];
  let checked = 0;
  for (const { localName, cssPath } of cssModuleImports(code, dir)) {
    for (const { className, attribute } of qualifiedSelectors(readFileSync(cssPath, 'utf8'))) {
      const tags = tagsUsing(code, localName, className);
      // A class this component does not use at all is not this component's claim to answer —
      // `dangling-css-class.test.ts` owns the other direction, and a shared stylesheet would
      // otherwise report against every importer but one.
      if (tags.length === 0) continue;
      checked += 1;
      if (!tags.some((tag) => new RegExp(`(^|\\s)${attribute}(=|\\s|$)`).test(tag))) {
        findings.push({ file: absPath, cssFile: cssPath, selector: `.${className}[${attribute}]` });
      }
    }
  }
  return { findings, checked };
}

const files = componentSourceFiles();
const audits = files.map((f) => ({ file: f, ...auditFile(f) }));

describe('⚠ 12a-A5 — no CSS rule qualifies a class by an attribute its own element never stamps', () => {
  test('the scan reaches real rules — the population, before the property', () => {
    // Anti-vacuity, the shape 10c-2's reconciliation had to add to the sibling guard: a
    // scanner that read nothing would satisfy the property below perfectly.
    const checked = audits.reduce((n, a) => n + a.checked, 0);
    expect(files.length).toBeGreaterThanOrEqual(15);
    expect(checked, 'no attribute-qualified selector was checked at all').toBeGreaterThanOrEqual(12);
  });

  test('⚠ every attribute-qualified rule in the tree is satisfiable by the component that owns it', () => {
    const findings = audits.flatMap((a) => a.findings);
    expect(
      findings.map((f) => `${f.file.slice(projectRoot.length)}: ${f.selector}`),
      'a rule no element can match paints nothing, in any commit, and nothing else in this tree can see it',
    ).toEqual([]);
  });
});

describe('⚠ the scanner’s own vocabulary, both directions', () => {
  test('an attribute on the class token is read; one on a descendant is not', () => {
    expect(qualifiedSelectors(".status[data-mode='paused'] { color: red; }")).toEqual([
      { className: 'status', attribute: 'data-mode' },
    ]);
    // `aria-pressed` belongs to `button`, which this guard cannot resolve — so it is silent
    // rather than wrong (`.controls button[aria-pressed='true']` is a real rule in this tree).
    expect(qualifiedSelectors(".controls button[aria-pressed='true'] { color: red; }")).toEqual([]);
  });

  test('two attributes on one compound are two claims (chip.module.css’s own shape)', () => {
    expect(qualifiedSelectors(".chip[data-size='md'][data-code='true'] { color: red; }")).toEqual([
      { className: 'chip', attribute: 'data-size' },
      { className: 'chip', attribute: 'data-code' },
    ]);
  });

  test('a rule quoted inside a COMMENT is not a rule — header.module.css now carries exactly that', () => {
    expect(qualifiedSelectors("/* .status[data-mode='paused'] was removed */\n.a { color: red; }")).toEqual([]);
  });

  test('styles.statusText is not a use of styles.status', () => {
    expect(tagsUsing('<span className={styles.statusText} />', 'styles', 'status')).toEqual([]);
    expect(tagsUsing('<span className={styles.status} data-mode="x" />', 'styles', 'status')).toHaveLength(1);
  });

  test('a tag whose attribute value contains ">" is still read to its own end', () => {
    const tags = tagsUsing('<span className={styles.dot} data-n={a > b ? 1 : 2} data-mode="x">', 'styles', 'dot');
    expect(tags).toHaveLength(1);
    expect(tags[0]).toContain('data-mode');
  });
});

describe('⚠ the whole pipeline, on a throwaway pair — the finding it would have made', () => {
  test('the header’s own defect is caught when it is re-created, and not when it is fixed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'unsat-css-'));
    try {
      writeFileSync(
        join(dir, 'widget.module.css'),
        ".status { color: red; }\n.status[data-mode='paused'] { background: blue; }\n.dot { color: blue; }\n",
      );
      const broken =
        "import styles from './widget.module.css';\n" +
        'export const W = (mode: string) => (\n' +
        '  <div className={styles.status}><span className={styles.dot} data-mode={mode} /></div>\n' +
        ');\n';
      writeFileSync(join(dir, 'widget.tsx'), broken);
      const bad = auditFile(join(dir, 'widget.tsx'));
      expect(bad.findings.map((f) => f.selector)).toEqual(['.status[data-mode]']);

      // The same tree with the attribute on the element the rule names: no finding.
      writeFileSync(
        join(dir, 'widget.tsx'),
        broken.replace('<div className={styles.status}>', '<div className={styles.status} data-mode={mode}>'),
      );
      expect(auditFile(join(dir, 'widget.tsx')).findings).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
