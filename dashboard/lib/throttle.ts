/**
 * §3.7 — decoding `clocks_throttle_reasons.active`.
 *
 * "Decode and render by name, never as a bare hex string." The vocabulary — bit, name and
 * neutral/alarm treatment — lives in `lib/types.ts` as {@link THROTTLE_REASONS}, read from
 * the spec rather than from NVML. This module is the decoder step 1 deferred (HANDOVER
 * §9, O3): mask in, ordered reasons out, each rendered `0x20 sw thermal slowdown`.
 *
 * **The rule that makes this worth having:** a bit **not** in §3.7's table renders
 * `0x<hex> unknown` and is treated as **WATCH**. NVML defines values the table does not
 * list (`0x10`, sync boost, among them) and may gain more. Silently dropping one "would
 * report a throttling card as unthrottled" — the exact failure decoding exists to prevent.
 * Watch and not alarm, because an unknown reason is not evidence of a thermal event.
 *
 * Values are `bigint`. The mask is 64 bits wide and `Number` loses exactness above 2^53,
 * so an unknown high bit would decode to the wrong code — the one place in this project
 * where a silent numeric coercion could rename a fault.
 */

import { THROTTLE_REASONS } from './types';
import type { Severity, ThrottleMask, ThrottleReason, ThrottleReasonName } from './types';

/**
 * The bits §6.3 puts in the alarm column: **`0x8`, `0x20`, `0x40`, `0x80`** — the three
 * thermal bits plus the power brake, "an external electrical fault and no less serious".
 * All four raise §6.4's banner.
 *
 * Derived from {@link THROTTLE_REASONS}'s `treatment` column rather than written out, so
 * the set cannot drift from the table it is supposed to summarise.
 *
 * ⚠ Not the same thing as `types.ts`'s `THERMAL_THROTTLE_BITS`, which is `0x8 | 0x20 |
 * 0x40` — *thermal* only. §3.7 was amended after step 1 to put `0x80` in §6.3's alarm set,
 * which resolves HANDOVER §6's first open question in favour of "yes, `0x80` banners".
 * The two constants answer different questions and both are correct; see the step-2 notes.
 */
export const THROTTLE_ALARM_BITS: bigint = THROTTLE_REASONS.filter(
  (r) => r.treatment === 'alarm',
).reduce((acc, r) => acc | BigInt(r.bit), 0n);

/** How §6.2 spells a bit this table does not know. */
export const UNKNOWN_REASON_NAME = 'unknown';

/** One active bit of a {@link ThrottleMask}, decoded for display. */
export interface DecodedThrottleReason {
  /** The bit's value, e.g. `0x20n`. */
  readonly bit: bigint;
  /** The bit rendered as §3.7 renders it — `'0x20'`. */
  readonly code: string;
  /** §3.7's name, or `'unknown'` for a bit the table does not list. */
  readonly name: ThrottleReasonName | typeof UNKNOWN_REASON_NAME;
  /** `false` for a bit not in §3.7's table. */
  readonly known: boolean;
  /** §6.3: alarm for the four alarm bits, watch for an unknown bit, normal otherwise. */
  readonly severity: Severity;
  /** The whole rendering — `'0x20 sw thermal slowdown'`, `'0x10 unknown'`. */
  readonly label: string;
}

/** The decoded mask. `null` from {@link decodeThrottleMask} means there was no reading. */
export interface ThrottleDecode {
  /** The parsed mask. `0n` is a complete, healthy reading — not an absent one. */
  readonly mask: bigint;
  /** Every active bit, ascending, known and unknown alike. Empty when the mask is `0`. */
  readonly reasons: readonly DecodedThrottleReason[];
  /** The worst severity across the active bits; `'normal'` when none are active. */
  readonly severity: Severity;
  /**
   * §3.7: "a mask of `0` or `0x4` alone carries the note *normal, not a fault*". `null`
   * for every other mask, so the note cannot be attached to a real throttle event.
   */
  readonly note: string | null;
  /**
   * §6.2: "Throttle reasons appear only when something other than `0x4` is active; the
   * normal power cap is not news and must not be styled as a warning."
   */
  readonly notable: boolean;
}

/** §3.7's note for the two masks that are not a fault. */
export const NOT_A_FAULT_NOTE = 'normal, not a fault';

const BY_BIT: ReadonlyMap<bigint, ThrottleReason> = new Map(
  THROTTLE_REASONS.map((r) => [BigInt(r.bit), r]),
);

/** `0x4` — the routine 250 W power cap this box runs at continuously. */
const SW_POWER_CAP = 0x4n;

