/**
 * `collectCooling` — the IO wrapper for §3.3, and the layer where §3.7's five probe
 * outcomes actually get produced.
 *
 * Most tests drive a **fake** {@link CollectorIo}, which is what makes the states the live
 * box cannot be put into reachable: the stock 4-fan driver, `/sys` not mounted, `EACCES`
 * on the node, a stalled fan, an EC that never answers. The last `describe` runs the same
 * collector against a **real** temporary directory through `nodeIo`, because a fake cannot
 * catch a `readdir` that returns `Dirent`s instead of names, or a path joined wrongly.
 *
 * Writes go to `os.tmpdir()` and nowhere else. Invariant 2 concerns the server: every
 * `dell_smm` fixture in `samples.ts` was captured from `ai-server` with `cat`, and nothing
 * was written to it — writing a `pwmN` would take manual control of a fan on a box with
 * two passively-cooled 250 W cards.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { ch5EcAuto, ch5Manual, nothingReadable, pwm5NodeAbsent, pwm5Unreadable } from '../fixtures';
import type { ErrorSource } from '../types';
import { DEFAULT_PATHS } from './collect';
import type { CollectorPaths } from './collect';
import { DELL_SMM_TIMEOUT_MS, collectCooling } from './cooling';
import { PWM5_EC_AUTO_ERRNO } from './dell-smm';
import { nodeIo } from './io';
import type { CollectorIo } from './io';
import {
  CAPTURED_DELL_SMM,
  CAPTURED_DELL_SMM_ENTRIES,
  CAPTURED_DELL_SMM_TRAPS,
  DELL_SMM_FAN5_EMPTY,
  DELL_SMM_FAN5_IMPLAUSIBLE,
  DELL_SMM_FAN5_STALLED,
  DELL_SMM_STOCK,
  DELL_SMM_STOCK_ENTRIES,
  PWM5_ABOVE_RANGE,
  PWM5_EMPTY,
  PWM5_HIGH,
  PWM5_OFF,
} from './samples';

const ROOT = DEFAULT_PATHS.hwmonRoot;
const NODE = `${ROOT}/hwmon3`;

// ---------------------------------------------------------------------------
// A fake box
// ---------------------------------------------------------------------------

interface FakeOptions {
  /** hwmon index → `name` contents. Defaults to the box's own four nodes. */
  readonly nodes?: Readonly<Record<string, string>>;
  /** The `dell_smm` node's directory listing. */
  readonly entries?: readonly string[];
  /** The `dell_smm` node's readable files, keyed by bare filename. */
  readonly files?: Readonly<Record<string, string>>;
  /** Filenames under the node whose read rejects, and with what errno. */
  readonly readFails?: Readonly<Record<string, string>>;
  /** `readDir` of the hwmon root rejects. */
  readonly rootFails?: string;
  /** `readDir` of the `dell_smm` node rejects. */
  readonly nodeDirFails?: string;
  /** Every read hangs for this long, to exercise the deadline. */
  readonly hangMs?: number;
}

/** Node's own error shape: a message AND a `code`, which is the half that matters. */
const errno = (code: string, path: string): Error =>
  Object.assign(new Error(`${code}: ${code.toLowerCase()}, read '${path}'`), { code });

interface Recorder {
  readonly io: CollectorIo;
  readonly reads: string[];
  readonly dirs: string[];
  /** The highest number of reads in flight at once. */
  peak(): number;
}

const fake = (o: FakeOptions = {}): Recorder => {
  const nodes = o.nodes ?? { hwmon0: 'nvme\n', hwmon1: 'nvme\n', hwmon2: 'coretemp\n', hwmon3: 'dell_smm\n' };
  const entries = o.entries ?? CAPTURED_DELL_SMM_ENTRIES;
  const files = o.files ?? CAPTURED_DELL_SMM;
  const readFails = o.readFails ?? { pwm5: PWM5_EC_AUTO_ERRNO };
  const reads: string[] = [];
  const dirs: string[] = [];
  let inFlight = 0;
  let peak = 0;

  const settle = async <T>(produce: () => T): Promise<T> => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    try {
      if (o.hangMs !== undefined) await new Promise((r) => setTimeout(r, o.hangMs));
      return produce();
    } finally {
      inFlight -= 1;
    }
  };

  const io: CollectorIo = {
    readDir: async (path) => {
      dirs.push(path);
      return settle(() => {
        if (path === ROOT) {
          if (o.rootFails !== undefined) throw new Error(o.rootFails);
          return Object.keys(nodes);
        }
        if (path === NODE) {
          if (o.nodeDirFails !== undefined) throw errno(o.nodeDirFails, path);
          return [...entries];
        }
        throw errno('ENOENT', path);
      });
    },
    readFile: async (path) => {
      reads.push(path);
      return settle(() => {
        const nodeName = /^\/sys\/class\/hwmon\/(hwmon\d+)\/name$/.exec(path);
        if (nodeName !== null) {
          const text = nodes[nodeName[1] ?? ''];
          if (text === undefined) throw errno('ENOENT', path);
          return text;
        }
        if (!path.startsWith(`${NODE}/`)) throw errno('ENOENT', path);
        const file = path.slice(`${NODE}/`.length);
        const code = readFails[file];
        if (code !== undefined) throw errno(code, path);
        const text = files[file];
        if (text === undefined) throw errno('ENOENT', path);
        return text;
      });
    },
    run: async () => {
      throw new Error('collectCooling must not run a command');
    },
    unameRelease: () => '7.0.0-30-generic',
  };

  return { io, reads, dirs, peak: () => peak };
};

