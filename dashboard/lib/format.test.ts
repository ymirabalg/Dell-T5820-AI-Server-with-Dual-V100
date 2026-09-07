/**
 * §6.6 — one table per row of the units-and-formatting table, plus the two laws that hold
 * across every row.
 *
 * The tables are built to bite at the edges rather than the middles: `null` and `0` for
 * every formatter, both sides of every rounding and scaling boundary, and the exact
 * strings §6.6 prints. A test that only exercises typical values has not tested anything
 * that will actually break.
 */

import { describe, expect, test } from 'vitest';

import {
  EM_DASH,
  formatAge,
  formatBytesPerSecond,
  formatCelsius,
  formatCh5Pwm,
  formatCpuModel,
  formatGiB,
  formatLoadAverage,
  formatMHz,
  formatMiB,
  formatMiBPair,
  formatPercent,
  formatPort,
  formatRpm,
  formatSwapGiB,
  formatText,
  formatTokens,
  formatUptime,
  formatWatts,
  pwmStateName,
} from './format';
import {
  ch5EcAuto,
  ch5Manual,
  everythingZero,
  nothingReadable,
  servingIdentityOnly,
  servingInstances,
} from './fixtures';
import {
  bytesPerSecond,
  celsius,
  gib,
  mhz,
  mib,
  percent,
  port,
  pwm,
  rpm,
  seconds,
  tokens,
  watts,
} from './types';
import type {
  BytesPerSecond,
  Celsius,
  Cooling,
  GiB,
  LoadAverage,
  MHz,
  MiB,
  Percent,
  Pwm,
  Rpm,
  Seconds,
  ServingInstance,
  TelemetrySnapshot,
  Tokens,
  Watts,
} from './types';

// ---------------------------------------------------------------------------
// The two laws, over every formatter at once
// ---------------------------------------------------------------------------

/**
 * Each §6.6 row as (name, `null` call, what it must render, zero call, what that must
 * render), so both laws are swept in one pass with an expected string per row rather than
 * a rule the test infers.
 */
const ROWS: readonly [string, () => string, string, () => string, string][] = [
  [
    'GPU/CPU temp',
    () => formatCelsius(null),
    EM_DASH,
    () => formatCelsius(celsius(0)),
    '0 °C',
  ],
  [
    'GPU power',
    () => formatWatts(null),
    EM_DASH,
    () => formatWatts(watts(0)),
    '0.0 W',
  ],
  [
    'VRAM',
    () => formatMiB(null),
    EM_DASH,
    () => formatMiB(mib(0)),
    '0 MiB',
  ],
  [
    'VRAM pair',
    () => formatMiBPair(null, null),
    EM_DASH,
    () => formatMiBPair(mib(0), mib(0)),
    '0 / 0 MiB',
  ],
  [
    'SM clock',
    () => formatMHz(null),
    EM_DASH,
    () => formatMHz(mhz(0)),
    '0 MHz',
  ],
  // ⚠ §6.6's RAM row and its Disk row are the same unit at the same precision, so they
  // are the same formatter and one row here (O19). Splitting them back into two entries
  // would sweep `formatGiB` twice and claim two rows' worth of coverage for one call.
  [
    'RAM & disk',
    () => formatGiB(null),
    EM_DASH,
    () => formatGiB(gib(0)),
    '0.0 GiB',
  ],
  [
    'Swap',
    () => formatSwapGiB(null),
    EM_DASH,
    () => formatSwapGiB(gib(0)),
    '0.00 GiB',
  ],
  [
    'Network',
    () => formatBytesPerSecond(null),
    EM_DASH,
    () => formatBytesPerSecond(bytesPerSecond(0)),
    '0 KB/s',
  ],
  [
    'Fan speed',
    () => formatRpm(null),
    EM_DASH,
    () => formatRpm(rpm(0)),
    '0 RPM',
  ],
  [
    'Percentages',
    () => formatPercent(null),
    EM_DASH,
    () => formatPercent(percent(0)),
    '0.0 %',
  ],
  [
    'Load average',
    () => formatLoadAverage(null),
    EM_DASH,
    () => formatLoadAverage([0, 0, 0]),
    '0.00 / 0.00 / 0.00',
  ],
  [
    'Context length',
    () => formatTokens(null),
    EM_DASH,
    () => formatTokens(tokens(0)),
    '0',
  ],
  [
    'Channel-5 PWM',
    () => formatCh5Pwm({ ...ch5Manual, ch5Mode: null, ch5Pwm: null }),
    'unavailable',
    () => formatCh5Pwm({ ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(0) }),
    'OFF pwm 0',
  ],
  [
    'Port',
    () => formatPort(null),
    EM_DASH,
    () => formatPort(port(0)),
    '0',
  ],
  [
    'Uptime',
    () => formatUptime(null),
    EM_DASH,
    () => formatUptime(seconds(0)),
    // §3.2's fourth form. Still law 2: a zero reading and an unreadable one do not look
    // alike, which is what §6.6 says the law is FOR. See `formatUptime`'s own doc.
    'up <1 min',
  ],
  [
    'age',
    () => formatAge(null),
    EM_DASH,
    () => formatAge(0),
    '0 s',
  ],
  [
    'free text',
    () => formatText(null),
    EM_DASH,
    () => formatText('0'),
    '0',
  ],
  [
    'CPU model',
    () => formatCpuModel(null),
    EM_DASH,
    () => formatCpuModel('0'),
    '0',
  ],
];

