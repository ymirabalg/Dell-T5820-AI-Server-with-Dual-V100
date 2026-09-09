/**
 * §6.3 — every threshold row, tested on **both sides of every edge**.
 *
 * The middles of these bands are not interesting: 66 °C is normal in any plausible
 * implementation. 69 vs 70 and 79 vs 80 are where a `>` that should be a `>=` hides, so
 * each row's table names the last value of one band and the first value of the next.
 */

import { describe, expect, test } from 'vitest';

import { pwmStateName } from './format';
import { ch5EcAuto, ch5Manual, everythingZero, nothingReadable } from './fixtures';
import {
  GPU_TEMP_ALARM_C,
  GPU_TEMP_WATCH_C,
  SEVERITY_RANK,
  ch5Engagement,
  freePercent,
  severityCpuTemp,
  severityDiskFree,
  severityDkms,
  severityFan5,
  severityFan5Absolute,
  severityFan5Engaged,
  severityFanStopped,
  severityGpuTemp,
  severityHealth,
  severityLink,
  severityMemory,
  severityPwm5Present,
  severityRam,
  severitySwap,
  severityThrottle,
  severityUfw,
  severityUnitState,
  severityVram,
  usedPercent,
  worstSeverity,
} from './severity';
import type { Ch5Engagement } from './severity';
import { celsius, gib, mib, pwm, rpm, throttleMask } from './types';
import type {
  Celsius,
  Cooling,
  GiB,
  HealthState,
  LinkState,
  MiB,
  Rpm,
  Severity,
  UnitState,
} from './types';

// ---------------------------------------------------------------------------
// Combining
// ---------------------------------------------------------------------------

describe('worstSeverity — §9 aggregate dot', () => {
  const cases: readonly [string, (Severity | null)[], Severity | null][] = [
    ['nothing at all', [], null],
    ['one null', [null], null],
    ['all null', [null, null], null],
    ['one normal', ['normal'], 'normal'],
    ['normal then watch', ['normal', 'watch'], 'watch'],
    ['watch then normal', ['watch', 'normal'], 'watch'],
    ['watch then alarm', ['watch', 'alarm'], 'alarm'],
    ['alarm then watch', ['alarm', 'watch'], 'alarm'],
    ['a null among three bands', ['normal', null, 'alarm', 'watch'], 'alarm'],
    ['a null beside a normal', [null, 'normal'], 'normal'],
  ];
  test.each(cases)('%s → %s', (_name, input, expected) => {
    expect(worstSeverity(...input)).toBe(expected);
  });

  test('a panel whose every reading failed is not a panel reporting health', () => {
    expect(worstSeverity(null, null)).toBeNull();
    expect(worstSeverity(null, null)).not.toBe('normal');
  });

  test('the rank orders alarm above watch above normal', () => {
    expect(SEVERITY_RANK.alarm).toBeGreaterThan(SEVERITY_RANK.watch);
    expect(SEVERITY_RANK.watch).toBeGreaterThan(SEVERITY_RANK.normal);
  });
});

describe('usedPercent / freePercent', () => {
  test('the ordinary case', () => {
    expect(usedPercent(mib(26452), mib(32768))).toBeCloseTo(80.7, 1);
    expect(freePercent(gib(85), gib(100))).toBe(15);
  });

  const nulls: readonly [MiB | null, MiB | null][] = [
    [null, mib(100)],
    [mib(50), null],
    [null, null],
    [mib(50), mib(0)],
    [mib(Number.NaN), mib(100)],
    [mib(50), mib(Number.NaN)],
    [mib(50), mib(Number.POSITIVE_INFINITY)],
  ];
  test.each(nulls)('usedPercent(%s, %s) is null, not a fabricated number', (used, total) => {
    expect(usedPercent(used, total)).toBeNull();
    expect(freePercent(used, total)).toBeNull();
  });

  test('zero used is a real percentage, not an absent one', () => {
    expect(usedPercent(mib(0), mib(32768))).toBe(0);
    expect(freePercent(mib(0), mib(32768))).toBe(100);
  });

  // R1: these two were the only functions in the module taking a bare `number`, which is
  // the hole every other signature closes. §6.6 puts two memory units in one snapshot.
  test('the two arguments must be the same unit', () => {
    // @ts-expect-error VRAM MiB and host RAM GiB are not the same quantity.
    usedPercent(mib(26452), gib(61));
    // @ts-expect-error and the same clash the other way round — a disk GiB against VRAM MiB.
    freePercent(gib(238.5), mib(32768));
  });

  test('an unbranded number is not a reading', () => {
    // @ts-expect-error a bare number has not been through a collector.
    usedPercent(26452, 32768);
  });
});