const sources = (errors: readonly { source: ErrorSource }[]): ErrorSource[] =>
  errors.map((e) => e.source);

/** The `Cooling` §3.3 describes, with the fan values the live capture holds. */
const LIVE_FANS = {
  fan1Rpm: 1028,
  fan2Rpm: 718,
  fan3Rpm: 615,
  fan4Rpm: 1006,
  fan5Rpm: 1915,
};

// ---------------------------------------------------------------------------
// §3.7's five outcomes, in order
// ---------------------------------------------------------------------------

describe('§3.7 outcome 1 — the probe could not be performed', () => {
  test('no `dell_smm` hwmon: pwm5Present is null, NOT false', () => {
    // ⚠ The worst inversion in the project, and it is one keystroke away: `false` claims
    // the DKMS 5-fan module did not load. This snapshot has no evidence of that.
    return collectCooling({
      io: fake({ nodes: { hwmon0: 'nvme\n', hwmon1: 'coretemp\n' } }).io,
    }).then(({ cooling, pwm5Present, errors }) => {
      expect(pwm5Present).toBeNull();
      expect(pwm5Present).not.toBe(false);
      expect(cooling.ch5Mode).toBeNull();
      expect(cooling.ch5Pwm).toBeNull();
      expect(sources(errors)).toEqual(['dell-smm']);
      expect(errors[0]?.message).toBe('no hwmon named `dell_smm` under /sys/class/hwmon');
    });
  });

  test('it reproduces `nothingReadable`’s cooling and safety exactly', async () => {
    const { cooling, pwm5Present } = await collectCooling({
      io: fake({ nodes: { hwmon0: 'nvme\n' } }).io,
    });
    expect(cooling).toEqual(nothingReadable.cooling);
    expect(pwm5Present).toBe(nothingReadable.safety.pwm5Present);
  });

  test('⚠ every fan is null, not zero — a driver that did not load', async () => {
    const { cooling } = await collectCooling({ io: fake({ nodes: {} }).io });
    expect([
      cooling.fan1Rpm,
      cooling.fan2Rpm,
      cooling.fan3Rpm,
      cooling.fan4Rpm,
      cooling.fan5Rpm,
    ]).toEqual([null, null, null, null, null]);
  });

  test('`/sys` not mounted at all: still unknown, and the message says so', async () => {
    const { pwm5Present, errors } = await collectCooling({
      io: fake({ rootFails: "ENOENT: no such file or directory, scandir '/sys/class/hwmon'" }).io,
    });
    expect(pwm5Present).toBeNull();
    expect(errors[0]?.message).toContain('/sys/class/hwmon: ENOENT');
  });

  test('⚠ EACCES on the node directory is unknown, NOT present', async () => {
    // §3.7 row 1 lists `EACCES` on the directory. Reading `pwm5` speculatively instead
    // would get EACCES from the read and be classified `unreadable` — `pwm5Present: true`,
    // an assertion the listing never supported.
    const { pwm5Present, cooling, errors } = await collectCooling({
      io: fake({ nodeDirFails: 'EACCES' }).io,
    });
    expect(pwm5Present).toBeNull();
    expect(cooling.ch5Mode).toBeNull();
    expect(errors[0]?.message).toContain('EACCES');
  });

  test('with every `name` readable, absence is stated plainly…', async () => {
    const { pwm5Present, errors } = await collectCooling({
      io: fake({ nodes: { hwmon0: 'nvme\n', hwmon1: 'coretemp\n' } }).io,
    });
    expect(pwm5Present).toBeNull();
    expect(errors[0]?.message).toBe('no hwmon named `dell_smm` under /sys/class/hwmon');
  });

  test('…and with one unreadable the message refuses to claim absence', async () => {
    const io: CollectorIo = {
      ...fake({ nodes: { hwmon0: 'nvme\n', hwmon1: 'coretemp\n' } }).io,
      readFile: async (path) => {
        throw errno('EACCES', path);
      },
    };
    const { pwm5Present, errors } = await collectCooling({ io });
    expect(pwm5Present).toBeNull();
    expect(errors[0]?.message).toContain('could not be identified');
  });
});

