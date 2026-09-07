import { fileURLToPath } from 'node:url';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  /**
   * ⚠ `tsconfig.json` declares `paths: { "@/*": ["./*"] }` and Next resolves it from the
   * tsconfig itself, so `@/` imports **typecheck and build** without this. Vitest does not
   * read `paths`, so without the alias every `@/` import fails at *test* time with an
   * unresolved-module error — loudly, but only once a step actually writes one. HANDOVER
   * states `@/` as the project convention, so steps 6, 9 and 10 would each have written
   * conforming imports, watched them typecheck, and hit it in their own test run.
   *
   * `fileURLToPath`, **not** `new URL(...).pathname`: the latter percent-encodes, so a
   * checkout under a path containing a space resolves to a directory that does not exist.
   *
   * ⚠ Writing this is not evidence it took — this box's own history is ufw's `is-active`
   * on a disabled firewall and `StartLimit*` silently ignored in `[Service]`. A text
   * assertion against this file would be that mistake in a new place, so
   * `lib/guardrails.test.ts` proves it by **resolving a real `@/` import at run time**.
   */
  resolve: {
    alias: { '@': fileURLToPath(new URL('.', import.meta.url)) },
  },
  test: {
    include: ['**/*.test.ts', '**/*.test.tsx'],
    exclude: ['node_modules/**', '.next/**', 'out/**'],

    /**
     * Type-level tests are not decoration here — the contract in `lib/types.ts` is
     * enforced by the compiler, so the suite has to run the compiler. `*.test-d.ts`
     * files are checked with `tsc` against the project tsconfig; a `@ts-expect-error`
     * that stops erroring (because someone loosened a type) is itself a compile error,
     * so `pnpm test` goes red rather than quietly passing.
     */
    typecheck: {
      enabled: true,
      include: ['**/*.test-d.ts'],
      tsconfig: './tsconfig.json',
    },
  },
});