describe('§6.6 law 1 — null renders as an em dash, never 0, never blank, never N/A', () => {
  // Every row renders the em dash except channel-5 PWM, which is §6.5's documented
  // exception: an absent *channel* is not an absent figure, and "the Cooling panel shows
  // the channel as unavailable". The expectation is per row, so a formatter that started
  // returning 'unavailable' for everything would fail rather than be skipped.
  test.each(ROWS)('%s', (_name, fromNull, expected) => {
    const rendered = fromNull();
    expect(rendered).toBe(expected);
    expect(rendered).not.toBe('');
    expect(rendered).not.toMatch(/0|N\/A/);
  });

  test('exactly one §6.6 row is allowed to render something other than the em dash', () => {
    const exceptions = ROWS.filter(([, , expected]) => expected !== EM_DASH);
    expect(exceptions.map(([name]) => name)).toEqual(['Channel-5 PWM']);
  });

  test('the em dash is U+2014, not a hyphen or an en dash', () => {
    expect(EM_DASH).toBe('—');
    expect(EM_DASH).not.toBe('-');
    expect(EM_DASH).not.toBe('–');
  });
});

describe('§6.6 law 2 — zero renders as the numeral with its unit, never an em dash', () => {
  /*
   * ⚠ The law's *purpose* is the assertion that matters, and §6.6 states it: law 2 is "the
   * §6.5 rule expressed as a formatting law", and the §6.5 rule is **"zero and unknown must
   * never look alike."** So every row must render a zero as something that is neither the
   * em dash nor blank, and distinct from what it renders for `null`.
   *
   * "Contains the numeral 0" is a *proxy* for that, and it holds for every row but one:
   * §3.2's fourth uptime form renders a zero-second reading as `up <1 min`. That is still a
   * reading and still distinct from `—`, so the law holds; the proxy does not. The exception
   * is pinned by name below, the same way law 1 pins Channel-5 PWM, so a second row
   * acquiring it fails rather than passing quietly.
   */
  const NO_NUMERAL: readonly string[] = ['Uptime'];

  test.each(ROWS)('%s', (name, fromNull, _nullExpected, fromZero, expected) => {
    const rendered = fromZero();
    expect(rendered).toBe(expected);
    expect(rendered).not.toBe(EM_DASH);
    expect(rendered).not.toBe('');
    // The law itself: zero and unknown must not look alike.
    expect(rendered).not.toBe(fromNull());
    if (!NO_NUMERAL.includes(name)) expect(rendered).toMatch(/0/);
  });

  test('exactly one §6.6 row renders a zero without the numeral, and it is named', () => {
    const withoutNumeral = ROWS.filter(([, , , fromZero]) => !/0/.test(fromZero())).map(
      ([name]) => name,
    );
    expect(withoutNumeral).toEqual([...NO_NUMERAL]);
  });
});

