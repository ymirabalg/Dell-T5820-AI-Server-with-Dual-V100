/**
 * The IO wrappers — invariant 5, §6.5 and §3.7's `ErrorSource` vocabulary.
 *
 * > Invariant 5: "A failed reading is a partial snapshot plus an `errors[]` entry — never
 * > a 500. Partial snapshots are the normal case on this machine."
 *
 * Every test drives a **fake** {@link CollectorIo}, so nothing here reads `/proc`, needs a
 * GPU, or needs root — the same property the parsers have, extended to the layer that
 * catches failure. The fake also makes the failure modes reachable: `nvidia-smi` absent,
 * `/sys` not mounted, a directory that reads but a file inside it that does not.
 */

import { describe, expect, test } from 'vitest';

import type { ErrorSource } from '../types';
import {
  CORETEMP_NAME,
  DEFAULT_INTERFACE,
  DEFAULT_PATHS,
  collectCpuTemp,
  collectGpus,
  collectHost,
} from './collect';
import type { HostCollection } from './collect';
import { NVIDIA_SMI_TIMEOUT_MS } from './io';
import type { CollectorIo } from './io';
import {
  CAPTURED_CORETEMP,
  CAPTURED_ETC_HOSTNAME,
  CAPTURED_NVIDIA_SMI,
  CAPTURED_OPERSTATE,
  CAPTURED_PROC_CPUINFO,
  CAPTURED_PROC_LOADAVG,
  CAPTURED_PROC_MEMINFO,
  CAPTURED_PROC_NET_DEV,
  CAPTURED_PROC_STAT,
  CAPTURED_PROC_UPTIME,
  EMPTY,
  NVIDIA_SMI_ONE_CARD,
} from './samples';

// ---------------------------------------------------------------------------
// A fake box
// ---------------------------------------------------------------------------

/**
 * `ai-server` as its bind mounts would present it inside the container (§2.2), keyed by
 * the exact paths `DEFAULT_PATHS` reads. `hwmon0`/`hwmon1` are the two `nvme` nodes and
 * `hwmon3` is `dell_smm`, exactly as the box enumerates them — `coretemp` is `hwmon2`, in
 * the middle, which is what makes "find it by name" testable.
 */
const HEALTHY_FILES: Readonly<Record<string, string>> = {
  '/proc/stat': CAPTURED_PROC_STAT,
  '/proc/meminfo': CAPTURED_PROC_MEMINFO,
  '/proc/loadavg': CAPTURED_PROC_LOADAVG,
  '/proc/uptime': CAPTURED_PROC_UPTIME,
  '/proc/net/dev': CAPTURED_PROC_NET_DEV,
  '/proc/cpuinfo': CAPTURED_PROC_CPUINFO,
  '/etc/hostname': CAPTURED_ETC_HOSTNAME,
  '/sys/class/net/eno1/operstate': CAPTURED_OPERSTATE,
  '/sys/class/hwmon/hwmon0/name': 'nvme\n',
  '/sys/class/hwmon/hwmon1/name': 'nvme\n',
  '/sys/class/hwmon/hwmon2/name': `${CORETEMP_NAME}\n`,
  '/sys/class/hwmon/hwmon3/name': 'dell_smm\n',
  ...Object.fromEntries(
    Object.entries(CAPTURED_CORETEMP).map(([f, c]) => [`/sys/class/hwmon/hwmon2/${f}`, c]),
  ),
};

const HEALTHY_DIRS: Readonly<Record<string, string[]>> = {
  '/sys/class/hwmon': ['hwmon0', 'hwmon1', 'hwmon2', 'hwmon3'],
  '/sys/class/hwmon/hwmon2': Object.keys(CAPTURED_CORETEMP),
};

interface FakeOptions {
  readonly files?: Readonly<Record<string, string>>;
  readonly dirs?: Readonly<Record<string, string[]>>;
  readonly stdout?: string;
  readonly runFails?: string;
  readonly release?: string;
}

