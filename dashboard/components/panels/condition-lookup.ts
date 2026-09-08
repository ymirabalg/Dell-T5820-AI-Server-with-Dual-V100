/**
 * §6.5's stale row, for a panel: find the one confirmed condition a raw reading corresponds
 * to, and say whether it is stale.
 *
 * ⚠ This deliberately reuses `app/dashboard-shell.tsx`'s exact wording rather than inventing a
 * second one — S-B (`SPEC.md` §6.5, ruled 2026-09-08): *"§6.5 now says the banner and the row
 * use the same words."* `staleAgeNote` below is byte-for-byte the same computation as that
 * file's `staleAgeText`: `last read ${formatAge(nowMs - lastSeenMs)} ago`. Two independently
 * written implementations of the same sentence is how a project ends up with `since 15:10:40`
 * in one place and `since 15:10:40 EDT` in another (HANDOVER §0.3, 10a-reconcile F11) — the
 * exact failure this file exists to not repeat.
 *
 * ### Which rows can actually reach `stale`, and why most cannot
 *
 * `lib/client/observations.ts`'s three-valued safety checks (`ufw_enforcing`, `pwm5_present`,
 * `dkms_for_running_kernel`) call TOTAL severity functions — `severityUfw`, `severityPwm5Present`,
 * `severityDkms` never return `null` — so `conditionsFrom` pushes an observation for them on
 * EVERY successful poll, whatever the raw reading is. A condition that is always observed can
 * never be absent from a poll, so it can never cross into `stale` through `observePoll`'s
 * mechanism; a `null` current reading there is answered directly, by the total function's own
 * `null → watch` branch, not by this file.
 *
 * The rows that CAN go stale are the ones whose §6.3 function returns `null` for an unreadable
 * input — `severityUnitState`, `severityHealth`, `severityCpuTemp`, `severityMemory`,
 * `severityDiskFree`, `severityLink`, `severityFanStopped`, `severityFan5*` — because a `null`
 * severity means `conditionsFrom` skips the `push` entirely (O12: "a reading with no band
 * produces no observation"), and a condition that stops appearing in successive successful
 * polls is exactly what `observePoll` debounces into `stale` over ten seconds of sampled wall
 * time. This module is used wherever one of those is rendered, and is a no-op (returns `null`)
 * everywhere else — which is why it costs nothing to call defensively even on the three-valued
 * checks above.
 */

import type { DisplayedCondition } from '@/lib/conditions';
import { EM_DASH, formatAge } from '@/lib/format';

/** The confirmed condition an id names, or `undefined` if the session has never confirmed one. */
export const findDisplayed = (
  displayed: readonly DisplayedCondition[],
  id: string,
): DisplayedCondition | undefined => displayed.find((c) => c.id === id);

/**
 * S-B's exact wording, or `null` when the condition is not stale (or was never found at all —
 * the ordinary case before the first poll, and for a kind that structurally cannot go stale).
 *
 * ⚠ Byte-identical to `app/dashboard-shell.tsx`'s `staleAgeText`. If either changes, change
 * both, or better: ask for this to be exported from one place next time either file moves.
 */
export const staleAgeNote = (
  condition: DisplayedCondition | undefined,
  nowMs: number,
): string | null =>
  condition !== undefined && condition.stale
    ? `last read ${formatAge(nowMs - condition.lastSeenMs)} ago`
    : null;

/**
 * §6.5's other half of the stale rule, and the one 10b's first draft missed:
 *
 * > **⚠ A stale condition shows its LAST VALUE, unchanged — not an em dash.** §6.6's law that
 * > `null` renders `—` governs *a reading that is absent*; a stale condition's reading is not
 * > absent, it is **old**, and blanking it would throw away the only number an operator has.
 *
 * Every panel row renders the *current* snapshot reading, and a condition is stale precisely
 * because that reading stopped arriving — so without this the row renders `—` while
 * `components/alarm-banner.tsx` renders `lead.value` for the same condition in the same frame.
 * That is the banner and the row showing **two different numbers for one condition**, one
 * screen apart, which is the exact failure S-B's "same words" ruling exists to prevent
 * (10b-reconcile, adversarial F4).
 *
 * ⚠ **Only substitutes for an em dash.** If the current reading is present the current reading
 * wins — "unchanged" describes a value nobody could re-read, not an override of one that was.
 * A stale condition whose figure is somehow still readable is not a case §6.5 legislates, and
 * showing the older of two known numbers would be worse than either rule.
 *
 * ⚠ **`DisplayedCondition.value` is already formatted** (`'4,308 RPM'`, `'active'`) by
 * `conditionsFrom`, so this returns it verbatim — it never formats, and must not.
 */
export const staleValueOr = (
  condition: DisplayedCondition | undefined,
  current: string,
): string =>
  condition !== undefined && condition.stale && current === EM_DASH ? condition.value : current;