describe('the two laws over the canonical fixtures', () => {
  /** Every §6.6-formatted figure reachable from a snapshot, as (label, formatter). */
  const figures: readonly [string, (s: TelemetrySnapshot) => string][] = [
    ['gpu tempC', (s) => formatCelsius(s.gpus?.[0]?.tempC ?? null)],
    ['gpu powerW', (s) => formatWatts(s.gpus?.[0]?.powerW ?? null)],
    ['gpu powerCapW', (s) => formatWatts(s.gpus?.[0]?.powerCapW ?? null)],
    [
      'gpu vram',
      (s) => formatMiBPair(s.gpus?.[0]?.memUsedMiB ?? null, s.gpus?.[0]?.memTotalMiB ?? null),
    ],
    ['gpu utilPct', (s) => formatPercent(s.gpus?.[0]?.utilPct ?? null)],
    ['gpu smClockMHz', (s) => formatMHz(s.gpus?.[0]?.smClockMHz ?? null)],
    ['host cpuPct', (s) => formatPercent(s.host.cpuPct)],
    ['host loadAvg', (s) => formatLoadAverage(s.host.loadAvg)],
    ['host cpuTempC', (s) => formatCelsius(s.host.cpuTempC)],
    ['host memUsedGiB', (s) => formatGiB(s.host.memUsedGiB)],
    ['host memTotalGiB', (s) => formatGiB(s.host.memTotalGiB)],
    ['host swapUsedGiB', (s) => formatSwapGiB(s.host.swapUsedGiB)],
    ['host swapTotalGiB', (s) => formatSwapGiB(s.host.swapTotalGiB)],
    ['cooling fan1', (s) => formatRpm(s.cooling.fan1Rpm)],
    ['cooling fan2', (s) => formatRpm(s.cooling.fan2Rpm)],
    ['cooling fan3', (s) => formatRpm(s.cooling.fan3Rpm)],
    ['cooling fan4', (s) => formatRpm(s.cooling.fan4Rpm)],
    ['cooling fan5', (s) => formatRpm(s.cooling.fan5Rpm)],
    ['storage root used', (s) => formatGiB(s.storage.root.usedGiB)],
    ['storage root total', (s) => formatGiB(s.storage.root.totalGiB)],
    ['storage home used', (s) => formatGiB(s.storage.home.usedGiB)],
    ['storage home total', (s) => formatGiB(s.storage.home.totalGiB)],
    ['net rx', (s) => formatBytesPerSecond(s.storage.net.rxBytesPerSec)],
    ['net tx', (s) => formatBytesPerSecond(s.storage.net.txBytesPerSec)],
  ];

  /** The free-text figures. Same two laws, but "renders a numeral" does not apply. */
  const textFigures: readonly [string, (s: TelemetrySnapshot) => string][] = [
    ['hostname', (s) => formatText(s.hostname)],
    ['host kernel', (s) => formatText(s.host.kernel)],
    ['host cpuModel', (s) => formatCpuModel(s.host.cpuModel)],
  ];

  test.each(figures)('nothingReadable: %s renders the em dash', (_label, format) => {
    expect(format(nothingReadable)).toBe(EM_DASH);
  });

  test.each(figures)('everythingZero: %s renders a numeral', (_label, format) => {
    const rendered = format(everythingZero);
    expect(rendered).not.toBe(EM_DASH);
    expect(rendered).toMatch(/[0-9]/);
  });

  test.each(textFigures)('nothingReadable: %s renders the em dash', (_label, format) => {
    expect(format(nothingReadable)).toBe(EM_DASH);
  });

  test.each(textFigures)('everythingZero: %s renders its text', (_label, format) => {
    const rendered = format(everythingZero);
    expect(rendered).not.toBe(EM_DASH);
    expect(rendered).not.toBe('');
  });

  test('the same figure differs between the two fixtures — 0 RPM is not the em dash', () => {
    expect(formatRpm(everythingZero.cooling.fan5Rpm)).toBe('0 RPM');
    expect(formatRpm(nothingReadable.cooling.fan5Rpm)).toBe(EM_DASH);
  });

  /**
   * The SERVING panel, which the snapshot-level sweep above cannot reach: `nothingReadable`
   * has `serving: null` and `everythingZero` has `serving: []`, so neither carries an
   * instance. `servingIdentityOnly` is step 1's fixture for "known only by its env
   * filename; every other field `null`" and is the single best law-1 case in the project.
   */
  const servingFigures: readonly [string, (i: ServingInstance) => string][] = [
    ['port', (i) => formatPort(i.port)],
    ['ctx', (i) => formatTokens(i.ctx)],
    ['model', (i) => formatText(i.model)],
  ];

  test.each(servingFigures)(
    'servingIdentityOnly: %s renders the em dash, never a blank',
    (_label, format) => {
      const rendered = format(servingIdentityOnly);
      expect(rendered).toBe(EM_DASH);
      expect(rendered).not.toBe('');
      expect(rendered).not.toBe('0');
    },
  );

  test.each(servingFigures)('a live instance: %s renders its value', (_label, format) => {
    const live = servingInstances[0];
    if (live === undefined) throw new Error('fixture lost its first instance');
    expect(format(live)).not.toBe(EM_DASH);
  });

  test('a stopped instance keeps the figures its env file gave it', () => {
    // §3.4: the env file parsed, so `port` and `ctx` are known; everything that needed the
    // process is `null`. The two must not render alike.
    const down = servingInstances[1];
    if (down === undefined) throw new Error('fixture lost its second instance');
    expect(formatPort(down.port)).toBe('8081');
    expect(formatTokens(down.ctx)).toBe('131,072');
    expect(formatText(down.model)).toBe(EM_DASH);
  });

  test('a port is never thousands-separated — it is an identifier, not a quantity', () => {
    expect(formatPort(port(8080))).toBe('8080');
    expect(formatPort(port(8080))).not.toBe('8,080');
    expect(formatTokens(tokens(8080))).toBe('8,080');
  });
});

