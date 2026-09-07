/**
 * §3.3's `dell_smm` node, as pure functions: the five fan tachometers, and the **one
 * three-valued `pwm5` probe** that §3.7 makes the most delicate thing in this project.
 *
 * No IO. Every function here is a pure function of text (or of a classified read outcome),
 * so the whole of §3.7's probe table is exercised without a `/sys`, without root and
 * without a Dell.
 *
 * ---
 *
 * ### ⚠ The three telemetry traps (§3.3), which decide what is *not* in this file
 *
 * 1. **`fanN_input` is the only trustworthy fan telemetry on this board.** Everything else
 *    lies. The three constants below name the only files this module will look at.
 * 2. **`pwmN_enable` reads back `2` ("EC auto") even while a manual state is in force** —
 *    the driver never disables BIOS fan control on this board, so the EC reports its own
 *    mode. Measured on the live box 2026-09-06: `pwm5_enable` → `2`, while `pwm5` →
 *    `ENODATA`. **The mode is never derived from it**, and it is never read.
 * 3. **`fanN_target` clamps instead of erroring.** Measured the same day: `fan5_target` →
 *    `5100`, the HIGH *nominal*, presented as though it were a live setpoint while channel
 *    5 was idling at 1903 RPM. It is not in the contract and it is never read.
 *
 * `fan5_label` is not read either: it exists on this board and returns `EINVAL`
 * (measured), because `GET_FAN_TYPE` fails here — §3.3's "there is no way to ask which fan
 * is the video fan; it has to be inferred from behaviour".
 *
 * ### ⚠ `dell_smm`'s `temp*_input` are deliberately absent
 *
 * The node carries `temp1 temp2 temp5 temp7`, and §3.2 forbids all of them as a CPU
 * sensor: `temp1` swung 43–54 °C during pure idle while the package held 35–37 °C.
 * `coretemp` is the CPU source and `nvidia-smi` is the GPU source. Nothing here reads a
 * temperature.
 */

import { pwmStateName } from '../format';
import type { Ch5Mode, Cooling, CoolingChannels, Pwm, Rpm, Safety, UnitState } from '../types';
import { pwm, rpm } from '../types';
import { errnoCodeOf } from './errors';
import { parseIntegerStrict } from './numbers';
import { clean } from './result';
import type { ParseResult } from './result';

/**
 * Re-exported from `errors.ts`, where it now lives: step 5's D-Bus and HTTP probes are the
 * third caller and must not import a Dell module to read an errno. Kept exported here so
 * step 4's public surface did not change under a later step's feet.
 */
export { errnoCodeOf };

/** §3.3's hwmon `name`. Found by name, never by a fixed index — see `hwmon.ts`. */
export const DELL_SMM_NAME = 'dell_smm';

/** The five tachometers §3.3 lists, and the only fan files this module reads. */
export const FAN_CHANNELS = [1, 2, 3, 4, 5] as const;

/** `fanN_input` — trap 1. Never `fanN_target`, never `fanN_label`. */
export const fanInputFile = (channel: number): string => `fan${channel}_input`;

/** The duty-cycle register for the GPU/PCIe header. The probe's whole subject. */
export const PWM5_FILE = 'pwm5';

/**
 * The errno the driver returns from `pwm5` when channel 5 is in **EC automatic control**.
 *
 * ⚠ **This is HEALTHY** (invariant 3, §3.3, §3.7, §6.5). `dell-smm-hwmon` does
 * `if (ret > data->i8k_fan_max) return -ENODATA;` and state 3 (AUTO) exceeds
 * `i8k_fan_max` (2), so the *absence* of a duty cycle is the driver's way of saying the EC
 * owns the channel. Rendering it as an error is a defect.
 *
 * Confirmed on the live box 2026-09-06 with `os.read()`: **errno 61, `ENODATA`, on the
 * READ and not on the open** — `open()` succeeds. So it arrives as a rejection from
 * `readFile`, and `error.code` is where it is legible.
 */
export const PWM5_EC_AUTO_ERRNO = 'ENODATA';

// ---------------------------------------------------------------------------
// Fans
// ---------------------------------------------------------------------------

/** §3.3's five tachometers. The `CoolingChannels` fields minus `serviceState`. */
export interface FanReadings {
  readonly fan1Rpm: Rpm | null;
  readonly fan2Rpm: Rpm | null;
  readonly fan3Rpm: Rpm | null;
  readonly fan4Rpm: Rpm | null;
  readonly fan5Rpm: Rpm | null;
}

/** No channel was read. **Not** five zeroes — invariant 1, and this is where it starts. */
export const NO_FANS: FanReadings = {
  fan1Rpm: null,
  fan2Rpm: null,
  fan3Rpm: null,
  fan4Rpm: null,
  fan5Rpm: null,
};