const fakeIo = (o: FakeOptions = {}): CollectorIo => ({
  readFile: async (path) => {
    const files = o.files ?? HEALTHY_FILES;
    const text = files[path];
    if (text === undefined) throw new Error(`ENOENT: no such file or directory, open '${path}'`);
    return text;
  },
  readDir: async (path) => {
    const dirs = o.dirs ?? HEALTHY_DIRS;
    const entries = dirs[path];
    if (entries === undefined) throw new Error(`ENOENT: no such file or directory, scandir '${path}'`);
    return [...entries];
  },
  run: async () => {
    if (o.runFails !== undefined) throw new Error(o.runFails);
    return o.stdout ?? CAPTURED_NVIDIA_SMI;
  },
  unameRelease: () => o.release ?? '7.0.0-30-generic',
});

const sources = (errors: readonly { source: ErrorSource }[]): ErrorSource[] =>
  errors.map((e) => e.source);

// ---------------------------------------------------------------------------
// §3.1 collectGpus
// ---------------------------------------------------------------------------

describe('collectGpus (§3.1)', () => {
  test('the healthy box: two cards, no errors', async () => {
    const { gpus, errors } = await collectGpus({ io: fakeIo() });
    expect(errors).toEqual([]);
    expect(gpus?.map((g) => g.index)).toEqual([0, 1]);
  });

  test('⚠ nvidia-smi absent is `gpus: null` — the enumeration could not be performed', async () => {
    // §3.1: "missing or returning nothing is not an error state to hide … This box has a
    // documented history of booting with no compute GPU at all."
    const { gpus, errors } = await collectGpus({
      io: fakeIo({ runFails: 'spawn nvidia-smi ENOENT' }),
    });
    expect(gpus).toBeNull();
    expect(sources(errors)).toEqual(['nvidia-smi']);
    expect(errors[0]?.message).toContain('ENOENT');
  });

  /*
   * ⚠ **And `[]` is never silent** (§3.1: "always carries an `errors[]` entry"). This
   * assertion changed on 2026-09-07: the empty-parse branch used to return `errors: []`, so
   * the one shape that produced `[]` with nothing to explain it contradicted the sentence.
   *
   * Unreachable — step 3's adversarial measured `nvidia-smi` exiting **6** with no devices,
   * so exit 0 with no output is not a state the real binary reaches. Filed anyway, because an
   * entry mints no verdict and no severity: it can only ever say *why* a figure is blank, and
   * `[]` with no explanation is the one reading here that says nothing at all.
   */
  test('⚠ it ran and printed nothing is `gpus: []` — a different state, and not null', async () => {
    const { gpus, errors } = await collectGpus({ io: fakeIo({ stdout: EMPTY }) });
    expect(gpus).toEqual([]);
    expect(gpus).not.toBeNull();
    // Not `null`, and not silent either.
    expect(sources(errors)).toEqual(['nvidia-smi']);
    expect(errors[0]?.message).toContain('printed nothing');
  });

  test('null and [] are genuinely distinguishable at the call site', async () => {
    const absent = (await collectGpus({ io: fakeIo({ runFails: 'nope' }) })).gpus;
    const none = (await collectGpus({ io: fakeIo({ stdout: EMPTY }) })).gpus;
    expect(absent === null).toBe(true);
    expect(none === null).toBe(false);
    // …and the consumer idiom flattens them, which is fine — the contract keeps them apart.
    expect([...(absent ?? [])]).toEqual([...(none ?? [])]);
  });

  test('a failed run carries the command’s own text, not "Command failed"', async () => {
    // ⚠ Renamed. This was called "a timeout is reported with the driver's own text" and
    // exercised **no timeout at all** — it hands the fake a `runFails` string. A test whose
    // name claims coverage it does not have is worse than a missing one: an auditor reading
    // test names ticks the box. The real timeout bound lives in `io.test.ts`, against the
    // two hang shapes, because only `nodeIo` can have it.
    const { gpus, errors } = await collectGpus({ io: fakeIo({ runFails: 'No devices were found' }) });
    expect(gpus).toBeNull();
    expect(errors[0]?.message).toBe('No devices were found');
  });

  test('a rejection from the timeout path is `gpus: null` plus that message', async () => {
    // What the wrapper does with what `nodeIo.run` rejects with once its deadline fires:
    // §3.1's "could not be performed", carrying the reason a human can act on.
    const { gpus, errors } = await collectGpus({
      io: fakeIo({ runFails: 'nvidia-smi: timed out after 4000 ms' }),
    });
    expect(gpus).toBeNull();
    expect(sources(errors)).toEqual(['nvidia-smi']);
    expect(errors[0]?.message).toContain('timed out after 4000 ms');
  });

  test('the §3.1 bound is what collectGpus passes when the caller says nothing', async () => {
    let seen: number | null = null;
    const io: CollectorIo = {
      ...fakeIo(),
      run: async (_c, _a, timeoutMs) => {
        seen = timeoutMs;
        return CAPTURED_NVIDIA_SMI;
      },
    };
    await collectGpus({ io });
    expect(seen).toBe(NVIDIA_SMI_TIMEOUT_MS);
  });

  test('a card that disappears between polls', async () => {
    const before = await collectGpus({ io: fakeIo({ stdout: CAPTURED_NVIDIA_SMI }) });
    const after = await collectGpus({ io: fakeIo({ stdout: NVIDIA_SMI_ONE_CARD }) });
    expect(before.gpus).toHaveLength(2);
    expect(after.gpus).toHaveLength(1);
    expect(after.gpus?.[0]).toEqual(before.gpus?.[0]);
  });

  test('never throws, whatever the process does', async () => {
    for (const failure of ['spawn ENOENT', 'ETIMEDOUT', '']) {
      await expect(collectGpus({ io: fakeIo({ runFails: failure }) })).resolves.toBeDefined();
    }
  });
});

