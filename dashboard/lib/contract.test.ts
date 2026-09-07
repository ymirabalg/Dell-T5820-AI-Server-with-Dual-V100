import { describe, expect, test } from 'vitest';

import {
  ch5EcAuto,
  everythingZero,
  nothingReadable,
  pwm5NodeAbsent,
  pwm5Unreadable,
  servingIdentityOnly,
  servingPopulated,
} from './fixtures';
import {
  THERMAL_THROTTLE_BITS,
  THROTTLE_REASONS,
  bytesPerSecond,
  celsius,
  gb,
  gib,
  isoTimestamp,
  mhz,
  mib,
  percent,
  port,
  pwm,
  rpm,
  seconds,
  throttleMask,
  tokens,
  watts,
} from './types';
import type { TelemetrySnapshot } from './types';

// ---------------------------------------------------------------------------
// Branding is compile-time only
// ---------------------------------------------------------------------------

describe('branded units', () => {
  /*
   * The brands exist to stop MiB reaching a GiB formatter (§6.6, decision 20). They must
   * cost nothing on the wire: the JSON `/api/telemetry` returns has to be plain numbers
   * and strings, readable by anything — including the Prometheus scraper §1's non-goals
   * contemplate.
   */
  test('constructors are the identity function', () => {
    const cases: ReadonlyArray<readonly [string, unknown, unknown]> = [
      ['celsius', celsius(66), 66],
      ['watts', watts(247.1), 247.1],
      ['mib', mib(26452), 26452],
      ['gib', gib(12.1), 12.1],
      ['gb', gb(238.5), 238.5],
      ['mhz', mhz(1380), 1380],
      ['rpm', rpm(4308), 4308],
      ['percent', percent(18.4), 18.4],
      ['bytesPerSecond', bytesPerSecond(1048576), 1048576],
      ['seconds', seconds(3600), 3600],
      ['pwm', pwm(255), 255],
      ['port', port(8080), 8080],
      ['tokens', tokens(131072), 131072],
      ['isoTimestamp', isoTimestamp('2026-09-06T14:02:11.482Z'), '2026-09-06T14:02:11.482Z'],
      ['throttleMask', throttleMask('0x0000000000000004'), '0x0000000000000004'],
    ];

    for (const [name, actual, expected] of cases) {
      expect(actual, name).toBe(expected);
    }
    expect(cases).toHaveLength(15);
  });

  /*
   * They name a unit; they do not check one. Recorded as a test rather than a comment
   * because a collector author who writes `celsius(parseFloat(field))` has written no
   * check at all while feeling like they did, and `NaN` reaches §6.6's formatter as
   * "NaN °C" — neither `—` nor a numeral, a state §6.6 does not contemplate. Parsing
   * belongs in the collector; a value that failed to parse is `null`.
   */
  test('constructors validate nothing, deliberately', () => {
    expect(Number.isNaN(celsius(Number.NaN))).toBe(true);
    expect<number>(percent(-5)).toBe(-5);
    expect<string>(isoTimestamp('banana')).toBe('banana');
  });

  test('a branded value serialises as a plain number', () => {
    expect(JSON.stringify({ tempC: celsius(66), fan5Rpm: rpm(4308) })).toBe(
      '{"tempC":66,"fan5Rpm":4308}',
    );
  });
});

// ---------------------------------------------------------------------------
// §3.7's throttle vocabulary
// ---------------------------------------------------------------------------

