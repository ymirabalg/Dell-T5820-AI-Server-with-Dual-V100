/**
 * §3.5's disk half — {@link filesystemFrom} and {@link collectStorage}.
 *
 * The captured block counts are `os.statvfs()` on this box's two §2.2 mounts, and the
 * arithmetic is anchored to `df -B1` from the same minute: `blocks × bsize` and
 * `(blocks − bfree) × bsize` reproduce its **1B-blocks** and **Used** columns to the byte.
 * That equality is the check §6.6 asks for.
 */

import { describe, expect, test } from 'vitest';

import { gb } from '../types';
import type { Network, Storage } from '../types';
import { DEFAULT_PATHS } from './collect';
import { severityDiskFree } from '../severity';
import { CAPTURED_STATVFS_HOME, CAPTURED_STATVFS_ROOT } from './samples';
import { BYTES_PER_GIB, NO_FILESYSTEM, filesystemFrom } from './statvfs';
import type { StatvfsBlocks, StatvfsIo } from './statvfs';
import { collectStorage } from './storage';

/** A seam that answers per path, or rejects. */
const fakeStatvfs = (
  answers: Readonly<Record<string, StatvfsBlocks | Error>>,
  onCall?: (path: string) => void,
): StatvfsIo => ({
  statvfs: (path) => {
    onCall?.(path);
    const answer = answers[path];
    if (answer === undefined) return Promise.reject(new Error(`ENOENT: no such file or directory, statfs '${path}'`));
    if (answer instanceof Error) return Promise.reject(answer);
    return Promise.resolve(answer);
  },
});

const live: Readonly<Record<string, StatvfsBlocks>> = {
  [DEFAULT_PATHS.rootMount]: CAPTURED_STATVFS_ROOT,
  [DEFAULT_PATHS.homeMount]: CAPTURED_STATVFS_HOME,
};