/**
 * One tachometer, from the text of its `fanN_input`.
 *
 * Three outcomes, and the difference between the first two **is** global invariant 1:
 *
 * | text | result | entry |
 * |---|---|---|
 * | `'0\n'` | `rpm(0)` — a **dead fan**, and §6.6 renders it `0 RPM` | no |
 * | absent from the record | `null` — a channel that does not exist | no |
 * | `'\n'`, `'abc'` | `null` — the file exists and produced no reading | **yes** |
 * | `'-1\n'` | `null` — outside the quantity's domain | no (§6.7) |
 * | `'14451\n'` | `rpm(14451)` — passed straight through. See below | no |
 *
 * ⚠ **There is no upper bound, and adding one would delete an alarm.** §6.3's *absolute*
 * row makes `> 5100 RPM` an alarm in its own right — "**14451 RPM once hung POST** — an
 * implausible tach is the early warning, not a cosmetic glitch". A collector that rejected
 * an implausible tach as `null` would hand the panel a `—` where the spec requires red.
 * The plausibility judgement is §6.3's, downstream, and this layer must not pre-empt it.
 *
 * ⚠ **The floor is not an invented bound either.** `fanN_input` is an unsigned
 * revolution count; a negative is a corrupt read in the same class as `Number('')` being
 * `0`, and it carries no `errors[]` entry because §6.7 puts an out-of-range reading —
 * "a successful read of an impossible value" — on the same terms as a rejected delta.
 *
 * ⚠ **`-0` is on the readable side of that floor, and that is correct.** `-0 < 0` is
 * `false`, so it becomes `rpm(-0)`, renders `0 RPM` (`Intl` drops the sign) and — since
 * `-0 === 0` — bands **alarm** on §6.3's zero clause, which is exactly what a corrupt read
 * of a stopped fan should do. §6.3 says this in as many words: the comparison downstream
 * must be `===` and never `Object.is`. Rejecting `-0` here would convert a red cell into an
 * em dash, which is the trade this project never makes.
 */
const fanRpm = (
  files: Readonly<Record<string, string>>,
  channel: number,
  problems: string[],
): Rpm | null => {
  const file = fanInputFile(channel);
  const raw = files[file];
  // Absent is not a failure: on the stock 4-fan driver there is no `fan5_input` at all.
  // ⚠ On THIS board that state is also reported by `pwm5Present: false`, because the DKMS
  // patch adds `fan5_input` and `pwm5` together — but that is a property of the driver, not
  // a guarantee of this function. A driver that split them would leave the channel showing
  // `—` with no `errors[]` entry, and steps 9/10 must render an unexplained em dash
  // honestly rather than relying on an entry that may not be there (A9).
  if (raw === undefined) return null;
  // ⚠ `Number('')` is `0`, and `0 RPM` on the GPU header is a perfectly plausible dead
  // fan. `parseIntegerStrict` is the only door (HANDOVER §6).
  const value = parseIntegerStrict(raw);
  if (value === null) {
    problems.push(`\`${file}\` is not a reading`);
    return null;
  }
  return value < 0 ? null : rpm(value);
};

/**
 * All five tachometers, from a `filename → contents` record.
 *
 * The record is exactly what an IO wrapper can produce and exactly what a test can hand
 * over without a `/sys` — the same shape `parsePackageTempC` takes. **Only files that were
 * read successfully belong in it**; a file that was listed but whose read failed is the
 * wrapper's own `errors[]` entry, because only the wrapper knows the path it tried.
 *
 * ⚠ Each channel is mapped to its own field explicitly rather than by index arithmetic.
 * `fan2` is the GPU-area OEM fan and `fan5` is the GPU/PCIe header; an off-by-one would
 * put the channel this dashboard exists to watch in the row labelled with another one.
 */
export const parseDellSmmFans = (
  files: Readonly<Record<string, string>>,
): ParseResult<FanReadings> => {
  const problems: string[] = [];
  const value: FanReadings = {
    fan1Rpm: fanRpm(files, 1, problems),
    fan2Rpm: fanRpm(files, 2, problems),
    fan3Rpm: fanRpm(files, 3, problems),
    fan4Rpm: fanRpm(files, 4, problems),
    fan5Rpm: fanRpm(files, 5, problems),
  };
  return { value, problems };
};

// ---------------------------------------------------------------------------
// ⚠ The one three-valued pwm5 probe (§3.7, HANDOVER O8)
// ---------------------------------------------------------------------------

/** What the wrapper saw when it tried to read `pwm5`. The only IO fact this module takes. */
export type Pwm5Read =
  | { readonly kind: 'ok'; readonly text: string }
  | {
      readonly kind: 'failed';
      /** `error.code` off the rejection — `'ENODATA'`, `'EACCES'`, `'EIO'`, or `null`. */
      readonly code: string | null;
      readonly message: string;
    };

