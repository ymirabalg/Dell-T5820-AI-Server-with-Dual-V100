/**
 * The process's single read of `/etc/ai-dashboard.env` — SPEC.md §5.1 (`11-Q2`).
 *
 * Kept apart from `secret-file.ts` so that the parser, the rule table and every refusal
 * message stay free of `node:fs` and can be measured as pure functions. This module is the
 * only thing in the auth path that touches the filesystem.
 *
 * ⚠ **Every composition root in the auth path reads from HERE, and none of them reads
 * `process.env` any more** — `lib/auth/authorize.ts`, `lib/auth/handler.ts` and `proxy.ts`.
 * That is the ruling: the two secrets never enter the container's environment, so
 * `docker inspect` and `/proc/1/environ` have nothing to show. `dashboard.sh check` asserts
 * the absence from the other side, because *the ruling is worthless if a later edit puts them
 * back and nothing notices*.
 *
 * ⚠ `STANDING` is NOT here. It is configuration rather than a secret, it stays an environment
 * variable (`docker run -e STANDING`), and `lib/telemetry/source.ts` reads it from
 * `process.env` exactly as it always has.
 *
 * ---
 *
 * ### ⚠⚠ ONE read for the PROCESS, and this file is the only reason that is true
 *
 * **The defect this shape exists to remove, measured 2026-09-11 (`11b-A3`).** `next build`
 * bundles this module into **three** server chunks of `.next/standalone` — the instrumentation
 * entry, the gate (`proxy.ts`) and the route handlers — and a module-level
 * `makeSecretSource(…)` gives each of them its **own** memo, filled at its own moment. So:
 * startup validated the file and the server went ready; an **in-place** append (`>>`, `tee
 * -a`, an editor with `backupcopy=yes`, a config-management tool) then made the gate's and the
 * routes' copies read a refused file; both memoised an **empty** `Environment`; every login
 * returned **401**; **nothing was logged**, because `runStartup` is the only thing that ever
 * consults `refusal()` and it had already run; and the process never exited, so
 * `Restart=always` never fired and `StartLimitBurst` never counted. That is O20's exact
 * symptom — *a dashboard that will not open and will not say why* — reached **through** the
 * guard built to make O21 loud.
 *
 * **Two honest shapes were available and this is the first of them: one read, shared.** The
 * cell below is keyed by a registered `Symbol`, so every bundled copy of this module in the
 * Node realm resolves the **same** source and the file is read once for the process, by
 * whichever entrance is first. A post-boot edit then cannot change behaviour at all, which is
 * §4's own precedent — *a `STANDING` change takes effect on the next container restart* — and
 * it is what `set-password`'s and `configure`'s *"run `dashboard.sh restart`"* warnings have
 * always promised. The alternative shape, re-reading per request while keeping the last good
 * configuration, was rejected: it would make the gate and the route able to straddle a rewrite
 * (the very thing the memo's own comment says it exists to prevent), and a request path that
 * re-reads turns an unreadable file into a `readFileSync` per request.
 *
 * ⚠⚠ **The property this is TESTED on is "never silently degrades", not "reads once."**
 * Sharing is what makes the ordinary case correct; it is not what makes the failure safe.
 * `makeSecretSource`'s `onDegraded` is: if `environment()` — a **request** path — is the
 * entrance that performs the read and the file is refused, the refusal reaches stderr before
 * the empty environment is returned, **once**, with a headline that says the server is running
 * and denying rather than borrowing the startup check's *"REFUSING TO START"*. So the claim
 * holds in every ordering, including the one where `register()` never ran and nothing else
 * would ever have said a word:
 *
 * > **`credentialEnvironment()` never returns an empty environment without a refusal having
 * > been written to stderr** — by the startup check that read the file, or by this.
 *
 * ⚠ A refusal on stderr is not §5's *"nothing is logged about authentication"*. It names
 * **keys and reasons**, never a value, never a request, never an attempt, and it is written at
 * most once per process — it is a statement about the file, which is configuration.
 */

import { readFileSync, statSync } from 'node:fs';