// ---------------------------------------------------------------------------
// Temperatures
// ---------------------------------------------------------------------------

describe('GPU temp — normal ≤ 69, watch 70–79, alarm ≥ 80', () => {
  const cases: readonly [Celsius | null, Severity | null][] = [
    [celsius(0), 'normal'],
    [celsius(66), 'normal'],
    [celsius(69), 'normal'],
    [celsius(70), 'watch'],
    [celsius(75), 'watch'],
    [celsius(79), 'watch'],
    [celsius(80), 'alarm'],
    [celsius(83), 'alarm'],
    [celsius(87), 'alarm'],
    [null, null],
    [celsius(Number.NaN), null],
  ];
  test.each(cases)('%s °C → %s', (input, expected) => {
    expect(severityGpuTemp(input)).toBe(expected);
  });

  test('the measured production mean and worst case sit where the bands say', () => {
    expect(severityGpuTemp(celsius(66.2))).toBe('normal');
    expect(severityGpuTemp(celsius(75.3))).toBe('watch');
  });
});

// ---------------------------------------------------------------------------
// 10e / §3.2 — the GPU-temp boundaries are EXPORTED so the sparkline's reference lines
// (`GPU_TEMP_WATCH_C` / `GPU_TEMP_ALARM_C`) and this function read the same two numbers.
// ---------------------------------------------------------------------------

describe('⚠ 10e — the exported GPU-temp constants are what severityGpuTemp actually reads', () => {
  test('⚠ GPU_TEMP_WATCH_C is 70 and GPU_TEMP_ALARM_C is 80 — §6.3’s own boundaries, exported', () => {
    expect(GPU_TEMP_WATCH_C).toBe(70);
    expect(GPU_TEMP_ALARM_C).toBe(80);
  });

  test('⚠ severityGpuTemp bands the WATCH floor from the exported constant, not a second copy', () => {
    expect(severityGpuTemp(celsius(GPU_TEMP_WATCH_C - 1))).toBe('normal');
    expect(severityGpuTemp(celsius(GPU_TEMP_WATCH_C))).toBe('watch');
  });
});

describe('CPU temp — normal ≤ 79, watch 80–89, alarm ≥ 90', () => {
  const cases: readonly [Celsius | null, Severity | null][] = [
    [celsius(0), 'normal'],
    [celsius(79), 'normal'],
    [celsius(80), 'watch'],
    [celsius(89), 'watch'],
    [celsius(90), 'alarm'],
    [celsius(100), 'alarm'],
    [null, null],
  ];
  test.each(cases)('%s °C → %s', (input, expected) => {
    expect(severityCpuTemp(input)).toBe(expected);
  });

  test('a GPU-band temperature is not a CPU-band temperature', () => {
    expect(severityGpuTemp(celsius(80))).toBe('alarm');
    expect(severityCpuTemp(celsius(80))).toBe('watch');
  });
});

// ---------------------------------------------------------------------------
// Memory
// ---------------------------------------------------------------------------

describe('GPU VRAM — normal ≤ 90 %, watch 90–95 %, alarm > 95 %', () => {
  const cases: readonly [number, Severity][] = [
    [0, 'normal'],
    [807, 'normal'],
    [900, 'normal'],
    [901, 'watch'],
    [950, 'watch'],
    [951, 'alarm'],
    [1000, 'alarm'],
  ];
  test.each(cases)('%s of 1000 MiB → %s', (used, expected) => {
    expect(severityVram(mib(used), mib(1000))).toBe(expected);
  });

  test('the live 128K configuration is normal, and 256K would not be', () => {
    expect(severityVram(mib(26452), mib(32768))).toBe('normal');
    expect(severityVram(mib(32000), mib(32768))).toBe('alarm');
  });

  test('an unreadable side has no severity', () => {
    expect(severityVram(null, mib(32768))).toBeNull();
    expect(severityVram(mib(26452), null)).toBeNull();
    expect(severityVram(mib(0), mib(0))).toBeNull();
  });
});