describe('§3.7 outcome 2 — the DKMS 5-fan module did not load', () => {
  test('⚠ pwm5Present is false: THE alarm, and it is reachable only from here', async () => {
    const { cooling, pwm5Present, errors } = await collectCooling({
      io: fake({ entries: DELL_SMM_STOCK_ENTRIES, files: DELL_SMM_STOCK, readFails: {} }).io,
    });
    expect(pwm5Present).toBe(false);
    expect(cooling.ch5Mode).toBeNull();
    expect(sources(errors)).toEqual(['dell-smm']);
    expect(errors[0]?.message).toContain('no `pwm5` node');
  });

  test('⚠ fan1–fan4 survive; only channel 5 disappears (§9)', async () => {
    const { cooling } = await collectCooling({
      io: fake({ entries: DELL_SMM_STOCK_ENTRIES, files: DELL_SMM_STOCK, readFails: {} }).io,
    });
    expect(cooling.fan1Rpm).toBe(1028);
    expect(cooling.fan4Rpm).toBe(1006);
    expect(cooling.fan5Rpm).toBeNull();
  });

  /*
   * ⚠ **And channel 5's silence is an exception, not the rule.** §6.3's `fan1`–`fan4` row:
   * "An em dash on channels 1–4 **always** has an `errors[]` entry behind it; one on channel
   * 5 may not, because channel 5 has a documented absent state and these do not." The test
   * above is the second half — `fan5Rpm: null` with only the `pwm5` entry beside it. This is
   * the first half, and it was unguarded until 2026-09-07: a channel missing from the
   * listing simply `continue`d, so a `fan2` that stopped enumerating rendered a bare `—`
   * that nothing explained.
   *
   * §6.5's one exception cannot rescue it — the neighbour that would explain it reads
   * `unavailable`, and O13 says `unavailable` is not a severity, so the exception does not
   * reach it. That is S11/G5 seen from the collector's side.
   *
   * Unreachable on this board: `dell_smm` exposes `fan1`–`fan4` unconditionally. Kept
   * because an `errors[]` entry mints no verdict and no severity — it can only ever say
   * *why* a figure is blank — so the cost of being wrong about reachability is one line of
   * text, and the cost of being right is a silent dead fan on a box with two passively
   * cooled 250 W cards.
   */
  test('⚠ a channel 1–4 missing from the listing is explained; channel 5 is not', async () => {
    const withoutFan2 = DELL_SMM_STOCK_ENTRIES.filter((e) => e !== 'fan2_input');
    const { cooling, errors } = await collectCooling({
      io: fake({ entries: withoutFan2, files: DELL_SMM_STOCK, readFails: {} }).io,
    });

    expect(cooling.fan2Rpm).toBeNull();
    expect(sources(errors)).toEqual(['dell-smm', 'dell-smm']);
    const messages = errors.map((e) => e.message);
    expect(messages.some((m) => m.includes('fan2_input') && m.includes('channel 2'))).toBe(true);
    // Channel 5 is missing from this listing too, and is still explained only by `pwm5`.
    expect(cooling.fan5Rpm).toBeNull();
    expect(messages.some((m) => m.includes('fan5_input'))).toBe(false);
    expect(messages.some((m) => m.includes('no `pwm5` node'))).toBe(true);
  });

  test('it reproduces `pwm5NodeAbsent`’s cooling and safety row', async () => {
    const { cooling, pwm5Present } = await collectCooling({
      io: fake({
        entries: DELL_SMM_STOCK_ENTRIES,
        files: { ...DELL_SMM_STOCK, fan1_input: '1005\n', fan2_input: '720\n', fan3_input: '740\n', fan4_input: '1111\n' },
        readFails: {},
      }).io,
    });
    expect({ ...cooling, serviceState: 'active' }).toEqual(pwm5NodeAbsent.cooling);
    expect(pwm5Present).toBe(pwm5NodeAbsent.safety.pwm5Present);
  });

  test('a missing `fan5_input` carries NO entry of its own — the alarm says it once', async () => {
    const { errors } = await collectCooling({
      io: fake({ entries: DELL_SMM_STOCK_ENTRIES, files: DELL_SMM_STOCK, readFails: {} }).io,
    });
    expect(errors).toHaveLength(1);
  });

  test('⚠ `pwm5` is not even attempted when the listing does not have it', async () => {
    const box = fake({ entries: DELL_SMM_STOCK_ENTRIES, files: DELL_SMM_STOCK, readFails: {} });
    await collectCooling({ io: box.io });
    expect(box.reads.some((p) => p.endsWith('/pwm5'))).toBe(false);
  });

  test('⚠ a listing that lost `name` cannot produce the alarm — it is UNKNOWN', async () => {
    // A4. The oracle is one-sided: "`pwm5` is not in the listing" is taken as positive
    // evidence that the DKMS module did not load. So the listing must first be shown to be
    // a listing. We demonstrably just read `name` out of this directory, so a listing
    // without it is filtered, synthetic or empty — and §3.7 says "I could not look" is
    // `null`, never `false`. Unreachable on a coherent filesystem; one comparison stops any
    // future fake or hardened `/sys` from minting "GPU fan control is gone" for free.
    for (const entries of [[], ['fan1_input', 'fan2_input'], DELL_SMM_STOCK_ENTRIES.filter((e) => e !== 'name')]) {
      const { pwm5Present, cooling } = await collectCooling({
        io: fake({ entries, files: DELL_SMM_STOCK, readFails: {} }).io,
      });
      expect(pwm5Present, JSON.stringify(entries)).toBeNull();
      expect(pwm5Present, JSON.stringify(entries)).not.toBe(false);
      expect(cooling.fan1Rpm, JSON.stringify(entries)).toBeNull();
    }
  });

  test('and a listing that HAS `name` but no `pwm5` still gives the alarm — the other side', async () => {
    // Fixture symmetry: the guard must not swallow the real alarm it sits in front of.
    // `DELL_SMM_STOCK_ENTRIES` is the stock 4-fan driver's listing, `name` included.
    expect(DELL_SMM_STOCK_ENTRIES).toContain('name');
    expect(DELL_SMM_STOCK_ENTRIES).not.toContain('pwm5');
    const { pwm5Present, errors } = await collectCooling({
      io: fake({ entries: DELL_SMM_STOCK_ENTRIES, files: DELL_SMM_STOCK, readFails: {} }).io,
    });
    expect(pwm5Present).toBe(false);
    expect(errors[0]?.message).toContain('no `pwm5` node');
  });
});

