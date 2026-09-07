/**
 * The telemetry contract.
 *
 * This is the shape of the JSON returned by `GET /api/telemetry` (SPEC.md §4), modelling
 * every field in §3.1–§3.6 and every closed vocabulary in §3.7. Everything downstream —
 * collectors, the route, the client ring buffer, the panels — is typed against this file.
 *
 * Three laws are encoded here rather than written in a comment somewhere:
 *
 * 1. **`null` is not `0`.** SPEC.md §3: "Every field carries an explicit `null` when
 *    unreadable." So every *reading* is `T | null` — the temperature, the RPM, the
 *    percentage, not merely the object that holds them. A caller cannot reach a number
 *    without confronting the `null` first, because `strictNullChecks` will not let it.
 *    A fan reading `0` is a dead fan; a fan reading `null` is a driver that did not load
 *    (§6.5). Those demand different reactions, so they are different values.
 *
 * 2. **Units are part of the type.** §6.6 and decision 20 put two different memory units
 *    in one snapshot — VRAM in MiB, RAM and disk in GiB. Every quantity is therefore a
 *    branded number, so `memUsedMiB` cannot be handed to a formatter that expects GiB.
 *    Branding is erased at runtime; the JSON carries plain numbers.
 *
 *    ⚠ A brand names a **unit**, not a role. RAM and disk share `GiB` because they are the
 *    same unit (O19 collapsed the old `GB` brand into it once §6.6 settled on GiB for
 *    disk); the brand cannot tell a RAM figure from a disk figure and does not try to.
 *
 * 3. **Channel 5's mode is a discriminated union, not a pair of loose fields.** §3.3's
 *    derivation — a numeric `pwm5` read means manual, `ENODATA` means EC auto and is
 *    *healthy* — is expressed in the type: the `manual` variant is the only one carrying
 *    a PWM value, and it carries it non-null. There is no way to write down a snapshot
 *    that claims EC auto and a duty cycle at the same time.
 *
 * **Scope of this file.** It is the wire contract plus §3.7's closed vocabularies, and
 * nothing else. Derived vocabularies (condition ids for §6.4's `STANDING` list, display
 * modes like `paused`/`stale`, chart series ids) belong to the module that owns them, not
 * here. `Severity` is the one deliberate exception, and it is argued at its definition.
 *
 * **This file describes; it does not direct.** Obligations on later steps — which
 * collector derives what, which probe feeds which field — live in `pipeline/HANDOVER.md`,
 * because that is the document every step is required to read and this one is reviewed
 * once. A directive comment that turns out to be wrong gets *obeyed*, which is worse than
 * no comment; step 1's `pwm5Present` invariant was exactly that and it is now corrected
 * against §3.7.
 *
 * Nothing in this file writes anything anywhere. The dashboard is read-only (decision 3).
 */

// ---------------------------------------------------------------------------
// Branding
// ---------------------------------------------------------------------------

/**
 * A nominal type over a structural one. The `__unit` property exists only in the type
 * system; nothing constructs it and nothing reads it at runtime.
 *
 * `Celsius` is assignable to `number` (so arithmetic and `toFixed` work), but `number`
 * is not assignable to `Celsius` (so a raw number, or a value in the wrong unit, is a
 * compile error). Mint one with the matching constructor below.
 *
 * `lib/types.test-d.ts` asserts that each brand below is genuinely nominal. Without that
 * assertion, deleting a `Brand<>` wrapper degrades every field written in terms of the
 * alias in lockstep, and nothing notices.
 */
export type Brand<T, U extends string> = T & { readonly __unit: U };

/** Degrees Celsius. §6.6: rendered as an integer. */
export type Celsius = Brand<number, 'Celsius'>;
/** Watts. §6.6: rendered to 1 dp. */
export type Watts = Brand<number, 'Watts'>;
/** Mebibytes — GPU VRAM only. §6.6: thousands separated, `26,452 / 32,768 MiB`. */
export type MiB = Brand<number, 'MiB'>;
/**
 * Gibibytes — host RAM, swap **and filesystems**. §6.6: 1 dp for RAM and disk, 2 dp for swap.
 *
 * ⚠ Disk belongs here, not in a `GB` of its own. §6.6's disk row reads *"powers of 1024,
 * which is what `df -h` and `lsblk` print. `/` is 232.6 GiB, not 249.8 GB"*, and the
 * collector has always divided by `1024³` — so a separate `GB` brand named a unit nothing
 * in this contract ever carried. O19 deleted it rather than renaming it into a collision.
 */