describe('the throttle bitmask vocabulary', () => {
  /*
   * §3.7 fixes eight bits and their treatment. The two that matter are `0x4` — the routine
   * 250 W power cap this box runs at continuously, which §6.2 forbids styling as a warning
   * — and the three thermal bits, which have never been observed here and are alarms.
   */
  test('every bit in §3.7 is present exactly once, with its treatment', () => {
    expect(THROTTLE_REASONS).toHaveLength(8);
    expect(new Set(THROTTLE_REASONS.map((r) => r.bit)).size).toBe(8);

    const byBit = new Map(THROTTLE_REASONS.map((r) => [r.bit, r]));
    expect(byBit.get(0x4)?.name).toBe('sw power cap');
    expect(byBit.get(0x4)?.treatment).toBe('neutral');
    expect(byBit.get(0x20)?.name).toBe('sw thermal slowdown');
    expect(byBit.get(0x20)?.treatment).toBe('alarm');

    for (const reason of THROTTLE_REASONS) {
      expect(reason.code, `${reason.name} renders its own bit`).toBe(
        `0x${reason.bit.toString(16)}`,
      );
    }
  });

  test('"thermal throttle" means 0x8, 0x20 and 0x40 — and not 0x4', () => {
    expect(THERMAL_THROTTLE_BITS).toBe(0x8 | 0x20 | 0x40);
    expect(THERMAL_THROTTLE_BITS & 0x4).toBe(0);
    // 0x80 is an alarm but is not thermal; the two questions are asked separately.
    expect(THERMAL_THROTTLE_BITS & 0x80).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Fixtures — see lib/fixtures.ts. That they compile at all is half the test.
// ---------------------------------------------------------------------------

/**
 * Every field of the snapshot that can be `null`, as a path from the root. Kept as data so
 * the round-trip test can assert on each one by name rather than on a deep-equality blob
 * that would pass just as happily with the keys missing.
 */
const NULLABLE_PATHS = [
  'hostname',
  'gpus',
  'serving',
  'host.cpuPct',
  'host.loadAvg',
  'host.cpuTempC',
  'host.memUsedGiB',
  'host.memTotalGiB',
  'host.swapUsedGiB',
  'host.swapTotalGiB',
  'host.uptimeSec',
  'host.kernel',
  'host.cpuModel',
  'host.cores',
  'host.threads',
  'cooling.fan1Rpm',
  'cooling.fan2Rpm',
  'cooling.fan3Rpm',
  'cooling.fan4Rpm',
  'cooling.fan5Rpm',
  'cooling.ch5Mode',
  'cooling.ch5Pwm',
  'cooling.serviceState',
  'storage.root.usedGB',
  'storage.root.totalGB',
  'storage.home.usedGB',
  'storage.home.totalGB',
  'storage.net.rxBytesPerSec',
  'storage.net.txBytesPerSec',
  'storage.net.link',
  'safety.ufwEnforcing',
  'safety.pwm5Present',
  'safety.dkmsForRunningKernel',
  'safety.fanServiceState',
] as const;

/** Every field of a `ServingInstance` except its identity (§3.4). */
const SERVING_NULLABLE_PATHS = ['port', 'unitState', 'model', 'ctx', 'health'] as const;

function resolve(root: unknown, path: string): { parent: Record<string, unknown>; key: string } {
  const segments = path.split('.');
  const key = segments.pop();
  if (key === undefined) throw new Error('empty path');
  let cursor = root;
  for (const segment of segments) {
    if (typeof cursor !== 'object' || cursor === null) {
      throw new Error(`${path}: ${segment} is not an object`);
    }
    cursor = (cursor as Record<string, unknown>)[segment];
  }
  if (typeof cursor !== 'object' || cursor === null) {
    throw new Error(`${path}: parent is not an object`);
  }
  return { parent: cursor as Record<string, unknown>, key };
}

function roundTrip(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

// ---------------------------------------------------------------------------
// null survives the wire, and is never confused with zero
// ---------------------------------------------------------------------------

describe('the wire format', () => {
  /*
   * This is invariant 1 at the serialisation layer. `JSON.stringify` drops `undefined`
   * properties entirely, so a contract that used `field?: T` instead of `field: T | null`
   * would send a snapshot with the key simply missing — and a client reading
   * `snapshot.cooling.fan5Rpm` would get `undefined`, which most template code renders as
   * blank. Blank is exactly the thing §6.6 forbids: `null` renders as `—`.
   */
  test('every nullable field crosses the wire as an explicit null', () => {
    const wire = roundTrip(nothingReadable);

    for (const path of NULLABLE_PATHS) {
      const { parent, key } = resolve(wire, path);
      expect(key in parent, `${path} is missing from the JSON`).toBe(true);
      expect(parent[key], `${path} should be null`).toBeNull();
    }
  });

  /*
   * §3.4 has no other runtime coverage: a `ServingInstance` never appears inside the
   * all-null snapshot, because `serving` itself is `null` there. An instance discovered
   * from its env filename with nothing else readable is a real state of this box, and it
   * is the one that proves those five fields survive the wire as nulls.
   */
  test('a serving instance known only by its identity crosses the wire intact', () => {
    const wire = roundTrip(servingIdentityOnly);

    expect((wire as { instance: unknown }).instance).toBe(2);
    for (const path of SERVING_NULLABLE_PATHS) {
      const { parent, key } = resolve(wire, path);
      expect(key in parent, `serving.${path} is missing from the JSON`).toBe(true);
      expect(parent[key], `serving.${path} should be null`).toBeNull();
    }
  });

  test('a populated serving list survives the wire with its units', () => {
    const wire = roundTrip(servingPopulated) as TelemetrySnapshot;
    const instances = wire.serving ?? [];

    expect(instances).toHaveLength(2);
    expect<number | null>(instances[0]?.port ?? null).toBe(8080);
    expect<number | null>(instances[0]?.ctx ?? null).toBe(131072);
    expect(instances[0]?.health).toBe('ok');
    // A down instance keeps the facts its env file gave and nulls the rest.
    expect(instances[1]?.unitState).toBe('failed');
    expect(instances[1]?.model).toBeNull();
  });

  test('a zero reading crosses the wire as zero, not as null', () => {
    const wire = roundTrip(everythingZero);

    for (const path of NULLABLE_PATHS) {
      const { parent, key } = resolve(wire, path);
      const value = parent[key];
      // `hostname`, `kernel`, `ch5Mode`, `serviceState` and `link` are not numeric, and
      // `gpus`/`serving` are lists; the point is that nothing here came back null.
      expect(value, `${path} should not be null in a fully-read snapshot`).not.toBeNull();
    }

    const snapshot = wire as TelemetrySnapshot;
    expect<number | null>(snapshot.cooling.fan5Rpm).toBe(0);
    expect<number | null>(snapshot.host.cpuPct).toBe(0);
    expect<number | null>(snapshot.storage.net.rxBytesPerSec).toBe(0);
  });

  /*
   * §3.1: `null` means nvidia-smi could not be run; `[]` means it ran and enumerated no
   * cards — a state this box was actually in for weeks. Both render "no GPUs enumerated",
   * but they are different facts and the contract keeps them apart.
   */
  test('an absent GPU list and an empty one are different values', () => {
    expect(nothingReadable.gpus).toBeNull();
    expect(everythingZero.gpus).not.toBeNull();
    expect(everythingZero.serving).toEqual([]);
    expect(everythingZero.serving).not.toBeNull();
  });

  /*
   * §4: "`errors` is part of the contract, not an afterthought." A partial snapshot names
   * what failed rather than rendering a plausible-looking zero.
   */
  test('a failed reading is a null plus an errors entry, never a 500', () => {
    expect(nothingReadable.cooling.fan5Rpm).toBeNull();
    expect(nothingReadable.errors).toHaveLength(1);
    expect(nothingReadable.errors[0]?.source).toBe('dell-smm');
    expect(everythingZero.errors).toEqual([]);
  });

  /*
   * §3.3 / invariant 3. `ENODATA` from `pwm5` means the channel is in EC automatic
   * control, which is healthy — the driver returns it because state 3 (AUTO) exceeds
   * `i8k_fan_max` (2). The contract gives it its own variant so it can never be filed
   * under "the read failed".
   */
  test('EC auto is a mode, not a missing reading', () => {
    expect(ch5EcAuto.ch5Mode).toBe('ec-auto');
    expect(ch5EcAuto.ch5Pwm).toBeNull();
    // The channel is being read perfectly well; only the duty cycle is unknowable.
    expect<number | null>(ch5EcAuto.fan5Rpm).toBe(2210);
  });
});

// ---------------------------------------------------------------------------
// §3.7: pwm5Present is three-valued, and the three are genuinely different
// ---------------------------------------------------------------------------

describe('the channel-5 probe is three-valued', () => {
  /*
   * The rule, and the reason this is a test rather than a comment: step 1 originally
   * documented `pwm5Present === false ⟺ ch5Mode === null`, and the wrong half of that
   * biconditional is the one a collector would obey. Deriving `pwm5Present` from
   * `ch5Mode` turns an unmounted `/sys` into a sticky banner asserting that GPU fan
   * control is gone — invariant 1 inverted, on the panel that earns this dashboard's
   * existence.
   */
  test('all three pwm5Present values coexist with ch5Mode === null', () => {
    expect(nothingReadable.cooling.ch5Mode).toBeNull();
    expect(pwm5NodeAbsent.cooling.ch5Mode).toBeNull();
    expect(pwm5Unreadable.cooling.ch5Mode).toBeNull();

    // Could not look / not there / there, but the mode could not be read.
    expect(nothingReadable.safety.pwm5Present).toBeNull();
    expect(pwm5NodeAbsent.safety.pwm5Present).toBe(false);
    expect(pwm5Unreadable.safety.pwm5Present).toBe(true);
  });

  test('only the one-directional implication holds', () => {
    const snapshots: readonly TelemetrySnapshot[] = [
      nothingReadable,
      everythingZero,
      pwm5NodeAbsent,
      pwm5Unreadable,
      servingPopulated,
    ];

    for (const snapshot of snapshots) {
      // ch5Mode !== null  =>  pwm5Present === true.
      if (snapshot.cooling.ch5Mode !== null) {
        expect(snapshot.safety.pwm5Present, 'a known mode implies the node exists').toBe(true);
      }
      // Contrapositive: pwm5Present false or null  =>  ch5Mode is null.
      if (snapshot.safety.pwm5Present !== true) {
        expect(snapshot.cooling.ch5Mode, 'no node means no mode').toBeNull();
      }
    }
  });

  /*
   * §9: "fan1–fan4 when the 5-fan module is absent — they survive; only channel 5
   * disappears." So a `fan5Rpm` of `null` beside four live channels is the DKMS failure,
   * and a `fan5Rpm` of `null` beside four null channels is a driver that is not there at
   * all. §6.5 forbids either being rendered as a blank RPM that reads as zero.
   */
  test('a missing channel 5 does not take channels 1-4 with it', () => {
    expect(pwm5NodeAbsent.cooling.fan5Rpm).toBeNull();
    expect<number | null>(pwm5NodeAbsent.cooling.fan1Rpm).toBe(1005);
    expect(nothingReadable.cooling.fan1Rpm).toBeNull();
  });

  /*
   * §3.6/§3.7: the fan service is one reading rendered in two panels (COOLING and SAFETY,
   * which §6.2 places side by side). `fanServiceState` is the `ActiveState` string, not a
   * boolean, so `failed` and `inactive` cannot collapse into one glyph.
   */
  test('the fan service state agrees between COOLING and SAFETY', () => {
    for (const snapshot of [everythingZero, pwm5NodeAbsent, pwm5Unreadable, nothingReadable]) {
      expect(snapshot.safety.fanServiceState).toBe(snapshot.cooling.serviceState);
    }
  });
});
