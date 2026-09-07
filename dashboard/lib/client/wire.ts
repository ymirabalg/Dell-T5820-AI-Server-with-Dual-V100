/**
 * O10 — **validate the wire shape; do not assert it.**
 *
 * HANDOVER, twice: *"The constructors name a unit; they do not validate one. They are
 * `v as T`, erased at runtime — so **O10: no `as TelemetrySnapshot` on a `fetch` response**,
 * and no coercion of `serving: null` to `[]`."*
 *
 * A cast tells the compiler what to believe about bytes nobody checked. Everything this
 * client does downstream — `severityFanStopped`'s `value === 0`, `severityUnitState`'s
 * exhaustive switch, §6.4's condition ids, §6.6's formatters — assumes the contract holds.
 * So it is checked here, once, at the only place bytes enter the process.
 *
 * ### What "valid" means
 *
 * - **Every field of §4's snapshot must be present**, with a value its type allows. A
 *   *missing* key is not `null`: `null` is a reading this box could not take (invariant 1)
 *   and a missing key is a server that does not implement this contract. The second is a
 *   failed poll; the first is Tuesday.
 * - **Unknown extra keys are ignored**, so a later server may add a field without breaking
 *   an older tab.
 * - **`null` is preserved exactly.** `serving: null` stays `null` — §3.1 and the do-not-copy
 *   list both say it is not `[]`, on the wire and after validation.
 * - **The closed vocabularies are checked** (§3.7): `UnitState`, `LinkState`, `HealthState`,
 *   `ErrorSource`. ⚠ dbus.ts states the cost of not doing it: a seventh `ActiveState` "would
 *   put a seventh value into a union the UI switches on exhaustively, and §6.3's
 *   `severityUnitState` would return `undefined` for it — an uncoloured row on the panel
 *   that reports whether GPU fan control is running."
 * - **`ts` must parse as a date.** §6.7 draws traces "against time, not index", so a `ts`
 *   that is not a time has no place on the axis. {@link parseSnapshot} returns the parsed
 *   epoch alongside the snapshot rather than re-parsing it at every render.
 *
 * ### ⚠ The vocabularies are `Record<T, true>` tables, not lists
 *
 * `Object.hasOwn(UNIT_STATES, v)` needs the table to be exhaustive, and
 * `Readonly<Record<UnitState, true>>` makes a missing member a **compile error** — the same
 * device `lib/conditions.ts` uses for `CONDITION_KIND_RULES`. The strings are written twice
 * in this tree (`dbus.ts` and `proc.ts` hold the server-side halves) because those modules
 * import `node:net`, but neither copy can drift from `lib/types.ts`: both are checked
 * against the union by the compiler. `lib/client/wire.test-d.ts` pins that.
 */

import type {
  Cooling,
  ErrorSource,
  Filesystem,
  Gpu,
  HealthState,
  Host,
  LinkState,
  LoadAverage,
  Network,
  Safety,
  ServingInstance,
  Storage,
  TelemetryError,
  TelemetrySnapshot,
  UnitState,
} from '../types';
import {
  bytesPerSecond,
  celsius,
  gb,
  gib,
  isoTimestamp,
  mhz,
  mib,
  percent,
  port,
  pwm,
  rpm,
  seconds,
  throttleMask,
  tokens,
  watts,
} from '../types';

// ---------------------------------------------------------------------------
// The closed vocabularies (§3.7), as exhaustive tables
// ---------------------------------------------------------------------------

const UNIT_STATES: Readonly<Record<UnitState, true>> = {
  active: true,
  reloading: true,
  inactive: true,
  failed: true,
  activating: true,
  deactivating: true,
};

const LINK_STATES: Readonly<Record<LinkState, true>> = {
  up: true,
  down: true,
  unknown: true,
  dormant: true,
  notpresent: true,
  lowerlayerdown: true,
  testing: true,
};

const HEALTH_STATES: Readonly<Record<HealthState, true>> = {
  ok: true,
  unhealthy: true,
  unreachable: true,
};

const ERROR_SOURCES: Readonly<Record<ErrorSource, true>> = {
  'nvidia-smi': true,
  coretemp: true,
  'proc-stat': true,
  'proc-meminfo': true,
  'proc-loadavg': true,
  'proc-uptime': true,
  'proc-net-dev': true,
  'net-operstate': true,
  'proc-cpuinfo': true,
  hostname: true,
  'dell-smm': true,
  dbus: true,
  'llama-env': true,
  'llama-health': true,
  'llama-models': true,
  statvfs: true,
  ufw: true,
  dkms: true,
};

