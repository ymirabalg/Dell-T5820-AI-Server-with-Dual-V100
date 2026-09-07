/**
 * §4's assembly: six collectors in, one {@link TelemetrySnapshot} out. **Pure of state** —
 * `previous` is handed in and the next `previous` is handed back, so the only thing that
 * remembers anything between polls is `source.ts`.
 *
 * This file **composes**. It does not parse, it does not read, and it does not adapt: step
 * 5 shaped every collector's return type so that no adapter is needed here, and a function
 * in this file that inspects a *reading* rather than a *collection* is in the wrong file.
 *
 * ---
 *
 * ### ⚠ 1. There is no shared budget, and that is the single most important line here
 *
 * HANDOVER §6, item 1, restating §6.7:
 *
 * > *A collector's budget bounds the collector's wall clock; it is never evidence about a
 * > subject … A verdict of failure — `unreachable`, `false`, `inactive` — may be minted
 * > only from an answer, or from a bound that applied to that subject **and to nothing
 * > else**.*
 *
 * The obvious implementation — one `deadline()` for the whole snapshot — reproduces step
 * 5's worst finding at the route level: a slow `nvidia-smi` would blank SERVING, and a slow
 * `statvfs` would band §6.3's alarm on a healthy `llama-server`. **Each collector keeps its
 * own budget** (4 s `nvidia-smi`, 2 s `dell_smm`, 2 s D-Bus, 2 s `statvfs`, 2 s safety
 * files, 2 s discovery + 4 s per instance), they run concurrently, and the poll's ceiling
 * is therefore the *largest* of them — §6.7's stated and intended 6 s, not their sum.
 *
 * `snapshot.test.ts` asserts over this file's source text that it opens no budget of its
 * own, because a shared `deadline()` here is behaviour-preserving on every healthy poll and
 * only shows itself on the wedged one.
 *
 * ### ⚠ 2. `errors` is destructured, never spread
 *
 * §3.2 of HANDOVER, measured by step 5's review: `{ ...await collectStorage(), net }`
 * **typechecks at exit 0** and ships the collector's `errors` array inside `snapshot.storage`
 * while the top-level `errors[]` already carries the same entries — TypeScript's
 * excess-property check does not fire through a spread. `collectStorage` and `collectSafety`
 * therefore nest their readings under `filesystems` and `checks`, and the two spreads below
 * are total: `Filesystems` **is** `Omit<Storage, 'net'>` and `SafetyChecks` **is**
 * `Omit<Safety, 'pwm5Present'>`, so neither can carry anything extra. A key census over the
 * assembled snapshot backs it at runtime, because the type is only half the guard.
 *
 * ### ⚠ 3. O9 — one D-Bus read, two panels
 *
 * `collectSafety` is the only reader of `gpu-fan-control.service`. Its answer is written to
 * `safety.fanServiceState` (through the spread) and to `cooling.serviceState` (through
 * {@link withServiceState}) **on adjacent lines**, which is the cheapest defence against
 * the two drifting. `collectCooling` never reads D-Bus and always returns
 * `serviceState: null`; this file is where that hole is filled.
 *
 * ### ⚠ 4. A collector that throws is a partial snapshot, never a 500
 *
 * Invariant 5, and PLAN's green criterion for this step. Every collector is documented and
 * tested as never throwing — each catches its own IO — so the wrappers below are
 * defence in depth against a *bug* in one of them. They are not decoration: without them a
 * single rejection inside `Promise.all` loses the whole snapshot, including the five
 * collections that succeeded, and returns 500 to a dashboard whose entire purpose is to
 * keep rendering while parts of the box are unreadable.
 *
 * The fallback is always the collection the collector itself produces when it learns
 * nothing: every reading `null`, and **one `errors[]` entry per §3.7 source that collector
 * can file**, so §6.5's *"match an error to the figure it explains"* still holds for every
 * figure the crash blanked. `lib/fixtures.ts` is deliberately not used for this — it says
 * so itself: it is test data, and *"there is no 'empty snapshot' the route may return when a
 * collector fails"*. These are not an empty snapshot; they are six independent "could not
 * report" collections, each carrying its own explanation.
 */

