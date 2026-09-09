/**
 * 10c1-A8-audit (HANDOVER §9) — the static half of *"a CSS-module import is a Proxy."*
 *
 * Verified by 10c-1's parent directly (HANDOVER §0.6, correcting an earlier, wrong claim that
 * the import resolves to `{}`): `styles.gpu0` returns `_gpu0_e75739` and
 * `styles.zzzNoSuchRule` returns `_zzzNoSuchRule_e75739`. **Every key resolves.** `tsc` sees
 * an index-signature type, so it is silent too. That means a deleted or misspelled class name
 * is invisible to the compiler AND to the entire render-test suite — the class still "exists"
 * (as a hash of a name nothing styles), the component still renders, and nothing in
 * `renderToStaticMarkup` output looks wrong. `alarm-banner.tsx`'s `styles.item` (no `.item`
 * rule in `alarm-banner.module.css`) was one live instance, found by the parent reading the
 * two files side by side and removed in 10c-1; this is the mechanical version of that reading.
 *
 * ### The rule
 *
 * For every non-test `.ts`/`.tsx` under `components/`/`app/` importing a sibling
 * `<name>.module.css` — single- or double-quoted, default or namespace form — every
 * `<localName>.<property>` access in that file must name a class the CSS file actually
 * declares (as `.property` somewhere in a selector). ⚠ The extension and the quote style were
 * both narrower than this sentence until 10c-2's reconciliation (adversarial F5/F6); each
 * omission removed whole files from the audit and returned `[]` rather than an error, which is
 * why the population check now names any file that mentions a stylesheet and produces no audit.
 * The reverse direction — a declared class
 * nothing references — is NOT checked here: that is dead CSS, a cost paid at build time, not
 * a "this component silently renders wrong" bug, and conflating the two would double this
 * guard's scope for a much lower-value class of finding.
 *
 * The import's LOCAL NAME is read from the import statement itself (not assumed to be
 * `styles`), so a differently-named default import is still covered — though every one of
 * today's eighteen CSS-module imports does use `styles`.
 *
 * ### What this handles, because the handoff named them explicitly
 *
 * - **`:global(...)`.** A selector's `:global(.foo)` names a real, unmangled global class —
 *   it is not a member of the module's exported object, so a `styles.foo` reaching for it
 *   would be reaching for something that was never there. Content inside `:global(...)` is
 *   excluded from the declared set for exactly this reason: a `styles.X` that resolves ONLY
 *   inside a `:global()` wrapper is exactly as dangling as one that does not exist at all.
 *   (No stylesheet in this project uses `:global` today — proven absent, not merely assumed,
 *   by the fixture below and a directory-wide check.)
 * - **`composes: … from …`.** The composing class itself (`.foo { composes: bar from
 *   './other.module.css'; }`) is still a real local declaration — `.foo` — so it needs no
 *   special-casing; the plain "every `.` starts a class token" extraction already finds it.
 *   (Also unused today; the guard does not depend on that.)
 * - **Dynamic access (`styles[expr]`).** Unreadable by a text scanner, so — matching Q1's
 *   rule that a scanner must REPORT what it cannot read rather than silently pass it —
 *   any `<localName>[` in a covered file is printed as a named, unresolved case rather than
 *   silently treated as zero uses. None exist today; the diagnostic proves it rather than
 *   assuming it (see `dynamicStylesAccess` below and its own describe block).
 *
 * ### What it cannot catch
 *
 * - A class declared **only** as a CSS value fragment this scanner cannot tell from a real
 *   selector — e.g. a hypothetical `url(../x.png)` would spuriously "declare" a class named
 *   `png`. No stylesheet here uses `url(...)`, so this has not been exercised; a text scanner
 *   over CSS cannot fully distinguish a selector position from a value position without a
 *   real parser (the same trade-off `lib/source-text.ts`'s `codeOnly` makes for TypeScript).
 * - The REVERSE direction (dead, unreferenced CSS) — named above, and out of scope on purpose.
 * - A class name that resolves for the WRONG reason — e.g. two components each importing
 *   their own stylesheet but one accidentally reusing the other's import path. This guard
 *   only checks "does the pair this file's own import names agree", never "should this file
 *   be importing a different pair".
 */

