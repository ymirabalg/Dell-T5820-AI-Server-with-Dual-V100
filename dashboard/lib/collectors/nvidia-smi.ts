/**
 * §3.1 — the `nvidia-smi` CSV parser. **Pure: text in, `Gpu[]` out.** No IO.
 *
 * The command is
 *
 * ```
 * nvidia-smi --query-gpu=<NVIDIA_SMI_FIELDS> --format=csv,noheader,nounits
 * ```
 *
 * and the eleven fields are §3.1's table in its order. `noheader` because the header is
 * not data, and `nounits` because §6.6 fixes the unit per figure — parsing `39.25 W`
 * would mean re-deriving a unit the spec already states, and `Number('39.25 W')` is `NaN`
 * anyway.
 *
 * **`nvidia-smi` being absent is a normal state of this box, not an error to hide**
 * (§3.1). That distinction lives in the IO wrapper, because it is about how the process
 * failed; this file only ever sees text that a process actually produced.
 */

import { celsius, mhz, mib, percent, throttleMask, watts } from '../types';
import type { Gpu, Percent, ThrottleMask } from '../types';
import { parseThrottleMask } from '../throttle';
import {
  isNotAReading,
  lines,
  parseDecimalStrict,
  parseIntegerStrict,
  parseText,
} from './numbers';
import type { ParseResult } from './result';

/**
 * §3.1's eleven query fields, in §3.1's order. The parser reads its columns by position,
 * so this array and {@link parseNvidiaSmiCsv} are one unit: reorder one and the other is
 * wrong. `nvidia-smi.test.ts` asserts the list against §3.1.
 *
 * ⚠ `clocks_throttle_reasons.active` and `clocks_event_reasons.active` are **accepted
 * aliases, not a rename in progress**: §3.1 records that driver 580 takes both and that
 * *"both return identical values, so either name is correct"*. §3.1 names the old key, so
 * the old key is what is sent. Do not "fix" this to the newer spelling expecting a
 * behaviour change — there is none, and the field list is asserted against §3.1 by test.
 */
export const NVIDIA_SMI_FIELDS = [
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
] as const;

/** The full argument vector, so the wrapper and the tests cannot disagree about it. */
export const NVIDIA_SMI_ARGS: readonly string[] = [
  `--query-gpu=${NVIDIA_SMI_FIELDS.join(',')}`,
  '--format=csv,noheader,nounits',
];

/** Column indices, named. Nothing below indexes the row with a bare number. */
const COL = {
  index: 0,
  name: 1,
  bus: 2,
  tempC: 3,
  powerW: 4,
  powerCapW: 5,
  memUsedMiB: 6,
  memTotalMiB: 7,
  utilPct: 8,
  smClockMHz: 9,
  throttle: 10,
} as const;

/**
 * A reading, or `null`. Every numeric column goes through here, so `[N/A]`,
 * `[Unknown Error]`, an empty cell and `39.2W` all become `null` in one place rather than
 * eleven.
 *
 * The brand is applied *after* the parse succeeds, never around it. HANDOVER §3: the
 * constructors name a unit and do not validate one, so `celsius(Number('[N/A]'))` is a
 * perfectly well-typed `celsius(NaN)` — this is the guard that stops it existing.
 */
const reading = <T>(raw: string | undefined, brand: (n: number) => T): T | null => {
  if (isNotAReading(raw)) return null;
  const n = parseDecimalStrict(raw);
  return n === null ? null : brand(n);
};

/**
 * `utilization.gpu`, range-checked to **0–100** per §3.1, or `null`.
 *
 * ⚠ This is the **only** `nvidia-smi` numeric that gets a range, and the asymmetry is
 * deliberate rather than an oversight. 0–100 *is* the unit of a percentage, so the bound is
 * the field's own definition; a bound invented for temperature, power, memory or clock has
 * no measured basis and would silently discard a real reading, which is a worse failure
 * than carrying an implausible one into §6.3's bands. `cpuPct` is checked the same way in
 * `deltas.ts`, and two `Percent` producers in one step disagreeing was the actual finding.
 *
 * Out of range is `null` and **not** a `problems` entry, matching `cpuPct` exactly: the
 * read succeeded and the figure renders `—`. The column-shift that could produce a wild
 * value is caught upstream by the column-count guard, which does report.
 */