// ---------------------------------------------------------------------------
// Row by row
// ---------------------------------------------------------------------------

describe('temperature — integer °C', () => {
  const cases: readonly [Celsius | null, string][] = [
    [celsius(66), '66 °C'],
    [celsius(0), '0 °C'],
    [celsius(-1), '-1 °C'],
    [celsius(83), '83 °C'],
    [celsius(66.4), '66 °C'],
    [celsius(66.6), '67 °C'],
    [celsius(1234), '1,234 °C'],
    [null, EM_DASH],
    [celsius(Number.NaN), EM_DASH],
    [celsius(Number.POSITIVE_INFINITY), EM_DASH],
  ];
  test.each(cases)('%s → %s', (input, expected) => {
    expect(formatCelsius(input)).toBe(expected);
  });
});

describe('GPU power — 1 dp W', () => {
  const cases: readonly [Watts | null, string][] = [
    [watts(249.8), '249.8 W'],
    [watts(250), '250.0 W'],
    [watts(0), '0.0 W'],
    [watts(0.04), '0.0 W'],
    [watts(-0), '0.0 W'],
    [null, EM_DASH],
  ];
  test.each(cases)('%s → %s', (input, expected) => {
    expect(formatWatts(input)).toBe(expected);
  });
});

describe('VRAM — MiB, thousands separated', () => {
  const cases: readonly [MiB | null, string][] = [
    [mib(26452), '26,452 MiB'],
    [mib(32768), '32,768 MiB'],
    [mib(999), '999 MiB'],
    [mib(1000), '1,000 MiB'],
    [mib(0), '0 MiB'],
    [null, EM_DASH],
  ];
  test.each(cases)('%s → %s', (input, expected) => {
    expect(formatMiB(input)).toBe(expected);
  });

  test('§6.6 prints the pair as 26,452 / 32,768 MiB', () => {
    expect(formatMiBPair(mib(26452), mib(32768))).toBe('26,452 / 32,768 MiB');
  });

  test('one side missing keeps the other visible', () => {
    expect(formatMiBPair(mib(26452), null)).toBe('26,452 / — MiB');
    expect(formatMiBPair(null, mib(32768))).toBe('— / 32,768 MiB');
  });

  test('both sides missing collapse to one em dash', () => {
    expect(formatMiBPair(null, null)).toBe(EM_DASH);
  });

  test('a zero used against a real total is a reading, not an absence', () => {
    expect(formatMiBPair(mib(0), mib(32768))).toBe('0 / 32,768 MiB');
  });
});

