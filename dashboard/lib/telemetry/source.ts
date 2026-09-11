/**
 * The one stateful object on the server: §4's 2 s cache plus §6.7's carried counters.
 *
 * §4 fixes the server as **stateless per request** — "Sampling is per-request, not a
 * background loop" — which is true of the *work*, not of the two things a delta needs. Two
 * facts have to survive between polls and there is exactly one place they live:
 *
 * | what | why it must persist | rule |
 * |---|---|---|
 * | the in-flight / last sample | ten tabs must cost one `nvidia-smi` | §4, O18 |
 * | `previous` counters | `cpuPct` and the network rates are deltas | §6.7, O16 |
 *
 * Nothing else is remembered. §6.7 and HANDOVER §6 item 3 are explicit that the other five
 * collectors are **stateless**: a `health` that was `ok` last poll and is `null` this poll
 * renders `—`, never a stale `ok`, and there is no per-instance history here to make that
 * mistake with.
 *
 * ---
 *
 * ### ⚠ O16 — `previous` survives a failed read, PER COUNTER
 *
 * > §6.7: "**The collector owns `previous` across a failed read.** A failed poll must not
 * > discard the last good counters, or one transient failure costs two polls of every delta
 * > — the failed one and the one after it. Keep the last successful sample and its timestamp
 * > until a newer successful sample replaces it."
 *
 * A `DeltaSample` is not one counter but two — `/proc/stat` and `/proc/net/dev` — and they
 * fail independently. Retaining the *whole* sample only when *both* read is not the rule
 * §6.7 states, and it has a failure mode: if `/proc/net/dev` stops parsing permanently
 * (the interface was renamed, say), the CPU baseline would freeze at the last poll where
 * both worked and `cpuPct` would slowly become a lifetime average rather than a 5 s one.
 * Retaining per counter is what "one transient failure costs one poll of **every** delta"
 * actually requires. See {@link mergePrevious}.
 *
 * ### ⚠ The cache is what makes `previous` safe
 *
 * `previous` is read when a sample starts and written when it settles. That is a race in
 * general — and it cannot happen here, because the cache never lets a second sample start
 * while one is in flight (§6.7's *"overlapping polls must never become overlapping
 * samples"*). The two mechanisms are not independent: **O18's join is what gives O16 a
 * single writer**, which is why they live in one file.
 *
 * ### ⚠ §4's two halves, and the order they compose in
 *
 * §4: *"Neither half ships without the other."* {@link oneAtATime} refuses a second call to
 * a collector whose first has not returned; {@link withHostCeiling} settles `collectHost`'s
 * request at 6 s. They are composed here rather than in `snapshot.ts` because the gate's
 * slots are **cross-poll state**, and this file is where the cross-poll state lives.
 *
 * **The ceiling goes OUTSIDE the gate, and the order is load-bearing.** The gate must hold
 * its slot until the *underlying* call settles. Composed the other way round —
 * `oneAtATime(withHostCeiling(c))` — the gate would see the ceiling's `Promise.race` settle
 * at 6 s, release the slot, and let the next poll issue a second call into the same wedged
 * source: one more permanently blocked thread-pool worker on every poll, which is precisely
 * the unbounded leak §4 pairs the two rules to prevent. Both orders pass every behavioural
 * test that does not wedge a collector across two polls, so the property is tested directly
 * in `source.test.ts`.
 */

import { readStandingList } from '@/lib/auth/config';
import { pathsFrom } from '@/lib/collectors';
import type { Environment } from '@/lib/auth/config';
import { isoTimestamp } from '@/lib/types';
import type { IsoTimestamp, TelemetrySnapshot } from '@/lib/types';
import type { DeltaSample } from '@/lib/collectors';

import { createInFlightCache } from './cache';
import { HOST_CEILING_MS, withHostCeiling } from './ceiling';
import { oneAtATime } from './gate';
import { collectorsFor, sampleSnapshot } from './snapshot';
import type { SnapshotCollectors } from './snapshot';

