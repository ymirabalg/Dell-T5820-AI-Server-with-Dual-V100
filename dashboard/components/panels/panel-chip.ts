/**
 * §6.2's panel-head chip override, ruled 2026-09-08 (10b-S-F): *"The head is the worst band
 * among the readings that exist, skipping `null`s — EXCEPT that a panel which would read
 * `normal` while any of its own readings is `—` shows no band instead."* `SPEC.md` states the
 * rule; this is the one place it is implemented, so every panel that can reach it — and any
 * panel 10c or a later loop adds — shares one definition rather than five near-identical ones.
 *
 * ### The finding this fixes
 *
 * MEMORY with `RAM — / —` (both readings unreadable) and a healthy swap rendered a **green ✓
 * above an em dash**: `severityMemory` is `worstSeverity(severityRam(…), severitySwap(…))`,
 * `severityRam` is `null` when RAM's own reading is missing, and `worstSeverity` skips `null`s
 * by design (it is right to for the aggregate — see `lib/severity.ts`'s own doc). So the one
 * present band, swap, won by default and the panel claimed health for a figure it never read.
 *
 * ### "Its own readings" — the definition the ruling asked for, and why
 *
 * The ruling's sentence answers this if read as one sentence rather than two: *"the worst band
 * among THE READINGS that exist, skipping `null`s"* names the very combination a panel already
 * builds via `worstSeverity`; *"any of ITS OWN readings is `—`"* points at the same set — the
 * leaf `Severity | null` values a panel passes into that combination, one per §6.3 row it
 * carries for itself. A "reading", here, is **one argument to the worst-of computation that
 * produces this panel's chip** — nothing wider and nothing narrower. That resolves the three
 * questions the handoff posed by name:
 *
 * - **A subtitle never counts.** §6.2: a subtitle is *"identity, never measurement"* — it
 *   carries no §6.3 band and is never a term in a `worstSeverity` call, so it cannot be one of
 *   "its own readings" under this definition, however that field is spelled.
 * - **A reading the panel does not band never counts either** — GPU power, utilisation and SM
 *   clock; a served model string; a SERVING row's port and context — even though every one of
 *   them is rendered. This is also *why* the ruling's other half holds without a special case:
 *   "a red GPU stays red with an unreadable SM clock" is automatic here, because SM clock was
 *   never a term feeding the chip to begin with — there is no hole in the computation for it to
 *   leave.
 * - **A row that is `—` because its whole COLLECTION was absent** (`serving: null`, `gpus:
 *   null`, a retired GPU card, `cooling: null`) never reaches this function: every panel that
 *   has such a branch computes `chip: null` directly on it, before any severity function runs,
 *   the same as it did before this ruling. This function only ever sees the case the ruling is
 *   actually about — one reading inside an otherwise-present collection that individually
 *   failed to parse.
 *
 * ### Call it with LEAF severities — never one `lib/severity.ts` already folded together
 *
 * A few `lib/severity.ts` exports already combine more than one raw reading into a single
 * `Severity | null` with an ordinary `worstSeverity()` call inside — `severityMemory` (RAM %
 * and swap) is the one this ruling's own reproduction case is about, and it cannot be edited
 * from here (§4's wire change owns `lib/`). Passing `severityMemory(host)` to {@link panelChip}
 * would be too late: its own inner `worstSeverity` has already thrown the `null` away and
 * returned `'normal'`, and nothing downstream can see that RAM's reading was the one missing.
 * Every call site below passes the SAME leaves — `severityRam(…)`, `severitySwap(…)`, one
 * `severityHealth`/`severityUnitState` pair per SERVING instance, the four `severityFanStopped`
 * calls for fan 1-4, and so on — that a pre-combined helper would otherwise hide.
 *
 * `severityFan5` is the one documented exception, passed whole: §6.3 already treats it as a
 * single reading (one tach, one row), and its own doc records that it was deliberately written
 * not to lose a `null` this way — "An unknown engagement yields `null`, not `normal`" — so
 * passing it whole here is reusing that guarantee, not a second instance of the bug this file
 * fixes.
 */

import { worstSeverity } from '@/lib/severity';
import type { Severity } from '@/lib/types';

/**
 * The worst of `severities` (skipping `null`s, exactly like {@link worstSeverity}), EXCEPT that
 * a `'normal'` result is downgraded to no band (`null`) when any of `severities` is itself
 * `null` — §6.2, ruled 2026-09-08 (10b-S-F).
 *
 * ⚠ **`'watch'` and `'alarm'` are returned untouched.** The downgrade applies to the `'normal'`
 * case ONLY, by design: *"it does not drop to no-band for `warn` or `alarm` … a panel must not
 * lose its alarm colour because one unrelated field failed to parse. A red GPU stays red with
 * an unreadable SM clock."* Folding the check in before ranking (e.g. bailing out the moment
 * any `null` is seen) would apply the downgrade to `'alarm'` too, which is the rejected
 * alternative the ruling names.
 */
export const panelChip = (...severities: readonly (Severity | null)[]): Severity | null => {
  const worst = worstSeverity(...severities);
  return worst === 'normal' && severities.includes(null) ? null : worst;
};
