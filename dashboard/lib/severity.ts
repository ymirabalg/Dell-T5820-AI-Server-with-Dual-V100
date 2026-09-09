/**
 * §6.3 — severity bands, "from measurements on this machine rather than generic defaults".
 *
 * One exported function per row of §6.3's threshold table, plus the two derived quantities
 * those rows are expressed in (used-% and free-%). Pure: readings in, a {@link Severity}
 * out. No clock, no IO, no rendering — {@link module:lib/format} turns the same readings
 * into strings and the two must never be collapsed into one "render this cell" helper,
 * because §6.4 needs the severity of a condition that is *displayed* differently.
 *
 * **`null` in, `null` out — with one spec'd exception.** {@link Severity} has no `unknown`
 * member on purpose (`lib/types.ts`): a reading that is `null` has no severity, and the
 * caller must handle absence explicitly rather than being handed a colour for it. The
 * exception is {@link severityPwm5Present}, where §6.3 puts `null` in the **watch** column
 * itself — the check could not run, which is a fact worth showing and is not the alarm.
 *
 * **Boundary convention — §6.3 states it directly:** "Where a boundary is named by two
 * bands … the less-severe clause wins", and "strict inequalities (`> 95 %`, `< 3000`) are
 * exact". So exactly 90 % VRAM is normal and 90.1 % is watch; 95 % is watch and 5100 RPM
 * is not an alarm. That one sentence pins VRAM 90, RAM 85 and disk-free 15. The
 * temperature rows are disjoint as written and need no convention.
 *
 * **Three functions are total (`Severity`, never `null`)**, because §6.3 puts `null` in
 * their **watch** column itself: {@link severityPwm5Present}, {@link severityDkms} and
 * {@link severityUfw}. §6.3 requires the last two to "mirror the `pwm5 present` row
 * exactly". Everywhere else a `null` reading has no severity and the caller must confront
 * the absence rather than being handed a colour for it.
 */

import { pwmStateName } from './format';
import { decodeThrottleMask } from './throttle';
import type {
  Celsius,
  Cooling,
  GiB,
  HealthState,
  Host,
  LinkState,
  MiB,
  Percent,
  Rpm,
  Severity,
  ThrottleMask,
  UnitState,
} from './types';
import { percent } from './types';

// ---------------------------------------------------------------------------
// Combining severities
// ---------------------------------------------------------------------------

/** Ordering for §9's aggregate dot: "worst severity across every panel". */
export const SEVERITY_RANK: Readonly<Record<Severity, number>> = {
  normal: 0,
  watch: 1,
  alarm: 2,
};

/**
 * The worst of several severities, ignoring `null`s.
 *
 * Returns `null` only when there is nothing to compare — every argument was `null`, or
 * there were none. That is not `'normal'`: a panel whose every reading failed is not a
 * panel reporting health, and §6.5 renders it as absent rather than green.
 */
export const worstSeverity = (...values: readonly (Severity | null)[]): Severity | null => {
  let worst: Severity | null = null;
  for (const value of values) {
    if (value === null) continue;
    if (worst === null || SEVERITY_RANK[value] > SEVERITY_RANK[worst]) worst = value;
  }
  return worst;
};

// ---------------------------------------------------------------------------
// Derived quantities
// ---------------------------------------------------------------------------

/**
 * `used / total` as a percentage, or `null` when it cannot be computed.
 *
 * `null` covers an absent reading on either side, a non-finite one, and a `total` of `0` —
 * where the quotient would be `NaN` or `Infinity` and every band below would answer
 * "normal" to a division that never happened.
 *
 * Both arguments carry the **same** brand: `usedPercent(mib(1), gib(2))` is a compile
 * error. `NoInfer` on `total` makes `used` the only inference site, so a mismatch is
 * reported rather than widened away. This is the one place in the module where a
 * percentage is computed from two readings, and it is where a MiB/GiB mix-up would
 * otherwise be invisible — every other function here is branded at its boundary.
 */