export type GiB = Brand<number, 'GiB'>;
/** Megahertz. §6.6: integer. */
export type MHz = Brand<number, 'MHz'>;
/** Revolutions per minute, straight from `fanN_input`. §6.6: integer, thousands separated. */
export type Rpm = Brand<number, 'Rpm'>;
/** A percentage in the range 0–100 (not 0–1). §6.6: 1 dp. */
export type Percent = Brand<number, 'Percent'>;
/** Bytes per second, the native unit of a `/proc/net/dev` delta. §6.6 auto-scales it for display. */
export type BytesPerSecond = Brand<number, 'BytesPerSecond'>;
/** Whole seconds. §6.6/§3.2: the header renders `uptimeSec` as `up 2 d 02:01`. */
export type Seconds = Brand<number, 'Seconds'>;
/**
 * A raw `pwmN` sysfs value, 0–255. §3.3: only meaningful under manual control.
 *
 * The driver quantises this onto three states — 0–63 OFF, 64–191 LOW, 192–255 HIGH — so
 * the number is a faithful echo of what was written, not a duty cycle. §6.6 renders it as
 * the state name followed by the raw value (`HIGH pwm 255`); do not interpolate it.
 */
export type Pwm = Brand<number, 'Pwm'>;
/** A TCP port. */
export type Port = Brand<number, 'Port'>;
/** A context length in tokens (`CTX=`). §6.6: thousands separated — `131,072`. */
export type Tokens = Brand<number, 'Tokens'>;
/** An ISO-8601 timestamp in UTC. §6.6: the server sends UTC; the browser renders local. */
export type IsoTimestamp = Brand<string, 'IsoTimestamp'>;
/**
 * `clocks_throttle_reasons.active` verbatim, e.g. `0x0000000000000004`.
 *
 * Kept as the raw mask on the wire so an unrecognised bit is still visible rather than
 * silently dropped. §3.7 fixes the bit→name vocabulary and which bits are thermal; see
 * {@link THROTTLE_REASONS} below.
 */
export type ThrottleMask = Brand<string, 'ThrottleMask'>;

// ---------------------------------------------------------------------------
// Constructors
// ---------------------------------------------------------------------------

/*
 * Identity functions that attach a brand. They take a plain `number`/`string`, never
 * `T | null`: a collector holding a possibly-absent reading has to write
 *
 *     raw === null ? null : celsius(raw)
 *
 * which is the point. A constructor that swallowed `null` would put the decision back
 * where it cannot be seen.
 *
 * ⚠ They NAME a unit; they do not validate one. `celsius(NaN)`, `percent(-5)`,
 * `port(999999)` and `isoTimestamp('banana')` all type-check and all pass through
 * unchanged — the brand is erased at runtime, which is required so the JSON stays plain
 * numbers. Parsing and range-checking belong in the collector, and a value that failed to
 * parse is `null`, never `celsius(NaN)`.
 */

export const celsius = (v: number): Celsius => v as Celsius;
export const watts = (v: number): Watts => v as Watts;
export const mib = (v: number): MiB => v as MiB;
export const gib = (v: number): GiB => v as GiB;
export const mhz = (v: number): MHz => v as MHz;
export const rpm = (v: number): Rpm => v as Rpm;
export const percent = (v: number): Percent => v as Percent;
export const bytesPerSecond = (v: number): BytesPerSecond => v as BytesPerSecond;
export const seconds = (v: number): Seconds => v as Seconds;
export const pwm = (v: number): Pwm => v as Pwm;
export const port = (v: number): Port => v as Port;
export const tokens = (v: number): Tokens => v as Tokens;
export const isoTimestamp = (v: string): IsoTimestamp => v as IsoTimestamp;
export const throttleMask = (v: string): ThrottleMask => v as ThrottleMask;

// ---------------------------------------------------------------------------
// §3.7 Closed vocabularies
//
// "These are closed sets. A field typed as a bare `string` where this section names a
// vocabulary is a defect, because the UI switches on these values and an unmatched one
// falls through silently."
// ---------------------------------------------------------------------------

/**
 * Severity bands (§6.3). Not a field of the snapshot — the snapshot carries readings and
 * severity is derived from them in step 2 — but the vocabulary is fixed here so every
 * consumer spells it the same way.
 *
 * There is deliberately no `'unknown'` member. A reading that is `null` has no severity;
 * the caller handles `null` explicitly. And `paused`/`stale` are *modes*, not severities:
 * §6.2 requires them to be shown **alongside** the severity, never instead of it, so that
 * a paused dashboard cannot hide an alarm count.
 */
export type Severity = 'normal' | 'watch' | 'alarm';

