import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

/**
 * ⚠ A SEPARATE config, so `pnpm test` can never pick these up.
 *
 * `vitest.config.mts` includes `**` + `*.test.ts`; a probe under `scripts/` would be swept in
 * and would then hit the network on every run — which is the opposite of a suite. Probes are
 * diagnostics against a live box: they are run deliberately, by a person, and they are allowed
 * to fail because the box is off.
 *
 *     pnpm vitest run --config vitest.probe.mts
 */
export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    include: ['scripts/**/*.probe.ts'],
    testTimeout: 60_000,
    // One at a time: several probes polling one box would fight over §4's 2 s cache and
    // over the outstanding-call rule, and the point is to observe those, not to disturb them.
    fileParallelism: false,
  },
});