export const usedPercent = <T extends number>(
  used: T | null,
  total: NoInfer<T> | null,
): Percent | null => {
  if (used === null || total === null) return null;
  if (!Number.isFinite(used) || !Number.isFinite(total) || total === 0) return null;
  return percent((used / total) * 100);
};

/**
 * `(total - used) / total` as a percentage — the quantity §6.3's disk row bands.
 *
 * Branded like {@link usedPercent}: both arguments must be the same unit.
 */
export const freePercent = <T extends number>(
  used: T | null,
  total: NoInfer<T> | null,
): Percent | null => {
  const usedPct = usedPercent(used, total);
  return usedPct === null ? null : percent(100 - usedPct);
};

// ---------------------------------------------------------------------------
// §6.3 rows
// ---------------------------------------------------------------------------

/**
 * §6.3's own GPU-temperature boundaries, exported (10e / §3.2) so the GPU sparkline's ≥1600px
 * reference lines and this function read the SAME two numbers rather than one written twice.
 * Before this they were bare literals inside {@link severityGpuTemp} (`lib/severity.ts:125`
 * and `:127` at the time this was written) — a chart drawing its own copy of `70`/`80` could
 * silently drift from the band that colours the cell, so the line on the chart and the colour
 * of the cell could disagree. `70` is the WATCH floor, `80` the ALARM floor (§6.3: normal
 * ≤ 69 °C, watch 70–79, alarm ≥ 80).
 */
export const GPU_TEMP_WATCH_C = 70;
export const GPU_TEMP_ALARM_C = 80;

/**
 * GPU temperature — normal ≤ 69 °C, watch 70–79, alarm ≥ 80.
 *
 * Basis: spec 83 °C, slowdown 87; production mean 66.2 °C, worst measured 75.3 °C.
 */
export const severityGpuTemp = (tempC: Celsius | null): Severity | null =>
  tempC === null || !Number.isFinite(tempC)
    ? null
    : tempC >= GPU_TEMP_ALARM_C
      ? 'alarm'
      : tempC >= GPU_TEMP_WATCH_C
        ? 'watch'
        : 'normal';

/** CPU package temperature — normal ≤ 79 °C, watch 80–89, alarm ≥ 90. Tjmax is 100. */
export const severityCpuTemp = (tempC: Celsius | null): Severity | null =>
  tempC === null || !Number.isFinite(tempC)
    ? null
    : tempC >= 90
      ? 'alarm'
      : tempC >= 80
        ? 'watch'
        : 'normal';

/**
 * GPU VRAM — normal ≤ 90 %, watch 90–95 %, alarm > 95 %.
 *
 * Basis: 128K context sits at ~81 % (26,452 of 32,768 MiB); 256K is a confirmed OOM.
 */
export const severityVram = (used: MiB | null, total: MiB | null): Severity | null => {
  const pct = usedPercent(used, total);
  return pct === null ? null : pct > 95 ? 'alarm' : pct > 90 ? 'watch' : 'normal';
};

/**
 * The percentage half of §6.3's RAM row — normal ≤ 85 %, watch 85–95 %, alarm > 95 %.
 *
 * §6.3's row has a second, independent alarm trigger; {@link severityMemory} is the whole
 * row and is what a panel should call.
 */
export const severityRam = (used: GiB | null, total: GiB | null): Severity | null => {
  const pct = usedPercent(used, total);
  return pct === null ? null : pct > 95 ? 'alarm' : pct > 85 ? 'watch' : 'normal';
};

/**
 * The swap half of §6.3's RAM row — **alarm above 1 GiB**, and there is no watch band.
 *
 * "Any swap in use is notable on this box" (§3.2), where 2 × 12 GiB of host RAM prompt
 * cache is configured; §6.6 gives swap 2 dp for the same reason. Exactly 1.00 GiB is not
 * an alarm — §6.3 writes `> 1 GiB`.
 */
