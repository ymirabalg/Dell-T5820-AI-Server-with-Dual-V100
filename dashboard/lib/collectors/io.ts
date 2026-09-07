/**
 * The IO seam. **Everything in this step that touches the world goes through here**, and
 * nothing else in `lib/collectors/` imports `node:fs` or `node:child_process`.
 *
 * That is the point of the step's parser/IO split, stated as a type: the parsers are pure
 * and exhaustively testable without a GPU, without `/proc` and without root, and the
 * wrappers are testable by handing them a fake {@link CollectorIo}. A collector that
 * called `readFile` inline would be testable in neither place.
 *
 * Every method **rejects** on failure and none of them return a sentinel — the wrappers
 * catch, and turn the rejection into an `errors[]` entry (invariant 5). A method that
 * returned `''` on a missing file would put `Number('')` back in play one layer up.
 */

import { readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import type { ExecFileException } from 'node:child_process';
import { release } from 'node:os';

import { boundedTimeoutMs } from './deadline';

/**
 * §3.1's bound on `nvidia-smi`: **4 s**, under §6.7's 5 s default cadence and well above
 * the ~250 ms the call takes on this box.
 *
 * It was an invented number when this step was built; §3.1 now states it, together with
 * the semantics {@link nodeIo.run} implements — *"the bound must settle the request
 * INDEPENDENTLY of the child process. Sending a signal is not a bound."* §4 samples per
 * request, so an unbounded collector hangs the telemetry route and every browser polling
 * it.
 */
export const NVIDIA_SMI_TIMEOUT_MS = 4000;

/** Bytes-from-the-world, injectable. */
export interface CollectorIo {
  /** UTF-8 contents of a file. Rejects on ENOENT, EACCES, EISDIR, anything. */
  readFile(path: string): Promise<string>;
  /** Entry names in a directory, no paths. Rejects on ENOENT, EACCES, ENOTDIR. */
  readDir(path: string): Promise<string[]>;
  /**
   * Run a command, resolve with its stdout. Rejects on ENOENT, non-zero exit, timeout.
   *
   * ⚠ **`timeoutMs` is a hard bound on the returned promise, not on the child.** §3.1
   * requires the request to settle whether or not the process can be killed. See
   * {@link nodeIo} for the mechanism and for why the obvious alternatives do not hold.
   *
   * ⚠ **Only `run` is bounded. `readFile` and `readDir` are not** — procfs and the
   * `/proc`/`coretemp` reads this step makes do not block. Step 4's `dell_smm` reads are
   * SMM BIOS calls on a board whose EC has hung before; a caller whose reads can block
   * must impose its own deadline and must not assume this seam does it.
   */
  run(command: string, args: readonly string[], timeoutMs: number): Promise<string>;
  /**
   * The running kernel release, as `uname -r` gives it. §3.2 permits "`/proc/version` or
   * `uname`" for `Host.kernel`.
   *
   * ⚠ **This is not the `os.hostname()` mistake wearing a different name, and the
   * difference is worth stating.** `uname()`'s *nodename* is namespaced by UTS, which is
   * why `os.hostname()` inside the container returns the container id (§3.2); its
   * *release* is not — it names the one kernel every namespace on the box is running, so
   * `os.release()` in the container and `uname -r` on the host are necessarily the same
   * string.
   *
   * It is used in preference to `/proc/version` for a second reason: §3.7's `ErrorSource`
   * vocabulary is closed at eighteen names and **has no member for `/proc/version`**, so a
   * failed read of it could not be reported without inventing one, which invariant 7
   * forbids. `os.release()` cannot fail. `parseKernelRelease` exists and is tested against
   * the captured `/proc/version` should a later step want the file instead.
   */
  unameRelease(): string;
}

/**
 * Describe a failed `execFile` in one line a human can act on (§6.5 puts this string in
 * front of one).
 *
 * **stderr first**, because `nvidia-smi` explains itself there and `No devices were found`
 * is far more use in a panel than `Command failed`. When it said nothing, the useful facts
 * are on the error object and were previously thrown away: `error.signal` names the signal
 * that killed it and `error.code` carries either the exit status (a number) or a spawn
 * failure (`'ENOENT'`). `error.message` is a ~230-character argv dump that mentions
 * neither, so it is the last resort and not the first.
 *
 * Step 5 needs this shape too: §3.7's `HealthState` distinguishes `unhealthy` (a 503) from
 * `unreachable` on precisely the status a prose fallback cannot carry.
 */
const describeExecFailure = (
  command: string,
  error: ExecFileException,
  stderr: string,
): string => {
  const said = stderr.trim();
  if (said !== '') return said;
  if (error.signal != null) return `${command}: killed by ${error.signal}`;
  if (typeof error.code === 'number') return `${command}: exited ${error.code}`;
  if (typeof error.code === 'string' && error.code !== '') return `${command}: ${error.code}`;
  return `${command}: ${error.message.split('\n')[0] ?? 'failed'}`;
};

/**
 * The real implementation. The only place in this step that imports `node:` modules.
 *
 * `execFile`, not `exec`: no shell, so nothing in a path or an argument can be
 * interpreted. The command is a constant and the arguments are constants, but this code
 * runs on a box whose SAFETY panel exists because things that "cannot happen" have.
 *
 * ### ⚠ The deadline settles the PROMISE, and no single `execFile` option does that
 *
 * §3.1 states the requirement: *the bound must settle the request independently of the
 * child process; sending a signal is not a bound.* There are **two** hang shapes, they are
 * bounded by different mechanisms, and no one option covers both. Measured on this
 * toolchain (Node 24), 300 ms deadline, `./probe` scripts:
 *
 * | | `trap "" TERM; sleep 9` | `sleep 9 & exit 0` (descendant holds stdout) |
 * |---|---|---|
 * | `timeout:` alone (what this used to be) | **9015 ms, and RESOLVED** | 305 ms, resolved with truncated stdout |
 * | `killSignal: 'SIGKILL'` alone | 307 ms | **no — nothing is left to signal** |
 * | `signal:` an `AbortSignal` alone | 305 ms | **9043 ms** |
 * | this implementation | **306 ms, rejected** | **306 ms, rejected** |
 *
 * `execFile`'s callback fires on the child's **`'close'`** event, which needs both that the
 * process exited *and* that its stdio closed. `timeout:` signals the child; it does not
 * settle the promise, so a child that does not die leaves the deadline as decoration and
 * the call comes back as a **success** thirty times late — with no `errors[]` entry, and
 * §6.7's backoff never engaging, because nothing failed.
 *
 * `killSignal: 'SIGKILL'` is the escalation a reader reaches for first and it is the one
 * that does not fix the real case: a wedged NVIDIA driver leaves `nvidia-smi` in
 * `TASK_UNINTERRUPTIBLE` inside an `ioctl` on `/dev/nvidiactl`, where **no signal is
 * delivered at all** until the syscall returns.
 *
 * ⚠ **`signal:` bounds the promise only while the child is still alive**, which is where
 * §3.1's "and also destroys the pipes" is optimistic: Node drops its abort listener once
 * the child exits, so a child that exits immediately while a **descendant keeps the
 * inherited stdout pipe** open is not reached at all — measured **9043 ms against a 300 ms
 * signal**. That is the second unbounded path, and it is the one that survives the fix a
 * reader would write. Reported as a spec correction in step 3's reconciliation notes.
 *
 * So the deadline does all four things itself, and each is load-bearing:
 *
 * 1. `ac.abort()` — bounds a live child, and reaps a killable one via `killSignal`.
 * 2. `child.stdout/stderr.destroy()` — bounds the descendant-holding-stdout case, which
 *    abort no longer reaches.
 * 3. `finish(reject)` — settles the promise **at the deadline**, whatever the child and its
 *    pipes do. Without it the orphan case settles by *resolving* with a truncated stdout,
 *    which is a partial CSV silently parsed as rows.
 * 4. `child.unref()` — an abandoned process must not hold the event loop open. Measured:
 *    a process that lingered 9021 ms after the call was bounded exits at 649 ms with it.
 *
 * This is not the `Promise.race` the review warned against: a bare race abandons the
 * promise without touching the streams and leaks the pipe. The streams are destroyed here.
 *
 * ⚠ **Bounding the promise abandons the process.** §4 samples per request, so at a 5 s
 * cadence against a wedged driver every poll forks another `nvidia-smi` that never exits.
 * Step 6 must cache the **in-flight promise**, not only the result — see HANDOVER.
 *
 * ### ⚠ The delay is `boundedTimeoutMs`'d, and it was not until step 5's reconciliation
 *
 * `setTimeout` clamps a delay outside `(0, 2³¹−1]` to **1 ms** and warns on stderr, so
 * `timeoutMs: Infinity` — HANDOVER's *"obvious way to write 'do not bound this'"* — produced
 * the **tightest possible** bound. Measured against the real seam: `collectGpus({ timeoutMs:
 * Infinity })` returned `gpus: null` at **4 ms** with `TimeoutOverflowWarning … Timeout
 * duration was set to 1`, where the 400 ms control reached the command in 2 ms.
 *
 * `deadline.ts` was hoisted in step 4 to fix this at the *collector* sites and nobody came
 * back to the seams; `http.ts` then added a second copy of the untouched original. Both are
 * closed here, and `lib/guardrails.test.ts` now asserts over the source text that **every
 * `setTimeout` in `lib/collectors/` takes a `boundedTimeoutMs(…)` result as its delay** —
 * because no behavioural test and no mutation can see a call that should exist and does not.
 */
export const nodeIo: CollectorIo = {
  readFile: (path) => readFile(path, 'utf8'),
  readDir: (path) => readdir(path),
  run: (command, args, timeoutMs) => {
    const ac = new AbortController();
    // ⚠ One bound, used for BOTH the timer and the message. Reporting `timeoutMs` while
    // timing `bound` is the same lie the unvalidated delay was.
    const bound = boundedTimeoutMs(timeoutMs, NVIDIA_SMI_TIMEOUT_MS);
    const expired = (): Error => new Error(`${command}: timed out after ${bound} ms`);
    let timer: ReturnType<typeof setTimeout> | undefined;

    return new Promise<string>((resolve, reject) => {
      let settled = false;
      /** Exactly one outcome reaches the caller, whichever path gets there first. */
      const finish = (outcome: () => void): void => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        outcome();
      };

      const child = execFile(
        command,
        [...args],
        { encoding: 'utf8', windowsHide: true, signal: ac.signal, killSignal: 'SIGKILL' },
        (error, stdout, stderr) => {
          if (error) {
            const aborted = ac.signal.aborted || error.name === 'AbortError';
            finish(() => {
              reject(aborted ? expired() : new Error(describeExecFailure(command, error, stderr)));
            });
            return;
          }
          finish(() => {
            resolve(stdout);
          });
        },
      );

      timer = setTimeout(() => {
        ac.abort();
        child.stdout?.destroy();
        child.stderr?.destroy();
        child.unref();
        finish(() => {
          reject(expired());
        });
      }, bound);
    });
  },
  unameRelease: () => release(),
};