/**
 * systemd's `ActiveState` (§3.3, §3.4, §3.6), read over D-Bus. All six values, which is
 * systemd's own closed vocabulary rather than a subset chosen here.
 *
 * §3.7 maps every one of them to a severity: `active` and `reloading` are ok — reloading
 * is running, and re-reading config is not a fault — `activating` and `deactivating` are
 * watch, `inactive` and `failed` are alarm. Step 2 owns the mapping code; the values it
 * maps are these and only these.
 *
 * ⚠ **`UnitState | null` means the state could not be READ, and nothing else** (§3.7). Four
 * routes reach it: the bus socket was unreachable, the conversation failed or was cut short
 * by its bound, the reply was not a D-Bus message, or `ActiveState` came back as a seventh
 * value. It carries no severity, renders `—`, and always has a `dbus` entry beside it. **A
 * unit that is not running is never `null`** — including one systemd has never loaded, whose
 * `GetUnit` reply is `NoSuchUnit` and which reads `inactive`.
 */
export type UnitState =
  | 'active'
  | 'reloading'
  | 'inactive'
  | 'failed'
  | 'activating'
  | 'deactivating';

/**
 * `/sys/class/net/eno1/operstate` (§3.5). The kernel's fixed vocabulary, verbatim.
 */
export type LinkState =
  | 'up'
  | 'down'
  | 'unknown'
  | 'dormant'
  | 'notpresent'
  | 'lowerlayerdown'
  | 'testing';

/**
 * The result of `GET http://127.0.0.1:PORT/health` (§3.4), which llama.cpp answers
 * without the API key. Fixed by §3.7:
 *
 * - `ok` — HTTP 200.
 * - `unhealthy` — answered but not ready. **llama.cpp returns 503 while a model loads**,
 *   which is this value and not `unreachable`.
 * - `unreachable` — connection refused, reset, or timed out.
 *
 * `null` is the fourth and different case: not probed this cycle (for instance the port
 * could not be read from the env file). It is spelled by the field, not by this union.
 */
export type HealthState = 'ok' | 'unhealthy' | 'unreachable';

/**
 * Where a failed reading came from (§3.7). Closed, because §6.5 requires matching an
 * error to the figure it explains — "that figure shows `—`, its `errors` entry is
 * available" — and matching needs a stable id, not free text.
 *
 * One name per *source*, finer-grained than §3's section headings: a failed
 * `/proc/meminfo` read must not blank the CPU panel's figures too.
 *
 * ⚠ `net-operstate` is deliberately separate from `proc-net-dev` (§3.7): the link state
 * comes from `/sys/class/net/eno1/operstate` and the throughput counters from `/proc`, so
 * folding them together would attribute a failed link read to the byte counters and point
 * the UI at the wrong figure. Eighteen names, matching §3.7 exactly.
 */
export type ErrorSource =
  | 'nvidia-smi'
  | 'coretemp'
  | 'proc-stat'
  | 'proc-meminfo'
  | 'proc-loadavg'
  | 'proc-uptime'
  | 'proc-net-dev'
  | 'net-operstate'
  | 'proc-cpuinfo'
  | 'hostname'
  | 'dell-smm'
  | 'dbus'
  | 'llama-env'
  | 'llama-health'
  | 'llama-models'
  | 'statvfs'
  | 'ufw'
  | 'dkms';

/**
 * How a throttle reason is presented (§3.7, §6.3).
 *
 * `neutral` is not "no severity by default" — it is a positive statement that the bit is
 * normal here. `0x4` is the routine 250 W power cap this box runs at continuously, and
 * §6.2 forbids styling it as a warning.
 */
export type ThrottleTreatment = 'neutral' | 'alarm';

/** The display name of one throttle bit (§3.7). */
export type ThrottleReasonName =
  | 'gpu idle'
  | 'applications clocks setting'
  | 'sw power cap'
  | 'hw slowdown'
  | 'sw thermal slowdown'
  | 'hw thermal slowdown'
  | 'hw power brake slowdown'
  | 'display clock setting';

/** One decoded bit of {@link ThrottleMask}. */
export interface ThrottleReason {
  /** The bit's numeric value, e.g. `0x20`. */
  readonly bit: number;
  /** The bit rendered as §3.7 renders it, e.g. `'0x20'`. */
  readonly code: string;
  readonly name: ThrottleReasonName;
  readonly treatment: ThrottleTreatment;
}

/**
 * §3.7's bit→name table for `clocks_throttle_reasons.active`, in bit order.
 *
 * This is the *vocabulary*, not the decoder: step 2 owns turning a {@link ThrottleMask}
 * into a list of these and rendering each as code + name (`0x20 sw thermal slowdown`),
 * with a mask of `0` or `0x4` alone carrying the note "normal, not a fault". The table
 * lives here so that the names and the neutral/alarm split are read from the spec once
 * rather than sourced from NVML by whoever writes the decoder.
 */