const utilisationReading = (raw: string | undefined): Percent | null => {
  if (isNotAReading(raw)) return null;
  const n = parseDecimalStrict(raw);
  if (n === null || n < UTIL_PCT_MIN || n > UTIL_PCT_MAX) return null;
  return percent(n);
};

/**
 * `clocks_throttle_reasons.active` as a validated {@link ThrottleMask}, or `null`.
 *
 * Validated with `lib/throttle.ts`'s own `parseThrottleMask` rather than a second regex
 * here: that module owns what a mask *is*, and its doc says outright that "a collector
 * that could not read the column must send `null`", because an unparseable mask rendered
 * as `0` would claim the card is not throttling.
 */
const throttleReading = (raw: string | undefined): ThrottleMask | null => {
  const text = isNotAReading(raw) ? null : parseText(raw);
  if (text === null) return null;
  const candidate = throttleMask(text);
  return parseThrottleMask(candidate) === null ? null : candidate;
};

/** §3.1: `utilization.gpu` is "range-checked to 0–100; outside that is `null`". */
const UTIL_PCT_MIN = 0;
const UTIL_PCT_MAX = 100;

/** Keep a `problems` message short enough to sit in a UI row. */
const excerpt = (line: string): string =>
  line.length > 80 ? `${line.slice(0, 80)}…` : line;

/**
 * Parse `--format=csv,noheader,nounits` output into §3.1's `Gpu` rows.
 *
 * Row handling, and why each choice is the honest one:
 *
 * - **Blank lines are skipped.** A trailing newline is not a card.
 * - **A row without exactly eleven columns is a `problems` entry and not a GPU.** That
 *   covers a truncated read, a driver answering a different field list, and the warning
 *   banner `nvidia-smi` sometimes prints on stdout. Guessing which columns survived would
 *   silently shift every reading one place left.
 * - **A row whose `index` will not parse is a `problems` entry and not a GPU.**
 *   `lib/types.ts`: `index` is the row's identity and §6.2 joins SERVING onto the card by
 *   it, so a row that cannot be placed in a panel is not a card.
 * - **Every other column fails independently.** §6.5: "A single sensor read fails → that
 *   figure shows `—` … the rest of the panel renders." A card with an unreadable
 *   temperature is still a card, and dropping the row would take its VRAM with it.
 *
 * `problems` deliberately carries the offending text (capped), because "row 3 had 9
 * columns" is not enough to act on and this is the only place the raw line still exists.
 */
export const parseNvidiaSmiCsv = (text: string): ParseResult<Gpu[]> => {
  const gpus: Gpu[] = [];
  const problems: string[] = [];

  for (const line of lines(text)) {
    const cells = line.split(',').map((c) => c.trim());
    if (cells.length !== NVIDIA_SMI_FIELDS.length) {
      problems.push(
        `unparseable row: expected ${NVIDIA_SMI_FIELDS.length} columns, got ${cells.length} — ${excerpt(line)}`,
      );
      continue;
    }

    const index = parseIntegerStrict(cells[COL.index]);
    if (index === null) {
      problems.push(`row with unreadable index skipped — ${excerpt(line)}`);
      continue;
    }

    gpus.push({
      index,
      name: isNotAReading(cells[COL.name]) ? null : parseText(cells[COL.name]),
      bus: isNotAReading(cells[COL.bus]) ? null : parseText(cells[COL.bus]),
      tempC: reading(cells[COL.tempC], celsius),
      powerW: reading(cells[COL.powerW], watts),
      powerCapW: reading(cells[COL.powerCapW], watts),
      memUsedMiB: reading(cells[COL.memUsedMiB], mib),
      memTotalMiB: reading(cells[COL.memTotalMiB], mib),
      utilPct: utilisationReading(cells[COL.utilPct]),
      smClockMHz: reading(cells[COL.smClockMHz], mhz),
      throttleReasons: throttleReading(cells[COL.throttle]),
    });
  }

  return { value: gpus, problems };
};
