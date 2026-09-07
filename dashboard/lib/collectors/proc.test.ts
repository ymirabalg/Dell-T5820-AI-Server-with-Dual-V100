/**
 * §3.2 and §3.5 — the `/proc`, hostname, operstate and `coretemp` parsers, driven by the
 * box's own files.
 *
 * Every `CAPTURED_*` fixture is literally what `ai-server` printed on 2026-09-06. Where a
 * number below is checked to a decimal place, it is checked against the arithmetic on
 * *that* file rather than against a value copied out of CLAUDE.md.
 */

import { describe, expect, test } from 'vitest';

import { formatCpuModel, formatSwapGiB, formatUptime } from '../format';
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
  CAPTURED_PROC_VERSION,
  CORETEMP_EMPTY_INPUT,
  CORETEMP_NO_PACKAGE,
  EMPTY,
  PROC_CPUINFO_NO_TOPOLOGY,
  PROC_MEMINFO_BAD_VALUES,
  PROC_MEMINFO_NO_MEMAVAILABLE,
  PROC_NET_DEV_JAMMED,
  PROC_NET_DEV_NO_ENO1,
  PROC_NET_DEV_WIDE,
  PROC_STAT_CORRUPT,
  PROC_STAT_NO_AGGREGATE,
  PROC_STAT_TRUNCATED,
} from './samples';
import {
  PACKAGE_LABEL,
  parseCpuinfo,
  parseHostname,
  parseKernelRelease,
  parseLoadavg,
  parseMeminfo,
  parseNetDev,
  parseOperstate,
  parsePackageTempC,
  parseProcStat,
  parseUptime,
} from './proc';

// ---------------------------------------------------------------------------
// /proc/stat
// ---------------------------------------------------------------------------

describe('/proc/stat (§3.2 cpuPct)', () => {
  test('reads the aggregate line off the real file', () => {
    // cpu  624650 1415 556005 96222283 35342 0 55034 0 0 0
    const { value, problems } = parseProcStat(CAPTURED_PROC_STAT);
    expect(problems).toEqual([]);
    // busy = user + nice + system + irq + softirq + steal
    expect(value?.busy).toBe(624650n + 1415n + 556005n + 0n + 55034n + 0n);
    // total = busy + idle + iowait
    expect(value?.total).toBe((value?.busy ?? 0n) + 96222283n + 35342n);
  });

  test('guest and guest_nice are NOT added — the kernel already counts them in user/nice', () => {
    // Both are 0 on the captured file, so a fixture where they are not proves the rule.
    const line = 'cpu  100 100 100 1000 0 0 0 0 500 500\n';
    const { value } = parseProcStat(line);
    // If guest/guest_nice were summed in, busy would be 1300 and total 2300.
    expect(value?.busy).toBe(300n);
    expect(value?.total).toBe(1300n);
  });

  test('§3.2 verbatim: `iowait` is IDLE, not busy — a waiting CPU is not executing', () => {
    // The other half of §3.2's accounting sentence, and the half no captured fixture pins:
    // the box's own /proc/stat has a small iowait, so busy-vs-idle for that column is only
    // visible where it dominates. Misfiling it inflates cpuPct on any IO-bound poll.
    const line = 'cpu  10 0 0 0 90 0 0 0\n';
    const { value } = parseProcStat(line);
    expect(value?.busy).toBe(10n);
    expect(value?.total).toBe(100n);
  });

  test('`cpu0` is not the aggregate — the match is the whole token, not a prefix', () => {
    const { value, problems } = parseProcStat(PROC_STAT_NO_AGGREGATE);
    expect(value).toBeNull();
    expect(problems[0]).toContain('no aggregate');
  });

  test('a truncated file is null, not a partial reading', () => {
    const { value, problems } = parseProcStat(PROC_STAT_TRUNCATED);
    expect(value).toBeNull();
    expect(problems[0]).toContain('usable fields');
  });

  test('a corrupt field fails the whole line rather than being skipped', () => {
    // Dropping `system` silently would understate busy time and show an idle machine
    // under load — a plausible number, which is the worst kind of wrong here.
    const { value, problems } = parseProcStat(PROC_STAT_CORRUPT);
    expect(value).toBeNull();
    expect(problems[0]).toContain('`system` is not a counter');
  });

  test('an empty file is null, not zero jiffies', () => {
    expect(parseProcStat(EMPTY).value).toBeNull();
  });

  test('a genuinely all-zero counter set is a reading', () => {
    // Immediately after boot every field can be 0. That is 0 busy of 0 total, which the
    // delta maths then declines to divide — but the *parse* succeeded.
    const { value, problems } = parseProcStat('cpu  0 0 0 0 0 0 0 0 0 0\n');
    expect(problems).toEqual([]);
    expect(value).toEqual({ busy: 0n, total: 0n });
  });
});

