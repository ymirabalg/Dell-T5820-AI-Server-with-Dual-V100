/**
 * Reading this project's own source as text, for the guards that assert over it.
 *
 * Two guard files need the same two primitives — `lib/guardrails.test.ts` (the server-side
 * timer, tsconfig and import rules, steps 4–7) and `lib/client/guardrails.test.ts` (step 8's
 * client timers and module boundary) — and the pair is behaviour-bearing: a guard that
 * matched inside a comment would be defeated by *prose*, which is the failure mode this tree
 * is unusually exposed to, since every module here explains its own bugs at length.
 *
 * So they live once, here, rather than being copied into the second guard file. That is the
 * same call step 7 made for `base64url.ts` — "two diverged, and the gap made 1 tag in 16 have
 * four accepted spellings" — applied to a smaller thing before it diverges rather than after.
 *
 * ⚠ Not a test file: `lib/fixtures.ts` and `lib/collectors/samples.ts` are the precedent for
 * shared scaffolding living in the source tree. Nothing in `app/` imports it, so it is never
 * traced into the build.
 */

import { readdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** `dashboard/`, resolved from this file rather than from the process's cwd. */
export const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * The same text with every comment replaced by spaces, so offsets are preserved.
 *
 * String and template literals are tracked, so `'http://…'` is not read as a line comment —
 * `llama.ts` builds exactly that URL. Deliberately small and literal: a fuller parser here
 * would be the thing at risk of being wrong.
 */
export function codeOnly(text: string): string {
  const out = [...text];
  let mode: '' | "'" | '"' | '`' | '//' | '/*' = '';
  for (let i = 0; i < out.length; i += 1) {
    const c = out[i] ?? '';
    const next = out[i + 1] ?? '';
    if (mode === '//') {
      if (c === '\n') mode = '';
      else out[i] = ' ';
    } else if (mode === '/*') {
      if (c === '*' && next === '/') {
        out[i] = ' ';
        out[i + 1] = ' ';
        i += 1;
        mode = '';
      } else if (c !== '\n') out[i] = ' ';
    } else if (mode !== '') {
      if (c === '\\') i += 1;
      else if (c === mode) mode = '';
    } else if (c === '/' && next === '/') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 1;
      mode = '//';
    } else if (c === '/' && next === '*') {
      out[i] = ' ';
      out[i + 1] = ' ';
      i += 1;
      mode = '/*';
    } else if (c === "'" || c === '"' || c === '`') {
      mode = c;
    }
  }
  return out.join('');
}

/** Every hand-written source file in the project, node_modules and build output excluded. */
export function sourceFiles(): string[] {
  const skip = new Set(['node_modules', '.next', 'out', '.git', 'pipeline']);
  const wanted = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
  const found: string[] = [];

  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (wanted.test(entry)) found.push(full);
    }
  };

  walk(projectRoot);
  return found;
}