export const THROTTLE_REASONS: readonly ThrottleReason[] = [
  { bit: 0x1, code: '0x1', name: 'gpu idle', treatment: 'neutral' },
  { bit: 0x2, code: '0x2', name: 'applications clocks setting', treatment: 'neutral' },
  { bit: 0x4, code: '0x4', name: 'sw power cap', treatment: 'neutral' },
  { bit: 0x8, code: '0x8', name: 'hw slowdown', treatment: 'alarm' },
  { bit: 0x20, code: '0x20', name: 'sw thermal slowdown', treatment: 'alarm' },
  { bit: 0x40, code: '0x40', name: 'hw thermal slowdown', treatment: 'alarm' },
  { bit: 0x80, code: '0x80', name: 'hw power brake slowdown', treatment: 'alarm' },
  { bit: 0x100, code: '0x100', name: 'display clock setting', treatment: 'neutral' },
];

/**
 * The bits §6.3's alarm row means by "thermal throttle": `0x8`, `0x20`, `0x40` (§3.7).
 *
 * `0x80` (HW power brake) is an alarm in its own right but is not thermal, so it is not
 * in this mask — the two questions are asked separately.
 */
export const THERMAL_THROTTLE_BITS = 0x8 | 0x20 | 0x40;

// ---------------------------------------------------------------------------
// §3.1 GPUs
// ---------------------------------------------------------------------------

/**
 * One row of `nvidia-smi --query-gpu=... --format=csv,noheader,nounits` (§3.1).
 *
 * `index` is the only non-null field: it is the row's identity. §6.2 joins the serving
 * data onto the GPU card *by index*, so a row whose index did not parse cannot be placed
 * in a panel at all and is not a GPU — it is an `errors[]` entry. Every other column,
 * `name` and `bus` included, can come back as `[N/A]` and is therefore nullable.
 */
export interface Gpu {
  readonly index: number;
  readonly name: string | null;
  /** `pci.bus_id`, e.g. `97:00.0`. §9: GPU 1's id is read at runtime, never assumed. */
  readonly bus: string | null;
  /** §6.3: normal ≤ 69, watch 70–79, alarm ≥ 80. Spec 83, slowdown 87. */
  readonly tempC: Celsius | null;
  readonly powerW: Watts | null;
  /** 250 W on both cards, but read rather than assumed. */
  readonly powerCapW: Watts | null;
  readonly memUsedMiB: MiB | null;
  readonly memTotalMiB: MiB | null;
  readonly utilPct: Percent | null;
  readonly smClockMHz: MHz | null;
  /** The raw mask. §3.7's {@link THROTTLE_REASONS} is what decodes it. */
  readonly throttleReasons: ThrottleMask | null;
}

// ---------------------------------------------------------------------------
// §3.2 Host
// ---------------------------------------------------------------------------

/**
 * `/proc/loadavg`, 1 / 5 / 15 minutes. §6.6: three values, 2 dp, ` / `-separated.
 *
 * Nullable as a whole rather than per-element: all three come from one line of one file
 * in a single read, so either the line parsed or the reading failed. There is no state of
 * the machine in which the 5-minute average is readable and the 1-minute average is not,
 * and §6.6 has no rendering for a half-parsed load average.
 */
export type LoadAverage = readonly [number, number, number];

/** §3.2. */
export interface Host {
  /**
   * Aggregate CPU utilisation, a delta between polls.
   *
   * §6.7: deltas need two samples, so the first poll of a session renders `—` and must
   * never render `0`. That is what the `null` is for.
   */
  readonly cpuPct: Percent | null;
  readonly loadAvg: LoadAverage | null;
  /**
   * `coretemp` hwmon, `Package id 0`. Tjmax 100 °C; §6.3 bands at 79 / 89.
   *
   * ⚠ NOT `dell_smm`'s `temp1` (§3.2): measured 2026-08-18 it swung 43–54 °C at idle
   * while the package held 35–37 °C. If `coretemp` is absent this is `null` and an
   * `errors[]` entry — never a substituted reading from another sensor.
   */
  readonly cpuTempC: Celsius | null;
  /** `MemTotal - MemAvailable`. */
  readonly memUsedGiB: GiB | null;
  readonly memTotalGiB: GiB | null;
  /** §6.6: 2 dp, because small values must not round to `0.0` on a box where any swap matters. */
  readonly swapUsedGiB: GiB | null;
  readonly swapTotalGiB: GiB | null;
  /** §3.2: shown in the header beside the hostname — `up 2 d 02:01`. */
  readonly uptimeSec: Seconds | null;
  /** `uname -r`. Needed by the DKMS safety check (§3.6). */
  readonly kernel: string | null;
  /**
   * `/proc/cpuinfo` `model name`, first entry — `Intel(R) Xeon(R) W-2135` (§3.2).
   *
   * Carried raw. §3.2 trims it to `Xeon W-2135` *for display*, which makes the trimming a
   * formatter's job (step 2), not a collector's: a snapshot that has already discarded
   * text cannot be un-trimmed.
   */
  readonly cpuModel: string | null;
  /** Distinct `core id` + `physical id` pairs in `/proc/cpuinfo` — 6 here (§3.2). */
  readonly cores: number | null;
  /** The `processor` count in `/proc/cpuinfo` — 12 here (§3.2). */
  readonly threads: number | null;
}