import {
  NO_FANS,
  NO_FILESYSTEM,
  collectCooling,
  collectGpus,
  collectHost,
  collectSafety,
  collectServing,
  collectStorage,
  coolingFrom,
  pwm5PresentFrom,
  reason,
  tag,
  withServiceState,
} from '@/lib/collectors';
import type {
  CoolingCollection,
  DeltaSample,
  Filesystems,
  GpuCollection,
  HostCollection,
  Pwm5Probe,
  SafetyChecks,
  SafetyCollection,
  ServingCollection,
  StorageCollection,
} from '@/lib/collectors';
import type {
  Cooling,
  ErrorSource,
  Host,
  IsoTimestamp,
  Network,
  Safety,
  Storage,
  TelemetryError,
  TelemetrySnapshot,
} from '@/lib/types';

// ---------------------------------------------------------------------------
// The six collectors, as an injectable record
// ---------------------------------------------------------------------------

/**
 * The six functions this file calls, named so a test can replace them.
 *
 * ⚠ Each is typed as `typeof` the real collector rather than as a hand-written signature.
 * A fake therefore has to satisfy the collector's own contract — including the options
 * object, including `collectHost`'s required `nowMs` — and a collector whose signature
 * changes breaks this file at compile time instead of at the fake.
 *
 * `collectCpuTemp` is absent on purpose: it is called *inside* `collectHost`, and its
 * `coretemp` entries arrive in `HostCollection.errors`.
 */
export interface SnapshotCollectors {
  readonly gpus: typeof collectGpus;
  readonly host: typeof collectHost;
  readonly cooling: typeof collectCooling;
  readonly serving: typeof collectServing;
  readonly storage: typeof collectStorage;
  readonly safety: typeof collectSafety;
}

/** The real collectors, each with its own default paths, seams and budget. */
export const DEFAULT_COLLECTORS: SnapshotCollectors = {
  gpus: collectGpus,
  host: collectHost,
  cooling: collectCooling,
  serving: collectServing,
  storage: collectStorage,
  safety: collectSafety,
};

// ---------------------------------------------------------------------------
// "The collector could not report" — one collection per collector
// ---------------------------------------------------------------------------

/** Every §3.2 host reading, unread. Invariant 1: `null`, never zero. */
export const NO_HOST: Host = {
  cpuPct: null,
  loadAvg: null,
  cpuTempC: null,
  memUsedGiB: null,
  memTotalGiB: null,
  swapUsedGiB: null,
  swapTotalGiB: null,
  uptimeSec: null,
  kernel: null,
  cpuModel: null,
  cores: null,
  threads: null,
};

/** §3.5's network half, unread. `link: null` is "not read", never `'down'`. */
export const NO_NETWORK: Network = { rxBytesPerSec: null, txBytesPerSec: null, link: null };

/**
 * §3.6's three non-hwmon checks, unread.
 *
 * ⚠ All three are `null` and none is `false`. §3.6's whole shape is that `false` is an
 * alarm claiming something specific is broken, and *"it must never be produced by a failed
 * read"* — a collector that crashed answered nothing at all.
 */
export const NO_CHECKS: SafetyChecks = {
  ufwEnforcing: null,
  dkmsForRunningKernel: null,
  fanServiceState: null,
};

/**
 * §3.7's probe outcome for "the check could not be performed".
 *
 * ⚠ `unlocated`, not `absent`. `pwm5PresentFrom` maps it to `null` — *unknown* — where
 * `absent` is §3.6's **alarm** claiming the DKMS 5-fan module did not load. Deriving the
 * alarm from a crashed collector is §3.7's stated worst inversion, on the panel that earns
 * this dashboard's existence. It is written as a probe rather than as a literal `null` so
 * that O8's "one three-valued probe" still holds on this path.
 */
const UNLOCATED: Pwm5Probe = { outcome: 'unlocated' };

/**
 * Every §3.7 source `collectHost` files. Nine, because `collectCpuTemp` runs inside it.
 *
 * ⚠ Nine entries for one crash is deliberate. `collectHost` blanks nine figures across
 * three panels, and §6.5 requires an error the reader can match to *the figure it
 * explains*; a single `proc-stat` entry would leave the RAM, load, uptime, CPU-model,
 * hostname, link and CPU-temperature blanks unexplained. `net-operstate` is listed
 * separately from `proc-net-dev` for §3.7's stated reason: different file, different figure.
 */
export const HOST_SOURCES: readonly ErrorSource[] = [
  'proc-stat',
  'proc-meminfo',
  'proc-loadavg',
  'proc-uptime',
  'proc-net-dev',
  'net-operstate',
  'proc-cpuinfo',
  'hostname',
  'coretemp',
];

