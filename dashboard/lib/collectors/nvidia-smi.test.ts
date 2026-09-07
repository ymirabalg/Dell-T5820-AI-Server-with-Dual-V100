/**
 * §3.1 — the `nvidia-smi` CSV parser, driven by the box's own output.
 *
 * `CAPTURED_NVIDIA_SMI` is literally what `ai-server` printed on 2026-09-06 with both
 * V100s idle. The failure rows are that text with one named mutation each, because the
 * states §3.1 and §6.5 care about — a card that disappears, a column that will not parse —
 * cannot be captured from a healthy machine.
 */

import { describe, expect, test } from 'vitest';

import { throttleMask } from '../types';
import { decodeThrottleMask } from '../throttle';
import {
  CAPTURED_NVIDIA_SMI,
  EMPTY,
  NVIDIA_SMI_ALL_ZERO,
  NVIDIA_SMI_BAD_INDEX,
  NVIDIA_SMI_NA_COLUMNS,
  NVIDIA_SMI_ONE_CARD,
  NVIDIA_SMI_SHORT_ROW,
  NVIDIA_SMI_TRUNCATED_ROW,
  NVIDIA_SMI_UTIL_AT_BOUNDS,
  NVIDIA_SMI_UTIL_OVER_RANGE,
  NVIDIA_SMI_UTIL_UNDER_RANGE,
  NVIDIA_SMI_WIDE_ROW,
  NVIDIA_SMI_WITH_BANNER,
} from './samples';
import { NVIDIA_SMI_ARGS, NVIDIA_SMI_FIELDS, parseNvidiaSmiCsv } from './nvidia-smi';

describe('the query itself (§3.1)', () => {
  test("the eleven fields are §3.1's table, in §3.1's order", () => {
    // The parser reads columns by position, so this list and the parser are one unit.
    expect([...NVIDIA_SMI_FIELDS]).toEqual([
      'index',
      'name',
      'pci.bus_id',
      'temperature.gpu',
      'power.draw',
      'power.limit',
      'memory.used',
      'memory.total',
      'utilization.gpu',
      'clocks.sm',
      'clocks_throttle_reasons.active',
    ]);
  });

  test('csv,noheader,nounits — §6.6 fixes the unit per figure, so units are not parsed', () => {
    expect(NVIDIA_SMI_ARGS).toEqual([
      `--query-gpu=${NVIDIA_SMI_FIELDS.join(',')}`,
      '--format=csv,noheader,nounits',
    ]);
  });
});

describe('the captured output — both V100s, idle', () => {
  const { value: gpus, problems } = parseNvidiaSmiCsv(CAPTURED_NVIDIA_SMI);

  test('two cards, no problems', () => {
    expect(problems).toEqual([]);
    expect(gpus).toHaveLength(2);
  });

  test('every column of GPU 0, as the driver printed it', () => {
    expect(gpus[0]).toEqual({
      index: 0,
      name: 'Tesla PG500-216',
      bus: '00000000:17:00.0',
      tempC: 38,
      powerW: 39.25,
      powerCapW: 250,
      memUsedMiB: 26456,
      memTotalMiB: 32768,
      utilPct: 0,
      smClockMHz: 1260,
      throttleReasons: '0x0000000000000000',
    });
  });

  test('GPU 1 keeps its own identity — the two rows are not merged or reordered', () => {
    expect(gpus[1]?.index).toBe(1);
    expect(gpus[1]?.bus).toBe('00000000:97:00.0');
    expect(gpus[1]?.memUsedMiB).toBe(26650);
  });

  test('utilPct 0 is a reading, not an absence — both cards are genuinely idle', () => {
    // The whole of invariant 1 in one column: `0` here means idle, `null` would mean the
    // column could not be read, and §6.6 renders them `0.0 %` and `—`.
    expect(gpus[0]?.utilPct).toBe(0);
    expect(gpus[0]?.utilPct).not.toBeNull();
  });

  test('the throttle mask is carried raw and decodes through lib/throttle.ts', () => {
    const decoded = decodeThrottleMask(gpus[0]?.throttleReasons ?? null);
    expect(decoded?.mask).toBe(0n);
    expect(decoded?.severity).toBe('normal');
    expect(decoded?.reasons).toEqual([]);
  });

  test('bus is the full domain form the driver actually prints, not §3.1’s example', () => {
    // §3.1's note says `97:00.0`; NVIDIA-SMI 580.173.02 prints `00000000:97:00.0`. Carried
    // raw — trimming it here would be inventing a rule the spec does not state, and §9
    // says the card's id is read at runtime and never assumed.
    expect(gpus[1]?.bus).toBe('00000000:97:00.0');
  });
});