// ---------------------------------------------------------------------------
// §3.3 Cooling
// ---------------------------------------------------------------------------

/**
 * The fan channels and the fan service. Shared by all three {@link Cooling} variants.
 *
 * ⚠ Only `fanN_input` appears here, and that is deliberate (§3.3, invariant 4).
 * `pwmN_enable` reads back `2` ("EC auto") even while a manual state is in force, and
 * `fanN_target` clamps to the HIGH nominal instead of erroring. Neither is in this
 * contract, so neither can be displayed or derived from by accident.
 */
export interface CoolingChannels {
  /** §3.6/§9: channels 1–4 survive a DKMS failure; only channel 5 disappears. */
  readonly fan1Rpm: Rpm | null;
  /** GPU-area OEM fan. Reported, never driven (§3.3) — the panel must not imply control. */
  readonly fan2Rpm: Rpm | null;
  readonly fan3Rpm: Rpm | null;
  readonly fan4Rpm: Rpm | null;
  /**
   * `fan5_input` — the GPU/PCIe header (`FAN_HDD`). Exists only with the DKMS 5-fan
   * module loaded.
   *
   * §6.3 bands: while engaged, ≥ 3500 normal, 3000–3499 watch, < 3000 alarm. The
   * **absolute** row applies in every mode and is **two-sided** — `> 5100` because an
   * implausible tach is the early warning for the reading that once hung POST at 14451
   * RPM, and `0` because no state this channel can be commanded into produces it.
   *
   * ⚠ `0` and `null` are not the same answer here and never render alike: `0` is a stopped
   * fan or a lost tach and colours the cell red, `null` is a channel that produced no
   * reading and colours nothing. Invariant 1, on the field it was written for.
   */
  readonly fan5Rpm: Rpm | null;
  /** `ActiveState` of `gpu-fan-control.service` (§3.3). */
  readonly serviceState: UnitState | null;
}

/** Channel 5 is under manual control: `pwm5` returned a number, so there *is* a number. */
export interface CoolingManual extends CoolingChannels {
  readonly ch5Mode: 'manual';
  readonly ch5Pwm: Pwm;
}

/**
 * Channel 5 is in EC automatic control: `pwm5` returned `ENODATA`.
 *
 * ⚠ This is HEALTHY (invariant 3, §3.7, §6.5). The driver returns `ENODATA` because state
 * 3 (AUTO) exceeds `i8k_fan_max` (2) — `if (ret > data->i8k_fan_max) return -ENODATA;`.
 * It renders as "EC auto" and never as an error.
 */
export interface CoolingEcAuto extends CoolingChannels {
  readonly ch5Mode: 'ec-auto';
  readonly ch5Pwm: null;
}

/**
 * The mode could not be determined. §3.7: "`null` means channel 5 is not enumerated at
 * all", and §6.5 requires it to render as *unavailable* — "never a blank RPM that reads
 * as zero".
 *
 * ⚠ This variant is NOT by itself the DKMS alarm. It covers both "the `pwm5` node is
 * absent" and "the node exists but could not be read" (`EACCES`, `EIO`), which §3.7 keeps
 * apart: the alarm is `safety.pwm5Present === false`, and `null` there is *unknown*. See
 * {@link Safety.pwm5Present}.
 */
export interface CoolingUnavailable extends CoolingChannels {
  readonly ch5Mode: null;
  readonly ch5Pwm: null;
}

