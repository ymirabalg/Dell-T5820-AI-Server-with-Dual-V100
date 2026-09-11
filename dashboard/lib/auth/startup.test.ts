import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { BUILD_PHASE, runStartup, startupAction } from '@/lib/auth/startup';
import type { StartupAction, StartupEnvironment } from '@/lib/auth/startup';

/**
 * SPEC.md §5.1's ruling of 2026-09-11: an unusable `/etc/ai-dashboard.env` is a **startup
 * refusal**, not a dashboard that denies every login in silence.
 *
 * ⚠ Everything decidable lives in `lib/auth/startup.ts` precisely so it can be driven here:
 * `instrumentation.ts` is four lines, and a `register()` that grew a branch would be a branch
 * nothing measures. The one line no test can reach is that file's `NEXT_RUNTIME` guard around
 * the dynamic import — there is no edge runtime in this suite to run it in — which is why
 * `startupAction` carries the same check as a second lock and why the file's shape is
 * asserted as text at the bottom of this file.
 */

const REFUSAL = 'ai-dashboard: REFUSING TO START — /etc/ai-dashboard.env …';

const env = (overrides: Partial<StartupEnvironment> = {}): StartupEnvironment => ({
  nodeEnv: 'production',
  nextRuntime: 'nodejs',
  nextPhase: undefined,
  ...overrides,
});

interface Ran {
  readonly action: StartupAction;
  readonly logged: readonly string[];
  readonly exits: readonly number[];
}

const run = (environment: StartupEnvironment, refusal: string | null): Ran => {
  const logged: string[] = [];
  const exits: number[] = [];
  const action = runStartup({
    env: environment,
    refusal: () => refusal,
    log: (message) => logged.push(message),
    exit: (code) => exits.push(code),
  });
  return { action, logged, exits };
};

describe('⚠⚠ a refused credentials file stops the container starting, and says why', () => {
  test('⚠ the four startup verdicts, one row each, and the two skips come first', () => {
    const rows = [
      { what: 'the container, good file', env: env(), refusal: null, expect: 'ok' },
      { what: 'the container, refused file', env: env(), refusal: REFUSAL, expect: 'exit' },
      {
        what: 'a dev server, refused file — warns, because there is no file on a laptop',
        env: env({ nodeEnv: 'development' }),
        refusal: REFUSAL,
        expect: 'warn',
      },
      {
        what: '`next build` — must NEVER read it: an exit here fails the Docker build itself',
        env: env({ nextPhase: BUILD_PHASE }),
        refusal: REFUSAL,
        expect: 'skip',
      },
      {
        what: 'the edge copy of instrumentation, which has no node:fs',
        env: env({ nextRuntime: 'edge' }),
        refusal: REFUSAL,
        expect: 'skip',
      },
      {
        what: 'outside a Next server altogether (no NEXT_RUNTIME), refused file',
        env: env({ nextRuntime: undefined }),
        refusal: REFUSAL,
        expect: 'exit',
      },
    ] as const;

    expect(rows.map((r) => ({ what: r.what, action: startupAction(r.env, r.refusal) }))).toEqual(
      rows.map((r) => ({ what: r.what, action: r.expect })),
    );
  });

  test('⚠ exit(1) is called on the production refusal, and on nothing else', () => {
    expect(run(env(), REFUSAL).exits).toEqual([1]);
    expect(run(env(), null).exits).toEqual([]);
    expect(run(env({ nodeEnv: 'development' }), REFUSAL).exits).toEqual([]);
    expect(run(env({ nextPhase: BUILD_PHASE }), REFUSAL).exits).toEqual([]);
  });

  test('⚠ the refusal is printed on both the exit and the warn path, and never on the ok one', () => {
    // §5 logs NOTHING about authentication. The one exception is this refusal, which the
    // ruling requires to be loud — so the healthy path must stay silent, or the exception
    // becomes the rule.
    expect(run(env(), REFUSAL).logged).toEqual([REFUSAL]);
    expect(run(env(), null).logged).toEqual([]);
    expect(run(env({ nextPhase: BUILD_PHASE }), REFUSAL).logged).toEqual([]);

    // ⚠ The container's copy is the refusal and NOTHING else — no hedging, no second line.
    expect(run(env(), REFUSAL).logged[0]).toBe(REFUSAL);

    // ⚠⚠ …and the warn arm SAYS it is the warn arm. `refusalReport` opens with "REFUSING TO
    // START", which is exact in the container and false on a laptop, where the process then
    // goes on to serve requests — measured 2026-09-11 by running the real `register()` in a
    // real node process with NODE_ENV unset. A message announcing a refusal that does not
    // happen is 11-A18g: a true sentence about the wrong thing, and the fastest way to teach
    // a reader that this particular message can be ignored.
    const warned = run(env({ nodeEnv: 'development' }), REFUSAL);
    expect(warned.logged).toHaveLength(1);
    expect(warned.logged[0]).toContain(REFUSAL);
    expect(warned.logged[0]).toContain('starting anyway');
    expect(warned.logged[0]).toContain('In the container this is exit 1');
  });
});

describe('⚠ instrumentation.ts is the hook, and it stays four lines of wiring', () => {
  const source = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'instrumentation.ts'),
    'utf8',
  );
  const code = source
    .split('\n')
    .filter((l) => !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .join('\n');

  test('⚠ register() guards the runtime and imports the reader dynamically, never at the top', () => {
    // ⚠ Next's own doc: "Next.js calls register in all environments, so it's important to
    // conditionally import any code that doesn't support specific runtimes." A top-level
    // `import … from '@/lib/auth/secrets'` would pull `node:fs` into the edge bundle.
    expect(code).toContain('export async function register()');
    expect(code).toContain("process.env['NEXT_RUNTIME'] !== 'nodejs'");
    expect(code).toContain("await import('@/lib/auth/startup')");
    expect(code).toContain('runStartupCheck()');
    // Nothing is imported at the top of the file at all.
    expect(/^import /m.test(code)).toBe(false);
  });
});