import type { Environment } from './config';
import { SECRET_ENV_FILE, makeSecretSource } from './secret-file';
import type { SecretSource } from './secret-file';

/**
 * The key the three bundled copies of this module meet on.
 *
 * ⚠ `Symbol.for`, not a module-level `const`: a module-level binding is exactly the thing
 * `next build` duplicates. The global symbol registry is shared across every realm of the
 * agent, and `globalThis` is shared by every Node-runtime chunk of one server process. The
 * **edge** runtime is a different context and does not share it — which costs nothing, because
 * the edge copy never reads this file at all (`instrumentation.ts` guards the import, and
 * `startupAction` refuses to look outside the Node runtime).
 *
 * ⚠ The date is in the key on purpose. If the shape of what is stored here ever changes, a
 * mixed pair of chunks must not silently agree about a cell they disagree about the meaning of.
 */
const CREDENTIAL_CELL = Symbol.for('ai-dashboard.credentials.2026-09-11');

type CellHolder = { [CREDENTIAL_CELL]?: SecretSource };

/**
 * Read the mounted file's bytes.
 *
 * ⚠ **`statSync` first, and it is not decoration** (`11b-A13`). `readFileSync` on a FIFO
 * **blocks until a writer appears** — measured: the process printed nothing and was still
 * alive after 6 s. `register()` would then never return, `NextNodeServer.prepareImpl()` would
 * await it for ever, and the process would neither serve nor exit: `Type=simple` means systemd
 * reports the unit `active (running)` throughout, so `Restart=always` never fires,
 * `StartLimitBurst=5` never counts, and `check`'s `ActiveState` row agrees with all of it.
 * Only `check_gate` would notice, as *"nothing answered on 8090"*. A `stat` does not open the
 * file, so it cannot block on one; a directory, `EACCES` and `ENOENT` already throw and are
 * already caught into a refusal. ⚠ It does **not** close the whole class: a read that blocks
 * on a hung NFS or fuse mount blocks in `stat` too, and `runStartup` has no timeout. That is
 * recorded rather than claimed closed.
 */
const readCredentialBytes = (): Uint8Array => {
  const stat = statSync(SECRET_ENV_FILE);
  if (!stat.isFile()) {
    const error = new Error('not a regular file') as Error & { code: string };
    error.code = 'ENOTREG: a directory, a socket or a FIFO';
    throw error;
  }
  return readFileSync(SECRET_ENV_FILE);
};

/** The shared cell, created by whichever chunk touches it first. */
const credentialSource = (): SecretSource => {
  const holder = globalThis as CellHolder;
  const existing = holder[CREDENTIAL_CELL];
  if (existing !== undefined) return existing;
  const created = makeSecretSource(readCredentialBytes, SECRET_ENV_FILE, (report) => {
    // ⚠ stderr, so journald keeps it — the same destination `startup.ts` uses, and the only
    // one a container has.
    console.error(report);
  });
  holder[CREDENTIAL_CELL] = created;
  return created;
};

/**
 * The one source, shared by every bundled copy of this module, read on first use and never
 * again (see {@link makeSecretSource}).
 *
 * In the container that first use is `instrumentation.ts`'s `register()`, which Next calls
 * **once, before the server is ready to handle requests** — so a bad file is a startup
 * refusal in `journalctl`, not a dashboard that denies every login in silence.
 */
export const productionSecrets: SecretSource = {
  environment: (): Environment => credentialSource().environment(),
  refusal: (): string | null => credentialSource().refusal(),
};

/**
 * The `Environment` `readAuthConfig` is handed in production.
 *
 * Never throws: an unreadable or refused file yields an empty environment, `readAuthConfig`
 * returns `null`, and every login and every session is denied — §5's *"a dashboard that will
 * not open is the loud, immediate and harmless failure"*. The LOUD half is the startup
 * refusal; this half is what keeps a request path from turning it into a 500 — and, since
 * `11b-A3`, what keeps it from being silent when the startup half never ran.
 */
export const credentialEnvironment = (): Environment => productionSecrets.environment();