/**
 * Every §3.7 source `collectSafety` files — one per check it blanks.
 *
 * `dbus` is the fan service's, `ufw` and `dkms` the two file checks'. Three figures, three
 * entries, on the same terms as `collectStorage`'s two mounts.
 */
export const SAFETY_SOURCES: readonly ErrorSource[] = ['ufw', 'dkms', 'dbus'];

/**
 * `collectServing`'s source for a crash: `llama-env`, and only that one.
 *
 * ⚠ Not its other three. `dbus`, `llama-health` and `llama-models` name **per-instance**
 * figures, and a collector that died before (or during) discovery has no instances to
 * attribute them to — the result is `serving: null`, *"could not enumerate instances"*,
 * which is exactly what its own failed-`readDir` path produces and files against
 * `llama-env`.
 */
export const SERVING_SOURCES: readonly ErrorSource[] = ['llama-env'];

/** The one source `collectGpus` files. */
export const GPU_SOURCES: readonly ErrorSource[] = ['nvidia-smi'];

/** The one source `collectCooling` files — for all five channels and the `pwm5` probe. */
export const COOLING_SOURCES: readonly ErrorSource[] = ['dell-smm'];

/** The one source `collectStorage` files — for both mounts. */
export const STORAGE_SOURCES: readonly ErrorSource[] = ['statvfs'];

/**
 * The message a crashed collector leaves behind.
 *
 * It names the collector, because unlike every other entry in the snapshot there is no path
 * or URL to name: the read never got far enough to have a subject.
 */
export const collectorThrew = (collector: string, why: string): string =>
  `${collector} failed before it could report a reading: ${why}`;

/** One entry per source, all carrying the same explanation. */
const entriesFor = (sources: readonly ErrorSource[], message: string): TelemetryError[] =>
  sources.flatMap((source) => tag(source, [message]));

/**
 * Run one collector, and turn a rejection into that collector's "could not report".
 *
 * ⚠ `reason(e)`, never `String(e)` or `e.message` — the project has one function for
 * describing a rejection and this is not the place for a second.
 */
const attempt = async <T>(run: () => Promise<T>, onThrow: (why: string) => T): Promise<T> => {
  try {
    return await run();
  } catch (e) {
    return onThrow(reason(e));
  }
};

// ---------------------------------------------------------------------------
// The assembly
// ---------------------------------------------------------------------------

/** Arguments to {@link sampleSnapshot}. */
export interface SampleSnapshotOptions {
  readonly collectors: SnapshotCollectors;
  /**
   * ⚠ **Monotonic** — `performance.now()`, not `Date.now()`. It reaches `collectHost` as
   * the instant its counters were read, and `netRatesBetween` divides by the difference
   * between two of them. A backward wall-clock step between polls would make that
   * difference negative (rates `null` for a poll, self-healing) or, if the step were
   * forward, silently halve a real rate. It never leaves the process: {@link ts} is the
   * only clock on the wire.
   *
   * HANDOVER §9 lists "`netRatesBetween` and a monotonic `nowMs`" as step 6's to resolve;
   * this is the resolution. ⚠ `DeltaSample.atMs`'s own doc comment in
   * `lib/collectors/deltas.ts` still says `Date.now()` and now under-describes it — the
   * field is only ever paired with itself, so the change is safe, but the comment should be
   * corrected. Recorded in this step's notes rather than edited here, since `deltas.ts` is
   * step 3's file.
   */
  readonly nowMs: number;
  /** §4's `ts`: wall clock, ISO-8601 UTC. The only clock the client sees. */
  readonly ts: IsoTimestamp;
  /** §6.7's carried counters, or `null` on the first poll of the process. */
  readonly previous: DeltaSample | null;
  /**
   * §4's `standing`, already split by `readStandingList` — **passed through untouched**.
   *
   * ⚠ It is not a collection and there is no collector for it, so it does not belong in the
   * `Promise.all` above and cannot fail: §4 calls it *"configuration, not a reading, and the
   * only such field"*. It is threaded in rather than read here for the same reason `ts` is —
   * this file composes and does not read.
   */
  readonly standing: readonly string[];
}

/**
 * One poll: the snapshot to serve, and the counters the *next* poll needs.
 *
 * `sample` is returned rather than stored because §4 fixes the server as stateless per
 * request; `source.ts` owns where it lives between polls (O16).
 */