import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { codeOnly, projectRoot } from './source-text';

const SCAN_ROOTS = ['components', 'app'].map((d) => join(projectRoot, d));
const SKIP_DIRS = new Set(['node_modules', '.next', 'out']);

/**
 * Every non-test SOURCE file under the scan roots — `.ts` as well as `.tsx`.
 *
 * ⚠ **Widened by 10c-2's RECONCILIATION (adversarial F5), which found both 10c-2 walking
 * guards filtering on `.tsx` alone.** The exposure here is smaller than the L11 guard's (a
 * `.ts` file importing a CSS module is unusual — none does today), but it is the same
 * one-word omission and the same silent narrowing, so it is closed the same way.
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

interface CssModuleImport {
  readonly localName: string;
  readonly cssPath: string; // absolute
}

/**
 * Every `import <name> from '<relative>.module.css'` in `text`, resolved against `fromDir`.
 *
 * ⚠ **Widened by 10c-2's RECONCILIATION (adversarial F6).** The pattern accepted SINGLE quotes
 * only, so a double-quoted import — what a differently-configured formatter or a different
 * editor inserts — removed that whole file from the audit and returned `[]` rather than an
 * error. Namespace form (`import * as styles from …`) is accepted for the same reason. A
 * silent omission in a guard is worse than the bug it hunts, and the population check below
 * now refuses to let one pass unnoticed either way.
 */
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

/** `<localName>.identifier` accesses in `text` — a plain identifier after the dot only; a
 *  computed member (`styles[…]`) is deliberately not matched here, see {@link dynamicAccessesOf}. */
function propertyAccessesOf(text: string, localName: string): Set<string> {
  const props = new Set<string>();
  const RE = new RegExp(`\\b${localName}\\.([A-Za-z_$][\\w$]*)`, 'g');
  for (const m of text.matchAll(RE)) {
    if (m[1] !== undefined) props.add(m[1]);
  }
  return props;
}

/** `<localName>[` occurrences — unreadable by this scanner, reported rather than ignored. */
function dynamicAccessesOf(text: string, localName: string): number {
  const RE = new RegExp(`\\b${localName}\\[`, 'g');
  return [...text.matchAll(RE)].length;
}

/** Every class name a `.module.css` file DECLARES — any `.identifier` outside a comment or a
 *  `:global(...)` wrapper. Not scoped to rule starts on purpose: `.a,\n.b {` (grid.module.css's
 *  own shape) and `.a > *` both declare real, referenceable classes without `.a {` appearing
 *  verbatim. */
export function declaredClasses(css: string): Set<string> {
  let text = css.replace(/\/\*[\s\S]*?\*\//g, ' '); // comments first
  text = text.replace(/:global\(([^)]*)\)/g, (whole) => ' '.repeat(whole.length)); // then :global(...)
  // Then quoted strings — `composes: bar from './other.module.css'` embeds a file path whose
  // own dots (`.module`, `.css`) would otherwise be misread as class-name tokens.
  text = text.replace(/'[^']*'|"[^"]*"/g, (whole) => ' '.repeat(whole.length));
  const classes = new Set<string>();
  for (const m of text.matchAll(/\.([A-Za-z_-][\w-]*)/g)) {
    if (m[1] !== undefined) classes.add(m[1]);
  }
  return classes;
}

interface FileAudit {
  readonly file: string;
  readonly cssFile: string;
  readonly dangling: string[]; // styles.X with no matching declared class
  readonly dynamicAccessCount: number;
}

/** One `.tsx` file's every CSS-module import, audited. Empty array if it imports none.
 *
 * ⚠ Scans `codeOnly(text)`, never the raw source — this file's own history is the proof it
 * matters: `alarm-banner.tsx`'s doc comment narrating the ORIGINAL `styles.item` bug quotes
 * `styles.item` and `styles.X` verbatim in prose, and an unstripped scan flagged both as if
 * they were live accesses (10a's F3 lesson, hit again while building the guard that lesson
 * predicted would need it). */
