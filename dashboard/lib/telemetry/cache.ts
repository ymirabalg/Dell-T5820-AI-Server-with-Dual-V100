/**
 * §4's server-side cache — **it holds the IN-FLIGHT PROMISE, not only the finished
 * result**, and that distinction is the whole reason this module exists.
 *
 * > §4: "Server-side cache: 2 s, and it caches the IN-FLIGHT PROMISE, not only the
 * > finished result. Multiple browser tabs must not each fork `nvidia-smi`. … Caching only
 * > the result is not enough: §3.1's bound abandons a wedged `nvidia-smi` rather than
 * > killing it, so a result-only cache would fork a new orphan every poll and accumulate
 * > them without limit. Callers arriving while a sample is in flight join it."
 *
 * O18 widened that from one seam to three: `nodeIo.run` abandons a wedged `nvidia-smi`,
 * `nodeHttp.get` abandons a wedged `llama-server` socket, and `nodeDbus.connect` abandons a
 * wedged bus. Each releases its own handle at the bound, so what accumulates is the
 * abandoned *work* — the process the kernel still holds, the socket the peer never closed.
 * **The only thing that stops those multiplying is that a second poll never starts a second
 * sample**, and that is this file.
 *
 * ---
 *
 * ### The two rules, and why one is not a special case of the other
 *
 * 1. **While a sample is in flight, every caller joins it — regardless of the window.**
 *    §6.7: `collectServing`'s worst case is 2 s discovery + 4 s probe = **6 s**, against a
 *    5 s default cadence, and it says so deliberately: *"A poll may legitimately take
 *    longer than the cadence, and that is not a fault … **Overlapping polls must never
 *    become overlapping samples.**"* A cache that only asked "is the last result younger
 *    than 2 s?" would answer *no* at 2 s into a 6 s sample and fork a second one — which is
 *    the exact accumulation O18 forbids, arriving through the freshness check rather than
 *    through the absence of a cache.
 * 2. **Once it has settled, the result is served for `ttlMs`.** Ten tabs cost one sample.
 *
 * ### The window is measured from the sample's START
 *
 * `startedMs` is stamped when the sample begins, not when it finishes, so a snapshot is
 * never served with a `ts` older than `ttlMs`. Measuring from completion would let a 6 s
 * poll's result be served until it was 8 s old, and §6.7's age indicator — the thing that
 * tells a reader the page is behind — would be reporting an age the server had already
 * decided to ignore. The same reading of the clock is handed to `sample`, so the freshness
 * window and the delta interval cannot drift apart.
 *
 * ### ⚠ The clock is monotonic, and it is injected
 *
 * `performance.now()`, never `Date.now()` — the rule `lib/collectors/deadline.ts` was
 * written for. A backward NTP step (the first sync after boot, a container resume) would
 * make `now - startedMs` negative and hold a stale snapshot for the size of the step.
 * Injecting the clock is also what lets the tests advance time without faking timers.
 *
 * ### ⚠ There is no timer in this file, and there must not be one
 *
 * §4: "Sampling is per-request, not a background loop. With no clients connected the
 * container does no work at all — it must never itself become load on a box whose thermal
 * margin is the thing being watched." Expiry is therefore a comparison made when a caller
 * arrives, not a `setTimeout` that fires into an empty room. Nothing here refreshes, warms
 * up, or keeps alive.
 */

/** How a caller reaches the cached sample. One method, so there is one way in. */
export interface InFlightCache<T> {
  /**
   * The current sample: the in-flight one if there is one, the last one if it is still
   * inside the window, and otherwise a new one.
   */
  get(): Promise<T>;
}

/** Arguments to {@link createInFlightCache}. Options object, matching every collector. */
export interface InFlightCacheOptions<T> {
  /**
   * Take one sample. Receives the monotonic instant the cache stamped the entry with, so
   * the sample's own timestamps agree with the window it will be served for.
   *
   * ⚠ **It must be `async` (or otherwise never throw synchronously).** `get()` is
   * deliberately not `async` — see the note on it below — and the price of that is that a
   * synchronous throw here would escape past `get(): Promise<T>` as a thrown exception
   * rather than a rejection, leaving the stale entry in place. Unreachable today
   * (`source.ts`'s sample is `async`, so it can only reject) and stated here because it is
   * a constraint this file relies on rather than one it enforces.
   */
  readonly sample: (startedMs: number) => Promise<T>;
  /** §4's 2 s. Measured from the sample's start. */
  readonly ttlMs: number;
  /** ⚠ Monotonic. `performance.now()` in production. */
  readonly monotonicMs: () => number;
}

/** One sample: when it started, whether it has settled, and the promise callers join. */
interface Entry<T> {
  readonly startedMs: number;
  /**
   * Mutable, and deliberately a separate object from the entry: the settle handlers close
   * over *this*, so they can never flip the flag of an entry that has since replaced them.
   */
  readonly flight: { inFlight: boolean };
  readonly promise: Promise<T>;
}

/**
 * Build a cache that samples on demand and lets concurrent and successive callers join.
 *
 * Generic in `T` and with no knowledge of telemetry, so the O18 property — *N callers, one
 * sample* — is proved in `cache.test.ts` against a counter rather than against a snapshot.
 */
export const createInFlightCache = <T>({
  sample,
  ttlMs,
  monotonicMs,
}: InFlightCacheOptions<T>): InFlightCache<T> => {
  let entry: Entry<T> | null = null;

  /**
   * ⚠ Not `async`. The decision and the store both happen in one synchronous run, so two
   * callers in the same tick cannot both find the cache empty. An `async` function would in
   * fact be safe here too — its body runs synchronously up to the first `await` — but that
   * is a property of where the `await` happens to sit, and this is a rule the file should
   * not depend on someone re-checking after an edit.
   */
  const get = (): Promise<T> => {
    const nowMs = monotonicMs();
    const held = entry;
    // ⚠ `inFlight` FIRST, and it is not an optimisation. Rule 1 above: an unfinished sample
    // is joined however old it is, or a 6 s poll against a 2 s window forks a second one.
    if (held !== null && (held.flight.inFlight || nowMs - held.startedMs < ttlMs)) {
      return held.promise;
    }

    const flight = { inFlight: true };
    const promise = sample(nowMs).then(
      (value) => {
        flight.inFlight = false;
        return value;
      },
      (e: unknown) => {
        flight.inFlight = false;
        // ⚠ Evicted, not held for the rest of the window. A rejected sample is a bug in the
        // assembler rather than a failed reading (a failed reading is `null` plus an
        // `errors[]` entry — §6.5 — and never reaches here), and serving the same rejection
        // to every caller for 2 s would turn one bug into a stall. Identity-checked so a
        // late rejection cannot evict an entry that has already replaced it.
        if (entry !== null && entry.flight === flight) entry = null;
        throw e;
      },
    );
    // Assigned before either handler can run — `.then` callbacks are microtasks, and this
    // line is still in the same synchronous run as the `sample()` call above.
    entry = { startedMs: nowMs, flight, promise };
    return promise;
  };

  return { get };
};