describe('SM clock — integer MHz', () => {
  const cases: readonly [MHz | null, string][] = [
    [mhz(1380), '1,380 MHz'],
    [mhz(135), '135 MHz'],
    [mhz(0), '0 MHz'],
    [null, EM_DASH],
  ];
  test.each(cases)('%s → %s', (input, expected) => {
    expect(formatMHz(input)).toBe(expected);
  });
});

describe('RAM and disk 1 dp vs swap 2 dp — the rounding that must not read as "none"', () => {
  /*
   * One table, because after O19 there is one formatter: §6.6 gives RAM and disk the same
   * unit and the same precision, and the disk figures below are this box's real ones —
   * `/` at 232.6 GiB and `/home` at 915.8 GiB, the numbers `df -h` rounds to `233G` and
   * `916G`. The four-digit case is here rather than in a disk-only table because grouping
   * is a property of the formatter, and only a filesystem on this box gets that large.
   */
  const oneDp: readonly [GiB | null, string][] = [
    [gib(24.34), '24.3 GiB'],
    [gib(61), '61.0 GiB'],
    [gib(232.6371), '232.6 GiB'],
    [gib(915.8145), '915.8 GiB'],
    [gib(931.5), '931.5 GiB'],
    [gib(1234.5), '1,234.5 GiB'],
    [gib(0), '0.0 GiB'],
    [null, EM_DASH],
  ];
  test.each(oneDp)('RAM/disk %s → %s', (input, expected) => {
    expect(formatGiB(input)).toBe(expected);
  });

  const swap: readonly [GiB | null, string][] = [
    [gib(0.02), '0.02 GiB'],
    [gib(1.25), '1.25 GiB'],
    [gib(8), '8.00 GiB'],
    [gib(0), '0.00 GiB'],
    [null, EM_DASH],
  ];
  test.each(swap)('swap %s → %s', (input, expected) => {
    expect(formatSwapGiB(input)).toBe(expected);
  });

  test('§6.6: 2 dp exists so a small swap cannot round to 0.0 and read as none', () => {
    expect(formatGiB(gib(0.02))).toBe('0.0 GiB');
    expect(formatSwapGiB(gib(0.02))).toBe('0.02 GiB');
    expect(formatSwapGiB(gib(0.02))).not.toBe(formatSwapGiB(gib(0)));
  });
});

describe('network — auto-scaled, 2 significant figures', () => {
  const cases: readonly [BytesPerSecond | null, string][] = [
    [bytesPerSecond(1243000), '1.2 MB/s'],
    [bytesPerSecond(486000), '490 KB/s'],
    [bytesPerSecond(994000), '990 KB/s'],
    [bytesPerSecond(999499), '1.0 MB/s'],
    [bytesPerSecond(999999), '1.0 MB/s'],
    [bytesPerSecond(1000000), '1.0 MB/s'],
    [bytesPerSecond(1000), '1.0 KB/s'],
    [bytesPerSecond(5), '0.0050 KB/s'],
    [bytesPerSecond(0), '0 KB/s'],
    [null, EM_DASH],
  ];
  test.each(cases)('%s → %s', (input, expected) => {
    expect(formatBytesPerSecond(input)).toBe(expected);
  });

  test('KB/s below 1e6, MB/s at and above it', () => {
    expect(formatBytesPerSecond(bytesPerSecond(900000))).toMatch(/KB\/s$/);
    expect(formatBytesPerSecond(bytesPerSecond(1000000))).toMatch(/MB\/s$/);
  });

  test('a KB/s reading that rounds to 1,000 is promoted, never shown with four digits', () => {
    expect(formatBytesPerSecond(bytesPerSecond(999499))).toBe('1.0 MB/s');
    expect(formatBytesPerSecond(bytesPerSecond(999499))).not.toMatch(/KB\/s$/);
  });
});

describe('fan speed — integer RPM, thousands separated', () => {
  const cases: readonly [Rpm | null, string][] = [
    [rpm(4308), '4,308 RPM'],
    [rpm(2210), '2,210 RPM'],
    [rpm(989), '989 RPM'],
    [rpm(14451), '14,451 RPM'],
    [rpm(0), '0 RPM'],
    [null, EM_DASH],
  ];
  test.each(cases)('%s → %s', (input, expected) => {
    expect(formatRpm(input)).toBe(expected);
  });

  test('a dead fan and an absent channel are visually unambiguous (§6.5)', () => {
    expect(formatRpm(rpm(0))).not.toBe(formatRpm(null));
  });
});

