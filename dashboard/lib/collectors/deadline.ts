/**
 * One shared budget across several reads, on a **monotonic** clock.
 *
 * `CollectorIo` bounds `run` and explicitly does **not** bound `readFile`/`readDir` (O17).
 * For `/proc` that is fine — procfs does not block. It is not fine for anything that talks
 * to hardware or to another process: step 4's `dell_smm` reads are SMM BIOS calls into the
 * Dell EC, and step 5 adds D-Bus, two HTTP probes and `statvfs`. Each of those needs the
 * same three properties, so they live here once rather than being copied per collector:
 *
 * 1. **One deadline for the whole probe**, enforced per operation against the time
 *    remaining. Ten operations each allowed the full budget is a ten-times-longer bound
 *    than the one written down — the failure mode of every "timeout" that is really a
 *    per-attempt timeout.
 * 2. **A monotonic clock.** See the ⚠ below; this is the reason the module exists at all.
 * 3. **A validated budget**, because `setTimeout` silently turns an out-of-range delay into
 *    **1 ms**, which is the opposite of what a caller asking for a long bound wanted.
 *
 * ---
 *
 * ### ⚠ `performance.now()`, never `Date.now()`
 *
 * `Date.now()` is the **wall clock** and is steppable; `setTimeout` counts on the
 * **monotonic** clock. Mixing them means the arithmetic and the timer disagree whenever
 * `systemd-timesyncd` steps the clock — the first sync after boot, a VM or container
 * resume, the end of a leap smear. Measured on step 4's collector before this fix: moving
 * `Date.now` back by one hour mid-probe turned a declared 2 s bound into a **one-hour**
 * bound, on a per-request route, against an EC that has hung before.
 *
 * A *forward* step is the safe direction — every remaining read rejects at once and the
 * poll self-heals — so the damage is asymmetric rather than absent. HANDOVER states the
 * consequence: **"a bounded call that is not bounded is worse than an unbounded one,
 * because it stops anyone asking the question."**
 *
 * `performance.now()` is monotonic from process start, is a global from Node 16 so it needs
 * no import, returns fractional milliseconds which `setTimeout` accepts, and shares the
 * base `setTimeout` itself counts on.
 *
 * ### ⚠ A bounded read is abandoned, not cancelled
 *
 * The seam takes no `AbortSignal`, and an in-flight `fs.readFile` cannot be interrupted
 * anyway: the thread-pool slot stays occupied until the call returns. What the deadline
 * guarantees is that **the request settles**, which is what §3.1 asks of `nvidia-smi` for
 * the same reason. Both handlers are attached to the abandoned promise, so its late
 * rejection is subscribed to and can never surface as an `unhandledRejection` that takes
 * the route down.
 */

import { reason } from './errors';
import type { HwmonReader } from './hwmon';

/**
 * The largest delay `setTimeout` honours: 2³¹−1 ms, a little under 25 days.
 *
 * ⚠ **Above it Node clamps the delay to `1`** and prints `TimeoutOverflowWarning` to
 * stderr; `NaN` clamps the same way with `TimeoutNaNWarning`. So `timeoutMs: Infinity` —
 * the obvious way to write "do not bound this" — silently produces the **tightest possible**
 * bound instead of none, and the whole probe times out on every poll.
 */
export const MAX_TIMEOUT_MS = 2 ** 31 - 1;

/**
 * Coerce a caller-supplied budget onto something `setTimeout` will actually honour.
 *
 * Accepts a finite `timeoutMs` in `(0, MAX_TIMEOUT_MS]` and falls back to the collector's
 * own default for everything else — `Infinity`, `NaN`, `0`, a negative, or anything at or
 * above 2³¹. Falling back rather than throwing keeps invariant 5: a caller's bad argument
 * degrades one poll's bound, it does not turn the telemetry route into a 500.
 *
 * `fallbackMs` is a module constant at every call site, so it is trusted; passing a bad one
 * is a programming error this cannot repair.
 */
export const boundedTimeoutMs = (timeoutMs: number, fallbackMs: number): number =>
  Number.isFinite(timeoutMs) && timeoutMs > 0 && timeoutMs <= MAX_TIMEOUT_MS
    ? timeoutMs
    : fallbackMs;

/** Bounds any promise-returning operation against one shared, monotonic budget. */
export type Within = <T>(start: () => Promise<T>) => Promise<T>;

/**
 * Open a budget of `timeoutMs` starting **now**, and return the wrapper that spends it.
 *
 * Every operation passed to the returned function settles by the deadline, whatever the
 * world does. Once the budget is spent, later operations are rejected without being
 * started — which is why a wedged first read still leaves the *later* fields as clean
 * "timed out" entries rather than hanging the route.
 */
export const deadline = (timeoutMs: number, fallbackMs: number): Within => {
  const budget = boundedTimeoutMs(timeoutMs, fallbackMs);
  // ⚠ Monotonic. See the module doc — this line and the one in `within` are the fix.
  const deadlineAt = performance.now() + budget;
  const overdue = (): Error => new Error(`timed out after ${budget} ms`);
  /**
   * ⚠ **The latch.** `setTimeout` counts on libuv's cached, millisecond-resolution clock
   * while the arithmetic below reads `performance.now()`, which is finer. The two can
   * disagree by a fraction of a millisecond, so a timer can fire *marginally before*
   * `deadlineAt` — leaving `left` a hair above zero for the next operation, which then
   * starts, and (for a fast operation) finishes. Measured as an intermittent failure of
   * step 4's "a wedged read in the FIRST position salvages nothing" test, which saw four
   * channels come back populated after the first had already timed out: five figures the
   * panel would show as live readings taken *after* the budget was declared spent.
   *
   * Once any operation has timed out, the budget IS spent — that is what the module's own
   * doc promises ("later operations are rejected without being started"), and a clock
   * comparison alone does not guarantee it. This flag does.
   */
  let spent = false;

  return <T>(start: () => Promise<T>): Promise<T> => {
    const left = deadlineAt - performance.now();
    if (spent || left <= 0) {
      spent = true;
      return Promise.reject(overdue());
    }
    return new Promise<T>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        spent = true;
        reject(overdue());
      }, left);
      // ⚠ Both handlers are attached even after the deadline has fired, so the abandoned
      // operation's eventual rejection is *subscribed to* and never surfaces as an
      // unhandledRejection that would take the whole route down.
      start().then(
        (value) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          resolve(value);
        },
        (e: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          reject(e instanceof Error ? e : new Error(reason(e)));
        },
      );
    });
  };
};

/**
 * A {@link HwmonReader} whose two reads share one {@link deadline}.
 *
 * Only the two methods an hwmon walk needs, and no knowledge of `dell_smm` or of any
 * particular node — so `findHwmonNode` is bounded without knowing that deadlines exist.
 * Step 5 should call {@link deadline} directly for D-Bus and HTTP rather than wrapping a
 * reader it does not have.
 */
export const boundedReader = (reader: HwmonReader, within: Within): HwmonReader => ({
  readFile: (path) => within(() => reader.readFile(path)),
  readDir: (path) => within(() => reader.readDir(path)),
});
