import { readFileSync, readdirSync } from 'node:fs';

import { describe, expect, test } from 'vitest';

/**
 * HANDOVER §6 rule 1: *"A cell's colour is not `displayed` … Nothing debounced is a cell
 * colour."* For a pure render function, the debounce that rule forbids is structurally
 * impossible only because these components hold no state across renders at all — there is
 * nothing to debounce WITH. That is true of every primitive here today, but it is a fact
 * about the source, not a computation any of the co-located tests exercises: nothing in
 * `chip.test.tsx` or the others would go red if a future edit added a `useState` that held
 * the previous severity. This proves it directly, over the primitives' own source text.
 *
 * Scoped to `components/*.tsx` excluding `.test.tsx` files — a test file has no reason to
 * call a hook either, but that is not what this rule is about, and scanning it would let a
 * hook import inside a test's own render call hide a real one in the component beside it.
 *
 * §5.3's own warning applies: this is a text guardrail over a MODULE-LOCAL vocabulary (a
 * bare `useXxx(` call in the file that defines the component), not a global — so it is
 * guardable by text. It does not need `sourceFiles()`-style tree-walking (HANDOVER §5.3.3):
 * step 9's component list is closed and enumerated by reading the one directory this file
 * lives in, so a new primitive is covered automatically and nothing is hand-listed twice.
 */

const HOOK_CALL = /\buse(?:State|Effect|Ref|Memo|Callback|Reducer|LayoutEffect|ImperativeHandle)\s*\(/;

const componentFiles = readdirSync(new URL('.', import.meta.url))
  .filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))
  .sort();

describe('⚠ no primitive holds state across renders — nothing here can debounce a cell colour', () => {
  test('the component directory actually has files to check — a guard over an empty list proves nothing', () => {
    expect(componentFiles.length).toBeGreaterThan(0);
  });

  test.each(componentFiles)('⚠ the primitive %s calls no React hook', (file) => {
    const text = readFileSync(new URL(file, import.meta.url), 'utf8');
    expect(HOOK_CALL.test(text)).toBe(false);
  });
});