describe('invariant 1 across the eleven columns', () => {
  // Same shape, same column count. One row is all-`null`, the other all-zero. Together
  // they are the whole of "zero and unknown must never look alike" for this parser.
  const na = parseNvidiaSmiCsv(NVIDIA_SMI_NA_COLUMNS).value[0];
  const zero = parseNvidiaSmiCsv(NVIDIA_SMI_ALL_ZERO).value[0];

  const NULLABLE = [
    'name',
    'bus',
    'tempC',
    'powerW',
    'powerCapW',
    'memUsedMiB',
    'memTotalMiB',
    'utilPct',
    'smClockMHz',
    'throttleReasons',
  ] as const;

  test('[N/A] and [Unknown Error] make every column null — never NaN, never 0', () => {
    expect(na).toBeDefined();
    for (const key of NULLABLE) {
      expect(na?.[key], `${key} should be null`).toBeNull();
    }
    // The index still parsed, so the row is still a card.
    expect(na?.index).toBe(0);
  });

  test('a genuinely idle, genuinely empty card reads 0 in every numeric column', () => {
    expect(zero).toEqual({
      index: 0,
      name: 'Tesla PG500-216',
      bus: '00000000:17:00.0',
      tempC: 0,
      powerW: 0,
      powerCapW: 0,
      memUsedMiB: 0,
      memTotalMiB: 0,
      utilPct: 0,
      smClockMHz: 0,
      throttleReasons: '0x0',
    });
  });

  test('columns fail independently — one unreadable cell does not blank the rest', () => {
    // §6.5: "A single sensor read fails → that figure shows `—` … the rest of the panel
    // renders." A card with no temperature is still a card with VRAM.
    const mixed = '0, Tesla PG500-216, 00000000:17:00.0, [N/A], 39.25, 250.00, 26456, 32768, 0, [N/A], 0x4\n';
    const g = parseNvidiaSmiCsv(mixed).value[0];
    expect(g?.tempC).toBeNull();
    expect(g?.smClockMHz).toBeNull();
    expect(g?.powerW).toBe(39.25);
    expect(g?.memUsedMiB).toBe(26456);
    expect(g?.throttleReasons).toBe('0x4');
  });

  test('and no numeric column is ever NaN — `celsius(NaN)` type-checks, so it must not exist', () => {
    for (const key of ['tempC', 'powerW', 'memUsedMiB', 'utilPct', 'smClockMHz'] as const) {
      const v = zero?.[key];
      expect(typeof v === 'number' && Number.isFinite(v)).toBe(true);
      expect(Number.isNaN(na?.[key] as unknown as number)).toBe(false);
    }
  });
});

describe('a card that disappears mid-session', () => {
  test('poll N has two cards, poll N+1 has one, and index 1 is simply gone', () => {
    const before = parseNvidiaSmiCsv(CAPTURED_NVIDIA_SMI).value;
    const after = parseNvidiaSmiCsv(NVIDIA_SMI_ONE_CARD).value;

    expect(before.map((g) => g.index)).toEqual([0, 1]);
    expect(after.map((g) => g.index)).toEqual([0]);
    // GPU 0's readings are unchanged: nothing from the lost card was attributed to it.
    expect(after[0]).toEqual(before[0]);
  });
});

