/**
 * Strict text→number parsing. **This module is where global invariant 1 is enforced.**
 *
 * > "`null` is not `0`. A fan reading 0 is a dead fan; a fan reading nothing is a driver
 * > that did not load. Conflating them is the single worst bug this project can ship."
 *
 * JavaScript's built-in conversions all break that rule in one direction or another, and
 * every one of these has a real analogue in the text this step parses:
 *
 * | expression | result | where it would bite |
 * |---|---|---|
 * | `Number('')` | **`0`** | a truncated `temp1_input`, an empty `nvidia-smi` column |
 * | `Number(' ')` | **`0`** | a whitespace-only sysfs read |
 * | `Number('\n')` | **`0`** | ditto — sysfs files end in a newline |
 * | `Number(null)` | **`0`** | a missing key handed straight through |
 * | `Number('0x10')` | `16` | a hex mask read as a decimal count |
 * | `Number('1_000')` | `NaN` | (safe, but only by accident) |
 * | `parseInt('12abc')` | `12` | `12 MiB` parsed with the unit still attached |
 * | `parseFloat('1.2.3')` | `1.2` | a corrupted line silently truncated |
 * | `Number('Infinity')` | `Infinity` | a non-finite reading reaching a brand |
 *
 * HANDOVER O6/O7 name this as the step-3/4 obligation, because no formatter guard can
 * catch it downstream: a finite-but-wrong `0` renders as the entirely plausible `0 RPM` /
 * `0.0 %` / `0 °C`. It has to be rejected *here*, at parse time.
 *
 * So: every function below is total, takes `string | undefined` (because
 * `noUncheckedIndexedAccess` makes every split-and-index produce `undefined`), and returns
 * `null` for anything that is not unambiguously a number. Nothing throws.
 *
 * No IO. Everything in this file is a pure function of its argument.
 */

/** A whole number, optionally signed. Nothing else — no hex, no exponent, no separators. */
const INTEGER = /^[+-]?\d+$/;

/** An unsigned whole number, for the `unsigned long long` counters in `/proc`. */
const UNSIGNED_INTEGER = /^\d+$/;

/**
 * A plain decimal, optionally signed, optionally exponential. Deliberately does NOT match
 * `Infinity`, `NaN`, `0x…`, `1_000`, `''` or `'1.2.3'`.
 */
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/**
 * `nvidia-smi`'s "no value" placeholders, which it prints *inside the CSV cell* rather
 * than leaving blank. Confirmed on the box 2026-09-06: `fan.speed` on a passively-cooled
 * V100 returns the literal text `[N/A]`.
 *
 * The known set is `[N/A]`, `[Not Supported]`, `[Insufficient Permissions]` and
 * `[Unknown Error]`, but the *shape* is matched rather than the list: an unrecognised
 * bracketed placeholder is still not a reading, and `Number('[N/A]')` is `NaN` only by
 * luck — `Number('[]')` is `NaN` too, but a future placeholder is not worth betting on.
 * A GPU `name` never contains brackets.
 */
const BRACKETED_PLACEHOLDER = /^\[.*\]$/;

/**
 * Is this cell "no reading" rather than a value? True for an absent cell, an empty or
 * whitespace-only cell, and any bracketed `nvidia-smi` placeholder.
 */
export const isNotAReading = (raw: string | undefined): boolean => {
  if (raw === undefined) return true;
  const s = raw.trim();
  return s === '' || BRACKETED_PLACEHOLDER.test(s);
};

/**
 * A trimmed, non-empty string, or `null`. Used for every *text* field — `name`, `bus`,
 * `cpuModel`, `hostname`, `kernel`.
 *
 * An empty file is not an empty hostname: `/etc/hostname` that reads `''` means the read
 * produced nothing, and §6.6 renders `null` as `—`. Returning `''` would render as a blank
 * cell, which §6.6 forbids just as firmly as it forbids `0`.
 */
export const parseText = (raw: string | undefined): string | null => {
  if (raw === undefined) return null;
  const s = raw.trim();
  return s === '' ? null : s;
};

/**
 * A whole number within the safe-integer range, or `null`.
 *
 * Safe-integer bounded because the callers — a GPU `index`, a core count, a thread count —
 * are all small and a value outside `±2^53` is evidence of a corrupt read rather than a
 * large machine. The `/proc` counters use {@link parseCounter} instead, which is exact.
 */
export const parseIntegerStrict = (raw: string | undefined): number | null => {
  if (raw === undefined) return null;
  const s = raw.trim();
  if (!INTEGER.test(s)) return null;
  const n = Number(s);
  return Number.isSafeInteger(n) ? n : null;
};

/**
 * A finite decimal, or `null`. The workhorse for readings: temperatures, watts, MiB, MHz,
 * percentages, load averages, uptime.
 *
 * `Number.isFinite` is belt-and-braces after {@link DECIMAL} — the regex already excludes
 * `Infinity` — but it also rejects an exponent large enough to overflow (`1e999`).
 */
export const parseDecimalStrict = (raw: string | undefined): number | null => {
  if (raw === undefined) return null;
  const s = raw.trim();
  if (!DECIMAL.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/**
 * An unsigned `/proc` counter, as a **`bigint`**, or `null`.
 *
 * `/proc/stat`'s jiffies and `/proc/net/dev`'s byte counts are C `unsigned long long`, so
 * they can exceed `Number.MAX_SAFE_INTEGER` and a double would round them. The deltas
 * computed from them are small and convert back to `number` exactly; the *absolute* values
 * must not round, because a delta between two rounded counters is a fabricated rate.
 *
 * `lib/throttle.ts` set the same precedent for the 64-bit throttle mask.
 */
export const parseCounter = (raw: string | undefined): bigint | null => {
  if (raw === undefined) return null;
  const s = raw.trim();
  if (!UNSIGNED_INTEGER.test(s)) return null;
  return BigInt(s);
};

/**
 * Split a line on runs of whitespace, discarding leading and trailing whitespace, so that
 * `'cpu  1 2 3'` (two spaces after `cpu`, as `/proc/stat` really writes it) yields four
 * fields and not five.
 */
export const fields = (line: string): string[] => {
  const s = line.trim();
  return s === '' ? [] : s.split(/\s+/);
};

/** Split text into lines, dropping blank ones. Handles CRLF, and a trailing newline. */
export const lines = (text: string): string[] =>
  text.split(/\r?\n/).filter((l) => l.trim() !== '');