// ---------------------------------------------------------------------------
// Primitives. Each answers `undefined` for "not this", which is never a valid value here.
// ---------------------------------------------------------------------------

/**
 * ⚠ `undefined` is the failure signal throughout this file, **not `null`** — `null` is a
 * value every reading may legitimately hold. Conflating them would turn a server that
 * omitted `tempC` into a card reporting `—`, which is invariant 1 read backwards.
 */
type Checked<T> = T | undefined;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const field = (source: Record<string, unknown>, key: string): unknown =>
  Object.hasOwn(source, key) ? source[key] : undefined;

/**
 * `new Date().toISOString()`, which is what `lib/telemetry/source.ts` stamps — and nothing
 * looser.
 *
 * ⚠ `Date.parse` alone is not a validator. It falls back to an implementation-defined
 * parse for anything that is not ISO-8601, so `Date.parse('5')` is a real epoch on V8 and
 * `'ai-server'` is `NaN` only by luck of spelling. §6.6 fixes the wire format — "The server
 * sends ISO-8601 UTC in `ts`" — so the check is the format first.
 *
 * ⚠ **And the format is not enough either, because `Date.parse` ROLLS AN IMPOSSIBLE DATE
 * FORWARD.** `2026-13-01T00:00:00Z` is rejected, which is what this file used to claim was
 * the whole residue — but `2026-02-30T00:00:00.000Z` matches the shape, parses happily, and
 * lands on **2026-03-02**. A sample placed two days from where it says it is, on the axis
 * §6.7 insists is drawn "against time, not index", is not a documentation nit. So the parsed
 * epoch is round-tripped against the calendar by {@link calendarMatches}.
 */
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;

/** `YYYY-MM-DDTHH:MM:SS` — everything `toISOString()` writes before the fraction. */
const CALENDAR_CHARS = 19;

/**
 * Did `Date.parse` read the calendar date the string actually names?
 *
 * Compared over the first 19 characters rather than over the whole string, because the
 * fraction is the one part `toISOString()` normalises — `'…:00.5Z'` is a legal ISO-8601
 * half-second and comes back as `'…:00.500Z'`. A rolled-forward date always moves inside
 * these 19, so nothing that matters is outside the comparison.
 */
const calendarMatches = (raw: string, tsMs: number): boolean =>
  new Date(tsMs).toISOString().slice(0, CALENDAR_CHARS) === raw.slice(0, CALENDAR_CHARS);

