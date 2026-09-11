/**
 * The startup refusal — SPEC.md §5.1's ruling of 2026-09-11, INSTALL-SPEC.md §11.2.
 *
 * > "Our own reader **refuses** a quoted, whitespace-padded or multi-line value at startup and
 * > says which key and why. The silent failure becomes a loud one."
 *
 * `instrumentation.ts` is four lines that call {@link runStartupCheck}; everything decidable
 * lives here, where it can be driven from a test rather than from a server boot.
 *
 * ### ⚠ Why an explicit `process.exit`, and not a thrown error
 *
 * Next's own documentation says `register` *"is called once when a new Next.js server
 * instance is initiated, and must complete before the server is ready to handle requests"* —
 * it does not say what happens when it rejects, and a startup refusal that leaves the server
 * running would be the silent failure this ruling exists to remove. `exit(1)` is the one
 * behaviour that cannot be interpreted. The unit's `Restart=always` then retries it, and
 * `StartLimitBurst=5` inside `StartLimitIntervalSec=300` stops the retries after five — so a
 * credentials file nobody can fix by waiting ends in `failed`, which `check`'s `ActiveState`
 * row reports. Bounded, visible, and it does not spin.
 *
 * ### ⚠ Three states, not two — and the third is why local development still runs
 *
 * | when | verdict |
 * |---|---|
 * | not the Node runtime, or `next build`'s own phase | **skip** — nothing to read, and the edge copy has no `node:fs` |
 * | the file is good | **ok** |
 * | it is refused, `NODE_ENV=production` | **exit 1**, naming every key and reason |
 * | it is refused, anywhere else | **warn** and carry on |
 *
 * The warn arm is not a weakening of the ruling: the ruling is about the **deployment**, and
 * the container is `NODE_ENV=production` by the Dockerfile's own `ENV` (asserted in
 * `packaging.test.ts`). A `pnpm dev` on a laptop has no `/etc/ai-dashboard.env` and never
 * will; exiting there would make the dashboard impossible to develop and would teach whoever
 * hit it to delete this file — *a refusal that fires on a correct configuration teaches an
 * operator to ignore the one that matters* (HANDOVER §0.13). It still prints the reasons.
 */

import { productionSecrets } from './secrets';

/** What the runtime says about itself. Every field is `process.env`-shaped: possibly absent. */
export interface StartupEnvironment {
  /** `process.env.NODE_ENV`. */
  readonly nodeEnv: string | undefined;
  /** `process.env.NEXT_RUNTIME` — `'nodejs'` or `'edge'`; absent outside a Next server. */
  readonly nextRuntime: string | undefined;
  /** `process.env.NEXT_PHASE` — `'phase-production-build'` while `next build` runs. */
  readonly nextPhase: string | undefined;
}

/** `skip` = do not even look · `ok` · `warn` = say it and continue · `exit` = refuse to start. */
export type StartupAction = 'skip' | 'ok' | 'warn' | 'exit';

/** `next build`'s own phase, as Next spells it in `next/constants`. */
export const BUILD_PHASE = 'phase-production-build';

/**
 * What to do, given the runtime and whether the file was refused.
 *
 * ⚠ Pure, and total. The `skip` arms come first and both are load-bearing:
 *
 * - **`next build` must never read this file.** The image is built on a box where
 *   `/etc/ai-dashboard.env` may not exist and where it certainly must not be baked in; an
 *   `exit(1)` during `next build` would fail the Docker build itself, which is the one
 *   failure that would look nothing like its cause.
 * - **The edge copy has no `node:fs`.** Next calls `register` in every runtime;
 *   `instrumentation.ts` guards the dynamic import as well, and this is the second lock —
 *   that guard is the one line of this feature a test cannot reach.
 */
export const startupAction = (
  env: StartupEnvironment,
  refusal: string | null,
): StartupAction => {
  if (env.nextRuntime !== undefined && env.nextRuntime !== 'nodejs') return 'skip';
  if (env.nextPhase === BUILD_PHASE) return 'skip';
  if (refusal === null) return 'ok';
  return env.nodeEnv === 'production' ? 'exit' : 'warn';
};

/** Everything {@link runStartup} touches outside itself. Replaced wholesale in tests. */
export interface StartupDeps {
  readonly env: StartupEnvironment;
  /** The refusal text, or `null`. `productionSecrets.refusal` in production. */
  readonly refusal: () => string | null;
  /** Where a refusal is written. `console.error` in production — stderr, so journald keeps it. */
  readonly log: (message: string) => void;
  /** `process.exit` in production. */
  readonly exit: (code: number) => void;
}

/**
 * Run the check and act on it. Returns what it did, so a test asserts the action and the
 * output rather than only the output.
 *
 * ⚠ It logs the refusal and **nothing else**. Not on the `ok` path, where §5's *"nothing is
 * logged about authentication"* still binds; and never a value, because
 * {@link refusalReport} is the only thing it prints and that function cannot be handed one.
 */
export const runStartup = (deps: StartupDeps): StartupAction => {
  const refusal = deps.refusal();
  const action = startupAction(deps.env, refusal);
  if (action === 'exit' || action === 'warn') {
    // ⚠ The warn arm says that it IS the warn arm. `refusalReport`'s first line is "REFUSING
    // TO START", which is true in the container and false on a laptop — and a message that
    // announces a refusal on a process that then serves requests is 11-A18g's defect: a true
    // sentence about the wrong thing, teaching whoever reads it that this message means
    // nothing. Measured 2026-09-11 by running the real `register()` with NODE_ENV unset: it
    // printed "REFUSING TO START" and then reached the point where the server accepts
    // requests. The container's copy is unchanged, because there the sentence is exact.
    deps.log(
      action === 'warn'
        ? `${refusal as string}\n  (NODE_ENV is not 'production', so this is a WARNING and the ` +
          'server is starting anyway. In the container this is exit 1)'
        : (refusal as string),
    );
    if (action === 'exit') deps.exit(1);
  }
  return action;
};

/** The production wiring — the only thing `instrumentation.ts` needs to know about. */
export const runStartupCheck = (): StartupAction =>
  runStartup({
    env: {
      nodeEnv: process.env['NODE_ENV'],
      nextRuntime: process.env['NEXT_RUNTIME'],
      nextPhase: process.env['NEXT_PHASE'],
    },
    refusal: () => productionSecrets.refusal(),
    log: (message: string) => {
      console.error(message);
    },
    exit: (code: number) => {
      process.exit(code);
    },
  });