/**
 * §4's cache window: **2 s**, and §4 states the reasoning as well as the number — "The
 * cache floor is below the 5 s default cadence, so a single client never sees stale data,
 * while ten clients still cost one sample."
 */
export const TELEMETRY_CACHE_MS = 2000;

/**
 * The two clocks, kept apart on purpose.
 *
 * ⚠ They are not interchangeable and mixing them is this project's most expensive
 * recurring bug: `deadline.ts` exists because a backward NTP step turned a declared 2 s
 * bound into a measured one hour.
 *
 * - {@link monotonicMs} never goes backwards and has no meaning outside this process. It
 *   times the cache window and the delta interval.
 * - {@link isoNow} is the wall clock, and it is the **only** clock that reaches the wire —
 *   §4's `ts`, which §6.6 renders in the browser's local zone.
 */
export interface TelemetryClock {
  monotonicMs(): number;
  isoNow(): IsoTimestamp;
}

/** `performance.now()` and `Date`. Both are globals; neither needs an import in Node 24. */
export const systemClock: TelemetryClock = {
  monotonicMs: () => performance.now(),
  isoNow: () => isoTimestamp(new Date().toISOString()),
};

/** What a route asks for a snapshot. One method, so there is one way in. */
export interface TelemetrySource {
  /** The current snapshot — cached, joined, or freshly sampled. Never rejects for a failed reading. */
  snapshot(): Promise<TelemetrySnapshot>;
}

/** Arguments to {@link createTelemetrySource}. Options object, matching every collector. */
export interface TelemetrySourceOptions {
  readonly collectors?: SnapshotCollectors;
  readonly clock?: TelemetryClock;
  readonly ttlMs?: number;
  /**
   * §4's ceiling on `collectHost`. Defaults to {@link HOST_CEILING_MS}; a test shortens it
   * so a wedged read can be observed without waiting six seconds.
   */
  readonly hostCeilingMs?: number;
  /**
   * Where `STANDING` comes from. Production: `process.env` — filled by `docker run -e
   * STANDING` since SPEC §5.1's ruling of 2026-09-11, which the unit's second `ExecStartPre`
   * greps out of `/etc/ai-dashboard.env`. It was `--env-file` until then; the two SECRETS
   * left the environment entirely with that ruling and are read from the mounted file by
   * `lib/auth/secret-file.ts`. ⚠ **Everything below still holds**: the value reaches a
   * running process's environment once, at container creation, and a change to it needs a
   * restart rather than a poll.
   *
   * ⚠ **Read ONCE, here, at construction — and that is a correction, not a shortcut.**
   * This used to be read inside every sample, on the strength of §4's sentence *"A change
   * takes effect on the next poll."* **That sentence could not be true as deployed.**
   * `docker run --env-file` reads the file once, at container creation, and copies the
   * values into the container's environment; `process.env` in a running Node process does
   * not track the host file afterwards. So the per-sample read re-read a value that could
   * not have changed — tested, exported machinery that could not fire, which is HANDOVER's
   * do-not-copy #9 — while the spec promised a behaviour the deployment cannot deliver.
   *
   * Found 2026-09-07 by the steps 1–8 sweep and settled by the owner: keep the environment
   * variable, amend §4 to *"takes effect on the next container restart"*, and read once.
   * **A change to `STANDING` now requires a restart, and nothing here pretends otherwise.**
   *
   * ⚠ The credentials file IS bind-mounted now (2026-09-11) and `STANDING` shares it — but
   * this value deliberately still arrives through the environment, because §6.4 echoes it
   * verbatim and reading it per sample would be a **file** read needing its own monotonic
   * budget and a place in §4's outstanding-call rule. That is the change this paragraph
   * has always described, and it is still not being made.
   */
  readonly env?: Environment;
}