export const severitySwap = (usedGiB: GiB | null): Severity | null =>
  usedGiB === null || !Number.isFinite(usedGiB) ? null : usedGiB > 1 ? 'alarm' : 'normal';

/** §6.3's RAM row in full: the worse of the used-% band and the swap trigger. */
export const severityMemory = (host: Host): Severity | null =>
  worstSeverity(
    severityRam(host.memUsedGiB, host.memTotalGiB),
    severitySwap(host.swapUsedGiB),
  );

/**
 * Disk — banded on **free** space: normal ≥ 15 %, watch 5–15 %, alarm < 5 %.
 *
 * `/home` is the one to watch: `hf-get.sh` writes by source filename with no space check.
 */
export const severityDiskFree = (used: GiB | null, total: GiB | null): Severity | null => {
  const free = freePercent(used, total);
  return free === null ? null : free < 5 ? 'alarm' : free < 15 ? 'watch' : 'normal';
};

/**
 * Whether §6.3's *engaged* fan5 band applies — and it is **three-valued**, not a boolean.
 *
 * §6.3: "Engaged means `ch5Mode === 'manual'` **and** `ch5Pwm ≥ 192` (the HIGH
 * quantisation band)." The `≥ 192` test is {@link pwmStateName}, which is the single
 * definition of that boundary; this function never re-writes it.
 *
 * | outcome | when |
 * |---|---|
 * | `'engaged'` | manual, and the duty reads in the HIGH band |
 * | `'not-engaged'` | `ec-auto`, unavailable, or manual below HIGH |
 * | `'unknown'` | **manual, and the duty is not a reading** (§6.6) |
 *
 * ⚠ The third outcome is why this is not a boolean. A `boolean` has to fold "the duty did
 * not parse" into `false`, which reads as "not engaged" and hands the caller §6.3's
 * *absolute* rule alone — so a stopped fan on a channel being driven HIGH bands `normal`.
 * That was a real defect in this module, found by the step-2 adversarial phase.
 *
 * Getting the other direction wrong is equally loud: in EC auto the channel's healthy
 * reading is ~2210 RPM, below the engaged band's 3000 RPM alarm floor, so applying the
 * engaged band there "would raise a permanent alarm on a perfectly healthy box". Manual at
 * a *low* duty is the same trap — the service hands the channel back to the EC below
 * `AUTO_BELOW` rather than driving it LOW, and LOW's 989 RPM is less than half the EC's
 * own 2210.
 */
export type Ch5Engagement = 'engaged' | 'not-engaged' | 'unknown';

export const ch5Engagement = (cooling: Cooling): Ch5Engagement => {
  if (cooling.ch5Mode !== 'manual') return 'not-engaged';
  const state = pwmStateName(cooling.ch5Pwm);
  if (state === null) return 'unknown';
  return state === 'HIGH' ? 'engaged' : 'not-engaged';
};

