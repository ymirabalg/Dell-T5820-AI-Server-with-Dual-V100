/**
 * §4's outstanding-call rule: **at most one call to a given collector may be outstanding at
 * a time.**
 *
 * > §4: "A poll that finds one outstanding does not issue a second — it uses that
 * > collector's 'could not report' collection for this poll. A source that stops answering
 * > then costs a bounded number of workers, once, instead of one more on every poll for as
 * > long as the container runs, and it recovers on the first poll after the call returns."
 *
 * ---
 *
 * ### ⚠ Why this exists, and why it is not the same rule as the cache's
 *
 * `cache.ts` joins callers to one **snapshot**. This joins nothing: it *refuses*, per
 * **collector**. The two close different holes and neither subsumes the other.
 *
 * §3.1 says of a wedged `nvidia-smi` that "at a 5 s cadence against a wedged driver, every
 * poll would fork another `nvidia-smi` that never exits", and nominates §4's in-flight cache
 * as the fix. Traced against what is actually built, the cache does not reach it: a wedged
 * `nvidia-smi` does **not** keep the sample in flight, because `collectGpus` settles at its
 * own 4 s bound — so the snapshot settles, the 2 s window has already elapsed, and the next
 * poll forks a second `nvidia-smi`. The cache closes the **concurrent** case (ten tabs, one
 * sample); this closes the **successive** one. §4 now states both halves.
 *
 * The same argument holds for every seam that abandons rather than cancels — `nodeHttp.get`
 * on a wedged socket, `nodeDbus.connect` on a wedged bus — and, most sharply, for anything
 * on libuv's thread pool. Measured on this project: an in-flight `readFile`/`readdir`/
 * `statfs` cannot be cancelled (an `AbortSignal` neither frees the worker nor settles the
 * read's own promise), and **four concurrently blocked pool operations block every
 * subsequent read in the process indefinitely**. Without this rule, a source that stops
 * answering costs one more blocked worker on every poll, for as long as the container runs.
 * With it, it costs one call's worth, once, and recovers on the first poll after that call
 * returns.
 *
 * ### ⚠ It is applied to all six collectors, not only the `fs` ones
 *
 * The pool is the worst case, not the only one. `nvidia-smi` is a process, D-Bus is a
 * socket, and §3.1's accumulation is about processes.
 *
 * ### ⚠ There is no timer here, no cool-down and no failure count
 *
 * Nothing to tune and nothing to get wrong: the slot is released **when the underlying call
 * settles**, so recovery is automatic and immediate. A cool-down would have to be chosen,
 * and a half-open breaker would have to decide when to probe; both would be state this
 * project has no way to observe.
 *
 * ### ⚠ A refusal is the COLLECTOR's failure, never the route's
 *
 * The rejection lands in `snapshot.ts`'s existing `attempt(run, onThrow)` and produces that
 * collector's own "could not report" collection — every reading `null`, one `errors[]` entry
 * per §3.7 source it can file, naming the skip. **No nineteenth `ErrorSource` is
 * introduced** and no verdict of failure is minted: `serving: null` still means "which
 * instances exist is unknown", and no instance is marked `unreachable` or `inactive` by a
 * call that was never made.
 */

import type { SnapshotCollectors } from './snapshot';

/**
 * What a refused call rejects with.
 *
 * It reaches the snapshot through `collectorThrew`, so the entry reads
 * `collectGpus failed before it could report a reading: the previous call has not returned`
 * — which names the skip rather than claiming the subject was read and found wanting.
 */
export const OUTSTANDING_CALL = 'the previous call has not returned';

/**
 * Wrap one collector so that a second call is refused while the first is outstanding.
 *
 * ⚠ The slot is released from the handlers on the **underlying** promise. That is the whole
 * mechanism, and it is why {@link oneAtATime} must be applied *underneath* any ceiling: a
 * gate that released when a ceiling's `Promise.race` settled would let the next poll issue
 * another call into the same wedged source, which is the unbounded leak the rule exists to
 * prevent.
 */
const gated = <A extends readonly unknown[], R>(
  call: (...args: A) => Promise<R>,
): ((...args: A) => Promise<R>) => {
  let outstanding = false;

  return (...args: A): Promise<R> => {
    if (outstanding) return Promise.reject(new Error(OUTSTANDING_CALL));

    outstanding = true;
    let started: Promise<R>;
    try {
      started = call(...args);
    } catch (e) {
      // A collector that throws synchronously never became outstanding. Releasing here
      // keeps a bug from wedging the slot for the life of the process.
      outstanding = false;
      throw e;
    }

    return started.then(
      (value) => {
        outstanding = false;
        return value;
      },
      (e: unknown) => {
        outstanding = false;
        throw e;
      },
    );
  };
};

/**
 * The six collectors, each with its **own** slot.
 *
 * ⚠ Per collector, not one slot for the set. A wedged `dell_smm` must not skip the GPU
 * reading: §6.7 is explicit that a bound may only be evidence about the subject it applied
 * to "and to nothing else", and a shared slot would blank five panels on the sixth's
 * account — HANDOVER §6 item 1's mistake, arriving through the gate instead of through a
 * shared `deadline()`.
 */
export const oneAtATime = (collectors: SnapshotCollectors): SnapshotCollectors => ({
  gpus: gated(collectors.gpus),
  host: gated(collectors.host),
  cooling: gated(collectors.cooling),
  serving: gated(collectors.serving),
  storage: gated(collectors.storage),
  safety: gated(collectors.safety),
});
