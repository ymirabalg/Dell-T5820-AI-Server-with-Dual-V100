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