/**
 * §6.3's `fan5` **absolute** row: normal 1–5100 RPM, alarm at **`0`** and above **5100**.
 *
 * **Two-sided, and unconditional.** It applies in every mode — `manual`, `ec-auto`, and
 * whenever `ch5Mode` is `null` — because it needs nothing but the tach. §6.3: "Discarding
 * either because an *unrelated* field failed to parse would trade a real alarm for
 * tidiness."
 *
 * | tach | band | why |
 * |---|---|---|
 * | `null` | **no severity** | the channel produced no reading; renders `—` (invariant 1) |
 * | `0` | **alarm** | a stopped fan or a lost tach |
 * | `1`–`5100` | normal | LOW 989, EC auto 1900–2250, HIGH 4300–4470 all live here |
 * | `> 5100` | alarm | above the SMM nominal; **14451 RPM once hung POST** |
 *
 * ⚠ **`0` is a reading; `null` is not this row.** Only the numeral alarms. The channel
 * never *passes through* `0` on its way anywhere: an engage takes the tach **up**, from
 * ~2210 to 4300+, so there is no spin-up transient to debounce — which is exactly why this
 * end can be unconditional where a low-but-nonzero floor could not be. LOW's 989 RPM and
 * channel 3's measured 604 are legitimate states, so any threshold between `0` and the
 * engaged floor would fire on a healthy box.
 *
 * ⚠ **The comparison is `===`, never `Object.is`.** `-0 === 0` is `true`, so a corrupt
 * `-0` is correctly treated as a stopped fan; `Object.is(-0, 0)` is `false` and would let
 * it through as `normal`. §6.3 states this directly.
 *
 * ⚠ What `fan5_input` actually is: the tach of the **reference fan on hub port 1**, not of
 * the GPU shroud fans. A `0` says the channel's one instrument has failed — alarm-grade on
 * the same logic as §3.6's `pwm5Present: false` — but a healthy reading is not by itself
 * evidence that the cards are getting air.
 *
 * §6.4's condition id: `fan5_absolute`. Channel 5's zero is carried **here**, never as a
 * {@link severityFanStopped} / `fan_stopped` subject: one tach must never produce two
 * conditions (O3).
 */
export const severityFan5Absolute = (cooling: Cooling): Severity | null => {
  const value: Rpm | null = cooling.fan5Rpm;
  if (value === null || !Number.isFinite(value)) return null;
  return value > 5100 || value === 0 ? 'alarm' : 'normal';
};

/**
 * §6.3's `fan1`–`fan4` **stopped** row: normal at ≥ 1 RPM, alarm at **`0`**, and there is
 * no other band.
 *
 * Every one of these headers has a fan attached and `fan1` is the CPU heatsink fan, so `0`
 * is a stopped fan or a lost tach. `null` is a channel that did not enumerate and carries
 * **no severity** — invariant 1, the same split as {@link severityFan5Absolute}.
 *
 * ⚠ **There is deliberately no upper row and no low-but-nonzero band.** The EC does not
 * modulate these headers under GPU load (measured: every load-vs-idle difference inside the
 * channel's own jitter) and no nominal is documented for them, so an upper bound would be
 * invented. Idle readings run as low as 604 — below channel 3's own LOW preset — so `0` is
 * the only value on these channels that can be judged at all.
 *
 * Alarm rather than watch, uniformly: a blanket *watch* would under-call `fan1`, and a
 * per-channel split would invent structure with no measured basis. A chassis fan that is
 * genuinely dead and known about is what §6.4's **standing conditions** are for, and
 * `fan_stopped:<n>` is a well-formed id for one.
 *
 * §6.4's condition id: `fan_stopped:<channel>` — non-singleton, subscripted by the channel
 * index. **Channel 5 is not a subject of this kind** (see {@link severityFan5Absolute}).
 */
export const severityFanStopped = (value: Rpm | null): Severity | null => {
  if (value === null || !Number.isFinite(value)) return null;
  // `===`, never `Object.is`: `-0` is a stopped fan, not a value that escapes the row.
  return value === 0 ? 'alarm' : 'normal';
};

/**
 * §6.3's `fan5` **while engaged** row: normal ≥ 3500, watch 3000–3499, alarm < 3000.
 *
 * `null` — no severity — whenever the band does not apply: an unreadable tach, a channel
 * that is not engaged (§6.3: "The engaged band applies ONLY while engaged"), and a manual
 * channel whose duty is not a reading (§6.6: "give the band no severity rather than
 * assuming a state").
 *
 * §6.4's condition id: `fan5_engaged`.
 */
export const severityFan5Engaged = (cooling: Cooling): Severity | null => {
  const value: Rpm | null = cooling.fan5Rpm;
  if (value === null || !Number.isFinite(value)) return null;
  if (ch5Engagement(cooling) !== 'engaged') return null;
  return value < 3000 ? 'alarm' : value < 3500 ? 'watch' : 'normal';
};