/**
 * §3.3, with the mode derivation from `pwm5` encoded as a discriminated union.
 *
 * Narrow on `ch5Mode` to reach `ch5Pwm`:
 *
 * ```ts
 * if (cooling.ch5Mode === 'manual') {
 *   render(`HIGH pwm ${cooling.ch5Pwm}`);   // Pwm, not Pwm | null
 * }
 * ```
 *
 * The three variants are exhaustive, so a `switch` over `ch5Mode` with no default is
 * checked by the compiler.
 *
 * ### ⚠ There is no fourth variant, and `{ ch5Mode: 'manual', ch5Pwm: null }` is not one
 *
 * §6.6 and §6.7 both describe *"the mode is `manual` but the duty is not a reading"*, and
 * this union cannot hold it. That was examined in step 4 and the union was **kept**, on
 * four grounds worth recording so it is not re-opened:
 *
 * 1. A fourth variant and a nullable `ch5Pwm` on {@link CoolingManual} are **the same
 *    type**. Two members sharing the discriminant value `'manual'` both narrow under
 *    `if (c.ch5Mode === 'manual')`, so `c.ch5Pwm` is `Pwm | null` either way. Keeping them
 *    apart would need a *different* discriminant, which means changing §3.7's closed
 *    `ch5Mode` vocabulary and every switch in the project.
 * 2. It would fix two of the seven states that reach it — an `EIO` or `EACCES` on `pwm5` is
 *    §3.7 row 5 and is correctly `ch5Mode: null` — and none of the ones that matter.
 * 3. It would make the headline case *less* red. With a fourth variant, a stopped fan on a
 *    channel commanded HIGH whose duty will not parse gives `ch5Engagement: 'unknown'` and
 *    therefore no colour; §6.3's two-sided absolute row gives it **alarm**.
 * 4. A duty that failed to parse must not mint a `Pwm` (O6, and the brand constructors do
 *    not validate), so the only representable answer is {@link CoolingUnavailable}.
 *
 * The collector therefore reports an unreadable duty as `ch5Mode: null` and it renders
 * *unavailable*, not `—`. **§6.6 and §6.7 still say `—`, and that is an open spec gap**
 * (step 4's reconciliation notes) — the contract is right and the prose has not caught up.
 * `safety.pwm5Present` is what separates "the duty is unreadable" (`true`) from "channel 5
 * is not there" (`false`) from "could not look" (`null`); steps 9/10 should render that.
 *
 * ⚠ **`ch5Engagement`'s `'unknown'` and `formatCh5Pwm`'s em-dash branch are therefore
 * unreachable from the collector — and they are NOT dead code.** They are **wire
 * defences**: O10 is open, nothing validates a `fetch` response, and `pwmStateName` guards
 * `Number.isFinite`, so a payload carrying `{ ch5Mode: 'manual', ch5Pwm: null }` lands on
 * `'unknown'` at runtime today. Deleting either would trade a defence for tidiness.
 */
export type Cooling = CoolingManual | CoolingEcAuto | CoolingUnavailable;

/**
 * §3.7's `ch5Mode` vocabulary — `'manual' | 'ec-auto' | null` — as an importable name.
 *
 * Derived from {@link Cooling} rather than written out again: an alias that restated the
 * three literals would be a second place for the vocabulary to live, and a `switch` over
 * a drifted copy would type-check against a union the wire never sends.
 */
export type Ch5Mode = Cooling['ch5Mode'];

// ---------------------------------------------------------------------------
// §3.4 Serving
// ---------------------------------------------------------------------------

/**
 * One `llama-server@N` instance (§3.4).
 *
 * Instances are **discovered, not hard-coded** — enumerated from `/etc/llama-server/*.env`
 * — so a third card must appear without a code change. `instance` is the non-null
 * identity, taken from the env filename; everything read *about* the instance can fail
 * independently, which is the normal case when a unit is down but its env file is intact.
 */
export interface ServingInstance {
  readonly instance: number;
  /** `PORT=` from the env file. */
  readonly port: Port | null;
  /** `ActiveState` of `llama-server@N.service`. */
  readonly unitState: UnitState | null;
  /** Model alias from `GET /v1/models` — answered without the API key. */
  readonly model: string | null;
  /** `CTX=` from the env file. §6.6: thousands separated. */
  readonly ctx: Tokens | null;
  /** §3.7. `null` means not probed this cycle, which is not `unreachable`. */
  readonly health: HealthState | null;
}

// ---------------------------------------------------------------------------
// §3.5 Disk & network
// ---------------------------------------------------------------------------

/** One mount point, via `statvfs` (§3.5). §6.3: free ≥ 15 % normal, 5–15 % watch, < 5 % alarm. */
export interface Filesystem {
  readonly usedGiB: GiB | null;
  readonly totalGiB: GiB | null;
}

/** `eno1` (§3.5). The interface is fixed by the spec; the dashboard is not multi-host. */
export interface Network {
  /**
   * `/proc/net/dev` delta between polls. Like `cpuPct` this needs two samples, so it is
   * `null` on the first poll of a session and never `0` (§6.7).
   */
  readonly rxBytesPerSec: BytesPerSecond | null;
  readonly txBytesPerSec: BytesPerSecond | null;
  /** `/sys/class/net/eno1/operstate`. */
  readonly link: LinkState | null;
}