describe('§3.7 outcome 3 — manual control', () => {
  test('a numeric read is manual, and carries the duty', async () => {
    const { cooling, pwm5Present, errors } = await collectCooling({
      io: fake({ files: { ...CAPTURED_DELL_SMM, pwm5: PWM5_HIGH, fan5_input: '4308\n' }, readFails: {} }).io,
    });
    expect(pwm5Present).toBe(true);
    expect(cooling.ch5Mode).toBe('manual');
    if (cooling.ch5Mode !== 'manual') throw new Error('narrowing failed');
    expect(cooling.ch5Pwm).toBe(255);
    expect(errors).toEqual([]);
  });

  test('it reproduces `ch5Manual`', async () => {
    const { cooling } = await collectCooling({
      io: fake({
        files: {
          name: 'dell_smm\n',
          fan1_input: '1005\n',
          fan2_input: '720\n',
          fan3_input: '740\n',
          fan4_input: '1111\n',
          fan5_input: '4308\n',
          pwm5: PWM5_HIGH,
        },
        readFails: {},
      }).io,
    });
    expect({ ...cooling, serviceState: 'active' }).toEqual(ch5Manual);
  });

  test('⚠ a duty of 0 is a reading, not an absent one', async () => {
    const { cooling, errors } = await collectCooling({
      io: fake({ files: { ...CAPTURED_DELL_SMM, pwm5: PWM5_OFF }, readFails: {} }).io,
    });
    expect(cooling.ch5Mode).toBe('manual');
    expect(cooling.ch5Pwm).toBe(0);
    expect(errors).toEqual([]);
  });
});

describe('§3.7 outcome 4 — EC auto, and it is HEALTHY', () => {
  test('⚠ ENODATA is `ec-auto` and carries NO errors[] entry (invariant 3)', async () => {
    // The live box at capture time: both cards 40 °C, below `AUTO_BELOW=55`, so
    // `gpu-fan-control` had handed the channel back to the EC.
    const { cooling, pwm5Present, errors } = await collectCooling({ io: fake().io });
    expect(cooling.ch5Mode).toBe('ec-auto');
    expect(cooling.ch5Pwm).toBeNull();
    expect(pwm5Present).toBe(true);
    expect(errors).toEqual([]);
  });

  test('the whole live capture round-trips', async () => {
    const { cooling } = await collectCooling({ io: fake().io });
    expect(cooling).toEqual({
      ...LIVE_FANS,
      ch5Mode: 'ec-auto',
      ch5Pwm: null,
      serviceState: null,
    });
  });

  test('it reproduces `ch5EcAuto`', async () => {
    const { cooling } = await collectCooling({
      io: fake({
        files: {
          name: 'dell_smm\n',
          fan1_input: '1005\n',
          fan2_input: '720\n',
          fan3_input: '740\n',
          fan4_input: '1111\n',
          fan5_input: '2210\n',
        },
      }).io,
    });
    expect({ ...cooling, serviceState: 'active' }).toEqual(ch5EcAuto);
  });

  test('⚠ EC auto is NOT the same answer as an unreadable channel', async () => {
    const auto = await collectCooling({ io: fake().io });
    const denied = await collectCooling({ io: fake({ readFails: { pwm5: 'EACCES' } }).io });
    expect(auto.cooling.ch5Mode).toBe('ec-auto');
    expect(denied.cooling.ch5Mode).toBeNull();
    expect(auto.errors).toEqual([]);
    expect(denied.errors).not.toEqual([]);
    // …and both agree that the node is there.
    expect(auto.pwm5Present).toBe(true);
    expect(denied.pwm5Present).toBe(true);
  });
});