describe('percentages — 1 dp', () => {
  const cases: readonly [Percent | null, string][] = [
    [percent(81.3), '81.3 %'],
    [percent(100), '100.0 %'],
    [percent(0), '0.0 %'],
    [null, EM_DASH],
  ];
  test.each(cases)('%s → %s', (input, expected) => {
    expect(formatPercent(input)).toBe(expected);
  });
});

describe('load average — three values, 2 dp, " / "-separated', () => {
  const cases: readonly [LoadAverage | null, string][] = [
    [[1.24, 1.08, 0.91], '1.24 / 1.08 / 0.91'],
    [[0, 0, 0], '0.00 / 0.00 / 0.00'],
    [[12.5, 3, 0.07], '12.50 / 3.00 / 0.07'],
    [null, EM_DASH],
  ];
  test.each(cases)('%s → %s', (input, expected) => {
    expect(formatLoadAverage(input)).toBe(expected);
  });

  test('§6.6 prints exactly 1.24 / 1.08 / 0.91', () => {
    expect(formatLoadAverage([1.24, 1.08, 0.91])).toBe('1.24 / 1.08 / 0.91');
  });

  test('a non-finite member makes the whole reading absent, not partly rendered', () => {
    expect(formatLoadAverage([1.24, Number.NaN, 0.91])).toBe(EM_DASH);
  });
});

describe('context length — thousands separated', () => {
  const cases: readonly [Tokens | null, string][] = [
    [tokens(131072), '131,072'],
    [tokens(262144), '262,144'],
    [tokens(4096), '4,096'],
    [tokens(0), '0'],
    [null, EM_DASH],
  ];
  test.each(cases)('%s → %s', (input, expected) => {
    expect(formatTokens(input)).toBe(expected);
  });
});