export function auditFile(absTsxPath: string): FileAudit[] {
  const text = codeOnly(readFileSync(absTsxPath, 'utf8'));
  const dir = dirname(absTsxPath);
  const audits: FileAudit[] = [];
  for (const { localName, cssPath } of cssModuleImports(text, dir)) {
    const used = propertyAccessesOf(text, localName);
    const declared = declaredClasses(readFileSync(cssPath, 'utf8'));
    const dangling = [...used].filter((u) => !declared.has(u)).sort();
    audits.push({
      file: absTsxPath,
      cssFile: cssPath,
      dangling,
      dynamicAccessCount: dynamicAccessesOf(text, localName),
    });
  }
  return audits;
}

const files = componentSourceFiles();
const audits = files.flatMap(auditFile);

describe('⚠ 10c1-A8-audit — every styles.X names a real rule in its sibling .module.css', () => {
  /**
   * ⚠ **Strengthened by 10c-2's RECONCILIATION (adversarial F6/F8).** The net used to be
   * `audits.length > 0` — and 18 audits narrowing to 1 would have passed it, leaving the guard
   * reporting on one file while reading as though it covered every component. This is the
   * PROPORTIONAL form the adversarial measured as free: 18 files mention a CSS module and 18
   * are audited, so any file that drops out of the audit — a quote style the import pattern
   * does not read, a walk that stops finding it — is named here instead of vanishing.
   */
  test('every file that mentions a CSS module is actually audited — not merely "more than zero"', () => {
    const mentions = files.filter((f) => /\.module\.css/.test(codeOnly(readFileSync(f, 'utf8'))));
    const audited = new Set(audits.map((a) => a.file));
    const unaudited = mentions.filter((f) => !audited.has(f)).map((f) => f.slice(projectRoot.length));
    expect(
      unaudited,
      `files naming a .module.css that produced no audit: ${unaudited.join(', ')}`,
    ).toEqual([]);
    expect(audits.length).toBeGreaterThanOrEqual(15);
  });

  test.each(audits.map((a) => [a.file.slice(projectRoot.length), a] as const))(
    '⚠ no dangling class reference exists anywhere in %s',
    (_label, audit) => {
      expect(audit.dangling, JSON.stringify(audit.dangling)).toEqual([]);
    },
  );

  test('no file reaches its stylesheet through a computed member this scanner cannot read', () => {
    // Q1's rule: report what cannot be read, never silently treat it as zero. Proven absent
    // today rather than assumed — a real dynamic access would fail this, not vanish from it.
    const dynamic = audits.filter((a) => a.dynamicAccessCount > 0).map((a) => a.file.slice(projectRoot.length));
    expect(dynamic, `dynamic styles[...] access found in: ${dynamic.join(', ')}`).toEqual([]);
  });

  test('no stylesheet in the project uses :global — proven, not assumed', () => {
    const globalUsers = files
      .flatMap((f) => cssModuleImports(codeOnly(readFileSync(f, 'utf8')), dirname(f)))
      .map((i) => i.cssPath)
      .filter((cssPath, i, arr) => arr.indexOf(cssPath) === i)
      .filter((cssPath) => /:global\(/.test(readFileSync(cssPath, 'utf8')));
    expect(globalUsers.map((p) => p.slice(projectRoot.length))).toEqual([]);
  });
});

/*
 * ⚠ The guard's own vocabulary, both directions (HANDOVER §5.1).
 */
describe('⚠ declaredClasses reads every selector shape this project actually uses', () => {
  test('a plain rule', () => {
    expect(declaredClasses('.foo { color: red; }')).toEqual(new Set(['foo']));
  });

  test('an attribute-suffixed selector (chip.module.css’s own shape)', () => {
    expect(declaredClasses(".chip[data-size='sm'] { font-size: 1em; }")).toEqual(
      new Set(['chip']),
    );
  });

  test('a comma-separated multi-selector rule (grid.module.css’s own shape)', () => {
    expect(declaredClasses('.gpu0,\n.gpu1 {\n  min-width: 0;\n}')).toEqual(new Set(['gpu0', 'gpu1']));
  });

  test('a descendant combinator (grid.module.css’s "> *" shape)', () => {
    expect(declaredClasses('.gpu0 > * {\n  flex: 1 1 auto;\n}')).toEqual(new Set(['gpu0']));
  });

  test('a class name mentioned only in a comment is not declared', () => {
    expect(declaredClasses('/* see .foo elsewhere */\n.bar { color: red; }')).toEqual(new Set(['bar']));
  });

  test('a name inside :global(...) is excluded — it is not a module-local export', () => {
    expect(declaredClasses(':global(.sr-only) { position: absolute; }')).toEqual(new Set());
  });

  test('a local class combined with a :global() pseudo-class keeps only the local half', () => {
    expect(declaredClasses(".chip:global(.dark-theme) { color: white; }")).toEqual(new Set(['chip']));
  });

  test('a decimal value (0.75rem, 1.1em) is never read as a class name', () => {
    expect(declaredClasses('.pad { padding: 0.75rem; font-size: 1.1em; }')).toEqual(new Set(['pad']));
  });

  test('composes: … still declares the composing class itself', () => {
    expect(
      declaredClasses(".foo {\n  composes: bar from './other.module.css';\n}"),
    ).toEqual(new Set(['foo']));
  });
});

describe('⚠ auditFile — the whole pipeline, proven on a throwaway fixture pair', () => {
  test('a misspelled styles.X is flagged; a correctly spelled one is not', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dangling-css-'));
    try {
      writeFileSync(join(dir, 'widget.module.css'), '.item {\n  color: red;\n}\n');
      writeFileSync(
        join(dir, 'widget.tsx'),
        "import styles from './widget.module.css';\n" +
          'export const Widget = () => <div className={styles.item}><span className={styles.itme} /></div>;\n',
      );
      const [audit] = auditFile(join(dir, 'widget.tsx'));
      expect(audit?.dangling).toEqual(['itme']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a computed member access is counted, not silently skipped', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dangling-css-dyn-'));
    try {
      writeFileSync(join(dir, 'widget.module.css'), '.item {\n  color: red;\n}\n');
      writeFileSync(
        join(dir, 'widget.tsx'),
        "import styles from './widget.module.css';\n" +
          'export const Widget = (k: string) => <div className={styles[k]} />;\n',
      );
      const [audit] = auditFile(join(dir, 'widget.tsx'));
      expect(audit?.dynamicAccessCount).toBe(1);
      expect(audit?.dangling).toEqual([]); // nothing to compare a computed key against
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a file with no CSS-module import audits to an empty list, not an error', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dangling-css-none-'));
    try {
      writeFileSync(join(dir, 'widget.tsx'), 'export const Widget = () => <div />;\n');
      expect(auditFile(join(dir, 'widget.tsx'))).toEqual([]);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  /*
   * ⚠ Added by 10c-2's RECONCILIATION (adversarial F6) — the import shapes that used to remove
   * a whole file from the audit silently. Both are measured, not assumed: the adversarial built
   * exactly these fixture pairs and got `[]` back from both.
   */
  test('a DOUBLE-quoted css-module import is audited, not silently skipped', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dangling-css-dq-'));
    try {
      writeFileSync(join(dir, 'widget.module.css'), '.item {\n  color: red;\n}\n');
      writeFileSync(
        join(dir, 'widget.tsx'),
        'import styles from "./widget.module.css";\n' +
          'export const Widget = () => <div className={styles.itme} />;\n',
      );
      const [audit] = auditFile(join(dir, 'widget.tsx'));
      expect(audit?.dangling).toEqual(['itme']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test('a namespace import (import * as styles) is audited too', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dangling-css-ns-'));
    try {
      writeFileSync(join(dir, 'widget.module.css'), '.item {\n  color: red;\n}\n');
      writeFileSync(
        join(dir, 'widget.tsx'),
        "import * as styles from './widget.module.css';\n" +
          'export const Widget = () => <div className={styles.itme} />;\n',
      );
      const [audit] = auditFile(join(dir, 'widget.tsx'));
      expect(audit?.dangling).toEqual(['itme']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