describe('rows that are not cards', () => {
  test('an empty result is [] — it ran and found nothing, which is not `null`', () => {
    const { value, problems } = parseNvidiaSmiCsv(EMPTY);
    expect(value).toEqual([]);
    expect(problems).toEqual([]);
  });

  test('a truncated row is a problem, not a card with seven readings', () => {
    const { value, problems } = parseNvidiaSmiCsv(NVIDIA_SMI_TRUNCATED_ROW);
    expect(value).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('expected 11 columns, got 7');
  });

  test('a short row is a problem — columns are never guessed back into place', () => {
    const { value, problems } = parseNvidiaSmiCsv(NVIDIA_SMI_SHORT_ROW);
    expect(value).toEqual([]);
    expect(problems[0]).toContain('got 4');
  });

  /*
   * ⚠ **The other side of the boundary.** Every column-count fixture here was a short row,
   * so `cells.length !== 11` weakened to `< 11` passed all 807 tests and all 51 mutations.
   * The guard was correct; the coverage was one-sided, and a one-sided boundary test is a
   * `!==` that could have been a `<` with nothing to say so.
   *
   * This is not a hypothetical about a driver: it is a hypothetical about a **refactor**.
   * `--format=csv,nounits` emits no thousands separators, `nvidia-smi` quotes nothing, and
   * no NVIDIA board name carries a comma, so nothing produces twelve columns today.
   */
  test('⚠ a row with TWELVE columns is a problem, not eleven readings shifted left', () => {
    const { value, problems } = parseNvidiaSmiCsv(NVIDIA_SMI_WIDE_ROW);
    expect(value).toEqual([]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('expected 11 columns, got 12');
  });

  /*
   * ⚠ **The mark was dropped here 2026-09-07, when the red-test ledger was retrofitted to
   * step 3's harness.** This test asserts properties of the FIXTURE — that the wide row has
   * twelve cells and that its columns land one place left — plus one fact about
   * `lib/throttle.ts`, which is step 2's file. It depends on nothing in `lib/collectors/`,
   * so no step-3 mutation can redden it, and the guard it documents is the test above,
   * which is backed. HANDOVER §5.2 rule 1: where a property has no plausible wrong
   * implementation in the files the harness owns, drop the ⚠ rather than the standard.
   * The body stays — it is what puts the cost of losing the guard in the suite rather than
   * in a comment.
   */
  test('and the shift it prevents is what would have been reported', () => {
    // Named explicitly so the cost of losing the guard is in the suite, not only in a note.
    const cells = NVIDIA_SMI_WIDE_ROW.trim().split(',').map((c) => c.trim());
    expect(cells).toHaveLength(12);
    // Every field one place left: the parser's throttle column (10) holds the SM clock,
    // and its temperature column (3) holds the bus id.
    expect(cells[10]).toBe('1260');
    expect(cells[3]).toBe('00000000:17:00.0');

    /*
     * ⚠ **This assertion changed on 2026-09-07, and the change is the point.** Under `< 11`
     * this row used to yield a card at 38 °C whose throttle mask decoded to
     * `0x20 sw thermal slowdown | 0x40 hw thermal slowdown` — an **alarm, fabricated from a
     * clock reading**, with `problems: []` to explain it. That was possible only because
     * `lib/throttle.ts`'s `HEX` made the `0x` prefix optional, so the SM clock `1260` read
     * as `0x1260`.
     *
     * The prefix is now required (step 3's deferred A2, taken after measuring the box), so
     * the second half of that blast radius is gone: a shifted clock is **not a mask**, and
     * the column reads `—` with an `errors[]` entry rather than an alarm nobody can explain.
     * The column-count guard above is still what stops the shift; this is the belt behind it.
     */
    expect(decodeThrottleMask(throttleMask('1260'))).toBeNull();
    // …and with the prefix it would still have been the fabricated alarm, which is why the
    // column-count guard is the primary defence and not this one.
    expect(decodeThrottleMask(throttleMask('0x1260'))?.severity).toBe('alarm');
  });

  test('a row whose index will not parse is an errors[] entry, not a GPU', () => {
    // lib/types.ts: `index` is the row's identity and §6.2 joins SERVING onto it, so a row
    // that cannot be placed in a panel is not a card.
    const { value, problems } = parseNvidiaSmiCsv(NVIDIA_SMI_BAD_INDEX);
    expect(value).toEqual([]);
    expect(problems[0]).toContain('unreadable index');
  });

  test('a warning banner on stdout does not become a phantom GPU', () => {
    const { value, problems } = parseNvidiaSmiCsv(NVIDIA_SMI_WITH_BANNER);
    expect(value.map((g) => g.index)).toEqual([0]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('WARNING: infoROM');
  });

  test('one bad row does not discard the good rows around it', () => {
    // §6.5: "A single sensor read fails → that figure shows `—` … the rest of the panel
    // renders." The row-level equivalent.
    const mixed = NVIDIA_SMI_SHORT_ROW + CAPTURED_NVIDIA_SMI;
    const { value, problems } = parseNvidiaSmiCsv(mixed);
    expect(value.map((g) => g.index)).toEqual([0, 1]);
    expect(problems).toHaveLength(1);
  });

  test('a problem message carries the offending text, capped', () => {
    const long = `${'x'.repeat(200)}\n`;
    const { problems } = parseNvidiaSmiCsv(long);
    expect(problems[0]?.length).toBeLessThan(160);
    expect(problems[0]).toContain('…');
  });
});

describe('§3.1 — utilization.gpu is range-checked to 0–100', () => {
  /*
   * The one `nvidia-smi` numeric with a range, because 0–100 *is* the unit of a percentage
   * rather than an invented bound. Fixtures sit on **both** sides of both ends: the A2 rule
   * applies to a range check exactly as it applies to a column count.
   */
  test('0 and 100 are readings, not rejections', () => {
    const { value, problems } = parseNvidiaSmiCsv(NVIDIA_SMI_UTIL_AT_BOUNDS);
    expect(value.map((g) => g.utilPct)).toEqual([0, 100]);
    expect(problems).toEqual([]);
  });

  test('101 is null — and 0 is not, which is the invariant-1 half', () => {
    expect(parseNvidiaSmiCsv(NVIDIA_SMI_UTIL_OVER_RANGE).value[0]?.utilPct).toBeNull();
    expect(parseNvidiaSmiCsv(NVIDIA_SMI_UTIL_AT_BOUNDS).value[0]?.utilPct).toBe(0);
  });

  test('-1 is null', () => {
    expect(parseNvidiaSmiCsv(NVIDIA_SMI_UTIL_UNDER_RANGE).value[0]?.utilPct).toBeNull();
  });

  test('an out-of-range utilisation blanks ONLY itself — the card still renders', () => {
    // §6.5: "A single sensor read fails → that figure shows `—` … the rest of the panel
    // renders." A rejected percentage must not take the temperature with it.
    const { value, problems } = parseNvidiaSmiCsv(NVIDIA_SMI_UTIL_OVER_RANGE);
    expect(value).toHaveLength(1);
    expect(value[0]?.tempC).toBe(38);
    expect(value[0]?.memUsedMiB).toBe(26456);
    // The read succeeded; only the value is not usable. No errors[] entry, matching cpuPct.
    expect(problems).toEqual([]);
  });

  test('⚠ no OTHER numeric gains a range — an implausible temperature is still carried', () => {
    // Decided, not overlooked: a bound invented for temperature/power/clock has no measured
    // basis, and discarding a real reading is worse than carrying an odd one into §6.3.
    const cold = '0, n, b, -500, 1, 1, 1, 1, 1, 1, 0x0\n';
    expect(parseNvidiaSmiCsv(cold).value[0]?.tempC).toBe(-500);
  });
});

describe('the throttle column', () => {
  const row = (mask: string): string =>
    `0, n, b, 1, 1, 1, 1, 1, 1, 1, ${mask}\n`;

  test('a real mask is carried verbatim so an unknown bit stays visible', () => {
    expect(parseNvidiaSmiCsv(row('0x0000000000000004')).value[0]?.throttleReasons).toBe(
      '0x0000000000000004',
    );
  });

  test('a mask that is not a mask is null, never 0', () => {
    // lib/throttle.ts: an unparseable mask rendered as `0` would claim the card is not
    // throttling. `decodeThrottleMask(null)` is `null`; `decodeThrottleMask('0x0')` is
    // "normal, not a fault" — two different statements.
    for (const bad of ['Active', '[N/A]', '', 'zzz']) {
      expect(parseNvidiaSmiCsv(row(bad)).value[0]?.throttleReasons).toBeNull();
    }
  });

  test('what the collector emits is exactly what lib/throttle.ts accepts', () => {
    const mask = parseNvidiaSmiCsv(row('0x0000000000000020')).value[0]?.throttleReasons ?? null;
    expect(decodeThrottleMask(mask)?.severity).toBe('alarm');
  });
});