describe('channel-5 PWM — state name then raw value', () => {
  const states: readonly [Pwm, string][] = [
    [pwm(0), 'OFF'],
    [pwm(63), 'OFF'],
    [pwm(64), 'LOW'],
    [pwm(127), 'LOW'],
    [pwm(191), 'LOW'],
    [pwm(192), 'HIGH'],
    [pwm(255), 'HIGH'],
  ];
  test.each(states)('pwm %s is %s', (input, expected) => {
    expect(pwmStateName(input)).toBe(expected);
  });

  test('§6.6 prints the commissioned configuration as HIGH pwm 255', () => {
    expect(formatCh5Pwm(ch5Manual)).toBe('HIGH pwm 255');
  });

  test('ENODATA is EC auto and is healthy — never an error string (§6.5)', () => {
    expect(formatCh5Pwm(ch5EcAuto)).toBe('EC auto');
  });

  test('a channel that is not enumerated is unavailable, not a blank or a zero', () => {
    const unavailable: Cooling = { ...ch5EcAuto, ch5Mode: null, ch5Pwm: null };
    expect(formatCh5Pwm(unavailable)).toBe('unavailable');
    expect(formatCh5Pwm(unavailable)).not.toBe('0');
    expect(formatCh5Pwm(unavailable)).not.toBe('');
  });

  test('the raw value is always shown beside the state name', () => {
    expect(formatCh5Pwm({ ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(192) })).toBe(
      'HIGH pwm 192',
    );
    expect(formatCh5Pwm({ ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(128) })).toBe(
      'LOW pwm 128',
    );
  });

  test('EC auto and manual-at-the-same-RPM are different strings', () => {
    expect(formatCh5Pwm(ch5EcAuto)).not.toBe(formatCh5Pwm(ch5Manual));
  });

  /**
   * §6.6: "When the mode is `manual` but the duty is not a reading, render `—` and give
   * the band no severity rather than assuming a state."
   *
   * The brand constructors do not validate, so `pwm(NaN)` type-checks and `CoolingManual`
   * only requires the duty to be non-`null`, not finite. Assuming a state here labels a
   * channel `OFF` while it is being driven HIGH — and, through `ch5Engagement`, bands a
   * stopped fan `normal`.
   */
  const notAReading: readonly [string, number][] = [
    ['NaN', Number.NaN],
    ['+Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['1000 — above the 0–255 register', 1000],
    ['256 — one above the register', 256],
    ['-1 — below the register', -1],
  ];

  test.each(notAReading)('pwm %s has no state name', (_label, duty) => {
    expect(pwmStateName(pwm(duty))).toBeNull();
  });

  test.each(notAReading)('pwm %s renders the em dash, not a fabricated state', (_label, duty) => {
    const rendered = formatCh5Pwm({ ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(duty) });
    expect(rendered).toBe(EM_DASH);
    expect(rendered).not.toMatch(/OFF|LOW|HIGH/);
  });

  test('the register boundaries are readings — 0 and 255 are not "not a reading"', () => {
    expect(pwmStateName(pwm(0))).toBe('OFF');
    expect(pwmStateName(pwm(255))).toBe('HIGH');
    expect(formatCh5Pwm({ ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(0) })).toBe('OFF pwm 0');
  });

  test('an unreadable duty is NOT the same rendering as an absent channel', () => {
    // A manual channel whose duty failed to parse is a different fact from a channel that
    // is not enumerated at all, and §6.5 requires them to look different.
    const unreadable = formatCh5Pwm({ ...ch5Manual, ch5Mode: 'manual', ch5Pwm: pwm(Number.NaN) });
    const absent = formatCh5Pwm({ ...ch5EcAuto, ch5Mode: null, ch5Pwm: null });
    expect(unreadable).not.toBe(absent);
  });
});

// ---------------------------------------------------------------------------
// §3.2's three uptime forms
// ---------------------------------------------------------------------------

describe('uptime — §3.2 s four forms', () => {
  const cases: readonly [string, Seconds, string][] = [
    ['§3.2 verbatim: a day or more', seconds(2 * 86_400 + 2 * 3_600 + 60), 'up 2 d 02:01'],
    ['exactly one day', seconds(86_400), 'up 1 d 00:00'],
    ['one second short of a day', seconds(86_399), 'up 23:59'],
    ['§3.2 verbatim: between an hour and a day', seconds(2 * 3_600 + 60), 'up 02:01'],
    ['exactly one hour', seconds(3_600), 'up 01:00'],
    ['one second short of an hour', seconds(3_599), 'up 59 min'],
    ['§3.2 verbatim: below an hour', seconds(14 * 60), 'up 14 min'],
    ['§3.2 verbatim: below a minute', seconds(11), 'up <1 min'],
    ['one second short of a minute', seconds(59), 'up <1 min'],
    ['exactly one minute is a minute count, not the sub-minute form', seconds(60), 'up 1 min'],
    ['a box up for zero seconds is still a reading, not an em dash', seconds(0), 'up <1 min'],
    ['a long-lived box', seconds(1_234 * 86_400 + 5 * 3_600), 'up 1234 d 05:00'],
  ];
  test.each(cases)('%s → %s', (_name, input, expected) => {
    expect(formatUptime(input)).toBe(expected);
  });

  test('the reason there are four forms: a fresh boot is not "up 0 d 00:14"', () => {
    expect(formatUptime(seconds(14 * 60))).toBe('up 14 min');
    expect(formatUptime(seconds(14 * 60))).not.toBe('up 0 d 00:14');
  });

  test('…and the fourth form exists because "up 0 min" is that defect one scale down', () => {
    expect(formatUptime(seconds(11))).not.toBe('up 0 min');
    expect(formatUptime(seconds(11))).toBe('up <1 min');
  });

  test('⚠ the sub-minute form is a READING and is not the em dash (§6.5, law 1)', () => {
    // The boundary that matters most here: `up <1 min` says "the box just booted", `—` says
    // "/proc/uptime could not be read". Those demand different reactions.
    expect(formatUptime(seconds(0))).not.toBe(EM_DASH);
    expect(formatUptime(null)).toBe(EM_DASH);
  });

  test('an unread /proc/uptime is the em dash, never "up 0 min"', () => {
    expect(formatUptime(null)).toBe(EM_DASH);
    expect(formatUptime(seconds(Number.NaN))).toBe(EM_DASH);
    expect(formatUptime(seconds(-1))).toBe(EM_DASH);
  });

  test('a day count is not thousands-separated — it is a count of days, not a quantity', () => {
    expect(formatUptime(seconds(1_234 * 86_400))).toContain('1234 d');
  });

  test('truncates rather than rounds, so it never claims a minute that has not elapsed', () => {
    expect(formatUptime(seconds(119))).toBe('up 1 min');
    expect(formatUptime(seconds(3_600 + 119))).toBe('up 01:01');
  });
});

describe('text and the CPU model trim', () => {
  test('§3.2: Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz displays as Xeon W-2135', () => {
    expect(formatCpuModel('Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz')).toBe('Xeon W-2135');
  });

  const cases: readonly [string | null, string][] = [
    ['Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz', 'Xeon W-2135'],
    ['Intel(R) Core(TM) i7-9700K CPU @ 3.60GHz', 'Core i7-9700K'],
    ['  Xeon W-2135  ', 'Xeon W-2135'],
    ['Some Unknown Silicon', 'Some Unknown Silicon'],
    ['', EM_DASH],
    ['   ', EM_DASH],
    [null, EM_DASH],
  ];
  test.each(cases)('%s → %s', (input, expected) => {
    expect(formatCpuModel(input)).toBe(expected);
  });

  const text: readonly [string | null, string][] = [
    ['qwen3.6-27b', 'qwen3.6-27b'],
    ['  ai-server  ', 'ai-server'],
    ['', EM_DASH],
    [null, EM_DASH],
  ];
  test.each(text)('formatText %s → %s', (input, expected) => {
    expect(formatText(input)).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// Locale and unit typing
// ---------------------------------------------------------------------------

describe('locale is pinned to en-US on every viewer (§6.6)', () => {
  test('separators are commas and the decimal mark is a point, whatever the host locale', () => {
    expect(formatRpm(rpm(14451))).toBe('14,451 RPM');
    expect(formatGiB(gib(1234.5))).toBe('1,234.5 GiB');
    expect(formatRpm(rpm(14451))).not.toMatch(/14\.451|14 451/);
  });
});

describe('units are part of the type (§6.6, decision 20)', () => {
  test('a GiB reading cannot be handed to the MiB formatter', () => {
    // @ts-expect-error §6.6 puts three memory units in one snapshot; the brands keep them
    // apart, so this is the compile error that stops 61 GiB rendering as "61 MiB".
    formatMiB(gib(61));
    // @ts-expect-error and the reverse — VRAM MiB is not RAM GiB.
    formatGiB(mib(26452));
  });

  test('a bare number is not a reading', () => {
    // @ts-expect-error the brand is the unit; an unbranded number has not been through a
    // collector and has no unit at all.
    formatRpm(4308);
  });
});

// ---------------------------------------------------------------------------
// §6.2's age indicator, and §6.6's rule about the sign
// ---------------------------------------------------------------------------

describe('the age indicator', () => {
  test.each([
    [0, '0 s'],
    [999, '0 s'],
    [1_000, '1 s'],
    [59_999, '59 s'],
    [60_000, '1:00'],
    [61_500, '1:01'],
    [3_599_000, '59:59'],
    [3_600_000, '1:00:00'],
    [7_384_000, '2:03:04'],
  ])('%d ms renders %s', (ms, expected) => {
    expect(formatAge(ms)).toBe(expected);
  });

  /*
   * ⚠ §6.6: "A negative age never renders as a negative number. A `ts` ahead of the browser's
   * clock is clock skew, not a reading from the future: the age reads `0 s`, and §6.7's
   * `stale` mode says the rest." Both halves are needed — `mode.ts` treats a negative age as
   * not-current, so the clamp hides nothing; it only stops the indicator claiming a reading is
   * fresher than now, which is the one thing it cannot be.
   */
  test.each([-1, -999, -60_000, -2_370_908_800_000])(
    '⚠ clock skew never renders with a minus sign — an age of %d ms',
    (ms) => {
      expect(formatAge(ms)).toBe('0 s');
    },
  );

  test('⚠ null is not an age of zero — before the first sample there is nothing to be old', () => {
    expect(formatAge(null)).toBe(EM_DASH);
    expect(formatAge(Number.NaN)).toBe(EM_DASH);
    expect(formatAge(Number.POSITIVE_INFINITY)).toBe(EM_DASH);
  });
});