/** §3.5, matching §4's `storage: { root, home, net }`. */
export interface Storage {
  /**
   * `/` — the **232.6 GiB root filesystem** on the 238.5 GiB NVMe (§3.5). The two are
   * different numbers: `statvfs` measures the filesystem, `lsblk` the device.
   */
  readonly root: Filesystem;
  /**
   * `/home` — the **915.8 GiB filesystem** on the 931.5 GiB Crucial, holding `~/models`.
   * The one to watch (§3.5).
   */
  readonly home: Filesystem;
  readonly net: Network;
}

// ---------------------------------------------------------------------------
// §3.6 Safety
// ---------------------------------------------------------------------------

/**
 * The four things on this box that fail silently (§3.6). Not hardware — each of these has
 * already cost real time. Field names are fixed by §3.7.
 *
 * `null` means the check could not be performed (the file was not mounted, D-Bus did not
 * answer), which is emphatically not the same as the check *failing*. A missing
 * `/etc/ufw/ufw.conf` is not evidence that ufw is enforcing, and it is not evidence that
 * it is not; it is an `errors[]` entry and a `null`.
 */
export interface Safety {
  /**
   * `ENABLED=` in `/etc/ufw/ufw.conf`. **`yes` on this box as of 2026-09-06**, so `false`
   * is not currently a state that occurs here and §6.4's standing machinery has no live
   * subject.
   *
   * §6.3 gives `false` alarm severity but §6.4 *displays* it at watch while it is declared
   * standing, so that a permanent condition cannot hold the banner open forever. The
   * severity is the truth; the display is the concession. This field carries only the
   * fact — the standing logic is step 2's.
   *
   * ⚠ The check reads `ENABLED=` only. `/etc/ufw/user.rules` is root-only, so `true` means
   * the firewall is on and says **nothing about which ports it allows** (§2.1).
   *
   * ⚠ Never derive this from `systemctl is-active ufw`. That reads `active (exited)` on a
   * disabled firewall — the oneshot that hid a non-enforcing firewall for a week in
   * 2026-09-04.
   */
  readonly ufwEnforcing: boolean | null;
  /**
   * Does a `pwm5` node exist on the `dell_smm` hwmon? **Three-valued (§3.7), and the three
   * are genuinely different:**
   *
   * | value | meaning | SAFETY row |
   * |---|---|---|
   * | `true` | the `pwm5` node exists | pass |
   * | `false` | `dell_smm` was read, `pwm5` is absent | **alarm** — the 5-fan module did not load |
   * | `null` | the check could not be performed (`/sys` not mounted, no `dell_smm` hwmon, `EACCES`) | **unknown, not alarm** |
   *
   * Its relationship to {@link Cooling} is **one-directional**:
   *
   * > `ch5Mode !== null` ⟹ `pwm5Present === true`.
   * > Contrapositive: if `pwm5Present` is `false` **or** `null`, `ch5Mode` is `null`.
   *
   * The converse does not hold, in either direction. `ch5Mode === null` says only that
   * the mode could not be determined, which includes the case where the probe itself
   * could not be performed; and a `pwm5` that exists but fails with `EACCES` has
   * `pwm5Present === true` with `ch5Mode === null`.
   *
   * ⚠ §3.7: the two fields "must both be derived from ONE three-valued probe, never from
   * each other". Deriving `pwm5Present` from `ch5Mode` turns an unmounted `/sys` into a
   * banner claiming GPU fan control is gone — invariant 1 inverted, on the panel that
   * earns this dashboard's existence. The obligation on the collectors is recorded in
   * `pipeline/HANDOVER.md`.
   */
  readonly pwm5Present: boolean | null;
  /**
   * Is `updates/dkms/dell-smm-hwmon.ko*` present under `/lib/modules/<running kernel>/`?
   *
   * False means the next boot loses `pwm5` — the documented kernel-upgrade failure that
   * `dkms install -k <NEW-KVER>` pre-empts. Needs {@link Host.kernel}.
   */
  readonly dkmsForRunningKernel: boolean | null;
  /**
   * `ActiveState` of `gpu-fan-control.service` (§3.7).
   *
   * ⚠ A **state string, not a boolean**: the SAFETY panel shows *which* state, and a
   * boolean would collapse `failed` and `inactive` into one glyph. Not active means the
   * cards are on the EC's curve, which measurably ignores GPU temperature on every header
   * it owns.
   *
   * §3.3 carries the same reading as {@link CoolingChannels.serviceState}, because §3.6
   * lists the fan service as one of the four safety checks and §6.2 puts SAFETY next to
   * COOLING. They are one D-Bus read rendered in two panels and must never disagree; the
   * obligation is recorded in `pipeline/HANDOVER.md`.
   */
  readonly fanServiceState: UnitState | null;
}

