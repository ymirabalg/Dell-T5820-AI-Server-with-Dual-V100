/**
 * §3.7 — the throttle-mask decoder.
 *
 * Two properties matter more than the happy path and are tested hardest: an **unknown**
 * bit must survive decoding (dropping it would report a throttling card as unthrottled),
 * and `0x4` must stay neutral (styling the routine 250 W power cap as a warning would
 * make the dashboard cry wolf on every poll of a healthy box).
 */

import { describe, expect, test } from 'vitest';

import {
  NOT_A_FAULT_NOTE,
  THROTTLE_ALARM_BITS,
  decodeThrottleMask,
  parseThrottleMask,
} from './throttle';
import { THERMAL_THROTTLE_BITS, THROTTLE_REASONS, throttleMask } from './types';
import type { Severity } from './types';

const decode = (mask: string) => decodeThrottleMask(throttleMask(mask));

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

describe('parsing a mask', () => {
  const good: readonly [string, bigint][] = [
    ['0x0', 0n],
    ['0x0000000000000000', 0n],
    ['0x4', 4n],
    ['0X4', 4n],
    ['0x2c', 0x2cn],
    ['0x2C', 0x2cn],
    [' 0x4 ', 4n],
    ['4', 4n],
    ['0x8000000000000000', 0x8000000000000000n],
  ];
  test.each(good)('%s parses to %s', (input, expected) => {
    expect(parseThrottleMask(throttleMask(input))).toBe(expected);
  });

  const bad: readonly string[] = ['', '   ', '[N/A]', 'banana', '0x', '0xzz', '-0x4', '0x4 0x8'];
  test.each(bad)('%s is not a mask and decodes to null, never to 0', (input) => {
    expect(parseThrottleMask(throttleMask(input))).toBeNull();
    expect(decode(input)).toBeNull();
  });

  test('no reading is null; a zero mask is a complete reading', () => {
    expect(parseThrottleMask(null)).toBeNull();
    expect(decodeThrottleMask(null)).toBeNull();
    expect(decode('0x0')?.mask).toBe(0n);
  });

  test('an unparseable mask does not claim the card is healthy', () => {
    // A collector that could not read the column must send `null` (§4); this is the
    // backstop, and it must not decode to "no reasons active".
    expect(decode('[N/A]')).toBeNull();
    expect(decode('[N/A]')).not.toEqual(decode('0x0'));
  });
});

// ---------------------------------------------------------------------------
// §3.7's table, swept
// ---------------------------------------------------------------------------

describe("§3.7's eight bits, one at a time", () => {
  const cases: readonly [string, string, string, Severity][] = [
    ['0x1', '0x1', 'gpu idle', 'normal'],
    ['0x2', '0x2', 'applications clocks setting', 'normal'],
    ['0x4', '0x4', 'sw power cap', 'normal'],
    ['0x8', '0x8', 'hw slowdown', 'alarm'],
    ['0x20', '0x20', 'sw thermal slowdown', 'alarm'],
    ['0x40', '0x40', 'hw thermal slowdown', 'alarm'],
    ['0x80', '0x80', 'hw power brake slowdown', 'alarm'],
    ['0x100', '0x100', 'display clock setting', 'normal'],
  ];

  test.each(cases)('%s decodes to "%s %s" (%s)', (mask, code, name, severity) => {
    const decoded = decode(mask);
    expect(decoded?.reasons).toHaveLength(1);
    const reason = decoded?.reasons[0];
    expect(reason?.code).toBe(code);
    expect(reason?.name).toBe(name);
    expect(reason?.known).toBe(true);
    expect(reason?.severity).toBe(severity);
    expect(reason?.label).toBe(`${code} ${name}`);
    expect(decoded?.severity).toBe(severity);
  });

  test('§3.7 renders a bit as code + name — 0x20 sw thermal slowdown', () => {
    expect(decode('0x20')?.reasons[0]?.label).toBe('0x20 sw thermal slowdown');
  });

  test('every reason in the vocabulary decodes to itself', () => {
    expect(THROTTLE_REASONS).toHaveLength(8);
    for (const reason of THROTTLE_REASONS) {
      const decoded = decode(`0x${reason.bit.toString(16)}`);
      expect(decoded?.reasons).toHaveLength(1);
      expect(decoded?.reasons[0]?.name).toBe(reason.name);
      expect(decoded?.reasons[0]?.bit).toBe(BigInt(reason.bit));
    }
  });
});

