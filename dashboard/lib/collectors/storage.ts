/**
 * §3.5's disk half: `statvfs` on the two bind mounts.
 *
 * The network half of §3.5 is step 3's — `collectHost` owns `/proc/net/dev`'s deltas and
 * `operstate`, and their `ErrorSource`s are `proc-net-dev` and `net-operstate`. Step 6
 * assembles `Storage` from the two collectors; nothing here touches the network.
 *
 * ⚠ **Bounded (O17), because `statvfs` is not a `/proc` read.** It is a syscall into a
 * filesystem driver, and the two here are NVMe devices — a device that stops answering
 * blocks the call in `D` state, where no signal reaches it. The seam does not bound
 * `readFile`/`readDir` and would not bound this either, so the deadline is here and it is
 * `deadline.ts`'s: monotonic, and validated against `setTimeout`'s 1 ms clamp.
 */

import type { Filesystem, Storage, TelemetryError } from '../types';
import { DEFAULT_PATHS } from './collect';
import type { CollectorPaths } from './collect';
import { deadline } from './deadline';
import type { Within } from './deadline';
import { reason, tag } from './errors';
import { NO_FILESYSTEM, filesystemFrom, nodeStatvfs } from './statvfs';
import type { StatvfsIo } from './statvfs';

/**
 * The budget for both `statvfs` calls.
 *
 * ⚠ Chosen, not specified — reported as a gap alongside the other three. 2 s, matching
 * `DELL_SMM_TIMEOUT_MS` and `DBUS_TIMEOUT_MS` for the same reasons: a healthy call is
 * microseconds, it sits under §6.7's 5 s cadence, and a local syscall that outlasts a
 * process spawn is already pathological.
 */
export const STATVFS_TIMEOUT_MS = 2000;

/** Arguments to {@link collectStorage}. Options object, like every collector. */
export interface CollectStorageOptions {
  readonly statvfs?: StatvfsIo;
  readonly paths?: CollectorPaths;
  readonly timeoutMs?: number;
}

/**
 * Everything §3.5's disk half produces — **exactly `Storage` minus the `net` step 3 owns.**
 *
 * Derived with `Omit` rather than written out, so a contract that gains a disk field is a
 * compile error here rather than a silently missing key at the route.
 */
export type Filesystems = Omit<Storage, 'net'>;

/**
 * What {@link collectStorage} yields.
 *
 * ⚠ **The readings are NESTED under `filesystems`, and that shape is load-bearing.** This
 * collection was flat — `{ root, home, errors }` — and the assembly instruction that fell
 * out of it was `const storage: Storage = { ...await collectStorage(), net }`. Measured:
 * **that typechecks at exit 0**, because TypeScript's excess-property check does not fire
 * through a spread, so `errors` rides onto the wire inside `storage` while the top-level
 * `errors[]` already carries the same entries. Steps 3 and 4 never had the hazard because
 * they returned a *named value field* (`{ gpus, errors }`, `{ cooling, pwm5Present,
 * errors }`) and a spread was never the composition.
 *
 * So step 6 writes:
 *
 * ```ts
 * const { filesystems, errors } = await collectStorage();
 * const storage: Storage = { ...filesystems, net };
 * ```
 *
 * That spread is total and cannot carry anything extra, because `filesystems` **is**
 * `Omit<Storage, 'net'>`. `storage.test.ts` holds a `@ts-expect-error` proving the old
 * spread no longer compiles — and, because an unused `@ts-expect-error` is itself an error
 * under `tsc`, that directive also fails if anyone flattens this back.
 */
export interface StorageCollection {
  readonly filesystems: Filesystems;
  readonly errors: readonly TelemetryError[];
}

/** One mount. A failed call is `null`/`null` plus a `statvfs` entry — never zero bytes. */
const measure = async (
  statvfs: StatvfsIo,
  within: Within,
  path: string,
): Promise<{ value: Filesystem; errors: TelemetryError[] }> => {
  let blocks;
  try {
    blocks = await within(() => statvfs.statvfs(path));
  } catch (e) {
    return { value: NO_FILESYSTEM, errors: tag('statvfs', [`${path}: ${reason(e)}`]) };
  }
  const parsed = filesystemFrom(blocks);
  return { value: parsed.value, errors: tag('statvfs', parsed.problems.map((p) => `${path}: ${p}`)) };
};

/**
 * Collect §3.5's two filesystems.
 *
 * ⚠ **Two entries when both fail, not one.** §6.5 wants an error matched to the figure it
 * explains and these are two figures on two rows; step 4 settled the same question the same
 * way for its six blanked channels. Concurrent, because unlike `dell_smm`'s SMM calls these
 * are independent devices and nothing serialises them.
 */
export const collectStorage = async ({
  statvfs = nodeStatvfs,
  paths = DEFAULT_PATHS,
  timeoutMs = STATVFS_TIMEOUT_MS,
}: CollectStorageOptions = {}): Promise<StorageCollection> => {
  const within = deadline(timeoutMs, STATVFS_TIMEOUT_MS);
  const [root, home] = await Promise.all([
    measure(statvfs, within, paths.rootMount),
    measure(statvfs, within, paths.homeMount),
  ]);
  return {
    filesystems: { root: root.value, home: home.value },
    errors: [...root.errors, ...home.errors],
  };
};