/** A finite `number`. JSON cannot carry `NaN`, but a hand-rolled server could send a string. */
const numberOrNull = (value: unknown): Checked<number | null> => {
  if (value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
};

const stringOrNull = (value: unknown): Checked<string | null> => {
  if (value === null) return null;
  return typeof value === 'string' ? value : undefined;
};

const booleanOrNull = (value: unknown): Checked<boolean | null> => {
  if (value === null) return null;
  return typeof value === 'boolean' ? value : undefined;
};

const memberOrNull = <T extends string>(
  table: Readonly<Record<T, true>>,
  value: unknown,
): Checked<T | null> => {
  if (value === null) return null;
  if (typeof value !== 'string') return undefined;
  return Object.hasOwn(table, value) ? (value as T) : undefined;
};

/** A `number` that may not be `null` — `Gpu.index`, `ServingInstance.instance`. */
const integer = (value: unknown): Checked<number> => {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
  return value;
};

/** Map a branded reading through its constructor, keeping `null` as `null`. */
const branded = <T>(value: Checked<number | null>, make: (v: number) => T): Checked<T | null> =>
  value === undefined ? undefined : value === null ? null : make(value);

/** Every member of an array must validate, or the array does not. */
const arrayOf = <T>(value: unknown, item: (v: unknown) => Checked<T>): Checked<readonly T[]> => {
  if (!Array.isArray(value)) return undefined;
  const out: T[] = [];
  for (const entry of value) {
    const checked = item(entry);
    if (checked === undefined) return undefined;
    out.push(checked);
  }
  return out;
};

/**
 * A `string`, and only a `string` — no `null` accepted.
 *
 * §4's `standing` is configuration rather than a reading, so `null` is not one of its values
 * at any depth: an unset `STANDING` is `[]`.
 */
const plainString = (value: unknown): Checked<string> =>
  typeof value === 'string' ? value : undefined;

/** `T[] | null`, and **`null` is not `[]`** — the distinction §3.1 spends a paragraph on. */
const arrayOrNull = <T>(
  value: unknown,
  item: (v: unknown) => Checked<T>,
): Checked<readonly T[] | null> => (value === null ? null : arrayOf(value, item));

// ---------------------------------------------------------------------------
// §4's collections
// ---------------------------------------------------------------------------

const gpuOf = (value: unknown): Checked<Gpu> => {
  if (!isRecord(value)) return undefined;
  const index = integer(field(value, 'index'));
  const name = stringOrNull(field(value, 'name'));
  const bus = stringOrNull(field(value, 'bus'));
  const tempC = branded(numberOrNull(field(value, 'tempC')), celsius);
  const powerW = branded(numberOrNull(field(value, 'powerW')), watts);
  const powerCapW = branded(numberOrNull(field(value, 'powerCapW')), watts);
  const memUsedMiB = branded(numberOrNull(field(value, 'memUsedMiB')), mib);
  const memTotalMiB = branded(numberOrNull(field(value, 'memTotalMiB')), mib);
  const utilPct = branded(numberOrNull(field(value, 'utilPct')), percent);
  const smClockMHz = branded(numberOrNull(field(value, 'smClockMHz')), mhz);
  const rawThrottle = stringOrNull(field(value, 'throttleReasons'));
  if (
    index === undefined ||
    name === undefined ||
    bus === undefined ||
    tempC === undefined ||
    powerW === undefined ||
    powerCapW === undefined ||
    memUsedMiB === undefined ||
    memTotalMiB === undefined ||
    utilPct === undefined ||
    smClockMHz === undefined ||
    rawThrottle === undefined
  ) {
    return undefined;
  }
  return {
    index,
    name,
    bus,
    tempC,
    powerW,
    powerCapW,
    memUsedMiB,
    memTotalMiB,
    utilPct,
    smClockMHz,
    throttleReasons: rawThrottle === null ? null : throttleMask(rawThrottle),
  };
};

const loadAverageOf = (value: unknown): Checked<LoadAverage | null> => {
  if (value === null) return null;
  if (!Array.isArray(value) || value.length !== 3) return undefined;
  const [one, five, fifteen] = value;
  if (
    typeof one !== 'number' ||
    typeof five !== 'number' ||
    typeof fifteen !== 'number' ||
    !Number.isFinite(one) ||
    !Number.isFinite(five) ||
    !Number.isFinite(fifteen)
  ) {
    return undefined;
  }
  return [one, five, fifteen];
};

const hostOf = (value: unknown): Checked<Host> => {
  if (!isRecord(value)) return undefined;
  const cpuPct = branded(numberOrNull(field(value, 'cpuPct')), percent);
  const loadAvg = loadAverageOf(field(value, 'loadAvg'));
  const cpuTempC = branded(numberOrNull(field(value, 'cpuTempC')), celsius);
  const memUsedGiB = branded(numberOrNull(field(value, 'memUsedGiB')), gib);
  const memTotalGiB = branded(numberOrNull(field(value, 'memTotalGiB')), gib);
  const swapUsedGiB = branded(numberOrNull(field(value, 'swapUsedGiB')), gib);
  const swapTotalGiB = branded(numberOrNull(field(value, 'swapTotalGiB')), gib);
  const uptimeSec = branded(numberOrNull(field(value, 'uptimeSec')), seconds);
  const kernel = stringOrNull(field(value, 'kernel'));
  const cpuModel = stringOrNull(field(value, 'cpuModel'));
  const cores = numberOrNull(field(value, 'cores'));
  const threads = numberOrNull(field(value, 'threads'));
  if (
    cpuPct === undefined ||
    loadAvg === undefined ||
    cpuTempC === undefined ||
    memUsedGiB === undefined ||
    memTotalGiB === undefined ||
    swapUsedGiB === undefined ||
    swapTotalGiB === undefined ||
    uptimeSec === undefined ||
    kernel === undefined ||
    cpuModel === undefined ||
    cores === undefined ||
    threads === undefined
  ) {
    return undefined;
  }
  return {
    cpuPct,
    loadAvg,
    cpuTempC,
    memUsedGiB,
    memTotalGiB,
    swapUsedGiB,
    swapTotalGiB,
    uptimeSec,
    kernel,
    cpuModel,
    cores,
    threads,
  };
};

/**
 * §3.3's three-variant union, discriminated on `ch5Mode`.
 *
 * ⚠ This is the validation a cast can never do, and it is load-bearing: §6.6 says "a duty
 * that is not a reading leaves the **mode** undetermined, not merely the duty", so
 * `{ ch5Mode: 'manual', ch5Pwm: null }` is not a state the contract can hold. Accepting it
 * would hand `ch5Engagement` a `manual` channel with no duty and put the COOLING panel one
 * `??` away from asserting health it cannot see.
 *
 * ⚠ **An out-of-range or fractional duty is not a reading either**, and the same sentence
 * governs it. §6.7 spells the case out by number: "A `pwm5` of `999` … leaves the mode
 * undetermined, so the cooling cell reads **`unavailable`** rather than `—`." `manual`
 * asserts the duty *is* a reading, so `{ manual, 999 }` is contract-impossible in exactly the
 * way `{ manual, null }` already is. The row that earns the check is `{ manual, 12.7 }`:
 * `pwmStateName` would round it and the cell would read **`OFF pwm 13`** — an integer the
 * machine never reported. The driver's range is 0–255, whole numbers only (§3.3).
 */
/** The driver's duty range (§3.3, §6.6). `0` is OFF and a real reading; `256` is not one. */
const PWM_MIN = 0;
const PWM_MAX = 255;

const coolingOf = (value: unknown): Checked<Cooling> => {
  if (!isRecord(value)) return undefined;
  const fan1Rpm = branded(numberOrNull(field(value, 'fan1Rpm')), rpm);
  const fan2Rpm = branded(numberOrNull(field(value, 'fan2Rpm')), rpm);
  const fan3Rpm = branded(numberOrNull(field(value, 'fan3Rpm')), rpm);
  const fan4Rpm = branded(numberOrNull(field(value, 'fan4Rpm')), rpm);
  const fan5Rpm = branded(numberOrNull(field(value, 'fan5Rpm')), rpm);
  const serviceState = memberOrNull(UNIT_STATES, field(value, 'serviceState'));
  if (
    fan1Rpm === undefined ||
    fan2Rpm === undefined ||
    fan3Rpm === undefined ||
    fan4Rpm === undefined ||
    fan5Rpm === undefined ||
    serviceState === undefined
  ) {
    return undefined;
  }
  const channels = { fan1Rpm, fan2Rpm, fan3Rpm, fan4Rpm, fan5Rpm, serviceState };

  const mode = field(value, 'ch5Mode');
  const duty = field(value, 'ch5Pwm');
  if (mode === 'manual') {
    if (typeof duty !== 'number' || !Number.isInteger(duty)) return undefined;
    if (duty < PWM_MIN || duty > PWM_MAX) return undefined;
    return { ...channels, ch5Mode: 'manual', ch5Pwm: pwm(duty) };
  }
  if (duty !== null) return undefined;
  if (mode === 'ec-auto') return { ...channels, ch5Mode: 'ec-auto', ch5Pwm: null };
  if (mode === null) return { ...channels, ch5Mode: null, ch5Pwm: null };
  return undefined;
};

const servingInstanceOf = (value: unknown): Checked<ServingInstance> => {
  if (!isRecord(value)) return undefined;
  const instance = integer(field(value, 'instance'));
  const portValue = branded(numberOrNull(field(value, 'port')), port);
  const unitState = memberOrNull(UNIT_STATES, field(value, 'unitState'));
  const model = stringOrNull(field(value, 'model'));
  const ctx = branded(numberOrNull(field(value, 'ctx')), tokens);
  const health = memberOrNull(HEALTH_STATES, field(value, 'health'));
  if (
    instance === undefined ||
    portValue === undefined ||
    unitState === undefined ||
    model === undefined ||
    ctx === undefined ||
    health === undefined
  ) {
    return undefined;
  }
  return { instance, port: portValue, unitState, model, ctx, health };
};

const filesystemOf = (value: unknown): Checked<Filesystem> => {
  if (!isRecord(value)) return undefined;
  const usedGB = branded(numberOrNull(field(value, 'usedGB')), gb);
  const totalGB = branded(numberOrNull(field(value, 'totalGB')), gb);
  if (usedGB === undefined || totalGB === undefined) return undefined;
  return { usedGB, totalGB };
};

const networkOf = (value: unknown): Checked<Network> => {
  if (!isRecord(value)) return undefined;
  const rxBytesPerSec = branded(numberOrNull(field(value, 'rxBytesPerSec')), bytesPerSecond);
  const txBytesPerSec = branded(numberOrNull(field(value, 'txBytesPerSec')), bytesPerSecond);
  const link = memberOrNull(LINK_STATES, field(value, 'link'));
  if (rxBytesPerSec === undefined || txBytesPerSec === undefined || link === undefined) {
    return undefined;
  }
  return { rxBytesPerSec, txBytesPerSec, link };
};

const storageOf = (value: unknown): Checked<Storage> => {
  if (!isRecord(value)) return undefined;
  const root = filesystemOf(field(value, 'root'));
  const home = filesystemOf(field(value, 'home'));
  const net = networkOf(field(value, 'net'));
  if (root === undefined || home === undefined || net === undefined) return undefined;
  return { root, home, net };
};

const safetyOf = (value: unknown): Checked<Safety> => {
  if (!isRecord(value)) return undefined;
  const ufwEnforcing = booleanOrNull(field(value, 'ufwEnforcing'));
  const pwm5Present = booleanOrNull(field(value, 'pwm5Present'));
  const dkmsForRunningKernel = booleanOrNull(field(value, 'dkmsForRunningKernel'));
  const fanServiceState = memberOrNull(UNIT_STATES, field(value, 'fanServiceState'));
  if (
    ufwEnforcing === undefined ||
    pwm5Present === undefined ||
    dkmsForRunningKernel === undefined ||
    fanServiceState === undefined
  ) {
    return undefined;
  }
  return { ufwEnforcing, pwm5Present, dkmsForRunningKernel, fanServiceState };
};

const telemetryErrorOf = (value: unknown): Checked<TelemetryError> => {
  if (!isRecord(value)) return undefined;
  const rawSource = field(value, 'source');
  if (typeof rawSource !== 'string' || !Object.hasOwn(ERROR_SOURCES, rawSource)) return undefined;
  const message = field(value, 'message');
  if (typeof message !== 'string') return undefined;
  return { source: rawSource as ErrorSource, message };
};

// ---------------------------------------------------------------------------
// The snapshot
// ---------------------------------------------------------------------------

/**
 * A validated snapshot and the epoch its `ts` names.
 *
 * ⚠ `tsMs` is derived from the server's `ts` and **nothing else**. §4: "`ts` is the instant
 * the poll BEGAN … start-stamping can only over-state age, which is the direction every
 * reading here must err in." Re-stamping on arrival would silently make every reading look
 * fresher than it is, and it is exactly the correction HANDOVER tells step 8 not to make.
 */
export interface WireSnapshot {
  readonly snapshot: TelemetrySnapshot;
  /** `Date.parse(snapshot.ts)`. The x-axis, and the numerator of §6.2's age indicator. */
  readonly tsMs: number;
}

/**
 * §4's snapshot out of an unvalidated `fetch` body, or `null`.
 *
 * `null` is a server that did not answer the contract, and §6.7 treats it as a **failed
 * poll** — the grey dot, the counting age, the frozen traces and the backoff. It is not a
 * partial snapshot: a partial snapshot is a well-formed 200 carrying `errors[]`, "the
 * normal case on this machine" (invariant 5), and it validates here like any other.
 */
export const parseSnapshot = (value: unknown): WireSnapshot | null => {
  if (!isRecord(value)) return null;

  const rawTs = field(value, 'ts');
  if (typeof rawTs !== 'string' || !ISO_UTC.test(rawTs)) return null;
  const tsMs = Date.parse(rawTs);
  if (!Number.isFinite(tsMs)) return null;
  if (!calendarMatches(rawTs, tsMs)) return null;

  const hostname = stringOrNull(field(value, 'hostname'));
  // ⚠ Required, like every other key in this contract. Server and client ship in one image,
  // so there is no version skew for an optional key to absorb, and *which keys are optional*
  // is precisely the ambiguity §4's validator has none of. The **ids** are not judged here:
  // §6.4's "an id that matches no kind is reported as unknown" is `parseStandingIds`'s, in
  // the browser, and a malformed entry must reach it rather than fail the poll.
  const standing = arrayOf(field(value, 'standing'), plainString);
  const gpus = arrayOrNull(field(value, 'gpus'), gpuOf);
  const host = hostOf(field(value, 'host'));
  const cooling = coolingOf(field(value, 'cooling'));
  const serving = arrayOrNull(field(value, 'serving'), servingInstanceOf);
  const storage = storageOf(field(value, 'storage'));
  const safety = safetyOf(field(value, 'safety'));
  const errors = arrayOf(field(value, 'errors'), telemetryErrorOf);

  if (
    hostname === undefined ||
    standing === undefined ||
    gpus === undefined ||
    host === undefined ||
    cooling === undefined ||
    serving === undefined ||
    storage === undefined ||
    safety === undefined ||
    errors === undefined
  ) {
    return null;
  }

  const snapshot: TelemetrySnapshot = {
    ts: isoTimestamp(rawTs),
    hostname,
    standing,
    gpus,
    host,
    cooling,
    serving,
    storage,
    safety,
    errors,
  };
  return { snapshot, tsMs };
};
