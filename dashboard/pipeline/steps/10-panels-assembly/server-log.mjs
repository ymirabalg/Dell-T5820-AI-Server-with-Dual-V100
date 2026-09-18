/**
 * ⚠⚠ 12a/RECONCILE (`12a-A3`) — **the spawned `next dev`'s own output, read.**
 *
 * Both browser harnesses spawn `pnpm exec next dev` with `stdio: ['ignore', 'pipe', 'pipe']`
 * and, until this file existed, **never read either pipe**. Two consequences, one measured and
 * one latent, and this module closes both:
 *
 * 1. **The server's diagnosis never reached the operator.** The adversarial moved
 *    `secret-file-shim.cjs` aside and ran the harness: it exited 1 — good — with
 *    `Error: server did not come up at http://localhost:39173/login within 60000ms`, naming a
 *    PORT. The server had said the real cause into a pipe with no reader
 *    (`Cannot find module '…/secret-file-shim.cjs'`, and, without the two variables, the
 *    shim's own carefully worded throw). This project's four-day outage was a failure that
 *    exited non-zero while naming the wrong thing — `waitForSelector('[data-slot="gpu0"]')`.
 *    **Loud was never the missing property; naming its own cause was**, and it was still
 *    missing one layer down.
 * 2. **An unread pipe blocks its writer** once the OS buffer fills (64 KiB on macOS). A
 *    chattier `next dev` — a compile-error loop, a deprecation warning per route — would hang
 *    the harness instead of failing it. Not observed in four runs; removed here rather than
 *    left to be discovered on the run that matters.
 *
 * The ring is bounded (`MAX_LINES`), so draining cannot itself become a memory fault on a
 * server that logs forever, and the tail is printed only on a startup failure: a healthy run's
 * output is exactly as quiet as it was before.
 */

import { createConnection } from 'node:net';

/** How many trailing lines of the server's own output a failure prints. */
export const MAX_LINES = 60;

/**
 * Drain `server.stdout`/`server.stderr` into a bounded ring.
 *
 * @param {import('node:child_process').ChildProcess} server
 * @returns {{ tail: () => string }} `tail()` renders what the server said, newest last.
 */
export function attachServerLog(server) {
  /** @type {string[]} */
  const lines = [];
  const push = (stream, chunk) => {
    for (const line of String(chunk).split('\n')) {
      if (line.trim() === '') continue;
      lines.push(`  [${stream}] ${line}`);
      if (lines.length > MAX_LINES) lines.shift();
    }
  };
  // ⚠ `?.` — a harness that spawns without pipes must not die HERE, in the code that exists to
  // make a failure legible.
  server.stdout?.on('data', (chunk) => push('out', chunk));
  server.stderr?.on('data', (chunk) => push('err', chunk));
  // An unreadable pipe is itself worth printing rather than throwing out of an event handler.
  server.stdout?.on('error', (e) => push('out', `stream error: ${e.message}`));
  server.stderr?.on('error', (e) => push('err', `stream error: ${e.message}`));
  return {
    tail: () =>
      lines.length === 0
        ? '  (the spawned server printed nothing at all — it may not have started)'
        : lines.join('\n'),
  };
}

/**
 * Wait for `url` to answer, and on failure print what the SERVER said before rethrowing.
 *
 * ⚠ The rethrow is deliberate: the harness must still exit non-zero. What changes is that the
 * line above the stack trace is the cause rather than the symptom.
 *
 * @param {() => Promise<void>} waitForServer a call already bound to its url and timeout
 * @param {{ tail: () => string }} log
 */
export async function waitWithServerOutput(waitForServer, log) {
  try {
    await waitForServer();
  } catch (e) {
    console.error(
      `\n⚠ The spawned \`next dev\` never answered. What IT said, which is where the cause is:\n${log.tail()}\n`,
    );
    throw e;
  }
}