// ---------------------------------------------------------------------------
// /proc/meminfo
// ---------------------------------------------------------------------------

describe('/proc/meminfo (§3.2 RAM and swap)', () => {
  const { value, problems } = parseMeminfo(CAPTURED_PROC_MEMINFO);

  test('no problems on the real file', () => {
    expect(problems).toEqual([]);
  });

  test('memTotal is 61.2 GiB — the 61 GiB CLAUDE.md records', () => {
    expect(value.memTotalGiB).toBeCloseTo(64197644 / 1048576, 6);
    expect(value.memTotalGiB).toBeCloseTo(61.22, 2);
  });

  test('memUsed is MemTotal - MemAvailable, not MemTotal - MemFree', () => {
    expect(value.memUsedGiB).toBeCloseTo((64197644 - 58353620) / 1048576, 6);
    // The wrong derivation would give ~53 GiB — page cache counted as consumption.
    expect(value.memUsedGiB).toBeLessThan(10);
    expect((64197644 - 8280408) / 1048576).toBeGreaterThan(50);
  });

  test('swapTotal is 8 GiB', () => {
    expect(value.swapTotalGiB).toBeCloseTo(8, 5);
  });

  test("swapUsed survives §6.6's 2 dp — 22356 kB must not round to 0.0", () => {
    expect(value.swapUsedGiB).toBeCloseTo(22356 / 1048576, 9);
    // The reason §6.6 gives swap two decimal places rather than RAM's one.
    expect(formatSwapGiB(value.swapUsedGiB)).toBe('0.02 GiB');
  });

  test('MemAvailable absent: used is null, total still reads', () => {
    const partial = parseMeminfo(PROC_MEMINFO_NO_MEMAVAILABLE);
    expect(partial.value.memUsedGiB).toBeNull();
    expect(partial.value.memTotalGiB).toBeCloseTo(61.22, 2);
    expect(partial.problems).toEqual(['`MemAvailable` missing or unreadable']);
  });

  test('an empty value is null, not 0 GiB — and a wrong unit is rejected outright', () => {
    const bad = parseMeminfo(PROC_MEMINFO_BAD_VALUES);
    // `MemTotal:` with nothing after it: Number('') is 0, and `0.0 / 0.0 GiB` is a meter
    // that renders perfectly and says nothing true.
    expect(bad.value.memTotalGiB).toBeNull();
    expect(bad.value.memUsedGiB).toBeNull();
    // `SwapTotal: 8388604 B` read as KiB would be wrong by 1024x and look plausible.
    expect(bad.value.swapTotalGiB).toBeNull();
    expect(bad.problems).toContain('`MemTotal` missing or unreadable');
    expect(bad.problems).toContain('`SwapTotal` missing or unreadable');
  });

  test('a genuinely zero swap usage is 0, not null', () => {
    const none = parseMeminfo(
      'MemTotal:       64197644 kB\nMemAvailable:   58353620 kB\nSwapTotal:       8388604 kB\nSwapFree:        8388604 kB\n',
    );
    expect(none.value.swapUsedGiB).toBe(0);
    expect(formatSwapGiB(none.value.swapUsedGiB)).toBe('0.00 GiB');
  });

  test('an empty file yields four nulls and four problems, and does not throw', () => {
    const nothing = parseMeminfo(EMPTY);
    expect(nothing.value).toEqual({
      memUsedGiB: null,
      memTotalGiB: null,
      swapUsedGiB: null,
      swapTotalGiB: null,
    });
    expect(nothing.problems).toHaveLength(4);
  });
});

// ---------------------------------------------------------------------------
// /proc/loadavg
// ---------------------------------------------------------------------------