/**
 * §3.7's probe table as a closed set of five outcomes — **the single source of both
 * `safety.pwm5Present` and `cooling.ch5Mode`.**
 *
 * | outcome | reached when | `pwm5Present` | `ch5Mode` |
 * |---|---|---|---|
 * | `unlocated` | no `/sys`, no `dell_smm` hwmon, `EACCES` on the directory | `null` | `null` |
 * | `absent` | `dell_smm` was listed and there is no `pwm5` node | `false` | `null` |
 * | `manual` | `pwm5` read numerically, inside the 0–255 register | `true` | `'manual'` |
 * | `ec-auto` | `pwm5` rejected with `ENODATA` | `true` | `'ec-auto'` |
 * | `unreadable` | `pwm5` exists but yielded no duty (`EACCES`, `EIO`, junk, out of range) | `true` | `null` |
 */
export type Pwm5Probe =
  | { readonly outcome: 'unlocated' }
  | { readonly outcome: 'absent' }
  | { readonly outcome: 'manual'; readonly duty: Pwm }
  | { readonly outcome: 'ec-auto' }
  | { readonly outcome: 'unreadable' };

/**
 * Turn one attempted read of `pwm5` into one {@link Pwm5Probe}. §3.7's rows 3, 4 and 5.
 *
 * ### The duty is range-checked against the register, and out of range is `null` (O6)
 *
 * `pwmStateName` is imported rather than re-deriving `0` and `255` here: it is already
 * "the only definition of the ≥ 192 boundary in this project" and it owns the same
 * register's bounds. Two copies of `0–255` could drift, and a drift would let the
 * collector mint a `Pwm` the formatter then refuses to name — the one combination the
 * contract cannot express (see below).
 *
 * | text | outcome | `errors[]` |
 * |---|---|---|
 * | `'255'`, `'0'` | `manual` | no |
 * | `'256'`, `'-1'` | `unreadable` | **no** — §6.7: an out-of-range reading is "a successful read of an impossible value" |
 * | `''`, `'abc'`, `'1.5'` | `unreadable` | **yes** — the file produced no reading at all |
 *
 * ⚠ **§3.7's table has no row for either of the last two, nor for `ENOENT` on the read.**
 * Both were reported as spec gaps (C3, A10) and both are folded into `unreadable`, which
 * keeps `pwm5Present: true` — the listing had already answered that question. For `ENOENT`
 * that is the safe direction: it means `pwm5` vanished between the listing and the read
 * (the DKMS module unloading mid-poll), so the alternative would be to *invent* the alarm
 * from a race. It costs one stale poll and the next listing corrects it.
 *
 * ### ⚠ Why an unreadable duty is `unreadable` and not `manual`
 *
 * §6.6 and §6.7 both describe a state where **the mode is `manual` and the duty is not a
 * reading** — "render `—` and give the band no severity". `Cooling` cannot express it:
 * `CoolingManual.ch5Pwm` is `Pwm`, not `Pwm | null`, and HANDOVER forbids minting a brand
 * from a value that failed to parse ("a value that failed to parse is `null`, never
 * `rpm(NaN)`"), which is also O6's instruction — *"range-check `pwm5` to 0–255 and send
 * `null` otherwise"*.
 *
 * So the duty goes to `null`, and a `null` duty forces `ch5Mode: null`. The cost is that
 * §6.7's "a `pwm5` of `999` … renders `—`" actually renders `unavailable`. **Reported as a
 * spec/contract gap** (see `pipeline/steps/04-collector-cooling/build.md`); it is the
 * conservative half of the trade, because the alternative asserts a mode from a value the
 * hardware cannot produce.
 */
export const classifyPwm5Read = (read: Pwm5Read): ParseResult<Pwm5Probe> => {
  if (read.kind === 'failed') {
    // ⚠ Invariant 3. This branch is the reason the probe takes the errno at all.
    if (read.code === PWM5_EC_AUTO_ERRNO) return clean({ outcome: 'ec-auto' });
    return { value: { outcome: 'unreadable' }, problems: [read.message] };
  }
  const value = parseIntegerStrict(read.text);
  if (value === null) {
    return { value: { outcome: 'unreadable' }, problems: [`\`${PWM5_FILE}\` is not a reading`] };
  }
  // O6's boundary: 0 and 255 are readings, −1 and 256 are not.
  if (pwmStateName(pwm(value)) === null) return clean({ outcome: 'unreadable' });
  return clean({ outcome: 'manual', duty: pwm(value) });
};