// ---------------------------------------------------------------------------
// §4 The snapshot
// ---------------------------------------------------------------------------

/**
 * One failed reading (§4).
 *
 * "`errors` is part of the contract, not an afterthought. A partial snapshot is the normal
 * case on this machine, and the UI must be able to say *which* reading failed rather than
 * rendering a plausible-looking zero."
 *
 * `source` is drawn from §3.7's closed set so the UI can match an error to the figure it
 * explains (§6.5). `message` is free text for display.
 */
export interface TelemetryError {
  readonly source: ErrorSource;
  readonly message: string;
}

/**
 * The full response body of `GET /api/telemetry` (§4).
 *
 * Which top-level members can be `null`, and why:
 *
 * - `host`, `cooling`, `storage`, `safety` are **never** `null`. They are containers of
 *   independent readings, and every leaf inside them is individually nullable. §6.5: "A
 *   single sensor read fails → that figure shows `—` … the rest of the panel renders." A
 *   nullable container would let one bad sensor blank a whole panel.
 * - `gpus` and `serving` **are** nullable, and `null` differs from `[]` — but not in the
 *   way this comment used to claim. §3.1, measured on driver 580.173.02: **`null` = the
 *   enumeration could not be performed, INCLUDING a box with genuinely no cards** (that
 *   state exits 6 with `No devices were found`, and every non-zero exit is `null`, carrying
 *   the driver's own text). **`[]` = the command succeeded and produced no parseable rows**,
 *   and it **always carries an `errors[]` entry**, so it is never silent. §3.1 renders both
 *   as "no GPUs enumerated"; only the second is evidence of a bug in us. Consume with
 *   `snapshot.gpus ?? []`.
 *
 *   The earlier claim — that `[]` was "the enumeration ran and found nothing, a real,
 *   previously-observed state of this box" — was false: the box's no-GPU weeks produced
 *   exit 6, which is `null`. Corrected in step 3, code unchanged; `nvidia-smi -i 5`
 *   reproduces it read-only on a healthy box.
 * - `errors` is never `null`. An empty array is a complete snapshot; there is no state in
 *   which the list of errors is itself unreadable.
 * - `standing` is never `null` either, and for a different reason: it is **configuration**,
 *   not a reading (§4). An unset `STANDING` is `[]` — nothing is standing — which is the
 *   safe direction rather than an unknown.
 * - `ts` is never `null` — the server always knows what time it is.
 *
 * `hostname` is a top-level member because that is where §4's example JSON puts it, even
 * though §3.2's table names its source. It comes from a read-only bind of `/etc/hostname`
 * (§2.2): `os.hostname()` inside the container returns the container's UTS hostname, since
 * `--network host` shares the network namespace and not UTS.
 *
 * There is no "last successful read" field. §4 fixes the server as stateless ("Sampling is
 * per-request, not a background loop"), so §3.1's "the timestamp of the last successful
 * read" is necessarily derived by the client from its own ring buffer (§6.7).
 */
export interface TelemetrySnapshot {
  /** ISO-8601 UTC. The browser renders it in local time with the zone shown once (§6.6). */
  readonly ts: IsoTimestamp;
  readonly hostname: string | null;
  /**
   * §4's one **configuration** field, and the only member of this contract that is not a
   * reading — `STANDING` from `/etc/ai-dashboard.env`, echoed verbatim.
   *
   * ⚠ **Never parsed server-side.** §6.4's *"an id that matches no kind is reported as
   * unknown"* is a client-side fact, decided by `parseStandingIds`; one malformed entry must
   * not be able to fail a poll. The server splits on the separator §6.4 fixes and does
   * nothing else — no trimming, no validation, no dropping.
   *
   * Unset `STANDING` sends `[]`, which is the safe direction: a missing list can only make
   * the dashboard **louder**. `[]` is therefore *not* a failure state and carries no
   * `errors[]` entry, unlike every `null` in this contract.
   *
   * ⚠ **It is never rendered on the server-side shell** (§4). §5 leaves `/` reachable with a
   * revoked cookie, and the list of alarms an operator has chosen to silence is operational
   * intelligence, not decoration.
   */
  readonly standing: readonly string[];
  readonly gpus: readonly Gpu[] | null;
  readonly host: Host;
  readonly cooling: Cooling;
  readonly serving: readonly ServingInstance[] | null;
  readonly storage: Storage;
  readonly safety: Safety;
  readonly errors: readonly TelemetryError[];
}