describe('/proc/loadavg (§3.2)', () => {
  test('the first three fields of the real file', () => {
    expect(parseLoadavg(CAPTURED_PROC_LOADAVG).value).toEqual([0.34, 0.19, 0.08]);
  });

  test('a genuine 0.00 / 0.00 / 0.00 is a reading', () => {
    expect(parseLoadavg('0.00 0.00 0.00 1/300 1\n').value).toEqual([0, 0, 0]);
  });

  test('all-or-nothing: two readable averages is still null', () => {
    // lib/types.ts: there is no state in which the 5-minute average is readable and the
    // 1-minute average is not, and §6.6 has no rendering for a half-parsed load average.
    const { value, problems } = parseLoadavg('0.34 0.19\n');
    expect(value).toBeNull();
    expect(problems).toHaveLength(1);
  });

  test('an empty file is null, not [0, 0, 0]', () => {
    expect(parseLoadavg(EMPTY).value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// /proc/uptime
// ---------------------------------------------------------------------------

describe('/proc/uptime (§3.2)', () => {
  test('the first field of the real file, floored to whole seconds', () => {
    expect(parseUptime(CAPTURED_PROC_UPTIME).value).toBe(81376);
    expect(formatUptime(parseUptime(CAPTURED_PROC_UPTIME).value)).toBe('up 22:36');
  });

  test('floored, not rounded — 59.7 s is 59 s, and never rounds up to a minute', () => {
    expect(parseUptime('59.7 100.0\n').value).toBe(59);
    // ⚠ Step 3 finding F1, reported not fixed: SPEC.md §3.2 now names a **fourth** form,
    // `up <1 min` below a minute, and `lib/format.ts`'s `formatUptime` still implements
    // three and renders `up 0 min` here. That is step 2's file, so this test asserts only
    // what step 3 owns — the floor — and the rendering is left to the finding.
    expect(parseUptime('59.7 100.0\n').value).toBeLessThan(60);
  });

  test('a machine 0 seconds old reads 0, not null', () => {
    expect(parseUptime('0.00 0.00\n').value).toBe(0);
  });

  test('an empty file is null, not 0 — §6.6 renders it `—`, never `up 0 min`', () => {
    expect(parseUptime(EMPTY).value).toBeNull();
    expect(formatUptime(parseUptime(EMPTY).value)).toBe('—');
  });

  test('a negative uptime is rejected rather than floored further', () => {
    expect(parseUptime('-1.0 0.0\n').value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// /proc/net/dev
// ---------------------------------------------------------------------------

describe('/proc/net/dev (§3.5)', () => {
  test("eno1's byte counters off the real file", () => {
    const { value, problems } = parseNetDev(CAPTURED_PROC_NET_DEV, 'eno1');
    expect(problems).toEqual([]);
    expect(value).toEqual({ rxBytes: 65734369014n, txBytes: 1562741756n });
  });

  test('rx bytes is column 0 and tx bytes is column 8 — not the packet counts beside them', () => {
    const { value } = parseNetDev(CAPTURED_PROC_NET_DEV, 'eno1');
    // The packet counts, if the offsets were wrong by one.
    expect(value?.rxBytes).not.toBe(43716435n);
    expect(value?.txBytes).not.toBe(21488214n);
  });

  test('`lo` is not `eno1` — the interface is matched exactly', () => {
    expect(parseNetDev(CAPTURED_PROC_NET_DEV, 'lo').value?.rxBytes).toBe(327140n);
  });

  test('a name jammed against its colon still parses (the fixed-width column trap)', () => {
    // A whitespace split reads the interface as `enp0s31f6:65734369014` and the rx bytes
    // as the packet count — a wrong number that looks entirely reasonable.
    const { value, problems } = parseNetDev(PROC_NET_DEV_JAMMED, 'enp0s31f6');
    expect(problems).toEqual([]);
    expect(value).toEqual({ rxBytes: 65734369014n, txBytes: 1562741756n });
  });

  test('a missing interface is a problem naming it, not a zero counter', () => {
    const { value, problems } = parseNetDev(PROC_NET_DEV_NO_ENO1, 'eno1');
    expect(value).toBeNull();
    expect(problems).toEqual(['interface `eno1` not present']);
  });

  test('an interface that has genuinely moved no bytes reads 0', () => {
    const quiet =
      'Inter-|   Receive\n face |bytes\n  eno1: 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0\n';
    expect(parseNetDev(quiet, 'eno1').value).toEqual({ rxBytes: 0n, txBytes: 0n });
  });

  test('a short row is a problem, not a partial reading', () => {
    const short = '  eno1: 1 2 3\n';
    expect(parseNetDev(short, 'eno1').problems[0]).toContain('3 columns, need 16');
  });

  /*
   * ⚠ **The other side of the boundary**, and the reason it is here is a rule rather than a
   * hazard: every column-count fixture in this step was a *short* line, so `!==` weakened to
   * `<` survived the whole suite. **Every boundary guard needs a fixture on both sides.**
   *
   * This one is genuinely milder than the `nvidia-smi` case and the difference is worth
   * keeping: rx and tx sit at fixed offsets from the *left* and a new kernel counter would
   * append, so under a weakened guard the two byte counters still came back correct — 
   * nothing shifts and nothing is fabricated. The guard is still an equality, because
   * "seventeen columns" means the file is not the file this parser was written against.
   */
  test('⚠ a SEVENTEEN-column line is a problem too, not a lucky read', () => {
    const { value, problems } = parseNetDev(PROC_NET_DEV_WIDE, 'eno1');
    expect(value).toBeNull();
    expect(problems[0]).toContain('17 columns, need 16');
  });

  test('the exact boundary is a reading — sixteen columns parse', () => {
    // The complement, so "16 is rejected too" cannot pass unnoticed.
    const { value, problems } = parseNetDev(CAPTURED_PROC_NET_DEV, 'eno1');
    expect(problems).toEqual([]);
    expect(value).toEqual({ rxBytes: 65734369014n, txBytes: 1562741756n });
  });

  test('an empty file is null', () => {
    expect(parseNetDev(EMPTY, 'eno1').value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// /proc/cpuinfo
// ---------------------------------------------------------------------------

describe('/proc/cpuinfo (§3.2)', () => {
  const { value, problems } = parseCpuinfo(CAPTURED_PROC_CPUINFO);

  test('no problems on the real file', () => {
    expect(problems).toEqual([]);
  });

  test('12 threads and 6 cores — the W-2135, counted off all twelve blocks', () => {
    expect(value.threads).toBe(12);
    expect(value.cores).toBe(6);
  });

  test('cores counts distinct physical-id/core-id pairs, not `cpu cores`', () => {
    // `cpu cores` reports cores *per socket* and would be wrong on a multi-socket board.
    // Two sockets of two cores each is four cores, and `cpu cores` would still say 2.
    const dual =
      'processor\t: 0\nphysical id\t: 0\ncore id\t: 0\ncpu cores\t: 2\n\n' +
      'processor\t: 1\nphysical id\t: 0\ncore id\t: 1\ncpu cores\t: 2\n\n' +
      'processor\t: 2\nphysical id\t: 1\ncore id\t: 0\ncpu cores\t: 2\n\n' +
      'processor\t: 3\nphysical id\t: 1\ncore id\t: 1\ncpu cores\t: 2\n';
    expect(parseCpuinfo(dual).value.cores).toBe(4);
    expect(parseCpuinfo(dual).value.threads).toBe(4);
  });

  test('cpuModel is carried RAW — the §3.2 trim is the formatter’s job', () => {
    // "A snapshot that has already discarded the text cannot be un-trimmed."
    expect(value.cpuModel).toBe('Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz');
    expect(formatCpuModel(value.cpuModel)).toBe('Xeon W-2135');
  });

  test('no topology: threads still counts, cores is null rather than a guess', () => {
    const bare = parseCpuinfo(PROC_CPUINFO_NO_TOPOLOGY);
    expect(bare.value.threads).toBe(2);
    expect(bare.value.cores).toBeNull();
    expect(bare.problems).toEqual(['no `physical id`/`core id` topology']);
  });

  test('an empty file gives three nulls — never 0 cores, which would render as `0`', () => {
    const nothing = parseCpuinfo(EMPTY);
    expect(nothing.value).toEqual({ cpuModel: null, cores: null, threads: null });
    expect(nothing.problems).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// hostname, kernel, operstate
// ---------------------------------------------------------------------------

describe('/etc/hostname (§3.2)', () => {
  test('the real file', () => {
    expect(parseHostname(CAPTURED_ETC_HOSTNAME).value).toBe('ai-server');
  });

  test('an empty file is null, not the empty string', () => {
    const { value, problems } = parseHostname(EMPTY);
    expect(value).toBeNull();
    expect(problems).toEqual(['empty']);
  });

  test('only the first line, trimmed', () => {
    expect(parseHostname('ai-server\nsomething else\n').value).toBe('ai-server');
  });
});

describe('/proc/version (§3.2 kernel)', () => {
  test('the release off the real file', () => {
    expect(parseKernelRelease(CAPTURED_PROC_VERSION).value).toBe('7.0.0-30-generic');
  });

  test('an empty file is null', () => {
    expect(parseKernelRelease(EMPTY).value).toBeNull();
  });

  test('a line that is not a kernel banner is null, not a fragment of it', () => {
    expect(parseKernelRelease('Darwin Kernel Version 25.5.0\n').value).toBeNull();
  });
});

describe('operstate (§3.5, §3.7)', () => {
  test('the real file', () => {
    expect(parseOperstate(CAPTURED_OPERSTATE).value).toBe('up');
  });

  test("all seven of §3.7's values are accepted", () => {
    for (const s of ['up', 'down', 'unknown', 'dormant', 'notpresent', 'lowerlayerdown', 'testing']) {
      expect(parseOperstate(`${s}\n`).value).toBe(s);
    }
  });

  test('a value outside the vocabulary is null, never passed through', () => {
    // §3.7: "the UI switches on these values and an unmatched one falls through silently."
    // `severityLink` would give it no band and §6.3's eno1 row would be uncoloured.
    const { value, problems } = parseOperstate('UP\n');
    expect(value).toBeNull();
    expect(problems[0]).toContain('`UP`');
  });

  test('an empty file is null', () => {
    expect(parseOperstate(EMPTY).value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// coretemp
// ---------------------------------------------------------------------------

describe('coretemp (§3.2 cpuTempC)', () => {
  test('Package id 0 off the real node — 31000 millidegrees is 31 °C', () => {
    const { value, problems } = parsePackageTempC(CAPTURED_CORETEMP);
    expect(problems).toEqual([]);
    expect(value).toBe(31);
  });

  test('found by LABEL, not by index — temp1 being the package is not a promise', () => {
    // Same node with the package moved to temp7 and a core at temp1. An index-based
    // reader would return 30 °C from `Core 0`.
    const shuffled: Record<string, string> = {
      temp1_label: 'Core 0\n',
      temp1_input: '30000\n',
      temp7_label: `${PACKAGE_LABEL}\n`,
      temp7_input: '55000\n',
    };
    expect(parsePackageTempC(shuffled).value).toBe(55);
  });

  test('an empty input file is null, not 0 °C (HANDOVER O6 in its CPU form)', () => {
    // `Number('')` is 0, and `0 °C` on a Xeon is both perfectly formattable and false.
    const { value, problems } = parsePackageTempC(CORETEMP_EMPTY_INPUT);
    expect(value).toBeNull();
    expect(problems[0]).toContain('temp1_input');
  });

  test('no Package id 0 anywhere is null plus a problem naming the label', () => {
    const { value, problems } = parsePackageTempC(CORETEMP_NO_PACKAGE);
    expect(value).toBeNull();
    expect(problems[0]).toContain(PACKAGE_LABEL);
  });

  test('a label with no matching input is null, and says which file was missing', () => {
    const { value, problems } = parsePackageTempC({ temp1_label: `${PACKAGE_LABEL}\n` });
    expect(value).toBeNull();
    expect(problems[0]).toContain('has no `temp1_input`');
  });

  test('a genuine 0 °C is a reading', () => {
    const cold = { temp1_label: `${PACKAGE_LABEL}\n`, temp1_input: '0\n' };
    expect(parsePackageTempC(cold).value).toBe(0);
  });

  test('precision is carried, not rounded — §6.6 owns the integer rendering', () => {
    const odd = { temp1_label: `${PACKAGE_LABEL}\n`, temp1_input: '42500\n' };
    expect(parsePackageTempC(odd).value).toBe(42.5);
  });

  test('an empty node is null', () => {
    expect(parsePackageTempC({}).value).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Cross-parser
// ---------------------------------------------------------------------------

describe('no parser throws, on any of the fixtures', () => {
  // Invariant 5: "A failed reading is a partial snapshot plus an `errors[]` entry — never
  // a 500." A parser that throws on a corrupt file makes that impossible one layer up.
  const junk = [
    EMPTY,
    '\0\0\0',
    'x'.repeat(10000),
    CAPTURED_NVIDIA_SMI, // deliberately the wrong file for every parser below
    CAPTURED_PROC_STAT,
    CAPTURED_PROC_CPUINFO,
  ];
  const parsers: readonly [string, (t: string) => unknown][] = [
    ['parseProcStat', parseProcStat],
    ['parseMeminfo', parseMeminfo],
    ['parseLoadavg', parseLoadavg],
    ['parseUptime', parseUptime],
    ['parseNetDev', (t) => parseNetDev(t, 'eno1')],
    ['parseCpuinfo', parseCpuinfo],
    ['parseHostname', parseHostname],
    ['parseKernelRelease', parseKernelRelease],
    ['parseOperstate', parseOperstate],
  ];
  for (const [name, parse] of parsers) {
    test(`${name} survives every one`, () => {
      for (const text of junk) expect(() => parse(text)).not.toThrow();
    });
  }
});