/**
 * ⚠⚠ **12c/TEST — `waitForServer` cannot tell the server it SPAWNED from one that was already
 * there, and that is a fail-open in the only harness that grades the page.**
 *
 * ### Reproduced, 2026-09-18, not inferred
 *
 * Both harnesses bind a **fixed** port and then wait for `http://localhost:<port>/login` to
 * answer with any status under 500. A `next dev` that loses the bind does **not** shift port —
 * it prints `EADDRINUSE` and dies — so when something is already listening there:
 *
 * 1. the spawned server exits within a second or two;
 * 2. `waitForServer` succeeds **immediately**, against the other process;
 * 3. the harness fills in THIS run's ephemeral password, which that process has never heard of;
 * 4. `POST /api/session` answers **401**, and the run dies fifteen seconds later on
 *    `waitForSelector('[data-slot="gpu0"]')`.
 *
 * Measured by putting a second `next dev` on :39173 with its own credential pair and running
 * the login prefix: `FAIL (no grid), /api/session=POST 401`, with `EADDRINUSE` sitting in the
 * spawned server's own log — a log the harness only prints when `waitForServer` FAILS, which
 * here it did not. Every symptom of 12c-build §8.3's unexplained flake, and none of its causes
 * visible.
 *
 * ⚠ It is **not** a proof that this is what happened on 2026-09-17: the build quoted
 * `POST /api/session 401` from the spawned server's own output, and a server that never won the
 * bind logs no requests at all. So that occurrence remains unexplained and this closes a
 * different, certain hole — which is the honest description of both.
 *
 * ### ⚠⚠ 12c/RECONCILE (`12c-A7`) — it asked the wrong question, and failed OPEN on the exact
 * occupant it exists to catch
 *
 * The first version fetched `/login` with a 2 s timeout and `catch { return; }` — it read *any*
 * rejection as "nothing is listening". Measured against this module with a real listener:
 *
 * ```
 * nothing listening      : RETURNED  -> correct
 * bound, answers at once : THREW     -> correct
 * bound, answers in 8 s  : RETURNED  <- the harness would spawn, and a competing bind
 *                                       got EADDRINUSE at the moment the guard said "free"
 * ```
 *
 * And the occupant this guard exists to catch is, in the test phase's own words, *a `next dev`
 * leaked by a crashed previous run* — i.e. one that is **starting up**, i.e. one that holds the
 * port and does not answer `/login` for many seconds. The harness's own `waitForServer` allows
 * **60 000 ms** for that same URL precisely because compiling `/login` is slow. A two-second
 * HTTP deadline cannot be the test for "is this port held".
 *
 * **The question is whether the port is BOUND, so the check is a TCP connect**, which is what
 * the error message has always named (`lsof`) and what `next dev` itself will race for. A
 * listening socket completes the handshake in the kernel however busy the process is, so this
 * is true the instant the occupant binds and stays true while it compiles. Both loopback
 * families are probed: `next dev` binds `::` (its own `EADDRINUSE` prints `:::39173`) and
 * `localhost` may resolve either way.
 *
 * ⚠ A connect TIMEOUT counts as bound, not free. Nothing on loopback times out — a closed port
 * answers RST at once — so a timeout means something is holding it in a way this guard cannot
 * see through, and refusing loudly is the direction this whole check exists to err in.
 *
 * @param {number} port
 * @param {number} [answerDeadlineMs] how long the FAILURE MESSAGE waits for a status. It never
 *   changes the verdict — the verdict is the TCP connect above — and it exists so a test can
 *   assert this function's behaviour in milliseconds instead of spending the full deadline
 *   proving that a silent occupant is still an occupant.
 * @throws when anything already holds the port
 */
export async function assertPortFree(port, answerDeadlineMs = 2000) {
  const holder = await portHolder(port);
  if (holder === null) return; // nothing bound, which is the whole requirement
  // Only now, and only to make the message concrete: a status is useful to a reader and a
  // silent occupant is the interesting case, so neither is allowed to change the verdict.
  let answers = `it did not answer /login within ${answerDeadlineMs}ms — a server still compiling looks like this`;
  try {
    const res = await fetch(`http://localhost:${port}/login`, {
      signal: AbortSignal.timeout(answerDeadlineMs),
    });
    answers = `it answers /login with HTTP ${res.status}`;
  } catch {
    /* keep the sentence above: bound and silent is still bound */
  }
  throw new Error(
    `port ${port} is ALREADY HELD (${holder}) before this harness spawned anything —\n` +
      `  ${answers}.\n` +
      "  `next dev` does not shift port — it fails with EADDRINUSE and exits — and `waitForServer`\n" +
      '  cannot tell that process from the one this run started. The run would log in against it\n' +
      "  with this run's ephemeral password, get 401, and die on a selector fifteen seconds later.\n" +
      `  Find it with:  lsof -nP -iTCP:${port} -sTCP:LISTEN`,
  );
}

/**
 * Which loopback address, if any, accepts a TCP connection on `port`.
 *
 * @param {number} port
 * @returns {Promise<string | null>} the address that answered, or `null` if none is bound
 */
async function portHolder(port) {
  for (const host of ['127.0.0.1', '::1']) {
    const bound = await new Promise((resolve) => {
      const socket = createConnection({ port, host });
      const settle = (answer) => {
        socket.destroy();
        resolve(answer);
      };
      socket.setTimeout(2000);
      socket.once('connect', () => settle(true));
      socket.once('timeout', () => settle(true));
      socket.once('error', () => settle(false));
    });
    if (bound) return host;
  }
  return null;
}

/**
 * ⚠⚠ **12c/TEST — the second half, and the one that holds when the collision is a RACE.**
 *
 * {@link assertPortFree} is checked before the spawn, so a process that binds the port in the
 * window between that check and this one slips past it. After `waitForServer` returns, the
 * server this harness spawned must still be running — if it is not, whatever answered was
 * something else, and the log tail is where the reason (`EADDRINUSE`, a missing shim, a compile
 * failure) is already written.
 *
 * @param {import('node:child_process').ChildProcess} server
 * @param {{ tail: () => string }} log
 * @param {number} port
 */
export function assertServerAlive(server, log, port) {
  if (server.exitCode === null && server.signalCode === null) return;
  throw new Error(
    `the \`next dev\` this harness spawned is GONE (exit ${String(server.exitCode)}, signal ` +
      `${String(server.signalCode)}), yet :${port} answered — so the page under measurement is ` +
      'NOT the server this run configured, and its credentials are not the ones it faked.\n' +
      `  What the spawned server said before it died:\n${log.tail()}\n`,
  );
}