// ---------------------------------------------------------------------------
// §3.2 collectCpuTemp
// ---------------------------------------------------------------------------

describe('collectCpuTemp (§3.2)', () => {
  test('finds coretemp by NAME, not by a fixed hwmonN index', async () => {
    // On this box coretemp is hwmon2, between two nvme nodes and dell_smm, and §3.3's rule
    // for dell_smm applies here for the same reason: the index is not stable across boots.
    const { value, errors } = await collectCpuTemp({ io: fakeIo() });
    expect(errors).toEqual([]);
    expect(value).toBe(31);
  });

  test('still finds it when the enumeration order changes', async () => {
    const shuffled = {
      ...HEALTHY_FILES,
      '/sys/class/hwmon/hwmon0/name': `${CORETEMP_NAME}\n`,
      '/sys/class/hwmon/hwmon2/name': 'nvme\n',
      ...Object.fromEntries(
        Object.entries(CAPTURED_CORETEMP).map(([f, c]) => [`/sys/class/hwmon/hwmon0/${f}`, c]),
      ),
    };
    const dirs = { ...HEALTHY_DIRS, '/sys/class/hwmon/hwmon0': Object.keys(CAPTURED_CORETEMP) };
    const { value } = await collectCpuTemp({ io: fakeIo({ files: shuffled, dirs }) });
    expect(value).toBe(31);
  });

  test('⚠ never falls back to dell_smm — §3.2 measured temp1 wrong by up to 16 °C', async () => {
    const noCoretemp = { ...HEALTHY_FILES, '/sys/class/hwmon/hwmon2/name': 'dell_smm\n' };
    const { value, errors } = await collectCpuTemp({ io: fakeIo({ files: noCoretemp }) });
    expect(value).toBeNull();
    expect(sources(errors)).toEqual(['coretemp']);
    expect(errors[0]?.message).toContain(CORETEMP_NAME);
  });

  test('/sys not mounted is null plus one coretemp error, not a throw', async () => {
    const { value, errors } = await collectCpuTemp({ io: fakeIo({ dirs: {} }) });
    expect(value).toBeNull();
    expect(sources(errors)).toEqual(['coretemp']);
    expect(errors[0]?.message).toContain('ENOENT');
  });

  test('an hwmon node with no readable `name` is skipped, not fatal', async () => {
    const files = { ...HEALTHY_FILES };
    delete (files as Record<string, string>)['/sys/class/hwmon/hwmon0/name'];
    const { value, errors } = await collectCpuTemp({ io: fakeIo({ files }) });
    expect(value).toBe(31);
    expect(errors).toEqual([]);
  });

  test('⚠ an UNREADABLE hwmon node is not reported as an ABSENT one', async () => {
    // §2.2 runs the container non-root, so EACCES under /sys is the plausible case. The
    // value is `null` either way; what must not happen is a message asserting a fact the
    // collector does not have. Step 4 locates `dell_smm` through this same loop, and there
    // the swallowed error would flip O8's three-valued probe from `null` (unknown) to
    // `false` — a SAFETY alarm claiming GPU fan control is gone, on a healthy box.
    const io: CollectorIo = {
      ...fakeIo(),
      readFile: async (path) => {
        if (path.endsWith('/name')) throw new Error(`EACCES: permission denied, open '${path}'`);
        const text = HEALTHY_FILES[path];
        if (text === undefined) throw new Error(`ENOENT: ${path}`);
        return text;
      },
    };
    const { value, errors } = await collectCpuTemp({ io });
    expect(value).toBeNull();
    expect(sources(errors)).toEqual(['coretemp']);
    expect(errors[0]?.message).toContain('EACCES');
    expect(errors[0]?.message).toContain('could not be identified');
  });

  test('…and a node that genuinely is not coretemp still reports plain absence', async () => {
    // The other side of the same boundary: when every name read cleanly and none matched,
    // "no hwmon named `coretemp`" is true and must stay unqualified.
    const others = {
      ...HEALTHY_FILES,
      '/sys/class/hwmon/hwmon2/name': 'dell_smm\n',
    };
    const { value, errors } = await collectCpuTemp({ io: fakeIo({ files: others }) });
    expect(value).toBeNull();
    expect(errors[0]?.message).toContain(`no hwmon named \`${CORETEMP_NAME}\``);
    expect(errors[0]?.message).not.toContain('could not be identified');
  });

  test('a coretemp problem names the directory it was actually read from', async () => {
    // A9: the parsers hold no literal paths, so the wrapper supplies the real one — which
    // matters here more than anywhere, because this path is DISCOVERED, not a constant.
    const files = { ...HEALTHY_FILES };
    delete (files as Record<string, string>)['/sys/class/hwmon/hwmon2/temp1_input'];
    const { value, errors } = await collectCpuTemp({ io: fakeIo({ files }) });
    expect(value).toBeNull();
    expect(errors[0]?.message).toContain('/sys/class/hwmon/hwmon2:');
  });

  test('a temp file that fails to read does not blank the package reading', async () => {
    const files = { ...HEALTHY_FILES };
    delete (files as Record<string, string>)['/sys/class/hwmon/hwmon2/temp5_input'];
    const { value, errors } = await collectCpuTemp({ io: fakeIo({ files }) });
    expect(value).toBe(31);
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §3.2 + §3.5 collectHost
// ---------------------------------------------------------------------------

describe('collectHost — the healthy box', () => {
  test('every §3.2 field, from the box’s own files, with no errors', async () => {
    const r = await collectHost({ io: fakeIo(), nowMs: 1_000 });
    expect(r.errors).toEqual([]);
    expect(r.hostname).toBe('ai-server');
    expect(r.host.loadAvg).toEqual([0.34, 0.19, 0.08]);
    expect(r.host.cpuTempC).toBe(31);
    expect(r.host.memTotalGiB).toBeCloseTo(61.22, 2);
    expect(r.host.swapTotalGiB).toBeCloseTo(8, 5);
    expect(r.host.uptimeSec).toBe(81376);
    expect(r.host.kernel).toBe('7.0.0-30-generic');
    expect(r.host.cpuModel).toBe('Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz');
    expect(r.host.cores).toBe(6);
    expect(r.host.threads).toBe(12);
    expect(r.net.link).toBe('up');
  });

  test('§6.7 — the first poll has null deltas, never 0', async () => {
    const r = await collectHost({ io: fakeIo(), nowMs: 1_000 });
    expect(r.host.cpuPct).toBeNull();
    expect(r.net.rxBytesPerSec).toBeNull();
    expect(r.net.txBytesPerSec).toBeNull();
  });

  test('the second poll computes deltas from the sample the first handed back', async () => {
    const first = await collectHost({ io: fakeIo(), nowMs: 0 });
    const moved = {
      ...HEALTHY_FILES,
      '/proc/stat': 'cpu  625550 1415 556005 96227383 35342 0 55034 0 0 0\n',
      '/proc/net/dev':
        'Inter-|   Receive\n face |bytes\n  eno1: 65739369014 43716435    0 181828    0     0          0     89083 1563241756 21488214    0    1    0     0       0          0\n',
    };
    const second = await collectHost({
      io: fakeIo({ files: moved }),
      nowMs: 5_000,
      previous: first.sample,
    });
    expect(second.host.cpuPct).toBeCloseTo(15, 6);
    expect(second.net.rxBytesPerSec).toBe(1_000_000);
    expect(second.net.txBytesPerSec).toBe(100_000);
  });

  test('the sample carried forward is this poll’s counters and clock', async () => {
    const r = await collectHost({ io: fakeIo(), nowMs: 4_242 });
    expect(r.sample.atMs).toBe(4_242);
    expect(r.sample.net?.rxBytes).toBe(65734369014n);
    expect(r.sample.cpu).not.toBeNull();
  });
});

describe('collectHost — partial failure is the normal case (invariant 5, §6.5)', () => {
  const without = (...paths: string[]): Readonly<Record<string, string>> => {
    const files: Record<string, string> = { ...HEALTHY_FILES };
    for (const p of paths) delete files[p];
    return files;
  };

  test('one unreadable file blanks its own figures and nothing else', async () => {
    const r = await collectHost({ io: fakeIo({ files: without('/proc/meminfo') }), nowMs: 0 });
    expect(r.host.memTotalGiB).toBeNull();
    expect(r.host.swapTotalGiB).toBeNull();
    // …and every other panel still renders.
    expect(r.host.loadAvg).toEqual([0.34, 0.19, 0.08]);
    expect(r.host.cpuTempC).toBe(31);
    expect(r.host.cores).toBe(6);
    expect(sources(r.errors)).toEqual(['proc-meminfo']);
  });

  test('⚠ §3.7 — a failed link read is `net-operstate`, NOT `proc-net-dev`', async () => {
    // "folding them together would attribute a failed link read to the byte counters and
    // point the UI at the wrong figure."
    const r = await collectHost({
      io: fakeIo({ files: without('/sys/class/net/eno1/operstate') }),
      nowMs: 0,
    });
    expect(r.net.link).toBeNull();
    expect(sources(r.errors)).toEqual(['net-operstate']);
    expect(sources(r.errors)).not.toContain('proc-net-dev');
  });

  test('⚠ and a failed byte-counter read is `proc-net-dev`, not `net-operstate`', async () => {
    const r = await collectHost({ io: fakeIo({ files: without('/proc/net/dev') }), nowMs: 0 });
    expect(r.net.link).toBe('up');
    expect(sources(r.errors)).toEqual(['proc-net-dev']);
  });

  test('the two can fail independently and are reported separately', async () => {
    const r = await collectHost({
      io: fakeIo({ files: without('/proc/net/dev', '/sys/class/net/eno1/operstate') }),
      nowMs: 0,
    });
    expect(sources(r.errors).sort()).toEqual(['net-operstate', 'proc-net-dev']);
  });

  test('every source that can fail uses its own §3.7 name', async () => {
    const expected: readonly [string, ErrorSource][] = [
      ['/proc/stat', 'proc-stat'],
      ['/proc/meminfo', 'proc-meminfo'],
      ['/proc/loadavg', 'proc-loadavg'],
      ['/proc/uptime', 'proc-uptime'],
      ['/proc/net/dev', 'proc-net-dev'],
      ['/proc/cpuinfo', 'proc-cpuinfo'],
      ['/etc/hostname', 'hostname'],
      ['/sys/class/net/eno1/operstate', 'net-operstate'],
    ];
    for (const [path, source] of expected) {
      const r = await collectHost({ io: fakeIo({ files: without(path) }), nowMs: 0 });
      expect(sources(r.errors), `${path} should report as ${source}`).toEqual([source]);
      expect(r.errors[0]?.message).toContain(path);
    }
  });

  test('⚠ a failure in ONE source leaves every OTHER source’s figures intact', async () => {
    // §6.5: "A single sensor read fails → that figure shows `—`, its `errors` entry is
    // available, **the rest of the panel renders**." The per-source tests above each
    // remove one file and check its own figures went null; this checks the complement,
    // which is where cross-contamination actually hides — a collector that lets a dead
    // /proc/stat blank the CPU model passes every one of them.
    const REPRESENTATIVE: readonly [string, ErrorSource, (r: HostCollection) => boolean][] = [
      ['/proc/stat', 'proc-stat', (r) => r.sample.cpu !== null],
      ['/proc/meminfo', 'proc-meminfo', (r) => r.host.memTotalGiB !== null],
      ['/proc/loadavg', 'proc-loadavg', (r) => r.host.loadAvg !== null],
      ['/proc/uptime', 'proc-uptime', (r) => r.host.uptimeSec !== null],
      ['/proc/net/dev', 'proc-net-dev', (r) => r.sample.net !== null],
      ['/proc/cpuinfo', 'proc-cpuinfo', (r) => r.host.cpuModel !== null && r.host.cores !== null],
      ['/etc/hostname', 'hostname', (r) => r.hostname !== null],
      ['/sys/class/net/eno1/operstate', 'net-operstate', (r) => r.net.link !== null],
      ['/sys/class/hwmon/hwmon2/name', 'coretemp', (r) => r.host.cpuTempC !== null],
    ];

    for (const [broken, source] of REPRESENTATIVE) {
      const r = await collectHost({ io: fakeIo({ files: without(broken) }), nowMs: 0 });
      expect(sources(r.errors), `${broken} should report exactly ${source}`).toEqual([source]);
      for (const [other, otherSource, reads] of REPRESENTATIVE) {
        if (other === broken) {
          expect(reads(r), `${broken} should have blanked ${otherSource}`).toBe(false);
        } else {
          expect(reads(r), `${broken} must not blank ${otherSource}`).toBe(true);
        }
      }
    }
  });

  test('nothing readable at all: every field null, nine errors, no throw', async () => {
    const r = await collectHost({ io: fakeIo({ files: {}, dirs: {} }), nowMs: 0 });
    expect(r.hostname).toBeNull();
    expect(r.host).toEqual({
      cpuPct: null,
      loadAvg: null,
      cpuTempC: null,
      memUsedGiB: null,
      memTotalGiB: null,
      swapUsedGiB: null,
      swapTotalGiB: null,
      uptimeSec: null,
      // `uname` cannot fail, so the kernel is the one field that survives a dead /proc.
      kernel: '7.0.0-30-generic',
      cpuModel: null,
      cores: null,
      threads: null,
    });
    expect(r.net).toEqual({ rxBytesPerSec: null, txBytesPerSec: null, link: null });
    expect(sources(r.errors).sort()).toEqual([
      'coretemp',
      'hostname',
      'net-operstate',
      'proc-cpuinfo',
      'proc-loadavg',
      'proc-meminfo',
      'proc-net-dev',
      'proc-stat',
      'proc-uptime',
    ]);
  });

  test('a dead /proc/stat still lets the next poll compute network rates', async () => {
    // The two deltas are independent: one counter failing must not blank the other.
    const files = without('/proc/stat');
    const first = await collectHost({ io: fakeIo({ files }), nowMs: 0 });
    const moved = {
      ...files,
      '/proc/net/dev':
        'Inter-|   Receive\n face |bytes\n  eno1: 65739369014 1 0 0 0 0 0 0 1563241756 1 0 0 0 0 0 0\n',
    };
    const second = await collectHost({
      io: fakeIo({ files: moved }),
      nowMs: 5_000,
      previous: first.sample,
    });
    expect(second.host.cpuPct).toBeNull();
    expect(second.net.rxBytesPerSec).toBe(1_000_000);
  });

  test('an empty /etc/hostname is null, not the empty string', async () => {
    const r = await collectHost({
      io: fakeIo({ files: { ...HEALTHY_FILES, '/etc/hostname': EMPTY } }),
      nowMs: 0,
    });
    expect(r.hostname).toBeNull();
    expect(sources(r.errors)).toEqual(['hostname']);
  });

  test('⚠ a PARSE problem is prefixed with the path that was actually read', async () => {
    // A9. The read succeeded here — the file is present and empty — so this exercises the
    // parse branch, which is the one that used to carry a literal `/etc/hostname:` written
    // inside the pure parser. `CollectorPaths` is injectable and step 11 may mount `/proc`
    // elsewhere, so a hard-coded literal would name a file that was never opened and point
    // §6.5 at the wrong figure.
    const paths = { ...DEFAULT_PATHS, etcHostname: '/host/etc/hostname' };
    const files = { ...HEALTHY_FILES, '/host/etc/hostname': EMPTY };
    const r = await collectHost({ io: fakeIo({ files }), paths, nowMs: 0 });
    expect(r.errors[0]?.message).toBe('/host/etc/hostname: empty');
  });

  test('…and so is a parse problem from a file whose path is a plain default', async () => {
    const files = { ...HEALTHY_FILES, '/proc/loadavg': 'not a load average\n' };
    const r = await collectHost({ io: fakeIo({ files }), nowMs: 0 });
    expect(sources(r.errors)).toEqual(['proc-loadavg']);
    expect(r.errors[0]?.message).toBe('/proc/loadavg: could not read all three averages');
  });

  test('a blank `uname` release is null, not the empty string', async () => {
    const r = await collectHost({ io: fakeIo({ release: '' }), nowMs: 0 });
    expect(r.host.kernel).toBeNull();
  });
});

describe('invariant 5 is unconditional — nothing reaches the caller as a throw', () => {
  test('an IO layer that throws synchronously is still an errors[] entry', async () => {
    const hostile: CollectorIo = {
      readFile: () => {
        throw new Error('synchronous boom');
      },
      readDir: () => {
        throw new Error('synchronous boom');
      },
      run: () => {
        throw new Error('synchronous boom');
      },
      unameRelease: () => '7.0.0-30-generic',
    };
    const r = await collectHost({ io: hostile, nowMs: 0 });
    expect(r.errors).toHaveLength(9);
    expect(await collectGpus({ io: hostile })).toMatchObject({ gpus: null });
  });

  test('a `uname` that throws leaves the kernel null rather than failing the poll', async () => {
    const io: CollectorIo = {
      ...fakeIo(),
      unameRelease: () => {
        throw new Error('no uname');
      },
    };
    const r = await collectHost({ io, nowMs: 0 });
    expect(r.host.kernel).toBeNull();
    // …and every other figure is unaffected.
    expect(r.hostname).toBe('ai-server');
    expect(r.host.cores).toBe(6);
  });
});

describe('paths and the interface (§2.2, §3.5)', () => {
  test('the defaults are exactly what §2.2 bind-mounts', async () => {
    // "A collector that reads a path the container will not have is a step-12 failure
    // written in step 3."
    expect(DEFAULT_PATHS).toEqual({
      procStat: '/proc/stat',
      procMeminfo: '/proc/meminfo',
      procLoadavg: '/proc/loadavg',
      procUptime: '/proc/uptime',
      procNetDev: '/proc/net/dev',
      procCpuinfo: '/proc/cpuinfo',
      etcHostname: '/etc/hostname',
      hwmonRoot: '/sys/class/hwmon',
      sysClassNet: '/sys/class/net',
      nvidiaSmi: 'nvidia-smi',
      // Step 5's §3.4/§3.5/§3.6 mounts, added when `CollectorPaths` grew. ⚠ The two
      // filesystem targets are §2.2's `/host/root` and `/host/home`, never `/` and
      // `/home` — `statvfs('/')` inside the container measures the container's overlay.
      etcLlamaServer: '/etc/llama-server',
      ufwConf: '/etc/ufw/ufw.conf',
      libModules: '/lib/modules',
      rootMount: '/host/root',
      homeMount: '/host/home',
      dbusSystemSocket: '/run/dbus/system_bus_socket',
    });
    expect(DEFAULT_INTERFACE).toBe('eno1');
  });

  test('the interface flows to BOTH /proc/net/dev and the operstate path', async () => {
    const files = {
      ...HEALTHY_FILES,
      '/sys/class/net/enp0s31f6/operstate': 'down\n',
      '/proc/net/dev':
        'Inter-|   Receive\n face |bytes\nenp0s31f6:1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16\n',
    };
    const r = await collectHost({ io: fakeIo({ files }), iface: 'enp0s31f6', nowMs: 0 });
    expect(r.errors).toEqual([]);
    expect(r.net.link).toBe('down');
    expect(r.sample.net?.rxBytes).toBe(1n);
  });
});
