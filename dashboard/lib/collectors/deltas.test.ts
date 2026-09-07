/**
 * §6.7's deltas — "**First sample:** `cpuPct` and network rates are deltas and need two
 * samples. They render `—` until the second poll arrives, never `0`" — and HANDOVER O7,
 * "clamp `cpuPct` and the network rates, or send `null`".
 *
 * The two rules pull in opposite directions and both have to hold at once: a *real* zero
 * (an idle CPU, a silent link) must survive as `0`, and a *fake* zero (no previous sample,
 * a counter that went backwards, no elapsed time) must be `null`. Every test below is one
 * side or the other of that line.
 */

import { describe, expect, test } from 'vitest';

import { formatBytesPerSecond, formatPercent } from '../format';
import { NO_DELTAS, advanceDeltas, cpuPctBetween, netRatesBetween } from './deltas';
import type { DeltaSample } from './deltas';
import { parseNetDev, parseProcStat } from './proc';
import { CAPTURED_PROC_NET_DEV, CAPTURED_PROC_STAT } from './samples';

const cpu = (busy: bigint, total: bigint) => ({ busy, total });
const sample = (atMs: number, s: Partial<DeltaSample> = {}): DeltaSample => ({
  atMs,
  cpu: s.cpu ?? null,
  net: s.net ?? null,
});

describe('the first sample (§6.7)', () => {
  test('no previous sample means every delta is null, never 0', () => {
    const now = sample(1000, { cpu: cpu(100n, 1000n), net: { rxBytes: 5n, txBytes: 6n } });
    expect(advanceDeltas(null, now)).toEqual(NO_DELTAS);
    expect(advanceDeltas(null, now).cpuPct).toBeNull();
    expect(advanceDeltas(null, now).rxBytesPerSec).toBeNull();
    expect(advanceDeltas(null, now).txBytesPerSec).toBeNull();
  });

  test('and it renders as an em dash, not `0.0 %` / `0 B/s`', () => {
    // The point of the rule: a dashboard that shows 0 % on its first frame is claiming a
    // measurement it has not made.
    expect(formatPercent(NO_DELTAS.cpuPct)).toBe('—');
    expect(formatBytesPerSecond(NO_DELTAS.rxBytesPerSec)).toBe('—');
  });

  test('the second poll produces readings from the same pair of samples', () => {
    const a = sample(1000, { cpu: cpu(100n, 1000n), net: { rxBytes: 0n, txBytes: 0n } });
    const b = sample(6000, { cpu: cpu(200n, 1400n), net: { rxBytes: 5000n, txBytes: 1000n } });
    expect(advanceDeltas(a, b)).toEqual({
      cpuPct: 25,
      rxBytesPerSec: 1000,
      txBytesPerSec: 200,
    });
  });
});

describe('cpuPct', () => {
  test('busy / total, as a percentage', () => {
    expect(cpuPctBetween(cpu(0n, 0n), cpu(25n, 100n))).toBe(25);
    expect(cpuPctBetween(cpu(1000n, 4000n), cpu(1500n, 6000n))).toBe(25);
  });

  test('a genuinely idle CPU reads 0, and 0 is a reading', () => {
    // The other half of invariant 1: this must NOT be null.
    const pct = cpuPctBetween(cpu(100n, 1000n), cpu(100n, 2000n));
    expect(pct).toBe(0);
    expect(pct).not.toBeNull();
    expect(formatPercent(pct)).toBe('0.0 %');
  });

  test('a fully pinned CPU reads 100', () => {
    expect(cpuPctBetween(cpu(0n, 0n), cpu(1000n, 1000n))).toBe(100);
  });

  test('⚠ O7 — a backwards busy counter is null, not a negative percentage', () => {
    // "a negative percentage reaching the UI is a step-3 defect." The formatter
    // deliberately does not hide it, so the collector must not produce it.
    const pct = cpuPctBetween(cpu(200n, 1000n), cpu(100n, 2000n));
    expect(pct).toBeNull();
    expect(formatPercent(pct)).toBe('—');
  });

  test('⚠ O7 — a backwards total counter is null too', () => {
    expect(cpuPctBetween(cpu(100n, 2000n), cpu(150n, 1000n))).toBeNull();
  });

  test('⚠ null, not clamped to 0 — clamping would forge an idle CPU out of a bad read', () => {
    // Both are permitted by O7. `null` is chosen because `0.0 %` is a *reading* (see the
    // idle case above) and a backwards counter is not. This test is what pins the choice.
    expect(cpuPctBetween(cpu(200n, 1000n), cpu(100n, 2000n))).not.toBe(0);
  });

  test('a total that did not advance is null — 0/0 is NaN, and percent(NaN) type-checks', () => {
    const pct = cpuPctBetween(cpu(100n, 1000n), cpu(100n, 1000n));
    expect(pct).toBeNull();
    expect(Number.isNaN(pct as unknown as number)).toBe(false);
  });

  test('either sample absent is null', () => {
    expect(cpuPctBetween(null, cpu(1n, 2n))).toBeNull();
    expect(cpuPctBetween(cpu(1n, 2n), null)).toBeNull();
    expect(cpuPctBetween(null, null)).toBeNull();
  });

  test('a result outside 0–100 is null rather than a plausible-looking number', () => {
    // Unreachable while busy ⊆ total, which is true by construction today. It stopped
    // being true once when /proc/stat gained a field, and 130 % renders perfectly.
    expect(cpuPctBetween(cpu(0n, 0n), cpu(2000n, 1000n))).toBeNull();
  });

  test('is exact across counters larger than 2^53', () => {
    // The reason the counters are bigint: as doubles, both samples round to the same
    // value and the delta becomes 0 — a busy machine reported idle.
    const base = 9007199254740992n; // 2^53, the last integer a double counts by ones
    const pct = cpuPctBetween(cpu(base, base * 2n), cpu(base + 50n, base * 2n + 100n));
    expect(pct).toBe(50);
    // …the rounding this avoids: as doubles, these two counters are the same number.
    expect(Number(base)).toBe(Number(base + 1n));
  });

  test('a delta too large to convert exactly is null, not a rounded rate', () => {
    expect(cpuPctBetween(cpu(0n, 0n), cpu(1n, 2n ** 60n))).toBeNull();
  });
});