describe('RAM — normal ≤ 85 %, watch 85–95 %, alarm > 95 % or swap > 1 GiB', () => {
  const pct: readonly [number, Severity][] = [
    [0, 'normal'],
    [85, 'normal'],
    [85.5, 'watch'],
    [95, 'watch'],
    [95.5, 'alarm'],
    [100, 'alarm'],
  ];
  test.each(pct)('%s of 100 GiB → %s', (used, expected) => {
    expect(severityRam(gib(used), gib(100))).toBe(expected);
  });

  const swap: readonly [GiB | null, Severity | null][] = [
    [gib(0), 'normal'],
    [gib(0.02), 'normal'],
    [gib(1), 'normal'],
    [gib(1.01), 'alarm'],
    [gib(8), 'alarm'],
    [null, null],
  ];
  test.each(swap)('swap %s GiB → %s', (input, expected) => {
    expect(severitySwap(input)).toBe(expected);
  });

  test('the swap trigger is independent of the used-% band (§6.3 is one row)', () => {
    expect(severityMemory({ ...everythingZero.host, swapUsedGiB: gib(2) })).toBe('alarm');
    expect(severityMemory(everythingZero.host)).toBe('normal');
    expect(severityMemory(nothingReadable.host)).toBeNull();
  });
});

describe('disk — banded on FREE space: normal ≥ 15 %, watch 5–15 %, alarm < 5 %', () => {
  const cases: readonly [number, Severity][] = [
    [0, 'normal'],
    [85, 'normal'],
    [85.5, 'watch'],
    [95, 'watch'],
    [95.5, 'alarm'],
    [100, 'alarm'],
  ];
  test.each(cases)('%s of 100 GiB used → %s', (used, expected) => {
    expect(severityDiskFree(gib(used), gib(100))).toBe(expected);
  });

  test('exactly 15 % free is normal and exactly 5 % free is watch', () => {
    expect(freePercent(gib(85), gib(100))).toBe(15);
    expect(severityDiskFree(gib(85), gib(100))).toBe('normal');
    expect(freePercent(gib(95), gib(100))).toBe(5);
    expect(severityDiskFree(gib(95), gib(100))).toBe('watch');
  });

  test('an unread filesystem has no severity', () => {
    expect(severityDiskFree(null, gib(931.5))).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// fan5 — the row where the wrong answer is a permanent false alarm
// ---------------------------------------------------------------------------

describe('fan5 engagement — three-valued: manual AND ch5Pwm ≥ 192, or unknown', () => {
  const cases: readonly [string, Cooling, Ch5Engagement][] = [
    ['manual pwm 255 — the commissioned configuration', ch5Manual, 'engaged'],
    [
      'manual pwm 192 — the first value of the HIGH band',
      { ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(192) },
      'engaged',
    ],
    [
      'manual pwm 191 — the last value of the LOW band',
      { ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(191) },
      'not-engaged',
    ],
    [
      'manual pwm 128 — LOW, 989 RPM, worse than EC auto',
      { ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(128) },
      'not-engaged',
    ],
    ['manual pwm 0 — OFF', { ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(0) }, 'not-engaged'],
    ['ec-auto — ENODATA, healthy', ch5EcAuto, 'not-engaged'],
    [
      'unavailable — the channel is not enumerated',
      { ...ch5EcAuto, ch5Mode: null, ch5Pwm: null },
      'not-engaged',
    ],
    // A duty that is not a reading. The brand constructors do not validate, so a collector
    // that failed to parse `pwm5` and sent a number anyway lands here.
    [
      'manual, duty NaN',
      { ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(Number.NaN) },
      'unknown',
    ],
    [
      'manual, duty +Infinity',
      { ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(Number.POSITIVE_INFINITY) },
      'unknown',
    ],
    [
      'manual, duty 1000 — outside the 0–255 register',
      { ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(1000) },
      'unknown',
    ],
    [
      'manual, duty -1 — outside the 0–255 register',
      { ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(-1) },
      'unknown',
    ],
  ];
  test.each(cases)('%s → %s', (_name, cooling, expected) => {
    expect(ch5Engagement(cooling)).toBe(expected);
  });

  test('engagement reads the ≥ 192 boundary from pwmStateName, not from a second copy', () => {
    // R2/A3: one hardware fact, one definition. If these disagree the COOLING panel can
    // label a channel LOW while the engaged alarm band is applied to it.
    for (const duty of [0, 63, 64, 191, 192, 255]) {
      const cooling: Cooling = { ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(duty) };
      expect(ch5Engagement(cooling) === 'engaged').toBe(pwmStateName(pwm(duty)) === 'HIGH');
    }
  });
});

describe('fan5 while engaged — normal ≥ 3500, watch 3000–3499, alarm < 3000', () => {
  const engaged = (value: Rpm | null): Cooling => ({
    ...ch5Manual,
    ch5Mode: 'manual',
    ch5Pwm: pwm(255),
    fan5Rpm: value,
  });
  const cases: readonly [Rpm | null, Severity | null][] = [
    [rpm(4308), 'normal'],
    [rpm(4465), 'normal'],
    [rpm(3500), 'normal'],
    [rpm(3499), 'watch'],
    [rpm(3000), 'watch'],
    [rpm(2999), 'alarm'],
    [rpm(2210), 'alarm'],
    [rpm(0), 'alarm'],
    [rpm(5100), 'normal'],
    [rpm(5101), 'alarm'],
    [rpm(14451), 'alarm'],
    [null, null],
  ];
  test.each(cases)('%s RPM engaged → %s', (value, expected) => {
    expect(severityFan5(engaged(value))).toBe(expected);
  });
});

describe('fan5 NOT engaged — only the absolute rule applies (§6.3)', () => {
  const modes: readonly [string, (value: Rpm | null) => Cooling][] = [
    ['ec-auto', (v) => ({ ...ch5EcAuto, ch5Mode: 'ec-auto', ch5Pwm: null, fan5Rpm: v })],
    ['unavailable', (v) => ({ ...ch5EcAuto, ch5Mode: null, ch5Pwm: null, fan5Rpm: v })],
    [
      'manual below the HIGH band',
      (v) => ({ ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(128), fan5Rpm: v }),
    ],
  ];

  test.each(modes)("%s: the EC's healthy 2210 RPM is NOT an alarm", (_name, build) => {
    expect(severityFan5(build(rpm(2210)))).toBe('normal');
  });

  test.each(modes)('%s: 0 RPM alarms on the ABSOLUTE row, not the engaged one', (_name, build) => {
    // Two separate claims, and the split is the point. The *engaged* band does not apply
    // here — its 3000 RPM floor would permanently alarm at EC auto's healthy ~2210. The
    // *absolute* row does, because it is two-sided and unconditional, and `0` is a stopped
    // fan or a lost tach in every mode.
    expect(severityFan5Engaged(build(rpm(0)))).toBeNull();
    expect(severityFan5Absolute(build(rpm(0)))).toBe('alarm');
    expect(severityFan5(build(rpm(0)))).toBe('alarm');
  });

  test.each(modes)('%s: the EC-auto floor of 1900 RPM is still normal', (_name, build) => {
    // The other side of the same boundary. `0` is the ONLY low reading that alarms; §6.3
    // measures EC auto at 1900–2250 and channel 3 as low as 604, so a low-but-nonzero band
    // would fire on a healthy box.
    expect(severityFan5(build(rpm(1)))).toBe('normal');
    expect(severityFan5(build(rpm(604)))).toBe('normal');
    expect(severityFan5(build(rpm(1900)))).toBe('normal');
  });

  test.each(modes)('%s: an implausible tach is still an alarm', (_name, build) => {
    expect(severityFan5(build(rpm(5101)))).toBe('alarm');
    expect(severityFan5(build(rpm(14451)))).toBe('alarm');
  });

  test.each(modes)('%s: 5100 is the nominal max and is not an alarm', (_name, build) => {
    expect(severityFan5(build(rpm(5100)))).toBe('normal');
  });

  test.each(modes)('%s: the engaged ROW itself has no severity here', (_name, build) => {
    expect(severityFan5Engaged(build(rpm(2210)))).toBeNull();
    expect(severityFan5Engaged(build(rpm(0)))).toBeNull();
  });

  test.each(modes)('%s: a `null` tach still carries no severity at all', (_name, build) => {
    // Invariant 1's other half, restated per mode now that `0` alarms: the two must not be
    // conflated in either direction. `null` renders `—` and colours nothing.
    expect(severityFan5(build(null))).toBeNull();
    expect(severityFan5Absolute(build(null))).toBeNull();
  });

  test('the live EC-auto fixture is healthy — the false alarm this row exists to avoid', () => {
    expect(ch5EcAuto.fan5Rpm).toBe(2210);
    expect(severityFan5(ch5EcAuto)).toBe('normal');
  });

  test('the same RPM is an alarm once the service claims the channel at HIGH', () => {
    expect(severityFan5({ ...ch5Manual, fan5Rpm: rpm(2210) })).toBe('alarm');
  });

  test('an unreadable fan5 has no severity in any mode', () => {
    expect(severityFan5({ ...ch5EcAuto, fan5Rpm: null })).toBeNull();
    expect(severityFan5({ ...ch5Manual, fan5Rpm: null })).toBeNull();
    expect(severityFan5Absolute({ ...ch5Manual, fan5Rpm: null })).toBeNull();
    expect(severityFan5Engaged({ ...ch5Manual, fan5Rpm: null })).toBeNull();
  });
});

describe('fan5 with an UNREADABLE duty — no severity, never a manufactured "normal"', () => {
  const unreadableDuties: readonly [string, number][] = [
    ['NaN', Number.NaN],
    ['+Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['1000 — out of the 0–255 register', 1000],
    ['-1 — out of the 0–255 register', -1],
  ];
  /** Manual with a duty that did not parse, and a tach the caller chooses. */
  const unknownDuty = (duty: number, tach: Rpm | null): Cooling => ({
    ...ch5Manual,
    ch5Mode: 'manual',
    ch5Pwm: pwm(duty),
    fan5Rpm: tach,
  });
  const stalled = (duty: number): Cooling => unknownDuty(duty, rpm(0));

  test.each(unreadableDuties)(
    'manual, duty %s, fan HEALTHY: the band has no severity — not normal',
    (_name, duty) => {
      // §6.6: "When the mode is `manual` but the duty is not a reading, render `—` and
      // give the band no severity rather than assuming a state." Answering `normal` here
      // asserts health from a parse failure. 4308 RPM is the commissioned HIGH reading, so
      // nothing on the absolute row fires and the unknown engagement is what is visible.
      expect(severityFan5(unknownDuty(duty, rpm(4308)))).toBeNull();
      expect(severityFan5(unknownDuty(duty, rpm(4308)))).not.toBe('normal');
      expect(severityFan5Engaged(unknownDuty(duty, rpm(4308)))).toBeNull();
    },
  );

  test.each(unreadableDuties)(
    '⚠ manual, duty %s, fan STOPPED: ALARM — this is the state that used to band green',
    (_name, duty) => {
      // The headline defect of step 4's review, closed by §6.3's zero clause. The engaged
      // band cannot see this — the duty did not parse, so engagement is `unknown` — and
      // before the clause the absolute row answered `normal`, so a dead fan on a channel
      // commanded HIGH produced an affirmative green on the panel that earns this
      // dashboard's existence. `severityFan5` propagates an absolute alarm through the
      // unknown-engagement branch, which is why one comparison fixes all seven states.
      expect(severityFan5Absolute(stalled(duty))).toBe('alarm');
      expect(severityFan5(stalled(duty))).toBe('alarm');
      // Still no *engaged* severity: §6.6's rule is intact, it is simply no longer the
      // only thing that could have coloured this cell.
      expect(severityFan5Engaged(stalled(duty))).toBeNull();
    },
  );

  test.each(unreadableDuties)(
    'manual, duty %s: §6.3 s ABSOLUTE row is unconditional and still alarms',
    (_name, duty) => {
      // "14451 RPM once hung POST — an implausible tach is the early warning." Losing it
      // because an unrelated field failed to parse would discard that warning.
      const implausible: Cooling = { ...stalled(duty), fan5Rpm: rpm(14451) };
      expect(severityFan5Absolute(implausible)).toBe('alarm');
      expect(severityFan5(implausible)).toBe('alarm');
    },
  );

  test.each(unreadableDuties)(
    'manual, duty %s, fan UNREADABLE: still no severity — `null` is not `0`',
    (_name, duty) => {
      expect(severityFan5(unknownDuty(duty, null))).toBeNull();
      expect(severityFan5Absolute(unknownDuty(duty, null))).toBeNull();
    },
  );

  test('a readable duty in the same shape bands on both rows', () => {
    expect(severityFan5({ ...stalled(255) })).toBe('alarm'); // engaged AND stopped
    expect(severityFan5({ ...stalled(0) })).toBe('alarm'); // OFF duty, but the tach is 0
    expect(severityFan5(unknownDuty(0, rpm(989)))).toBe('normal'); // LOW, a legitimate state
  });
});

describe('fan5 — the two §6.3 rows are separately addressable (§6.4 gives them two ids)', () => {
  test('absolute applies in every mode and ignores the duty', () => {
    expect(severityFan5Absolute(ch5EcAuto)).toBe('normal');
    expect(severityFan5Absolute({ ...ch5EcAuto, fan5Rpm: rpm(5101) })).toBe('alarm');
    expect(severityFan5Absolute({ ...ch5Manual, fan5Rpm: rpm(5100) })).toBe('normal');
  });

  test('engaged applies only while engaged', () => {
    expect(severityFan5Engaged({ ...ch5Manual, fan5Rpm: rpm(2999) })).toBe('alarm');
    expect(severityFan5Engaged({ ...ch5EcAuto, fan5Rpm: rpm(2999) })).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// §6.3's zero clause — the row a dead fan is actually judged by
// ---------------------------------------------------------------------------

describe('fan5 absolute is TWO-SIDED and unconditional (§6.3)', () => {
  /** Every mode `Cooling` can be in, so "unconditional" is tested and not asserted. */
  const inEveryMode = (tach: Rpm | null): readonly [string, Cooling][] => [
    ['manual HIGH', { ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(255), fan5Rpm: tach }],
    ['manual LOW', { ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(128), fan5Rpm: tach }],
    ['manual OFF', { ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(0), fan5Rpm: tach }],
    ['ec-auto', { ...ch5EcAuto, ch5Mode: 'ec-auto', ch5Pwm: null, fan5Rpm: tach }],
    ['unavailable', { ...ch5EcAuto, ch5Mode: null, ch5Pwm: null, fan5Rpm: tach }],
    [
      'manual, duty unreadable',
      { ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(999), fan5Rpm: tach },
    ],
  ];

  test('⚠ `0` alarms in EVERY mode — all six, including the box s resting ec-auto', () => {
    // §6.3: "it fires in every mode, including `ec-auto` and whenever `ch5Mode` is `null`,
    // and including when the duty is unreadable." Six of these seven states banded
    // `normal` before the zero clause, and `ec-auto` is the one this box sits in whenever
    // the GPUs are below `AUTO_BELOW=55`.
    for (const [name, cooling] of inEveryMode(rpm(0))) {
      expect(severityFan5Absolute(cooling), name).toBe('alarm');
      expect(severityFan5(cooling), name).toBe('alarm');
    }
  });

  test('⚠ `null` alarms in NO mode — invariant 1, the other direction', () => {
    for (const [name, cooling] of inEveryMode(null)) {
      expect(severityFan5Absolute(cooling), name).toBeNull();
      expect(severityFan5(cooling), name).toBeNull();
    }
  });

  test('the boundaries either side of both ends', () => {
    // Fixture symmetry (HANDOVER §5), on a row that now has two edges rather than one.
    const abs = (v: number): Severity | null =>
      severityFan5Absolute({ ...ch5EcAuto, fan5Rpm: rpm(v) });
    expect(abs(0)).toBe('alarm'); // the low end
    expect(abs(1)).toBe('normal'); // one revolution is a reading
    expect(abs(5100)).toBe('normal'); // the SMM nominal max, still not an alarm
    expect(abs(5101)).toBe('alarm'); // the high end
  });

  test('⚠ `-0` is a stopped fan — the comparison is `===`, never `Object.is`', () => {
    // §6.3 states this: `-0 === 0` is true, so a corrupt `-0` is correctly caught, while
    // `Object.is(-0, 0)` is false and would let it band `normal`. `fanN_input` is an
    // unsigned revolution count, so `-0` is only reachable from a corrupt read — which is
    // exactly the value that must not slip past the row.
    expect(Object.is(-0, 0)).toBe(false); // the trap, stated
    expect(severityFan5Absolute({ ...ch5EcAuto, fan5Rpm: rpm(-0) })).toBe('alarm');
    expect(severityFan5({ ...ch5Manual, fan5Rpm: rpm(-0) })).toBe('alarm');
  });
});

describe('fan1–fan4 stopped — `0` is alarm, `null` is nothing, no other band (§6.3)', () => {
  const cases: readonly [Rpm | null, Severity | null][] = [
    [null, null], // did not enumerate — no severity, renders `—`
    [rpm(0), 'alarm'], // stopped, or a lost tach
    [rpm(-0), 'alarm'], // `===`, never `Object.is`
    [rpm(1), 'normal'],
    [rpm(604), 'normal'], // channel 3, measured, below its own LOW preset
    [rpm(718), 'normal'], // channel 2 at idle, captured from the box
    [rpm(1028), 'normal'], // channel 1, the CPU heatsink fan, at idle
    [rpm(4139), 'normal'], // channel 4 at manual HIGH
    [rpm(14451), 'normal'], // ⚠ NO upper row — see below
  ];
  test.each(cases)('%s → %s', (value, expected) => {
    expect(severityFanStopped(value)).toBe(expected);
  });

  test('⚠ there is deliberately no upper row on these four channels', () => {
    // §6.3: "the EC does not modulate them under GPU load and no nominal is documented."
    // fan5 has a documented SMM nominal of 5100 and a 14451 that once hung POST; these
    // four have neither, so an upper bound here would be invented rather than measured.
    expect(severityFanStopped(rpm(99999))).toBe('normal');
    expect(severityFan5Absolute({ ...ch5EcAuto, fan5Rpm: rpm(99999) })).toBe('alarm');
  });

  test('a non-finite reading has no severity, like every other row', () => {
    expect(severityFanStopped(rpm(Number.NaN))).toBeNull();
    expect(severityFanStopped(rpm(Number.POSITIVE_INFINITY))).toBeNull();
  });
});

describe('⚠ the `everythingZero` fixture — "a dead fan", and it must not band green', () => {
  /*
   * This is the test the review asked for by name, and it is the cleanest statement of why
   * §6.3's zero clause is a spec hole rather than a collector bug: the fixture never goes
   * near a collector. `lib/fixtures.ts` has carried the doc comment "A dead fan, an idle
   * card" since step 1 while every one of its five channels banded `normal`.
   *
   * `nothingReadable` is its paired opposite — the same fields, all `null` — and asserting
   * both here is invariant 1 in one place: zero is a reading and colours the cell; nothing
   * is not a reading and colours nothing.
   */
  test('all five channels are `0` and all five are ALARM', () => {
    const c = everythingZero.cooling;
    expect([c.fan1Rpm, c.fan2Rpm, c.fan3Rpm, c.fan4Rpm, c.fan5Rpm]).toEqual([0, 0, 0, 0, 0]);
    expect(severityFanStopped(c.fan1Rpm)).toBe('alarm');
    expect(severityFanStopped(c.fan2Rpm)).toBe('alarm');
    expect(severityFanStopped(c.fan3Rpm)).toBe('alarm');
    expect(severityFanStopped(c.fan4Rpm)).toBe('alarm');
    expect(severityFan5Absolute(c)).toBe('alarm');
    expect(severityFan5(c)).toBe('alarm');
  });

  test('and its paired opposite colours nothing at all', () => {
    const c = nothingReadable.cooling;
    expect([c.fan1Rpm, c.fan2Rpm, c.fan3Rpm, c.fan4Rpm, c.fan5Rpm]).toEqual([
      null,
      null,
      null,
      null,
      null,
    ]);
    expect(severityFanStopped(c.fan1Rpm)).toBeNull();
    expect(severityFanStopped(c.fan4Rpm)).toBeNull();
    expect(severityFan5Absolute(c)).toBeNull();
    expect(severityFan5(c)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Safety and units
// ---------------------------------------------------------------------------

describe('ufw enforcing — three-valued, mirroring pwm5 present (§6.3)', () => {
  const cases: readonly [boolean | null, Severity][] = [
    [true, 'normal'],
    [null, 'watch'],
    [false, 'alarm'],
  ];
  test.each(cases)('%s → %s', (input, expected) => {
    expect(severityUfw(input)).toBe(expected);
  });

  test('false is ALARM severity — watch is §6.4 s display concession, not the truth', () => {
    expect(severityUfw(false)).toBe('alarm');
    expect(severityUfw(false)).not.toBe('watch');
  });

  test('an unread ufw.conf is watch: a visible "could not check", never a blank', () => {
    // §6.3: "`null` is watch, matching `pwm5Present` — both are three-valued safety checks
    // and must behave alike." This row has already been wrong on this box since
    // 2026-09-04, so an uncoloured cell is the worst outcome.
    expect(severityUfw(null)).toBe('watch');
    expect(severityUfw(null)).not.toBe('alarm');
    expect(severityUfw(null)).not.toBe('normal');
  });

  test('the two three-valued safety checks now agree with each other', () => {
    for (const value of [true, null, false] as const) {
      expect(severityUfw(value)).toBe(severityPwm5Present(value));
      expect(severityUfw(value)).toBe(severityDkms(value));
    }
  });
});

describe('dkmsForRunningKernel — §6.3: "mirrors the pwm5 present row exactly"', () => {
  const cases: readonly [boolean | null, Severity][] = [
    [true, 'normal'],
    [null, 'watch'],
    [false, 'alarm'],
  ];
  test.each(cases)('%s → %s', (input, expected) => {
    expect(severityDkms(input)).toBe(expected);
  });

  test('false is the alarm — the next boot loses pwm5', () => {
    expect(severityDkms(false)).toBe('alarm');
  });

  test('null is unknown, never the alarm', () => {
    expect(severityDkms(null)).toBe('watch');
    expect(severityDkms(null)).not.toBe('alarm');
  });
});

describe('/health per instance — §6.3', () => {
  const cases: readonly [HealthState | null, Severity | null][] = [
    ['ok', 'normal'],
    ['unhealthy', 'watch'],
    ['unreachable', 'alarm'],
    [null, null],
  ];
  test.each(cases)('%s → %s', (input, expected) => {
    expect(severityHealth(input)).toBe(expected);
  });

  test('503 while a model loads is watch, not alarm — it is a real healthy state', () => {
    expect(severityHealth('unhealthy')).toBe('watch');
  });

  test('not probed this cycle carries NO severity, not a good or bad one', () => {
    expect(severityHealth(null)).toBeNull();
  });

  test('an unknown health value does not type-check', () => {
    // @ts-expect-error §3.7 s set is closed.
    severityHealth('degraded');
  });
});

describe('eno1 link — §6.3 over all seven operstate values', () => {
  const cases: readonly [LinkState, Severity][] = [
    ['up', 'normal'],
    ['dormant', 'watch'],
    ['testing', 'watch'],
    ['unknown', 'watch'],
    ['down', 'alarm'],
    ['lowerlayerdown', 'alarm'],
    ['notpresent', 'alarm'],
  ];
  test.each(cases)('%s → %s', (input, expected) => {
    expect(severityLink(input)).toBe(expected);
  });

  test('all seven values are covered, and up is the only healthy one', () => {
    expect(cases).toHaveLength(7);
    expect(cases.filter(([, sev]) => sev === 'normal').map(([v]) => v)).toEqual(['up']);
  });

  test('an unread operstate has no severity — its error source is net-operstate', () => {
    expect(severityLink(null)).toBeNull();
  });

  test('an eighth operstate does not type-check', () => {
    // @ts-expect-error §3.7 s set is closed at seven.
    severityLink('flapping');
  });
});

describe('pwm5 present — three-valued, and null is NOT the alarm', () => {
  const cases: readonly [boolean | null, Severity][] = [
    [true, 'normal'],
    [null, 'watch'],
    [false, 'alarm'],
  ];
  test.each(cases)('%s → %s', (input, expected) => {
    expect(severityPwm5Present(input)).toBe(expected);
  });

  test('null is unknown: watch, never alarm, and never silently normal', () => {
    expect(severityPwm5Present(null)).toBe('watch');
    expect(severityPwm5Present(null)).not.toBe('alarm');
    expect(severityPwm5Present(null)).not.toBe('normal');
  });

  test('the three values are three different severities', () => {
    const all = [true, false, null].map(severityPwm5Present);
    expect(new Set(all).size).toBe(3);
  });

  test('it is total — there is no null severity to render as a blank row', () => {
    expect(severityPwm5Present(null)).not.toBeNull();
  });
});

describe('any unit — all six ActiveState values (§3.7)', () => {
  const cases: readonly [UnitState, Severity][] = [
    ['active', 'normal'],
    ['reloading', 'normal'],
    ['activating', 'watch'],
    ['deactivating', 'watch'],
    ['inactive', 'alarm'],
    ['failed', 'alarm'],
  ];
  test.each(cases)('%s → %s', (input, expected) => {
    expect(severityUnitState(input)).toBe(expected);
  });

  test('every member of the vocabulary is mapped, and none returns null', () => {
    expect(cases).toHaveLength(6);
    for (const [state] of cases) expect(severityUnitState(state)).not.toBeNull();
  });

  test('reloading is running, not a fault', () => {
    expect(severityUnitState('reloading')).toBe(severityUnitState('active'));
  });

  test('inactive is an alarm, not merely "off"', () => {
    expect(severityUnitState('inactive')).toBe('alarm');
  });

  test('a unit that was not probed has no severity', () => {
    expect(severityUnitState(null)).toBeNull();
  });

  test('the vocabulary is closed', () => {
    // @ts-expect-error §3.7 fixes the six values; D-Bus strings must be narrowed first.
    severityUnitState('running');
  });
});

describe('GPU throttle severity (§6.3 via §3.7)', () => {
  const cases: readonly [string | null, Severity | null][] = [
    ['0x0', 'normal'],
    ['0x0000000000000000', 'normal'],
    ['0x4', 'normal'],
    ['0x1', 'normal'],
    ['0x2', 'normal'],
    ['0x100', 'normal'],
    ['0x5', 'normal'],
    ['0x8', 'alarm'],
    ['0x20', 'alarm'],
    ['0x40', 'alarm'],
    ['0x80', 'alarm'],
    ['0x24', 'alarm'],
    ['0x10', 'watch'],
    ['0x14', 'watch'],
    ['0x30', 'alarm'],
    [null, null],
    ['[N/A]', null],
  ];
  test.each(cases)('%s → %s', (input, expected) => {
    expect(severityThrottle(input === null ? null : throttleMask(input))).toBe(expected);
  });

  test('the routine 250 W power cap is never a warning (§6.2)', () => {
    expect(severityThrottle(throttleMask('0x4'))).toBe('normal');
  });

  test('an unknown bit is watch, and an unknown bit beside a thermal one is alarm', () => {
    expect(severityThrottle(throttleMask('0x10'))).toBe('watch');
    expect(severityThrottle(throttleMask('0x10'))).not.toBe('normal');
    expect(severityThrottle(throttleMask('0x30'))).toBe('alarm');
  });
});
