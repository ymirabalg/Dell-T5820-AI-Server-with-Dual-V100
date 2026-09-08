/**
 * §6.4's sticky alarm banner, reduced from `RuntimeState.displayed` to exactly what the
 * banner renders — nothing more, and nothing decided twice.
 *
 * ⚠ **This reads `state.displayed`, never `conditionsFrom`.** HANDOVER rule 2:
 * `conditionsFrom` is un-deduplicated by design (`unit:gpu-fan-control.service` twice), and
 * `lib/conditions.ts` already exports {@link bannerConditions} — the same filter §9's
 * `alarmCount` is built from — so this module does not re-implement the banner-worthy test,
 * only the ORDERING §6.4 leaves unsaid.
 *
 * ⚠ **Decision, invariant 7.** §6.4 says multiple alarm-level conditions "collapse into one
 * banner with a count" and says nothing about which one leads. This orders by `sinceMs`
 * ascending — the longest-standing alarm leads — because a 03:00 excursion still on screen at
 * 09:00 (§6.4's own example) is exactly the condition an operator is most likely to already be
 * wondering about, and because `sinceMs` gives a total, deterministic order with no need to
 * compare severities (every {@link BannerCondition} here is already alarm-level; `banner` is
 * never true for a `watch`-level condition). Ties break on `id`, since two conditions
 * confirmed in the same wall-clock millisecond are not otherwise ordered by anything §6.4
 * names.
 *
 * ⚠ **`stale` and `lastSeenMs` are carried, not dropped (10a-reconcile, adversarial F10).**
 * §6.5, for a condition whose subject stopped being reported: *"It keeps its last confirmed
 * band and its 'since', still counts (§9), and **its row and the banner name the age of the
 * reading**."* §9 repeats it. The first version of this reduction dropped both fields, so a
 * GPU at 82 °C whose `nvidia-smi` then died kept pinning the banner with a six-minute-old
 * value presented exactly like a live one — §6.5's own closing rule is that *"a reading that
 * stopped and a subject that left must never look alike"*. The **formatting** of the age is
 * the caller's (this module takes no clock, by design); what it may not do is throw away the
 * only fact the caller would need.
 */

import { bannerConditions } from '../conditions';
import type { DisplayedCondition } from '../conditions';

/** The part of a {@link DisplayedCondition} the banner renders — never built by hand. */
export interface BannerCondition {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  /** Wall-clock ms (§6.4: "the first observation of the CONFIRMED band"). Formatting is the
   *  caller's, per this project's convention that a component renders pre-formatted strings. */
  readonly sinceMs: number;
  /** §6.5: the subject stopped being reported, so this band is held rather than re-observed.
   *  Never lowers or raises the severity — it changes what the banner must SAY. */
  readonly stale: boolean;
  /** Wall-clock ms at which a poll last carried this condition. §6.5 requires the banner to
   *  name the age of the reading behind a stale condition; `now − lastSeenMs` is that age. */
  readonly lastSeenMs: number;
}

/** §6.4's banner, fully reduced: how many, which one leads, and the rest. */
export interface BannerView {
  /** `0` when nothing is banner-worthy — the caller's cue to render no banner at all.
   *  ⚠ Always `1 + rest.length`. `AlarmBanner` deliberately does **not** take this as a prop
   *  (F14): it derives its own count from the list it actually renders, so the number it
   *  announces and the conditions it names cannot drift apart. This field stays because it is
   *  §9's count as a reduction — the same `bannerConditions` filter `alarmCount` uses — and
   *  because the off-by-one is worth a mutation of its own. */
  readonly count: number;
  /** The oldest-standing alarm, or `null` when {@link count} is `0`. */
  readonly lead: BannerCondition | null;
  /** Every other alarm-level condition, oldest first. Empty when {@link count} is `0` or `1`. */
  readonly rest: readonly BannerCondition[];
}

const toBannerCondition = (c: DisplayedCondition): BannerCondition => ({
  id: c.id,
  label: c.label,
  value: c.value,
  sinceMs: c.sinceMs,
  stale: c.stale,
  lastSeenMs: c.lastSeenMs,
});

/** An empty banner — nothing alarm-level is standing. Reused rather than reconstructed. */
export const EMPTY_BANNER: BannerView = { count: 0, lead: null, rest: [] };

/** Reduce `state.displayed` to §6.4's banner. Pure; takes no clock. */
export const bannerView = (displayed: readonly DisplayedCondition[]): BannerView => {
  const ordered = [...bannerConditions(displayed)].sort(
    (a, b) => a.sinceMs - b.sinceMs || a.id.localeCompare(b.id),
  );
  if (ordered.length === 0) return EMPTY_BANNER;
  const mapped = ordered.map(toBannerCondition);
  // `mapped[0]` is `BannerCondition | undefined` under `noUncheckedIndexedAccess`; `?? null`
  // is not a fallback for a real gap here (the length check above rules that out) — it is
  // exactly the type BannerView.lead already promises, so this converts rather than guards.
  return { count: mapped.length, lead: mapped[0] ?? null, rest: mapped.slice(1) };
};