describe('filesystemFrom', () => {
  /*
   * ⚠ F8. This test used to read `expect((totalGB ?? 0) * BYTES_PER_GIB).toBe(249792131072)`,
   * which **cancels the divisor**: `totalGB` is `blocks * bsize / BYTES_PER_GIB`, so
   * multiplying it back asserts only `blocks * bsize === 249792131072`, true for any
   * divisor at all. The ⚠ marker and the name both claim a property about the *published
   * figure*, and the body checked the block arithmetic.
   *
   * It was not inert — mutation S2 (`used` from free blocks) reddens it, so the ledger was
   * satisfied — which is exactly HANDOVER §5.2's irreducible residue: a test that goes red
   * for a real reason that is not the reason its name implies. The only defence is reading
   * each test against its own name; the fix is to assert the figure itself.
   */
  test('⚠ the live root filesystem reproduces `df -B1` exactly, in the unit it publishes', () => {
    const parsed = filesystemFrom(CAPTURED_STATVFS_ROOT);
    expect(parsed.problems).toEqual([]);
    // `df -B1 /` printed 249792131072 total and 22153736192 used, 2026-09-06. Divided by
    // 1024³ — which is what `df -h`'s `233G` is — those are these two figures.
    expect(parsed.value.totalGB).toBeCloseTo(232.6371, 4);
    expect(parsed.value.usedGB).toBeCloseTo(20.6323, 4);
    // The block arithmetic, kept as its own claim rather than smuggled into the one above.
    expect(BYTES_PER_GIB).toBe(1024 ** 3);
    expect(CAPTURED_STATVFS_ROOT.blocks * CAPTURED_STATVFS_ROOT.bsize).toBe(249792131072);
  });

  test('the live home filesystem does too — the one §3.5 says to watch', () => {
    const parsed = filesystemFrom(CAPTURED_STATVFS_HOME);
    expect(parsed.value.totalGB).toBeCloseTo(915.8145, 4);
    expect(parsed.value.usedGB).toBeCloseTo(127.0372, 4);
    expect(CAPTURED_STATVFS_HOME.blocks * CAPTURED_STATVFS_HOME.bsize).toBe(983348297728);
  });

  test('⚠ the figures match what `df -h` prints, which is what §6.6 says to check against', () => {
    // `df -h` printed `233G` for `/` and `916G` for `/home`. §6.6's disk row now says
    // **GiB** and names `df -h` as the check, so the two agree and the divisor is `1024³`.
    // ⚠ The remaining lie is in the NAMES — `usedGB`, `formatGB`'s ` GB` suffix — which
    // step 9 owns; the values here are GiB and are right. §6.3's band is a ratio and is
    // unaffected either way.
    expect(Math.round(filesystemFrom(CAPTURED_STATVFS_ROOT).value.totalGB ?? 0)).toBe(233);
    expect(Math.round(filesystemFrom(CAPTURED_STATVFS_HOME).value.totalGB ?? 0)).toBe(916);
  });

  test('a genuinely empty filesystem is 0 used, which is a reading', () => {
    // Invariant 1's other half: `0` is a number, and it must survive. Only the *unreadable*
    // cases below become null.
    const parsed = filesystemFrom({ bsize: 4096, blocks: 1000, bfree: 1000 });
    expect(parsed.problems).toEqual([]);
    expect(parsed.value.usedGB).toBe(0);
    expect(parsed.value.totalGB).toBeGreaterThan(0);
  });

  test('a full filesystem is used === total, and bands alarm', () => {
    const parsed = filesystemFrom({ bsize: 4096, blocks: 1000, bfree: 0 });
    expect(parsed.value.usedGB).toBe(parsed.value.totalGB);
    expect(severityDiskFree(parsed.value.usedGB, parsed.value.totalGB)).toBe('alarm');
  });

  test('⚠ a zero `bsize` is null with an entry, NOT a 0.0 / 0.0 GB filesystem', () => {
    // This is the invariant-1 trap for this source. A pseudo-filesystem and a failed
    // syscall wrapper both produce it, and `freePercent` guards `total === 0` by returning
    // null — so without this the row would show two credible zeros with no colour and
    // nothing in `errors[]` to say anything was wrong.
    const parsed = filesystemFrom({ bsize: 0, blocks: 60984407, bfree: 55575780 });
    // ⚠ Literal nulls, NOT `toEqual(NO_FILESYSTEM)`. Comparing against the constant makes
    // the test agree with any redefinition of it — including `{ usedGB: gb(0), totalGB:
    // gb(0) }`, which is invariant 1 inverted. The regression harness found this.
    expect(parsed.value).toEqual({ usedGB: null, totalGB: null });
    expect(parsed.value.usedGB).toBeNull();
    expect(parsed.value.totalGB).toBeNull();
    expect(parsed.problems).toHaveLength(1);
    expect(severityDiskFree(parsed.value.usedGB, parsed.value.totalGB)).toBeNull();
  });

  test('a zero block count is null with an entry, for the same reason', () => {
    const parsed = filesystemFrom({ bsize: 4096, blocks: 0, bfree: 0 });
    expect(parsed.value).toEqual(NO_FILESYSTEM);
    expect(parsed.problems).toHaveLength(1);
  });

  test('⚠ more free blocks than total blocks is corrupt, not a small negative used', () => {
    const parsed = filesystemFrom({ bsize: 4096, blocks: 100, bfree: 101 });
    expect(parsed.value).toEqual(NO_FILESYSTEM);
    expect(parsed.problems[0]).toContain('101');
    // The other side of the boundary: equal is legal and is an empty disk.
    expect(filesystemFrom({ bsize: 4096, blocks: 100, bfree: 100 }).problems).toEqual([]);
  });

  test.each([
    ['a negative bsize', { bsize: -4096, blocks: 10, bfree: 5 }],
    ['a negative block count', { bsize: 4096, blocks: -10, bfree: 0 }],
    ['a fractional block count', { bsize: 4096, blocks: 10.5, bfree: 0 }],
    ['NaN', { bsize: Number.NaN, blocks: 10, bfree: 0 }],
    ['Infinity', { bsize: 4096, blocks: Number.POSITIVE_INFINITY, bfree: 0 }],
    ['past the safe-integer range', { bsize: 4096, blocks: 2 ** 53, bfree: 0 }],
  ])('%s is null with an entry', (_name, blocks) => {
    const parsed = filesystemFrom(blocks);
    expect(parsed.value).toEqual(NO_FILESYSTEM);
    expect(parsed.problems).toHaveLength(1);
  });
});