/**
 * §6.7's retention rule, applied per counter.
 *
 * | field | kept when the new read failed | why |
 * |---|---|---|
 * | `cpu` | yes | `cpuPctBetween` is self-normalising — `busy/total`, both deltas — so a longer interval is still a correct utilisation, just averaged over more time |
 * | `net` | yes | the counters are absolute, so a rate across two polls is the true mean rate across them |
 * | `atMs` | **follows `net`** | see below |
 *
 * ⚠ **`atMs` belongs to `net`.** A `DeltaSample` carries one timestamp for two counters,
 * and only one of them is ever paired with a clock: `netRatesBetween` divides by
 * `next.atMs - prev.atMs`, while `cpuPctBetween` never looks at the field at all. So the
 * timestamp is advanced exactly when the network counters are, which keeps every rate
 * divided by the interval its own counters were read across. Advancing it whenever
 * *anything* succeeded would divide a two-poll counter delta by a one-poll interval and
 * silently report **double** the real throughput — a plausible-looking number, which is the
 * failure mode this project is organised against.
 *
 * `source.test.ts` pins the coupling from the other side: it asserts a retained `cpu`
 * still yields a correct `cpuPct` when `atMs` did not move.
 */
export const mergePrevious = (prev: DeltaSample | null, next: DeltaSample): DeltaSample => ({
  atMs: next.net !== null ? next.atMs : (prev?.atMs ?? next.atMs),
  cpu: next.cpu ?? prev?.cpu ?? null,
  net: next.net ?? prev?.net ?? null,
});

/**
 * Build the server's telemetry source.
 *
 * ⚠ **Constructing one samples nothing.** §4: "With no clients connected the container does
 * no work at all — it must never itself become load on a box whose thermal margin is the
 * thing being watched." There is no warm-up here, no background refresh, no keep-alive and
 * no timer of any kind; the first collector call happens inside the first `snapshot()`.
 */
export const createTelemetrySource = ({
  collectors,
  clock = systemClock,
  ttlMs = TELEMETRY_CACHE_MS,
  hostCeilingMs = HOST_CEILING_MS,
  env = process.env,
}: TelemetrySourceOptions = {}): TelemetrySource => {
  let previous: DeltaSample | null = null;

  // ⚠ Read once. See {@link TelemetrySourceOptions.env}: under `--env-file` the environment
  // is fixed at container creation, so re-reading it per sample answered the same value
  // every time while implying it might not.
  const standing = readStandingList(env);

  // ⚠ Also read once, and for the same reason. `ROOT_MOUNT`/`HOME_MOUNT` exist only so the app
  // can run OUTSIDE a container — §2.2 mounts the two filesystems at `/host/root` and
  // `/host/home`, so the defaults are right in the container and a native run reads `ENOENT`
  // on both. An explicit `collectors` (every test) bypasses this entirely.
  const wired = collectors ?? collectorsFor(pathsFrom(env));

  // ⚠ §4's two halves, in the one order that is correct — see the module doc. Built once
  // per source, because the gate's slots must span polls; building them inside the sample
  // would give every poll a fresh, empty set of slots and the rule would do nothing.
  const guarded = withHostCeiling(oneAtATime(wired), hostCeilingMs);

  const cache = createInFlightCache<TelemetrySnapshot>({
    ttlMs,
    // Called through, not passed by reference: a fake clock written with method shorthand
    // would lose its `this` if the function were unbound here.
    monotonicMs: () => clock.monotonicMs(),
    sample: async (startedMs) => {
      // Read once, at the top, and merged against the same value below. The cache
      // guarantees no second sample is in flight, so this cannot be a lost update — but
      // naming the value makes the assumption visible instead of implied.
      const taken = previous;
      const { snapshot, sample } = await sampleSnapshot({
        collectors: guarded,
        nowMs: startedMs,
        ts: clock.isoNow(),
        previous: taken,
        // §4's `standing` — configuration, and the only field on the wire that is not a
        // reading. Captured at construction; see the option's doc for why per-sample was
        // wrong rather than merely unnecessary.
        standing,
      });
      previous = mergePrevious(taken, sample);
      return snapshot;
    },
  });

  return { snapshot: () => cache.get() };
};
