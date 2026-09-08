import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

/**
 * HANDOVER §6 rule 1: *"A cell's colour is not `displayed` … Nothing debounced is a cell
 * colour."* For a pure render function, the debounce that rule forbids needs somewhere to
 * hold the previous reading, and these components hold no state across renders at all. That
 * is a fact about the source, not a computation any co-located test exercises: nothing in
 * `chip.test.tsx` or the others would go red if a future edit added a hook that held the
 * previous severity. This asserts it directly, over the primitives' own source text.
 *
 * ### ⚠ An ALLOWLIST of hook names, not a blocklist — the correction that matters here
 *
 * This guard used to enumerate eight hooks
 * (`use(State|Effect|Ref|Memo|Callback|Reducer|LayoutEffect|ImperativeHandle)`) and call the
 * debounce "structurally impossible". **It was not.** The enumeration missed
 * `useSyncExternalStore` — the hook step 8's own client runtime is consumed with, named in
 * HANDOVER §3.1 — and `useContext`, `use`, `useTransition`, `useDeferredValue`,
 * `useOptimistic` and `useActionState` besides. A component could have subscribed to the
 * store, coloured itself from the **debounced** band, and stayed green through the whole
 * suite. A blocklist of names is defeated by any name not on it, including hooks React has
 * not shipped yet; matching the *shape* React itself mandates — `use` followed by a capital,
 * called — cannot be. Same species as §5.3 note 3's "a guard over a hard-coded file list is
 * defeated by adding a file", one level down: a guard over a hard-coded *name* list is
 * defeated by adding a name.
 *
 * The bare `use(` form (React 19's resource hook, and `React.use(`) is matched by the same
 * pattern's optional tail.
 *
 * ### ⚠ The file list is WALKED, not read one level deep
 *
 * `readdirSync` on this directory alone stopped at the top level, so step 10's
 * `components/panels/*.tsx` would have been outside the guard entirely — §5.3 note 3 in its
 * directory form. The walk recurses, and a fixture below proves the recursion rather than
 * assuming it.
 *
 * Scoped to `*.tsx` excluding `.test.tsx` — a test file has no reason to call a hook either,
 * but that is not what this rule is about, and scanning it would let a hook inside a test's
 * own render call hide a real one in the component beside it.
 *
 * §5.3's own warning applies: this is a text guardrail over a MODULE-LOCAL vocabulary (a
 * `useXxx(` call in the file that defines the component), not a global, so it is guardable by
 * text at all.
 */

/** `useState(`, `React.useSyncExternalStore(`, `use(` — every shape React's own naming rule allows. */
const HOOK_CALL = /\buse(?:[A-Z]\w*)?\s*\(/;

const COMPONENTS_DIR = new URL('.', import.meta.url);

/** Every non-test `.tsx` under `dir`, recursively, as paths relative to it. */
const componentFilesUnder = (dir: string): string[] => {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) =>
    a.name.localeCompare(b.name),
  )) {
    if (entry.isDirectory()) {
      out.push(...componentFilesUnder(join(dir, entry.name)).map((f) => join(entry.name, f)));
      continue;
    }
    if (entry.name.endsWith('.tsx') && !entry.name.includes('.test.')) out.push(entry.name);
  }
  return out;
};

const componentsRoot = fileURLToPath(COMPONENTS_DIR);
const componentFiles = componentFilesUnder(componentsRoot);

describe('⚠ no primitive holds state across renders — nothing here can debounce a cell colour', () => {
  test('the component directory actually has files to check — a guard over an empty list proves nothing', () => {
    expect(componentFiles.length).toBeGreaterThan(0);
  });

  test.each(componentFiles)('⚠ the primitive %s calls no React hook', (file) => {
    const text = readFileSync(join(componentsRoot, file), 'utf8');
    expect(HOOK_CALL.test(text)).toBe(false);
  });
});

/*
 * ⚠ The guard's own vocabulary, tested from both sides (HANDOVER §5.1). The `false` cases
 * matter as much as the `true` ones: a pattern that matched everything would pass the table
 * above by accident and fail the whole directory, which is not the same guard.
 */
describe('⚠ the hook pattern matches by SHAPE, so a hook it was never told about is still caught', () => {
  test.each([
    'useState(',
    'React.useState(',
    'useEffect(',
    'useSyncExternalStore(', // ⚠ the hook step 8 built its runtime on
    'useContext(',
    'useTransition(',
    'useDeferredValue(',
    'useOptimistic(',
    'useActionState(',
    'useId(',
    'useLayoutEffect(',
    'useImperativeHandle(',
    'useSomethingReactHasNotShippedYet(',
    'use (',
    'use(',
    'React.use(',
  ])('⚠ a hook call is matched: %s', (call) => {
    expect(HOOK_CALL.test(`const x = ${call}foo);`)).toBe(true);
  });

  test.each([
    'const pause = 1;',
    'element.focus();',
    'const userAgent = navigator.userAgent;',
    'because(x);',
    'const misuse = 3;',
    'reuse;',
    "const label = 'unused';",
  ])('a non-hook line is not matched: %s', (line) => {
    expect(HOOK_CALL.test(line)).toBe(false);
  });
});

/*
 * ⚠ §5.3 note 3, in its directory form. Step 10 adds `components/panels/`; a one-level
 * `readdirSync` would have left every file in it unguarded, and nothing would have said so.
 */
describe('⚠ the component walk recurses into subdirectories', () => {
  test('⚠ a nested .tsx is enumerated, and a nested .test.tsx is not', () => {
    const root = mkdtempSync(join(tmpdir(), 'purity-walk-'));
    try {
      writeFileSync(join(root, 'top.tsx'), 'export const A = 1;\n');
      mkdirSync(join(root, 'panels', 'deep'), { recursive: true });
      writeFileSync(join(root, 'panels', 'nested.tsx'), 'export const B = 2;\n');
      writeFileSync(join(root, 'panels', 'nested.test.tsx'), 'export const C = 3;\n');
      writeFileSync(join(root, 'panels', 'deep', 'deeper.tsx'), 'export const D = 4;\n');

      const found = componentFilesUnder(root);
      expect(found).toContain('top.tsx');
      expect(found).toContain(join('panels', 'nested.tsx'));
      expect(found).toContain(join('panels', 'deep', 'deeper.tsx'));
      expect(found).not.toContain(join('panels', 'nested.test.tsx'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test('⚠ a hook in a nested component is caught by the two halves together', () => {
    const root = mkdtempSync(join(tmpdir(), 'purity-nested-'));
    try {
      mkdirSync(join(root, 'panels'), { recursive: true });
      writeFileSync(
        join(root, 'panels', 'gpu-panel.tsx'),
        "const s = useSyncExternalStore(sub, get, getServer);\n",
      );
      const offenders = componentFilesUnder(root).filter((f) =>
        HOOK_CALL.test(readFileSync(join(root, f), 'utf8')),
      );
      expect(offenders).toEqual([join('panels', 'gpu-panel.tsx')]);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