/**
 * The colour of the COOLING panel's single `fan5` figure: the worse of §6.3's two rows.
 *
 * One reading, one cell, one colour — so the two rows are combined here even though §6.4
 * tracks them as two separate conditions (`fan5_absolute`, `fan5_engaged`).
 *
 * ⚠ **An unknown engagement yields `null`, not `normal`.** When the mode is `manual` and
 * the duty is not a reading, §6.6 gives the band no severity; answering `normal` would
 * assert health from a parse failure, and a stalled fan on a channel commanded HIGH is
 * exactly the case this dashboard exists to catch. **The absolute row still alarms**,
 * because it is unconditional and losing it to an unrelated duty parse failure would
 * discard both of its ends — the `> 5100` early warning that once hung POST, and the `0`
 * that says the channel's only instrument has stopped.
 *
 * ⚠ **That second end is the one that closes the hole.** Before §6.3 gained its zero
 * clause the engaged band was the *only* rule that could colour a stopped fan, so six of
 * the seven reachable `fan5Rpm === 0` states — every mode but engaged-manual, including
 * `ec-auto`, which is where this box sits below `AUTO_BELOW=55` — banded `normal`. A dead
 * fan produced an affirmative green. The absolute row now catches all seven.
 */
export const severityFan5 = (cooling: Cooling): Severity | null => {
  const absolute = severityFan5Absolute(cooling);
  if (absolute === null) return null;
  if (ch5Engagement(cooling) === 'unknown') return absolute === 'alarm' ? 'alarm' : null;
  return worstSeverity(absolute, severityFan5Engaged(cooling));
};

/**
 * ufw — **three-valued**, exactly like {@link severityPwm5Present}:
 *
 * | value | severity | meaning |
 * |---|---|---|
 * | `true` | normal | `ENABLED=yes` |
 * | `null` | **watch** | `/etc/ufw/ufw.conf` could not be read |
 * | `false` | alarm | the inference ports and this dashboard are open to anything routable |
 *
 * §6.3: "`null` is watch, matching `pwm5Present` — both are three-valued safety checks and
 * must behave alike." A missing file "is not evidence that ufw is enforcing, and it is not
 * evidence that it is not"; it is a visible "could not check", not a blank.
 *
 * `false` is **alarm severity** even though §6.4 *displays* it at watch while it is
 * declared standing — "the severity is the truth; the display is the concession", and the
 * concession is `lib/conditions.ts`'s, not this function's. That matters on this box: ufw
 * has not been enforcing since 2026-09-04.
 *
 * ⚠ Total, like the other two three-valued safety checks. Do not narrow it back to
 * `Severity | null`: an uncoloured ufw row is the one this machine has already been wrong
 * about.
 */
export const severityUfw = (enforcing: boolean | null): Severity =>
  enforcing === null ? 'watch' : enforcing ? 'normal' : 'alarm';

/**
 * `pwm5` present — **three-valued, and the three are genuinely different** (§3.7, §6.3):
 *
 * | value | severity | meaning |
 * |---|---|---|
 * | `true` | normal | the `pwm5` node exists |
 * | `null` | **watch** | the check could not be run — *unknown*, never the alarm |
 * | `false` | alarm | `dell_smm` answered and there is no `pwm5`: the 5-fan module did not load |
 *
 * ⚠ Total, and deliberately not `Severity | null`. §6.3 puts `null` in the watch column
 * itself, so an absent probe is a visible "could not check" rather than a blank. Reading
 * `null` as the alarm instead "turns a typo in step 11's `-v /sys:/sys:ro` mount into a
 * sticky banner asserting that GPU fan control is gone, on a box with two passively-cooled
 * 250 W cards" — invariant 1 inverted, on the panel that earns this dashboard's existence.
 */