/**
 * Hex, and the **`0x` prefix is required** — step 3's deferred A2, taken 2026-09-07.
 *
 * Hex is the only interpretation: `clocks_throttle_reasons.active` is documented and
 * observed as `0x0000000000000000`, and reading a bare `20` as decimal would silently turn
 * `0x20 sw thermal slowdown` into two different bits.
 *
 * ⚠ **The prefix used to be optional, and that made a decimal reading FABRICATE AN ALARM.**
 * A bare `8` parsed as `0x8` — *HW slowdown*, one of §6.3's four alarm bits — from a column
 * that never said any such thing. Step 3's A2 is the precedent for how bad that is: a
 * column shift fabricated a thermal-throttle alarm on a card at 38 °C, and the whole reason
 * this mask is decoded rather than displayed raw is to stop exactly that.
 *
 * **Measured before requiring it** (read-only, `ssh ai-server`, 2026-09-07):
 *
 * ```
 * $ nvidia-smi --query-gpu=index,clocks_throttle_reasons.active --format=csv,noheader
 * 0, 0x0000000000000000
 * 1, 0x0000000000000000
 * $ nvidia-smi --query-gpu=driver_version --format=csv,noheader | head -1
 * 580.173.02
 * ```
 *
 * The only driver in scope emits the prefix. The trade this makes is a **lost reading** on a
 * hypothetical driver that omits it — `null`, rendered `—`, with an `errors[]` entry from
 * `collectGpus`, because `nvidia-smi.ts` treats an unparseable cell as no reading — against
 * a **fabricated alarm** on a real one. §6.3's whole posture is that the fabricated alarm is
 * worse, and an em dash says "we could not read this" while `0x8` says "this card is in
 * hardware slowdown".
 */
const HEX = /^\s*0[xX]([0-9a-fA-F]+)\s*$/;

/**
 * Parse a {@link ThrottleMask}. `null` for no reading **and** for a string that is not a
 * mask.
 *
 * The brand constructors do not validate (HANDOVER §3), so `throttleMask('[N/A]')`
 * type-checks; a collector that could not read the column must send `null` (§4). An
 * unparseable string is therefore a collector defect, and it renders as "no reading" (`—`)
 * plus an `errors[]` entry rather than as a fabricated `0`, which would claim the card is
 * not throttling.
 */
export const parseThrottleMask = (mask: ThrottleMask | null): bigint | null => {
  if (mask === null) return null;
  const match = HEX.exec(mask);
  if (match === null) return null;
  const digits = match[1];
  if (digits === undefined) return null;
  return BigInt(`0x${digits}`);
};

/** Render a bit as §3.7 renders it: lowercase hex with an `0x` prefix, no padding. */
const codeOf = (bit: bigint): string => `0x${bit.toString(16)}`;

const decodeBit = (bit: bigint): DecodedThrottleReason => {
  const known = BY_BIT.get(bit);
  const code = codeOf(bit);
  if (known === undefined) {
    return {
      bit,
      code,
      name: UNKNOWN_REASON_NAME,
      known: false,
      // §3.7: watch, not alarm — an unknown reason is not evidence of a thermal event.
      severity: 'watch',
      label: `${code} ${UNKNOWN_REASON_NAME}`,
    };
  }
  return {
    bit,
    code,
    name: known.name,
    known: true,
    severity: known.treatment === 'alarm' ? 'alarm' : 'normal',
    label: `${code} ${known.name}`,
  };
};

/**
 * Decode a mask into every active bit, ascending.
 *
 * Returns `null` when there is no reading — see {@link parseThrottleMask}. A mask of `0`
 * is **not** that case: it decodes to zero reasons, `'normal'`, and §3.7's note.
 */
export const decodeThrottleMask = (mask: ThrottleMask | null): ThrottleDecode | null => {
  const value = parseThrottleMask(mask);
  if (value === null) return null;

  const reasons: DecodedThrottleReason[] = [];
  // `rest & -rest` isolates the lowest set bit; BigInt bitwise ops are two's complement.
  for (let rest = value; rest > 0n; rest &= rest - 1n) {
    reasons.push(decodeBit(rest & -rest));
  }

  const severity: Severity = reasons.some((r) => r.severity === 'alarm')
    ? 'alarm'
    : reasons.some((r) => r.severity === 'watch')
      ? 'watch'
      : 'normal';

  return {
    mask: value,
    reasons,
    severity,
    note: value === 0n || value === SW_POWER_CAP ? NOT_A_FAULT_NOTE : null,
    notable: (value & ~SW_POWER_CAP) !== 0n,
  };
};
