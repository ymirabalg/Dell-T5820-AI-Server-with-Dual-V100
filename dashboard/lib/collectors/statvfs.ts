/**
 * §3.5's disk half: the `statvfs` seam, and the pure arithmetic that turns blocks into a
 * {@link Filesystem}.
 *
 * ### The unit is **GiB**, and every identifier here now says so
 *
 * §6.6's disk row reads *"Disk | **GiB** | 1 dp | `df -h` — powers of 1024, which is what
 * `df -h` and `lsblk` print. `/` is 232.6 GiB, not 249.8 GB"*, and §1's decision 20 agrees.
 * Confirmed numerically on this box: `/` is 60984407 × 4096 = 249,792,131,072 B — **232.63**
 * over `1024³`, 249.79 over `10⁹`, and `df -h` prints `233G`.
 *
 * So {@link BYTES_PER_GIB} is `1024³` and its **name says so**. It was `BYTES_PER_GB`,
 * carrying a doc comment that read *"⚠ `1024³`, despite the name"* — this project's own
 * recurring defect written as an identifier.
 *
 * O19 finished the job: the `GB` brand, `gb()` and `formatGB` are **deleted** (not renamed —
 * `GiB` already existed for RAM, so a rename would have collided), `Filesystem` publishes
 * `usedGiB`/`totalGiB`, and the rendered suffix now agrees with the value. **§6.3's disk
 * band never depended on any of it**: it is `freePercent`, a ratio, and the divisor cancels.
 *
 * ### Which blocks
 *
 * `total = blocks × bsize` and `used = (blocks − bfree) × bsize`, which reproduce `df`'s
 * **Size** and **Used** columns exactly — verified against `df -B1` on this box to the byte,
 * and now stated by §3.5: *"`bavail` is deliberately not used — it excludes root-reserved
 * space and would not match `df`"*. `bavail` is what a non-root process may actually use,
 * 3.1 GiB lower on `/` because of the ext4 root reserve; spending it on `used` would make
 * *both* published figures disagree with `df` in order to improve a third that
 * {@link Filesystem} has no field for.
 */

import { statfs } from 'node:fs/promises';

import type { Filesystem, GiB } from '../types';
import { gib } from '../types';
import { clean } from './result';
import type { ParseResult } from './result';

/**
 * `1024³` — the divisor §6.6's disk row names, now with a name that agrees with it.
 *
 * Renamed from `BYTES_PER_GB` in step 5's reconciliation, ahead of the rest; `Filesystem`'s
 * fields and the formatter caught up in O19. See the module doc.
 */
export const BYTES_PER_GIB = 1024 ** 3;

/** The three `statvfs` fields §3.5 needs, named as `statfs(2)` names them. */
export interface StatvfsBlocks {
  readonly bsize: number;
  readonly blocks: number;
  readonly bfree: number;
}

/** `statvfs`, injectable. Rejects on ENOENT, EACCES, anything. */
export interface StatvfsIo {
  statvfs(path: string): Promise<StatvfsBlocks>;
}

/**
 * The real implementation, over `node:fs`'s `statfs`.
 *
 * ⚠ **`bigint: false`.** The counts here are block counts, not byte counts: this box's
 * larger filesystem is 240,075,268 blocks, eleven orders of magnitude inside
 * `Number.MAX_SAFE_INTEGER`. The `/proc` counters use `bigint` (see `numbers.ts`) because
 * those are absolute byte totals that a delta is taken from; nothing is subtracted from
 * these at 64-bit precision.
 */
export const nodeStatvfs: StatvfsIo = {
  statvfs: async (path) => {
    const s = await statfs(path);
    return { bsize: s.bsize, blocks: s.blocks, bfree: s.bfree };
  },
};

/** Every field within the safe-integer range and non-negative — anything else is corrupt. */
const sane = (value: number): boolean => Number.isSafeInteger(value) && value >= 0;

/** Both readings failed. Not "an empty disk" — invariant 1. */
export const NO_FILESYSTEM: Filesystem = { usedGiB: null, totalGiB: null };

/**
 * Blocks → §3.5's `Filesystem`.
 *
 * ⚠ **Every rejection here yields `null`, never `0`.** A `bsize` of `0` — which is what a
 * pseudo-filesystem and a failed syscall wrapper both produce — would otherwise make a
 * 931 GiB volume render `0.0 / 0.0 GiB`, and §6.3's `freePercent` guards `total === 0` by
 * returning `null`, so the row would show two credible zeros with **no colour and no
 * `errors[]` entry** to say anything was wrong.
 *
 * `bfree > blocks` is rejected for the same reason: it would make `used` negative, and a
 * negative used is not a smaller number, it is a corrupt read.
 */
export const filesystemFrom = (blocks: StatvfsBlocks): ParseResult<Filesystem> => {
  const { bsize, blocks: total, bfree } = blocks;
  if (!sane(bsize) || !sane(total) || !sane(bfree)) {
    return { value: NO_FILESYSTEM, problems: ['statvfs returned a value that is not a whole non-negative count'] };
  }
  if (bsize === 0 || total === 0) {
    return { value: NO_FILESYSTEM, problems: ['statvfs reports a zero-sized filesystem, which is not a reading'] };
  }
  if (bfree > total) {
    return { value: NO_FILESYSTEM, problems: [`statvfs reports ${String(bfree)} free blocks of ${String(total)}`] };
  }
  const totalGiB: GiB = gib((total * bsize) / BYTES_PER_GIB);
  const usedGiB: GiB = gib(((total - bfree) * bsize) / BYTES_PER_GIB);
  return clean<Filesystem>({ usedGiB, totalGiB });
};