describe('the alarm set — §6.3: 0x8, 0x20, 0x40, 0x80', () => {
  test('all four are alarm, and they are the only alarms in the table', () => {
    expect(THROTTLE_ALARM_BITS).toBe(0x8n | 0x20n | 0x40n | 0x80n);
    for (const bit of [0x8n, 0x20n, 0x40n, 0x80n]) {
      expect(THROTTLE_ALARM_BITS & bit).toBe(bit);
    }
    for (const bit of [0x1n, 0x2n, 0x4n, 0x100n]) {
      expect(THROTTLE_ALARM_BITS & bit).toBe(0n);
    }
  });

  test('0x80 is in the alarm set even though it is not thermal', () => {
    // §3.7 as amended: "the three thermal bits plus the power brake, which is an external
    // electrical fault and no less serious. All four raise §6.4's banner."
    expect(decode('0x80')?.severity).toBe('alarm');
    expect(THROTTLE_ALARM_BITS & 0x80n).toBe(0x80n);
    // `types.ts`'s THERMAL_THROTTLE_BITS answers a different question and excludes it.
    expect(BigInt(THERMAL_THROTTLE_BITS) & 0x80n).toBe(0n);
    expect(THROTTLE_ALARM_BITS).not.toBe(BigInt(THERMAL_THROTTLE_BITS));
  });
});

// ---------------------------------------------------------------------------
// Unknown bits — the rule the decoder exists for
// ---------------------------------------------------------------------------

describe('a bit not in §3.7 renders 0x<hex> unknown and is treated as WATCH', () => {
  test('0x10 — NVML sync boost, which §3.7 does not list', () => {
    const decoded = decode('0x10');
    expect(decoded?.reasons).toHaveLength(1);
    expect(decoded?.reasons[0]?.label).toBe('0x10 unknown');
    expect(decoded?.reasons[0]?.known).toBe(false);
    expect(decoded?.reasons[0]?.severity).toBe('watch');
    expect(decoded?.severity).toBe('watch');
  });

  test('it is never silently dropped — that would report a throttling card as healthy', () => {
    const decoded = decode('0x14');
    expect(decoded?.reasons.map((r) => r.code)).toEqual(['0x4', '0x10']);
    expect(decoded?.notable).toBe(true);
  });

  test('watch, not alarm: an unknown reason is not evidence of a thermal event', () => {
    expect(decode('0x10')?.severity).not.toBe('alarm');
  });

  test('a known alarm bit outranks an unknown one', () => {
    expect(decode('0x30')?.severity).toBe('alarm');
    expect(decode('0x30')?.reasons.map((r) => r.severity)).toEqual(['watch', 'alarm']);
  });

  test('a 64-bit unknown bit keeps its exact code — Number would round it away', () => {
    const decoded = decode('0x8000000000000000');
    expect(decoded?.reasons[0]?.code).toBe('0x8000000000000000');
    expect(decoded?.reasons[0]?.bit).toBe(0x8000000000000000n);
    expect(decoded?.severity).toBe('watch');
    expect(Number(0x8000000000000001n)).toBe(Number(0x8000000000000000n));
  });
});

// ---------------------------------------------------------------------------
// Whole masks
// ---------------------------------------------------------------------------

describe('combinations, the note, and what §6.2 shows at all', () => {
  test('an empty mask has no reasons and carries §3.7\'s note', () => {
    const decoded = decode('0x0000000000000000');
    expect(decoded?.reasons).toEqual([]);
    expect(decoded?.severity).toBe('normal');
    expect(decoded?.note).toBe(NOT_A_FAULT_NOTE);
    expect(decoded?.notable).toBe(false);
  });

  test('0x4 alone carries the note and is not news', () => {
    const decoded = decode('0x4');
    expect(decoded?.note).toBe(NOT_A_FAULT_NOTE);
    expect(decoded?.notable).toBe(false);
  });

  const noNote: readonly string[] = ['0x1', '0x5', '0x8', '0x24', '0x10'];
  test.each(noNote)('%s does NOT carry the "normal, not a fault" note', (mask) => {
    expect(decode(mask)?.note).toBeNull();
  });

  test('anything other than 0x4 is notable, so §6.2 shows the reasons', () => {
    expect(decode('0x5')?.notable).toBe(true);
    expect(decode('0x24')?.notable).toBe(true);
    expect(decode('0x4')?.notable).toBe(false);
  });

  test('reasons come back in ascending bit order, known and unknown interleaved', () => {
    expect(decode('0xa4')?.reasons.map((r) => r.code)).toEqual(['0x4', '0x20', '0x80']);
    expect(decode('0x1f4')?.reasons.map((r) => r.code)).toEqual([
      '0x4',
      '0x10',
      '0x20',
      '0x40',
      '0x80',
      '0x100',
    ]);
  });

  test('the power cap alongside a thermal slowdown is an alarm, and both are listed', () => {
    const decoded = decode('0x24');
    expect(decoded?.severity).toBe('alarm');
    expect(decoded?.reasons.map((r) => r.label)).toEqual([
      '0x4 sw power cap',
      '0x20 sw thermal slowdown',
    ]);
  });
});