describe('network rates', () => {
  const netAt = (atMs: number, rx: bigint, tx: bigint): DeltaSample =>
    sample(atMs, { net: { rxBytes: rx, txBytes: tx } });

  test('bytes per second over the wall-clock interval', () => {
    const rates = netRatesBetween(netAt(0, 0n, 0n), netAt(5000, 5_000_000n, 250_000n));
    expect(rates).toEqual({ rxBytesPerSec: 1_000_000, txBytesPerSec: 50_000 });
    // §6.6 auto-scales for display; the collector's unit is B/s.
    expect(formatBytesPerSecond(rates.rxBytesPerSec)).toBe('1.0 MB/s');
  });

  test('a genuinely silent link reads 0 B/s, and 0 is a reading', () => {
    const rates = netRatesBetween(netAt(0, 100n, 200n), netAt(5000, 100n, 200n));
    expect(rates).toEqual({ rxBytesPerSec: 0, txBytesPerSec: 0 });
    // §6.6 auto-scales, and step 2 chose KB/s as the floor unit; the point here is that
    // it renders a numeral with a unit at all rather than the em dash a `null` would give.
    expect(formatBytesPerSecond(rates.rxBytesPerSec)).toBe('0 KB/s');
    expect(formatBytesPerSecond(null)).toBe('—');
  });

  test('⚠ O7 — a wrapped or reset counter is null, not 0 and not negative', () => {
    const rates = netRatesBetween(netAt(0, 5_000n, 5_000n), netAt(5000, 10n, 5_100n));
    expect(rates.rxBytesPerSec).toBeNull();
    // …and the direction that did NOT wrap still reports. The two are independent.
    expect(rates.txBytesPerSec).toBe(20);
  });

  test('a zero-length interval is null — not Infinity, not 0', () => {
    const rates = netRatesBetween(netAt(1000, 0n, 0n), netAt(1000, 500n, 500n));
    expect(rates).toEqual({ rxBytesPerSec: null, txBytesPerSec: null });
  });

  test('a clock that went backwards is null — that is an NTP step, not a measurement', () => {
    const rates = netRatesBetween(netAt(5000, 0n, 0n), netAt(1000, 500n, 500n));
    expect(rates).toEqual({ rxBytesPerSec: null, txBytesPerSec: null });
  });

  test('either sample missing its counters is null', () => {
    expect(netRatesBetween(sample(0), netAt(5000, 1n, 1n))).toEqual({
      rxBytesPerSec: null,
      txBytesPerSec: null,
    });
    expect(netRatesBetween(netAt(0, 1n, 1n), sample(5000))).toEqual({
      rxBytesPerSec: null,
      txBytesPerSec: null,
    });
  });

  test('is exact across counters larger than 2^53', () => {
    const base = 9_007_199_254_740_993n;
    const rates = netRatesBetween(netAt(0, base, base), netAt(1000, base + 1000n, base + 2000n));
    expect(rates).toEqual({ rxBytesPerSec: 1000, txBytesPerSec: 2000 });
  });
});

describe('end to end from the captured files', () => {
  test('two real /proc reads five seconds apart produce real figures', () => {
    // The counters are the box's own; the second sample advances them by a hand-chosen
    // amount, because two captures cannot be taken at a controlled interval over SSH.
    const cpuNow = parseProcStat(CAPTURED_PROC_STAT).value;
    const netNow = parseNetDev(CAPTURED_PROC_NET_DEV, 'eno1').value;
    expect(cpuNow).not.toBeNull();
    expect(netNow).not.toBeNull();

    const first: DeltaSample = { atMs: 0, cpu: cpuNow, net: netNow };
    const second: DeltaSample = {
      atMs: 5000,
      // 5 s at 100 Hz across 12 threads is 6000 jiffies; 900 of them busy is 15 %.
      cpu: { busy: (cpuNow?.busy ?? 0n) + 900n, total: (cpuNow?.total ?? 0n) + 6000n },
      net: {
        rxBytes: (netNow?.rxBytes ?? 0n) + 5_000_000n,
        txBytes: (netNow?.txBytes ?? 0n) + 500_000n,
      },
    };

    const d = advanceDeltas(first, second);
    expect(d.cpuPct).toBeCloseTo(15, 10);
    expect(d.rxBytesPerSec).toBe(1_000_000);
    expect(d.txBytesPerSec).toBe(100_000);
    expect(formatPercent(d.cpuPct)).toBe('15.0 %');
  });

  test("the box's own counters are large enough that the bigint path matters", () => {
    // 65,734,369,014 rx bytes is well inside 2^53, but /proc/stat's totals grow forever
    // and this asserts the parse is exact rather than merely close.
    expect(parseNetDev(CAPTURED_PROC_NET_DEV, 'eno1').value?.rxBytes).toBe(65734369014n);
  });
});