/**
 * §3.6's `pwm5Present`, from the probe. **Total, exhaustive, and it never looks at
 * `ch5Mode`.**
 *
 * ⚠ §3.7: the two fields "must both be derived from ONE three-valued probe, never from
 * each other". Writing `pwm5Present = ch5Mode !== null` turns a `/sys` mount typo — or an
 * `EACCES` on a container run non-root — into a sticky SAFETY alarm asserting that GPU fan
 * control is gone, on a box with two passively-cooled 250 W cards. That is invariant 1
 * inverted, on the panel that earns this dashboard's existence.
 *
 * The only implication that holds is one-directional: `ch5Mode !== null` ⟹
 * `pwm5Present === true`. `dell-smm.test.ts` proves the converse fails **in both
 * directions**, by exhibiting three different `pwm5Present` values that all carry
 * `ch5Mode: null`, and three different `ch5Mode` values that all carry
 * `pwm5Present: true`.
 */
export const pwm5PresentFrom = (probe: Pwm5Probe): Safety['pwm5Present'] => {
  switch (probe.outcome) {
    case 'unlocated':
      // §3.7: "unknown, not alarm". The check could not be performed.
      return null;
    case 'absent':
      // §3.6's alarm: `dell_smm` answered and there is no `pwm5` — the DKMS 5-fan module
      // did not load, so channel 5 is uncontrollable.
      return false;
    case 'manual':
    case 'ec-auto':
    case 'unreadable':
      // The node was listed. Whether it can be *read* is a different question, and it is
      // `ch5Mode`'s, not this one's.
      return true;
  }
};

/**
 * §3.3's `ch5Mode`, from the same probe. **Total, exhaustive, and it never looks at
 * `pwm5Present`.**
 *
 * `'ec-auto'` is healthy (invariant 3) and `null` means the mode could not be determined —
 * which §6.5 renders as *unavailable*, "never a blank RPM that reads as zero".
 */
export const ch5ModeFrom = (probe: Pwm5Probe): Ch5Mode => {
  switch (probe.outcome) {
    case 'unlocated':
    case 'absent':
    case 'unreadable':
      return null;
    case 'manual':
      return 'manual';
    case 'ec-auto':
      return 'ec-auto';
  }
};

/**
 * Assemble §3.3's `Cooling` — the three-variant discriminated union, never a loose object
 * and a cast.
 *
 * `ch5Pwm` exists exactly when the mode is `'manual'`, which is the union's whole point:
 * `{ ch5Mode: 'ec-auto', ch5Pwm: 255 }` does not compile.
 *
 * ⚠ `serviceState` is a **parameter**, not a read. Step 4 does not touch D-Bus — see
 * {@link module:lib/collectors/cooling} for the scope decision and {@link withServiceState}
 * for how step 6 fills it in.
 */
export const coolingFrom = (
  fans: FanReadings,
  probe: Pwm5Probe,
  serviceState: UnitState | null,
): Cooling => {
  const channels: CoolingChannels = { ...fans, serviceState };
  switch (probe.outcome) {
    case 'manual':
      return { ...channels, ch5Mode: 'manual', ch5Pwm: probe.duty };
    case 'ec-auto':
      return { ...channels, ch5Mode: 'ec-auto', ch5Pwm: null };
    case 'unlocated':
    case 'absent':
    case 'unreadable':
      return { ...channels, ch5Mode: null, ch5Pwm: null };
  }
};

/**
 * Put the fan service's `ActiveState` into an already-built `Cooling`, preserving its
 * variant.
 *
 * ⚠ **O9: `cooling.serviceState` and `safety.fanServiceState` are ONE D-Bus read rendered
 * in two panels**, and `lib/contract.test.ts` asserts they agree. Step 4 collects fans and
 * channel 5 only; **step 5 owns the read and step 6 writes it to both fields** — the
 * resolution HANDOVER suggested for the scope question PLAN.md and §3.3 disagree about.
 *
 * It exists as a function so that step 6 has exactly one way to fill the field, and so the
 * two writes sit adjacent in step 6's code — the cheapest defence against them drifting.
 *
 * ⚠ **It was a three-branch `switch` with three identical bodies, on the theory that a bare
 * spread over a discriminated union loses the correlation between `ch5Mode` and `ch5Pwm`.
 * Measured in step 4's reconciliation: it does not.** TypeScript distributes an object
 * spread across the union, so this one line type-checks and the result is still
 * `CoolingManual | CoolingEcAuto | CoolingUnavailable` rather than a widened object. The
 * switch was three lines of ceremony with a doc comment giving a reason that was not the
 * reason.
 *
 * Exhaustiveness is not lost with it, because it was never enforced here: this function
 * *transforms* a `Cooling`, and every `Cooling` in the project is **constructed** by
 * {@link coolingFrom}, whose switch is exhaustive and is where a new variant would have to
 * be confronted.
 */
export const withServiceState = (cooling: Cooling, serviceState: UnitState | null): Cooling => ({
  ...cooling,
  serviceState,
});