export interface SnapshotSample {
  readonly snapshot: TelemetrySnapshot;
  readonly sample: DeltaSample;
}

/**
 * Take one sample and assemble §4's snapshot.
 *
 * The six collectors are started together and each keeps its own budget — see rule 1 in the
 * module doc. `Promise.all` over already-guarded calls cannot reject.
 */
export const sampleSnapshot = async ({
  collectors,
  nowMs,
  ts,
  previous,
  standing,
}: SampleSnapshotOptions): Promise<SnapshotSample> => {
  const [gpus, host, cooling, serving, storage, safety] = await Promise.all([
    attempt<GpuCollection>(
      () => collectors.gpus(),
      (why) => ({ gpus: null, errors: entriesFor(GPU_SOURCES, collectorThrew('collectGpus', why)) }),
    ),
    attempt<HostCollection>(
      () => collectors.host({ nowMs, previous }),
      (why) => ({
        hostname: null,
        host: NO_HOST,
        net: NO_NETWORK,
        // ⚠ Both counters `null`, which is what makes O16 work on this path too: the merge
        // in `source.ts` keeps the last good counters rather than replacing them with
        // nothing, so one crashed poll costs one delta and not two.
        sample: { atMs: nowMs, cpu: null, net: null },
        errors: entriesFor(HOST_SOURCES, collectorThrew('collectHost', why)),
      }),
    ),
    attempt<CoolingCollection>(
      () => collectors.cooling(),
      (why) => ({
        cooling: coolingFrom(NO_FANS, UNLOCATED, null),
        pwm5Present: pwm5PresentFrom(UNLOCATED),
        errors: entriesFor(COOLING_SOURCES, collectorThrew('collectCooling', why)),
      }),
    ),
    attempt<ServingCollection>(
      () => collectors.serving(),
      (why) => ({
        // §3.4: `null` is "which instances exist is unknown", and `[]` would claim the
        // directory listed and declared none. A crash is evidence of neither.
        serving: null,
        errors: entriesFor(SERVING_SOURCES, collectorThrew('collectServing', why)),
      }),
    ),
    attempt<StorageCollection>(
      () => collectors.storage(),
      (why) => ({
        filesystems: { root: NO_FILESYSTEM, home: NO_FILESYSTEM },
        errors: entriesFor(STORAGE_SOURCES, collectorThrew('collectStorage', why)),
      }),
    ),
    attempt<SafetyCollection>(
      () => collectors.safety(),
      (why) => ({
        checks: NO_CHECKS,
        errors: entriesFor(SAFETY_SOURCES, collectorThrew('collectSafety', why)),
      }),
    ),
  ]);

  // ⚠ Destructured, never spread — rule 2 in the module doc. `Filesystems` is
  // `Omit<Storage, 'net'>` and `SafetyChecks` is `Omit<Safety, 'pwm5Present'>`, so each of
  // these two spreads is total and cannot smuggle an `errors` array onto the wire.
  const filesystems: Filesystems = storage.filesystems;
  const checks: SafetyChecks = safety.checks;

  const assembledStorage: Storage = { ...filesystems, net: host.net };
  const assembledSafety: Safety = { ...checks, pwm5Present: cooling.pwm5Present };
  // ⚠ O9, and the adjacency is the point: `fanServiceState` above and `serviceState` here
  // are the same D-Bus read, and `collectSafety` is the only place it happens.
  const assembledCooling: Cooling = withServiceState(cooling.cooling, checks.fanServiceState);

  return {
    snapshot: {
      ts,
      hostname: host.hostname,
      // §4: echoed verbatim. Not validated, not deduplicated, not sorted — the browser is
      // where an id is judged, and one malformed entry must never fail a poll.
      standing,
      gpus: gpus.gpus,
      host: host.host,
      cooling: assembledCooling,
      serving: serving.serving,
      storage: assembledStorage,
      safety: assembledSafety,
      // Concatenated in the snapshot's own field order. §4 fixes no order for `errors[]`
      // and §6.5 matches an entry to a figure by `source`, so any order satisfies the
      // spec; this one is stable and needs no rule of its own to remember.
      errors: [
        ...gpus.errors,
        ...host.errors,
        ...cooling.errors,
        ...serving.errors,
        ...storage.errors,
        ...safety.errors,
      ],
    },
    sample: host.sample,
  };
};
