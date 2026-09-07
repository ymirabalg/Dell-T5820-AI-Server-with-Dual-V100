/**
 * `numbers.ts` — invariant 1 at parse time.
 *
 * > "`null` is not `0`. A fan reading 0 is a dead fan; a fan reading nothing is a driver
 * > that did not load. Conflating them is the single worst bug this project can ship."
 *
 * HANDOVER O6/O7 put the enforcement here rather than downstream, because **no formatter
 * guard can catch a finite-but-wrong zero**: `0 RPM`, `0.0 %` and `0 °C` are all perfectly
 * legal renderings of a real reading. The table below is every JavaScript conversion that
 * produces one from nothing, asserted to return `null` instead — and, paired with it, the
 * same inputs' genuine zeros asserted to survive.
 */

import { describe, expect, test } from 'vitest';

import {
  fields,
  isNotAReading,
  lines,
  parseCounter,
  parseDecimalStrict,
  parseIntegerStrict,
  parseText,
} from './numbers';

/**
 * The inputs that JavaScript turns into a number and this project must not. The
 * `builtin` column records what would have happened, so the test states the danger rather
 * than merely asserting an outcome.
 */
const NOTHING: readonly { raw: string | undefined; builtin: string }[] = [
  { raw: '', builtin: "Number('') === 0" },
  { raw: ' ', builtin: "Number(' ') === 0" },
  { raw: '\n', builtin: "Number('\\n') === 0" },
  { raw: '\t  \n', builtin: 'Number(whitespace) === 0' },
  { raw: undefined, builtin: 'noUncheckedIndexedAccess gives undefined; Number(undefined) is NaN' },
];

describe('the empty-string trap (invariant 1, HANDOVER O6/O7)', () => {
  test('Number() really does turn nothing into zero — the premise of this module', () => {
    // If this ever stops being true the guards below become dead weight, and a future
    // reader deserves to see the reason they exist rather than take it on faith.
    expect(Number('')).toBe(0);
    expect(Number(' ')).toBe(0);
    expect(Number('\n')).toBe(0);
    expect(Number(null)).toBe(0);
  });

  for (const { raw, builtin } of NOTHING) {
    test(`${JSON.stringify(raw)} is null, not 0 — ${builtin}`, () => {
      expect(parseIntegerStrict(raw)).toBeNull();
      expect(parseDecimalStrict(raw)).toBeNull();
      expect(parseCounter(raw)).toBeNull();
      expect(parseText(raw)).toBeNull();
    });
  }

  test('a genuine zero survives every parser', () => {
    expect(parseIntegerStrict('0')).toBe(0);
    expect(parseDecimalStrict('0')).toBe(0);
    expect(parseDecimalStrict('0.00')).toBe(0);
    expect(parseCounter('0')).toBe(0n);
    // …and it is 0, not null, so `Object.is` distinguishes it from the rows above.
    expect(parseIntegerStrict('0')).not.toBeNull();
  });
});

describe('parseIntegerStrict', () => {
  const cases: readonly [string, number | null][] = [
    ['0', 0],
    ['12', 12],
    ['-3', -3],
    ['+7', 7],
    ['  5  ', 5],
    // parseInt('12abc') is 12 — a unit left attached to a value.
    ['12abc', null],
    ['12 MiB', null],
    ['1.0', null],
    ['1e3', null],
    // Number('0x10') is 16 — a hex mask read as a count.
    ['0x10', null],
    ['1_000', null],
    ['NaN', null],
    ['Infinity', null],
    ['-', null],
    // Beyond 2^53 an index is evidence of corruption, not a large machine.
    ['9007199254740993', null],
  ];
  for (const [raw, want] of cases) {
    test(`${JSON.stringify(raw)} → ${want}`, () => {
      expect(parseIntegerStrict(raw)).toBe(want);
    });
  }
});

describe('parseDecimalStrict', () => {
  const cases: readonly [string, number | null][] = [
    ['0', 0],
    ['39.25', 39.25],
    ['-0.04', -0.04],
    ['.5', 0.5],
    ['1e3', 1000],
    ['31000', 31000],
    ['  0.48 ', 0.48],
    // parseFloat('1.2.3') is 1.2 — a corrupted line silently truncated.
    ['1.2.3', null],
    ['39.25 W', null],
    ['Infinity', null],
    ['-Infinity', null],
    ['NaN', null],
    ['0x1', null],
    ['1e999', null],
  ];
  for (const [raw, want] of cases) {
    test(`${JSON.stringify(raw)} → ${want}`, () => {
      expect(parseDecimalStrict(raw)).toBe(want);
    });
  }
});

describe('parseCounter — exact 64-bit /proc counters', () => {
  test('a value past Number.MAX_SAFE_INTEGER is exact, where a double would round', () => {
    const raw = '18446744073709551615'; // 2^64 - 1, the widest an unsigned long long goes
    expect(parseCounter(raw)).toBe(18446744073709551615n);
    // The reason bigint is used at all: the double is not this number.
    expect(Number(raw)).not.toBe(18446744073709551615n);
  });

  test('rejects a negative — /proc counters are unsigned, so a sign means a bad read', () => {
    expect(parseCounter('-1')).toBeNull();
  });

  test('rejects a decimal', () => {
    expect(parseCounter('1.0')).toBeNull();
  });
});

describe('parseText', () => {
  test('trims and keeps', () => {
    expect(parseText('  ai-server\n')).toBe('ai-server');
  });

  test('an empty file is null, not the empty string', () => {
    // §6.6 renders null as `—`; '' renders as a blank cell, which §6.6 forbids.
    expect(parseText('')).toBeNull();
    expect(parseText('   \n ')).toBeNull();
  });

  test('a string that would parse as a number is still text', () => {
    expect(parseText('0')).toBe('0');
  });
});

describe("isNotAReading — nvidia-smi's bracketed placeholders", () => {
  for (const raw of ['[N/A]', '[Not Supported]', '[Insufficient Permissions]', '[Unknown Error]']) {
    test(`${raw} is not a reading`, () => {
      expect(isNotAReading(raw)).toBe(true);
    });
  }

  test('an unlisted bracketed placeholder is caught by shape, not by a fixed list', () => {
    expect(isNotAReading('[Some Future Placeholder]')).toBe(true);
  });

  test('empty and absent cells are not readings', () => {
    expect(isNotAReading('')).toBe(true);
    expect(isNotAReading('  ')).toBe(true);
    expect(isNotAReading(undefined)).toBe(true);
  });

  test('a real value is a reading, including zero', () => {
    expect(isNotAReading('0')).toBe(false);
    expect(isNotAReading('Tesla PG500-216')).toBe(false);
  });
});

describe('fields and lines', () => {
  test("splits /proc/stat's TWO spaces after `cpu` into four fields, not five", () => {
    // 'cpu  1 2 3'.split(' ') gives ['cpu','','1','2','3'] — a phantom empty field that
    // shifts every subsequent index by one.
    expect(fields('cpu  1 2 3')).toEqual(['cpu', '1', '2', '3']);
    expect('cpu  1 2 3'.split(' ')).toHaveLength(5);
  });

  test('an empty line has no fields, rather than one empty field', () => {
    expect(fields('')).toEqual([]);
    expect(fields('   ')).toEqual([]);
  });

  test('lines drops blanks and survives CRLF and a trailing newline', () => {
    expect(lines('a\r\nb\n\n')).toEqual(['a', 'b']);
  });
});