export const severityPwm5Present = (present: boolean | null): Severity =>
  present === null ? 'watch' : present ? 'normal' : 'alarm';

/**
 * DKMS built for the **running** kernel — §6.3, "mirrors the `pwm5 present` row exactly":
 * `true` normal, `null` watch, `false` alarm.
 *
 * `false` means the next boot loses `pwm5` — the documented kernel-upgrade failure this
 * box has already had queued once (§3.6). `null` means `/lib/modules/$(uname -r)/…` could
 * not be listed, which is a check that did not run, not a check that failed.
 *
 * ⚠ Total, for the same reason as {@link severityPwm5Present}: §6.3 puts `null` in the
 * watch column itself, and "without it the SAFETY panel has an uncoloured row and §9's dot
 * cannot see it".
 */
export const severityDkms = (built: boolean | null): Severity =>
  built === null ? 'watch' : built ? 'normal' : 'alarm';

/**
 * An `llama-server` instance's `/health` — §6.3: `ok` normal, `unhealthy` watch,
 * `unreachable` alarm.
 *
 * `unhealthy` is llama.cpp answering 503 while a model loads (§3.7) — a real state of a
 * healthy machine, so it is watch rather than alarm. `null` is "not probed this cycle",
 * which §6.3 says "carries **no severity** rather than a good or bad one".
 */
export const severityHealth = (health: HealthState | null): Severity | null => {
  if (health === null) return null;
  switch (health) {
    case 'ok':
      return 'normal';
    case 'unhealthy':
      return 'watch';
    case 'unreachable':
      return 'alarm';
  }
};

/**
 * `eno1`'s link state — §6.3 over all seven `operstate` values (§3.7's {@link LinkState}).
 *
 * `up` is the only healthy one. `dormant`, `testing` and `unknown` are transient or
 * unreportable, so they are watch; `down`, `lowerlayerdown` and `notpresent` are alarm.
 * `null` — the sysfs read failed — has no severity, and its `errors[]` entry is
 * `net-operstate`, never `proc-net-dev` (§3.7).
 */
export const severityLink = (link: LinkState | null): Severity | null => {
  if (link === null) return null;
  switch (link) {
    case 'up':
      return 'normal';
    case 'dormant':
    case 'testing':
    case 'unknown':
      return 'watch';
    case 'down':
    case 'lowerlayerdown':
    case 'notpresent':
      return 'alarm';
  }
};

/**
 * Any systemd unit — §3.7's mapping of all six `ActiveState` values.
 *
 * `reloading` is ok: it is running, and re-reading config is not a fault. `inactive` is an
 * alarm and not merely "off", because every unit this dashboard watches is one that should
 * be running — a stopped `gpu-fan-control` means the cards are on the EC's curve, which
 * measurably ignores GPU temperature.
 *
 * `null` — not probed, D-Bus did not answer — has no severity.
 */
export const severityUnitState = (state: UnitState | null): Severity | null => {
  if (state === null) return null;
  switch (state) {
    case 'active':
    case 'reloading':
      return 'normal';
    case 'activating':
    case 'deactivating':
      return 'watch';
    case 'inactive':
    case 'failed':
      return 'alarm';
  }
};

/**
 * GPU throttle — §6.3, in its own words: normal is "no bit whose §3.7 treatment is `alarm`,
 * and no unlisted bit — so `0x1`, `0x2`, `0x4`, `0x100` alone are normal"; watch is "any
 * bit not in §3.7's table"; alarm is `0x8` / `0x20` / `0x40` / `0x80`.
 *
 * Delegates to {@link decodeThrottleMask}, so the band and the rendered reasons can never
 * disagree about which bits are set. `null` for no reading — including a mask string that
 * is not a mask, which is a collector defect and not evidence that the card is healthy.
 */
export const severityThrottle = (mask: ThrottleMask | null): Severity | null =>
  decodeThrottleMask(mask)?.severity ?? null;