describe('§3.7 outcome 5 — the node exists but yielded no duty', () => {
  test('EACCES: pwm5Present stays true, mode unknown, and it is reported', async () => {
    const { cooling, pwm5Present, errors } = await collectCooling({
      io: fake({ readFails: { pwm5: 'EACCES' } }).io,
    });
    expect(pwm5Present).toBe(true);
    expect(cooling.ch5Mode).toBeNull();
    expect(sources(errors)).toEqual(['dell-smm']);
    expect(errors[0]?.message).toContain('/sys/class/hwmon/hwmon3/pwm5: EACCES');
  });

  test('it reproduces `pwm5Unreadable`’s cooling and safety row', async () => {
    const { cooling, pwm5Present } = await collectCooling({
      io: fake({
        files: {
          name: 'dell_smm\n',
          fan1_input: '1005\n',
          fan2_input: '720\n',
          fan3_input: '740\n',
          fan4_input: '1111\n',
          fan5_input: '4308\n',
        },
        readFails: { pwm5: 'EACCES' },
      }).io,
    });
    expect({ ...cooling, serviceState: 'active' }).toEqual(pwm5Unreadable.cooling);
    expect(pwm5Present).toBe(pwm5Unreadable.safety.pwm5Present);
  });

  test('EIO is the same shape', async () => {
    const { pwm5Present, cooling } = await collectCooling({
      io: fake({ readFails: { pwm5: 'EIO' } }).io,
    });
    expect(pwm5Present).toBe(true);
    expect(cooling.ch5Mode).toBeNull();
  });

  test('⚠ a truncated duty is not `OFF pwm 0` — O6', async () => {
    const { cooling, pwm5Present, errors } = await collectCooling({
      io: fake({ files: { ...CAPTURED_DELL_SMM, pwm5: PWM5_EMPTY }, readFails: {} }).io,
    });
    expect(cooling.ch5Pwm).toBeNull();
    expect(cooling.ch5Mode).toBeNull();
    expect(pwm5Present).toBe(true);
    expect(errors[0]?.message).toContain('`pwm5` is not a reading');
  });

  test('⚠ an out-of-register duty is null and carries NO entry (§6.7)', async () => {
    const { cooling, pwm5Present, errors } = await collectCooling({
      io: fake({ files: { ...CAPTURED_DELL_SMM, pwm5: PWM5_ABOVE_RANGE }, readFails: {} }).io,
    });
    expect(cooling.ch5Pwm).toBeNull();
    expect(pwm5Present).toBe(true);
    expect(errors).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// The three fields all five outcomes share
// ---------------------------------------------------------------------------

describe('the fan channels', () => {
  test('⚠ a stalled fan5 is `0 RPM`, and pwm5Present is unaffected', async () => {
    const { cooling, pwm5Present, errors } = await collectCooling({
      io: fake({ files: { ...CAPTURED_DELL_SMM, fan5_input: DELL_SMM_FAN5_STALLED } }).io,
    });
    expect(cooling.fan5Rpm).toBe(0);
    expect(cooling.fan5Rpm).not.toBeNull();
    expect(pwm5Present).toBe(true);
    expect(errors).toEqual([]);
  });

  test('⚠ the tach that hung POST arrives as a reading, for §6.3 to alarm on', async () => {
    const { cooling } = await collectCooling({
      io: fake({ files: { ...CAPTURED_DELL_SMM, fan5_input: DELL_SMM_FAN5_IMPLAUSIBLE } }).io,
    });
    expect(cooling.fan5Rpm).toBe(14451);
  });

  test('a fan whose file will not read is null WITH an entry', async () => {
    const { cooling, errors } = await collectCooling({
      io: fake({ readFails: { fan3_input: 'EIO', pwm5: PWM5_EC_AUTO_ERRNO } }).io,
    });
    expect(cooling.fan3Rpm).toBeNull();
    expect(cooling.fan1Rpm).toBe(1028);
    expect(errors.map((e) => e.message)).toEqual([
      expect.stringContaining('/sys/class/hwmon/hwmon3/fan3_input: EIO'),
    ]);
  });

  test('a fan whose file reads as nothing is null WITH an entry naming the file', async () => {
    const { cooling, errors } = await collectCooling({
      io: fake({ files: { ...CAPTURED_DELL_SMM, fan5_input: DELL_SMM_FAN5_EMPTY } }).io,
    });
    expect(cooling.fan5Rpm).toBeNull();
    expect(errors[0]?.message).toBe('/sys/class/hwmon/hwmon3: `fan5_input` is not a reading');
  });

  test('every message is prefixed with the path that was actually read', async () => {
    const custom: CollectorPaths = { ...DEFAULT_PATHS, hwmonRoot: '/host/sys/class/hwmon' };
    const { errors } = await collectCooling({
      io: fake({ nodes: {} }).io,
      paths: custom,
    });
    expect(errors[0]?.message).toContain('/host/sys/class/hwmon');
  });
});

describe('⚠ the three telemetry traps, enforced at the collector', () => {
  const trapped = async (): Promise<string[]> => {
    const box = fake({
      files: { ...CAPTURED_DELL_SMM, ...CAPTURED_DELL_SMM_TRAPS, pwm5: PWM5_HIGH },
      readFails: {},
    });
    await collectCooling({ io: box.io });
    return box.reads;
  };

  test('`pwmN_enable` is NEVER read — it reads `2` even under manual control', async () => {
    expect((await trapped()).filter((p) => p.includes('_enable'))).toEqual([]);
  });

  test('`fanN_target` is NEVER read — it clamps to the HIGH nominal', async () => {
    expect((await trapped()).filter((p) => p.includes('_target'))).toEqual([]);
  });

  test('`fanN_label`, `fanN_max` and `fanN_min` are never read either', async () => {
    const reads = await trapped();
    expect(reads.filter((p) => /_(label|max|min)$/.test(p))).toEqual([]);
  });

  test('⚠ `dell_smm`’s tempN_input are never read — §3.2 forbids them as a CPU sensor', async () => {
    // Measured 2026-08-18: `temp1` swung 43–54 °C at idle while the package held 35–37 °C.
    expect((await trapped()).filter((p) => p.includes('/temp'))).toEqual([]);
  });

  test('exactly the six files §3.3 names are read, and no others', async () => {
    expect(await trapped()).toEqual([
      `${ROOT}/hwmon0/name`,
      `${ROOT}/hwmon1/name`,
      `${ROOT}/hwmon2/name`,
      `${ROOT}/hwmon3/name`,
      `${NODE}/fan1_input`,
      `${NODE}/fan2_input`,
      `${NODE}/fan3_input`,
      `${NODE}/fan4_input`,
      `${NODE}/fan5_input`,
      `${NODE}/pwm5`,
    ]);
  });

  test('no command is ever run — this collector reads sysfs and nothing else', async () => {
    // The fake's `run` throws; reaching it would fail the call rather than pass silently.
    await expect(collectCooling({ io: fake().io })).resolves.toBeDefined();
  });

  test('each directory is listed exactly once — the listing IS the presence oracle', async () => {
    const box = fake();
    await collectCooling({ io: box.io });
    expect(box.dirs).toEqual([ROOT, NODE]);
  });
});

// ---------------------------------------------------------------------------
// O17 — the bound this collector must impose on itself
// ---------------------------------------------------------------------------

describe('O17 — the reads are bounded here, not by the seam', () => {
  test('the default budget is the documented one', async () => {
    expect(DELL_SMM_TIMEOUT_MS).toBe(2000);
    // …and it is under §3.1's 4 s `nvidia-smi` bound and §6.7's 5 s cadence.
    expect(DELL_SMM_TIMEOUT_MS).toBeLessThan(4000);
  });

  test('⚠ an EC that never answers settles the collector anyway', async () => {
    const started = Date.now();
    const { cooling, pwm5Present, errors } = await collectCooling({
      io: fake({ hangMs: 5_000 }).io,
      timeoutMs: 20,
    });
    expect(Date.now() - started).toBeLessThan(2_000);
    expect(pwm5Present).toBeNull();
    expect(cooling.fan5Rpm).toBeNull();
    expect(errors[0]?.message).toContain('timed out after 20 ms');
  });

  test('⚠ a wedged read part-way through still yields the readings already taken', async () => {
    // The deadline is shared across the probe, so a slow EC costs the tail of the walk and
    // not the head. Every field reached before it is a real reading.
    let calls = 0;
    const box = fake();
    const io: CollectorIo = {
      ...box.io,
      readFile: async (path) => {
        calls += 1;
        if (path.endsWith('/fan5_input')) await new Promise((r) => setTimeout(r, 5_000));
        return box.io.readFile(path);
      },
    };
    const { cooling, pwm5Present, errors } = await collectCooling({ io, timeoutMs: 60 });
    expect(calls).toBeGreaterThan(0);
    expect(cooling.fan1Rpm).toBe(1028);
    expect(cooling.fan5Rpm).toBeNull();
    // The node was listed before the hang, so its presence is still known.
    expect(pwm5Present).toBe(true);
    expect(errors.map((e) => e.message).join('\n')).toContain('timed out');
  });

  test('⚠ an abandoned read that rejects later is not an unhandled rejection', async () => {
    // A bare `Promise.race` would leave the loser unsubscribed. On a per-request route
    // that is a process-level crash, not a lost reading.
    const seen: unknown[] = [];
    const onUnhandled = (e: unknown): void => {
      seen.push(e);
    };
    process.on('unhandledRejection', onUnhandled);
    try {
      const io: CollectorIo = {
        ...fake().io,
        readDir: async () => {
          await new Promise((r) => setTimeout(r, 40));
          throw new Error('the EC finally gave up');
        },
        readFile: async () => {
          await new Promise((r) => setTimeout(r, 40));
          throw new Error('the EC finally gave up');
        },
      };
      await collectCooling({ io, timeoutMs: 5 });
      await new Promise((r) => setTimeout(r, 90));
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(seen).toEqual([]);
  });

  test('⚠ the reads are SEQUENTIAL — one SMM call in flight at a time', async () => {
    // `dell-smm-hwmon` serialises every SMM call behind one mutex, and `fs.readFile` burns
    // a libuv thread-pool slot (four by default) while it blocks. Eleven concurrent
    // blocked reads would starve every other `fs` operation in the process.
    const box = fake({ hangMs: 1 });
    await collectCooling({ io: box.io });
    expect(box.peak()).toBe(1);
  });

  test('⚠ a wedged read in the FIRST position salvages nothing, and says so per figure', async () => {
    // A5. The paired half of the test above, and it is the unfavourable position: there is
    // no reason the EC would prefer channel 5, since `dell-smm-hwmon` serialises every SMM
    // call behind one mutex. The *behaviour* is right — `pwm5Present: true` still holds
    // because the listing had already answered — but the "degrades gracefully" claim was
    // only ever tested where the maximum is salvaged. Here nothing is.
    const box = fake();
    const io: CollectorIo = {
      ...box.io,
      readFile: async (path) => {
        if (path.endsWith('/fan1_input')) await new Promise((r) => setTimeout(r, 5_000));
        return box.io.readFile(path);
      },
    };
    const { cooling, pwm5Present, errors } = await collectCooling({ io, timeoutMs: 60 });
    expect([
      cooling.fan1Rpm,
      cooling.fan2Rpm,
      cooling.fan3Rpm,
      cooling.fan4Rpm,
      cooling.fan5Rpm,
    ]).toEqual([null, null, null, null, null]);
    // ⚠ Five `null`s, not five zeroes. The panel shows five em dashes, not five dead fans.
    expect(cooling.ch5Mode).toBeNull();
    expect(pwm5Present).toBe(true);
    // §6.5 wants an error matched to the figure it explains, and six figures are blanked —
    // so six entries, deliberately not collapsed into one.
    expect(errors).toHaveLength(6);
    expect(errors.every((e) => e.source === 'dell-smm')).toBe(true);
    for (const file of ['fan1_input', 'fan2_input', 'fan3_input', 'fan4_input', 'fan5_input', 'pwm5']) {
      expect(errors.some((e) => e.message.includes(`${NODE}/${file}`)), file).toBe(true);
    }
  });

  test('⚠ the budget is shared, not per-read', async () => {
    // Ten reads at 30 ms each need 300 ms. With ONE 120 ms budget the walk is cut short
    // part-way; with a 120 ms budget *per read* every one of them fits and the collector
    // finishes normally — which is the failure mode of every "timeout" that is really a
    // per-attempt timeout, and it is invisible unless the count is asserted.
    const box = fake({ hangMs: 30 });
    const { errors } = await collectCooling({ io: box.io, timeoutMs: 120 });
    expect(box.reads.length).toBeLessThan(10);
    expect(errors.map((e) => e.message).join('\n')).toContain('timed out after 120 ms');
  });

  test('⚠ a budget setTimeout cannot honour falls back — it does not become 1 ms', async () => {
    // A7. `setTimeout` clamps a delay outside the 32-bit signed range to **1 ms** and warns
    // on stderr, so `timeoutMs: Infinity` — the obvious way to write "do not bound this" —
    // used to produce the tightest possible bound: the whole probe timed out, COOLING went
    // permanently blank and SAFETY reported `pwm5Present: null` on every poll. The
    // direction was safe; the outcome was the exact opposite of the caller's intent.
    for (const timeoutMs of [2 ** 31, 2 ** 31 + 1, Number.POSITIVE_INFINITY, Number.NaN, 0, -1]) {
      const { cooling, pwm5Present, errors } = await collectCooling({
        io: fake().io,
        timeoutMs,
      });
      expect(pwm5Present, String(timeoutMs)).toBe(true);
      expect(cooling.fan1Rpm, String(timeoutMs)).toBe(1028);
      expect(errors, String(timeoutMs)).toEqual([]);
    }
  });

  test('a budget it CAN honour is used verbatim — the other side of the same guard', async () => {
    // The accepted half. 20 ms is in range, so it is used as given rather than replaced by
    // the fallback, and the message proves which number was in force. The *exact* boundary
    // at 2³¹−1 is a pure comparison and is fixtured on both sides in `deadline.test.ts`,
    // where the two sides are distinguishable without a four-second test.
    const box = fake({ hangMs: 30 });
    const { errors } = await collectCooling({ io: box.io, timeoutMs: 20 });
    const text = errors.map((e) => e.message).join('\n');
    expect(text).toContain('timed out after 20 ms');
    expect(text).not.toContain(`timed out after ${DELL_SMM_TIMEOUT_MS} ms`);
  });
});

// ---------------------------------------------------------------------------
// Invariant 5 — nothing throws, ever
// ---------------------------------------------------------------------------

describe('invariant 5 — a partial snapshot, never a 500', () => {
  test('a reader that rejects everything still resolves', async () => {
    const io: CollectorIo = {
      readFile: async () => {
        throw new Error('no');
      },
      readDir: async () => {
        throw new Error('no');
      },
      run: async () => {
        throw new Error('no');
      },
      unameRelease: () => '',
    };
    const { cooling, pwm5Present, errors } = await collectCooling({ io });
    expect(cooling.ch5Mode).toBeNull();
    expect(pwm5Present).toBeNull();
    expect(errors).toHaveLength(1);
  });

  test('a reader that rejects with a non-Error still resolves', async () => {
    const io: CollectorIo = {
      ...fake().io,
      readDir: async () => {
        throw 'a string';
      },
    };
    await expect(collectCooling({ io })).resolves.toMatchObject({ pwm5Present: null });
  });

  test('every error carries the `dell-smm` source and nothing else', async () => {
    for (const options of [
      { nodes: {} },
      { readFails: { pwm5: 'EACCES' } },
      { entries: DELL_SMM_STOCK_ENTRIES, files: DELL_SMM_STOCK, readFails: {} },
      { files: { ...CAPTURED_DELL_SMM, fan2_input: 'x\n' } },
    ] satisfies FakeOptions[]) {
      const { errors } = await collectCooling({ io: fake(options).io });
      expect(new Set(sources(errors))).toEqual(new Set(errors.length === 0 ? [] : ['dell-smm']));
    }
  });

  test('the collector takes an options object, like every other one', async () => {
    await expect(collectCooling()).resolves.toBeDefined();
  });
});

// ---------------------------------------------------------------------------
// The real filesystem, through nodeIo
// ---------------------------------------------------------------------------

describe('nodeIo against a real hwmon layout', () => {
  let root = '';
  let paths: CollectorPaths;
  let locked = '';

  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'ai-dashboard-step4-'));
    const hwmon = join(root, 'sys', 'class', 'hwmon');
    // dell_smm last, exactly as the box enumerates it — so "found by name" is a real
    // assertion here and not a lucky index.
    for (const [dir, name] of [
      ['hwmon0', 'nvme'],
      ['hwmon1', 'nvme'],
      ['hwmon2', 'coretemp'],
      ['hwmon3', 'dell_smm'],
    ]) {
      await mkdir(join(hwmon, dir as string), { recursive: true });
      await writeFile(join(hwmon, dir as string, 'name'), `${name}\n`);
    }
    for (const [file, contents] of Object.entries({
      ...CAPTURED_DELL_SMM,
      ...CAPTURED_DELL_SMM_TRAPS,
    })) {
      await writeFile(join(hwmon, 'hwmon3', file), contents);
    }
    // `pwm5` cannot be made to answer ENODATA on a normal filesystem, so the real-fs case
    // is the numeric one; ENODATA is covered by the fakes, off a captured errno.
    await writeFile(join(hwmon, 'hwmon3', 'pwm5'), PWM5_HIGH);
    await writeFile(join(hwmon, 'hwmon3', 'pwm5_enable'), '2\n');

    locked = join(root, 'locked', 'hwmon');
    await mkdir(join(locked, 'hwmon0'), { recursive: true });
    await writeFile(join(locked, 'hwmon0', 'name'), 'dell_smm\n');
    await chmod(join(locked, 'hwmon0'), 0o000);

    paths = { ...DEFAULT_PATHS, hwmonRoot: hwmon };
  });

  afterAll(async () => {
    if (locked !== '') await chmod(join(locked, 'hwmon0'), 0o755);
    if (root !== '') await rm(root, { recursive: true, force: true });
  });

  test('finds `dell_smm` at hwmon3 and reads all five channels', async () => {
    const { cooling, pwm5Present, errors } = await collectCooling({ io: nodeIo, paths });
    expect(errors).toEqual([]);
    expect(pwm5Present).toBe(true);
    expect(cooling).toMatchObject({ ...LIVE_FANS, ch5Mode: 'manual', ch5Pwm: 255 });
  });

  test('⚠ `readDir` really returns names — a Dirent would break the presence check', async () => {
    // A fake cannot catch this: `readdir(path)` with `withFileTypes` would return objects
    // whose `.includes('pwm5')` is always false, and `pwm5Present` would go to `false` —
    // the alarm — on a perfectly healthy box.
    const { pwm5Present } = await collectCooling({ io: nodeIo, paths });
    expect(pwm5Present).toBe(true);
  });

  test('a real ENOENT on the hwmon root is unknown, not the alarm', async () => {
    const { pwm5Present, errors } = await collectCooling({
      io: nodeIo,
      paths: { ...paths, hwmonRoot: join(root, 'nope') },
    });
    expect(pwm5Present).toBeNull();
    expect(errors[0]?.message).toContain('ENOENT');
  });

  test('⚠ a real EACCES on the node directory is unknown, not the alarm', async () => {
    // Runs as a normal user, so mode 000 really denies. §2.2 runs the container non-root.
    const { pwm5Present, cooling, errors } = await collectCooling({
      io: nodeIo,
      paths: { ...paths, hwmonRoot: locked },
    });
    expect(pwm5Present).toBeNull();
    expect(cooling.ch5Mode).toBeNull();
    expect(errors[0]?.message).toContain('EACCES');
  });

  test('the errno survives the real rejection, which is what the probe reads', async () => {
    // Not `code` in a message — `code` on the object. HANDOVER: do not match on text.
    await expect(nodeIo.readFile(join(locked, 'hwmon0', 'name'))).rejects.toMatchObject({
      code: 'EACCES',
    });
  });
});