describe('collectStorage', () => {
  test('reads the two §2.2 mounts and nothing else', async () => {
    const asked: string[] = [];
    const { filesystems, errors } = await collectStorage({
      statvfs: fakeStatvfs(live, (p) => asked.push(p)),
    });
    const { root, home } = filesystems;
    expect(errors).toEqual([]);
    expect(asked.sort()).toEqual([DEFAULT_PATHS.homeMount, DEFAULT_PATHS.rootMount].sort());
    expect(root.totalGB).toBeGreaterThan(200);
    expect(home.totalGB).toBeGreaterThan(900);
  });

  test('⚠ the mounts are §2.2’s `/host/root` and `/host/home`, not `/` and `/home`', async () => {
    // `statvfs('/')` inside the container measures the container's own overlay — a
    // plausible-looking number about the wrong filesystem, with no error to reveal it.
    expect(DEFAULT_PATHS.rootMount).toBe('/host/root');
    expect(DEFAULT_PATHS.homeMount).toBe('/host/home');
    const asked: string[] = [];
    await collectStorage({ statvfs: fakeStatvfs(live, (p) => asked.push(p)) });
    expect(asked).not.toContain('/');
    expect(asked).not.toContain('/home');
  });

  test('⚠ one mount failing leaves the other readable, and yields ONE entry', async () => {
    const { filesystems, errors } = await collectStorage({
      statvfs: fakeStatvfs({ [DEFAULT_PATHS.homeMount]: CAPTURED_STATVFS_HOME }),
    });
    const { root, home } = filesystems;
    expect(root).toEqual(NO_FILESYSTEM);
    expect(home.totalGB).not.toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe('statvfs');
    expect(errors[0]?.message).toContain(DEFAULT_PATHS.rootMount);
  });

  test('⚠ both failing yields TWO entries, one per figure', async () => {
    // §6.5 wants an error matched to the figure it explains, and these are two rows. Step
    // 4 settled the same question the same way for its six blanked channels.
    const { filesystems, errors } = await collectStorage({ statvfs: fakeStatvfs({}) });
    const { root, home } = filesystems;
    expect(root).toEqual({ usedGB: null, totalGB: null });
    expect(home).toEqual({ usedGB: null, totalGB: null });
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => e.source === 'statvfs')).toBe(true);
  });

  test('⚠ a blocked device is bounded — the route settles even though the syscall does not', async () => {
    // O17: `statvfs` is a syscall into a filesystem driver, and a device that stops
    // answering blocks in `D` state where no signal reaches it. §4 samples per request.
    const wedged: StatvfsIo = { statvfs: () => new Promise<StatvfsBlocks>(() => undefined) };
    const started = performance.now();
    const { filesystems, errors } = await collectStorage({ statvfs: wedged, timeoutMs: 40 });
    const root = filesystems.root;
    const elapsed = performance.now() - started;
    expect(elapsed).toBeGreaterThanOrEqual(30);
    expect(elapsed).toBeLessThan(2000);
    expect(root).toEqual(NO_FILESYSTEM);
    expect(errors).toHaveLength(2);
    expect(errors[0]?.message).toContain('timed out');
  });

  test('a nonsense timeout falls back to the module default rather than clamping to 1 ms', async () => {
    // `deadline.ts`'s validated budget. `timeoutMs: Infinity` — the obvious way to write
    // "do not bound this" — used to become `setTimeout`'s 1 ms clamp and blank the panel.
    const { filesystems, errors } = await collectStorage({
      statvfs: fakeStatvfs(live),
      timeoutMs: Number.POSITIVE_INFINITY,
    });
    const root = filesystems.root;
    expect(errors).toEqual([]);
    expect(root.totalGB).not.toBeNull();
  });

  test('a parser that throws would still be one entry, not a 500', async () => {
    const hostile: StatvfsIo = {
      statvfs: () => {
        throw new Error('statfs blew up');
      },
    };
    const { filesystems, errors } = await collectStorage({ statvfs: hostile });
    const { root, home } = filesystems;
    expect(root).toEqual(NO_FILESYSTEM);
    expect(home).toEqual(NO_FILESYSTEM);
    expect(errors).toHaveLength(2);
  });

  test('the branded unit is GB, and severity flows from it', () => {
    // A compile-time fact made visible: `severityDiskFree` takes `GB`, so a GiB/GB mix-up
    // in a later step is a type error rather than a wrong colour.
    expect(severityDiskFree(gb(90), gb(100))).toBe('watch');
    expect(severityDiskFree(gb(96), gb(100))).toBe('alarm');
    expect(severityDiskFree(gb(10), gb(100))).toBe('normal');
  });

  /*
   * ⚠ R2 — step 6's assembly, proved at COMPILE time, because no runtime assertion can see
   * it and `tsc` said nothing about the shape this replaced.
   *
   * The collection used to be flat, and the instruction that fell out of it was
   * `const storage: Storage = { ...await collectStorage(), net }`. That **typechecks at
   * exit 0** — TypeScript's excess-property check does not fire through a spread — so the
   * collector's `errors` array shipped inside `snapshot.storage`, duplicating the top-level
   * `errors[]` that already carried the same entries.
   *
   * Both directions are locked here. The `@ts-expect-error` fails if the whole collection
   * ever becomes spreadable into a `Storage` again; and because an **unused**
   * `@ts-expect-error` is itself a compile error, it also fails if `filesystems` is
   * flattened back. `vitest run` sees neither — only `tsc`, which is why `pnpm verify` runs
   * it first.
   */
  test('⚠ the whole collection cannot be spread into a Storage — errors would ride along', async () => {
    const collection = await collectStorage({ statvfs: fakeStatvfs(live) });
    const net: Network = { rxBytesPerSec: null, txBytesPerSec: null, link: null };

    // @ts-expect-error — `root` and `home` live under `filesystems`; spreading the
    // collection carries `errors` and satisfies nothing.
    const leaked: Storage = { ...collection, net };
    expect(leaked).toBeDefined();

    // The composition step 6 must write instead. Total, and cannot carry an extra key.
    const storage: Storage = { ...collection.filesystems, net };
    expect(Object.keys(storage).sort()).toEqual(['home', 'net', 'root']);
    expect(storage).not.toHaveProperty('errors');
  });
});
