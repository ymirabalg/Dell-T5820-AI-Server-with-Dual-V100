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
 * - **⚠⚠ The second exception, 12b: `serving[].gpus` (§3.4).** Absent means the SERVER
 *   predates the field, and §3.4 rules that case *correct rather than a compromise* — a
 *   server old enough not to publish `gpus` cannot be in split mode, so the index join is the
 *   only arrangement that exists on it. **This is the sentence that keeps the live box
 *   rendering as it does today across a client-only deploy**, and it is why the field is
 *   optional rather than `readonly gpus: … | null`: a nullable-but-required field would
 *   refuse the running server's every poll. See {@link optionalCardList}, where `null` and
 *   absent are kept apart.
 * - **⚠⚠ 12c — `serving[]` refuses the ROW, not the snapshot** (§3.4's second ruling of
 *   2026-09-17). One bad row is dropped, the rest render, and an `errors[]` entry names which
 *   row and why. This is **invariant 5**, not a relaxation of the paragraph above: a failed
 *   reading is a partial snapshot plus an entry, never nothing. {@link servingListOf} carries
 *   the full argument, including why this array and no other — `errors[]` is an array of
 *   independent entries too and is deliberately NOT lenient.
 * - **⚠⚠ 12c — `ServingInstance.instance` is a STRING, and that is NOT additive.**
 *   {@link instanceId} judges a string by `lib/units.ts`'s `isInstanceId` — the same predicate the
 *   collector's discovery uses — and accepts a JSON **number** as the older spelling of a
 *   numeric identity, which is what keeps the live box's frozen body rendering identically.
 *   ⚠ **The skew only bends one way.** A client older than its server meets `"instance":
 *   "split"` at `integer()`, refuses the snapshot, and shows §6.7's failed poll — no row
 *   refusal exists in code that predates it. Server and client ship in ONE image (§4), so the
 *   window is a browser tab left open across a redeploy, and it closes on reload.
 * - **⚠ One exception to "every field must be present": `errors[].instance` (10b-S-G).** It
 *   is the contract's first genuinely OPTIONAL field — absent means "this entry names no
 *   row", which is both an old server that has never heard of it and a current one whose
 *   source has no subject, and the two are indistinguishable on purpose. **Present but
 *   invalid still refuses the entry**, on the same terms as any other malformed field — see
 *   {@link optionalInstanceId}.
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
import { isInstanceId, isNumericInstance } from '../units';
import {
  bytesPerSecond,
  celsius,
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

/**
 * §3.7's eighteen sources, as the only RUNTIME enumeration of them in the project.
 *
 * ⚠ Exported since 12a. The type is a closed union and this `Record` cannot omit a member
 * without a compile error, so it is the one place a generated test can ask *"every source"*
 * without retyping the list — and a nineteenth source added to `lib/types.ts` then reaches
 * that test automatically rather than being invisible to it. HANDOVER §0.14: a hand-written
 * table cannot falsify its own property, because it only ever asks about the cases whoever
 * wrote it already thought of.
 */
export const ERROR_SOURCES: Readonly<Record<ErrorSource, true>> = {
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

/** A `number` that may not be `null` — `Gpu.index` is the only one left since 12c. */
const integer = (value: unknown): Checked<number> => {
  if (typeof value !== 'number' || !Number.isInteger(value)) return undefined;
  return value;
};

/**
 * ⚠⚠ **12c — `ServingInstance.instance`, a STRING, judged by the SAME grammar discovery uses
 * — and a JSON NUMBER accepted as the older spelling of a numeric one.**
 *
 * `lib/units.ts`'s {@link isInstanceId} is imported rather than restated, so a *string* identity
 * is admitted here exactly when `parseInstanceId` would admit it from a filename — one
 * predicate, not two that agree today. That matters
 * for three things downstream that take this value verbatim: §6.4's condition subject
 * (`health:1`), the React key on the SERVING row, and `servingUnitName`'s mapping. An identity
 * carrying a `:` would spell a second, colliding condition id; an empty one would key a row
 * on `''`.
 *
 * ### ⚠⚠ Why a `number` is accepted, and why this is NOT the coercion O10 forbids
 *
 * **This field's type change is not additive.** Every other contract change this project has
 * made added a key, and §3.4 ruled the *absence* of `gpus` meaningful for exactly that reason.
 * `instance` went from `number` to `string` on 2026-09-17, and the frozen
 * `LIVE_BOX_SERVING_WIRE` — the bytes the running container really sends — spells both
 * identities as JSON numbers. A string-only reader would drop **every row of every poll the
 * live box makes**, which is the outcome §3.4's own ruling calls a dead dashboard.
 *
 * So a number is read as the identity it names: §3.4 fixes a numeric identity as **its
 * canonical decimal string**, so `0` and `"0"` are two spellings of one instance and must
 * produce one page. The admission is deliberately narrow — a non-negative safe integer whose
 * `String()` is canonical, checked through {@link isNumericInstance} rather than by eye, so
 * `1.5`, `-1`, `1e21` and `NaN` are refused like any other malformed reading.
 *
 * ⚠ **`-1` is refused by CANONICALITY, not by a sign test, and 12c/RECONCILE deleted the sign
 * test that claimed it.** `|| value < 0` stood here and was **provably dead** (`12c-A11` #1):
 * `String()` prefixes a `-`, so `isNumericInstance('-1')` is already false, and reverting the
 * clause left the whole suite green. A guard that cannot fail is not protection — it is a
 * second, unchecked statement of a rule, and the one place a reader looks to see whether
 * negatives are handled. The rule now has exactly one spelling, and `wire.test.ts` asserts
 * `-1`, `-2` and `-1e21` against it with a mutation (`12c-R2`) that can take it away.
 *
 * ⚠ It is **not** `serving: null → []`: that would invent a reading the box never took. This
 * re-spells one identity as the same identity, and `isNumericInstance` is what makes "the
 * same" checkable rather than asserted.
 */
const instanceId = (value: unknown): Checked<string> => {
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) return undefined;
    const spelled = String(value);
    return isNumericInstance(spelled) ? spelled : undefined;
  }
  if (typeof value !== 'string' || !isInstanceId(value)) return undefined;
  return value;
};

/**
 * The sentinel {@link optionalInstanceId} returns for "the key is not present at all" — 10b-S-G,
 * and the first field this contract has ever made truly OPTIONAL rather than nullable.
 *
 * ⚠ `undefined` already means "invalid" everywhere in this file ({@link Checked}), and an
 * optional field needs a THIRD outcome distinct from both "invalid" and "a value": the key
 * may be legitimately missing. Reusing `undefined` for that would make a malformed
 * `instance` and an absent one indistinguishable, and only one of those is §4's licensed
 * "an old server has never heard of this field" — the other is a server that sent garbage
 * and must refuse the snapshot like every other bad reading here.
 */
const ABSENT = Symbol('absent');

/**
 * An optional instance-identity field (10b-S-G's `TelemetryError.instance` is the only one).
 * Three outcomes: {@link ABSENT} when the key is not present at all — valid, and the caller
 * stores no field; `undefined` when the key IS present but is not a valid identity — invalid,
 * refuse the entry like any other malformed field; or the identity itself.
 *
 * ⚠ 12c — it validates with {@link instanceId}, so an entry cannot name a row by an identity
 * no row could ever carry.
 */
const optionalInstanceId = (source: Record<string, unknown>, key: string): string | typeof ABSENT | undefined =>
  Object.hasOwn(source, key) ? instanceId(source[key]) : ABSENT;

/** A card index: a non-negative integer. `Gpu.index` is what these are compared against. */
const cardIndex = (value: unknown): Checked<number> => {
  const whole = integer(value);
  return whole === undefined || whole < 0 ? undefined : whole;
};

/**
 * ⚠⚠ §3.4's `gpus` — the contract's **second** optional field, and the one place in this file
 * where FOUR outcomes have to stay apart rather than three.
 *
 * | wire | returns | means |
 * |---|---|---|
 * | key missing | {@link ABSENT} | the server predates the field — §3.4 rules the index join the correct answer on such a server, silently |
 * | `null` | `null` | the unit exists and its `CUDA_VISIBLE_DEVICES` could not be read — an em dash with a `dbus` entry |
 * | `[]`, `[0]`, `[0,1]` | the array | the cards this instance serves |
 * | anything else | `undefined` | malformed — refuse the instance, exactly like a bad `port` |
 *
 * ⚠ **{@link ABSENT} and `null` must not be collapsed**, and this function is where the
 * collapse would happen: `arrayOrNull(field(value,'gpus'), …)` reads a missing key as
 * `undefined` → refused, and `field(...) ?? null` reads it as `null` → an em dash on a server
 * that is behaving perfectly. Both are one character away and both are wrong.
 *
 * ⚠ **A non-integer, fractional or negative member refuses the whole instance rather than
 * being dropped.** A partial list is the failure §3.4's `null` exists for: a card silently
 * missing from an otherwise plausible list would read as "no instance serves this card",
 * which is a claim, not a gap.
 */
const optionalCardList = (
  source: Record<string, unknown>,
  key: string,
): readonly number[] | null | typeof ABSENT | undefined => {
  if (!Object.hasOwn(source, key)) return ABSENT;
  const raw = source[key];
  if (raw === null) return null;
  return arrayOf(raw, cardIndex);
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

/**
 * ⚠⚠ **12c — one refused `serving[]` row, or the row.**
 *
 * The variant carries **why**, because §3.4's second ruling of 2026-09-17 requires the
 * `errors[]` entry to name *which* row and *why* — and "why" cannot be reconstructed after the
 * fact from a bare `undefined`.
 */
type CheckedRow =
  | { readonly ok: true; readonly row: ServingInstance }
  | { readonly ok: false; readonly why: string };

/** The members of §3.4's row, in §4's own order, so a refusal lists them the way the wire does. */
const SERVING_FIELDS = ['instance', 'port', 'unitState', 'model', 'ctx', 'health', 'gpus'] as const;

/**
 * A field name in backticks, for a refusal message.
 *
 * ⚠ **Written with `concat` rather than as a nested template literal, and that is not a style
 * choice.** `lib/source-text.ts`'s `codeOnly` is a small state machine, and the obvious
 * spelling — a template containing `${…}` whose expression contains a template containing
 * escaped backticks — flips its string mode permanently: the outer literal's CLOSING backtick
 * is read as an OPENING one, and every comment after it in the file survives comment-stripping.
 * Measured on this file: `lib/client/guardrails.test.ts`'s browser-globals guard went red
 * naming `wire.ts`, for the word `fetch` inside a doc comment it should never have seen.
 * That guard caught it loudly; the same desync in the other direction hides real code from a
 * guard, and six guards in this project read through `codeOnly`. Recorded in `12c-build.md`.
 */
const quoted = (name: string): string => '`' + name + '`';

const servingInstanceOf = (value: unknown): CheckedRow => {
  if (!isRecord(value)) return { ok: false, why: 'the row is not a JSON object' };
  const instance = instanceId(field(value, 'instance'));
  const portValue = branded(numberOrNull(field(value, 'port')), port);
  const unitState = memberOrNull(UNIT_STATES, field(value, 'unitState'));
  const model = stringOrNull(field(value, 'model'));
  const ctx = branded(numberOrNull(field(value, 'ctx')), tokens);
  const health = memberOrNull(HEALTH_STATES, field(value, 'health'));
  const gpus = optionalCardList(value, 'gpus');
  // ⚠ Every bad field is named, not the first one. A row refused for `instance` alone and a
  // row that is wholesale the wrong shape are different diagnoses, and the reader of §6.5's
  // note under the SERVING rows is the person deciding whether to redeploy.
  const checked = [instance, portValue, unitState, model, ctx, health, gpus];
  const bad = SERVING_FIELDS.filter((_, i) => checked[i] === undefined);
  // ⚠ The disjunction below is `bad.length > 0` spelled a second way, and it is here because
  // only the explicit form narrows: `bad.length` tells the compiler nothing about `instance`.
  // No cast is used to bridge the gap — this file's whole premise is that it does not cast
  // bytes it did not check, and a `row` assembled behind an `as` would be exactly that.
  if (
    instance === undefined ||
    portValue === undefined ||
    unitState === undefined ||
    model === undefined ||
    ctx === undefined ||
    health === undefined ||
    gpus === undefined
  ) {
    return { ok: false, why: `${bad.map(quoted).join(', ')} did not validate` };
  }
  const row = { instance, port: portValue, unitState, model, ctx, health };
  // ⚠ The key is OMITTED, not set to `undefined`. `exactOptionalPropertyTypes` is on, and
  // more importantly `Object.hasOwn(row, 'gpus')` is what `servedBy` reads to tell an older
  // server from one reporting a failure — a present key holding `undefined` would answer
  // `true` and send a perfectly healthy old snapshot down the new-server path.
  return { ok: true, row: gpus === ABSENT ? row : { ...row, gpus } };
};

/**
 * §3.7's source a refused row is filed under. **`llama-env`**, and the choice is argued here
 * rather than left to look obvious.
 *
 * `llama-env` is already §3.4's source for *which instances exist*: `discoverInstances`'s own
 * problems are tagged with it and they read *"`X` is not `<instance>.env` and was not treated
 * as an instance"* — the same sentence this entry makes one layer further out, about a row
 * rather than a filename. It also reaches exactly one panel (`panelsForSource` → `['serving']`),
 * which is the panel a missing row is missing from.
 *
 * ⚠ **It is a stretch and it is recorded as one.** Every other `llama-env` entry is a claim
 * about a file on the box; this one is a claim about the payload. §3.7 does not enumerate a
 * client-minted source and §3.4's ruling does not name one, so the alternative — a nineteenth
 * `ErrorSource` — is written up as a spec question in `12c-build.md` rather than invented here
 * (invariant 7).
 */
const WIRE_REFUSAL_SOURCE: ErrorSource = 'llama-env';

/**
 * ⚠⚠ **12c / §3.4's SECOND ruling — `serving[]` refuses the ROW, not the snapshot.**
 *
 * *"Today one invalid `serving[]` entry blanks the entire dashboard, so a box switched to
 * split mode before its dashboard is redeployed shows nothing at all. Ruled: drop the
 * offending row, render the rest, and file an `errors[]` entry naming it."*
 *
 * ### ⚠ This is invariant 5, not a relaxation of this file
 *
 * Invariant 5: *a failed reading is a partial snapshot plus an `errors[]` entry, never a 500*.
 * Whole-snapshot refusal was the stricter reading of O10 and it turned a contract mismatch
 * into a dead dashboard — a page with no GPU temperature, no fan speed and no SAFETY panel
 * because one instance's `instance` was of the wrong type.
 *
 * ### ⚠⚠ Why this array and NO OTHER
 *
 * Three properties hold of `serving[]` and of nothing else in §4, and all three are needed:
 *
 * 1. **Its members are independent subjects.** Each row is one process, discovered separately,
 *    read separately, rendered on its own row. Dropping one loses that process and nothing
 *    else. `host`, `cooling`, `storage` and `safety` are *containers of readings about one
 *    subject* — there is no row to drop, and dropping a field would be inventing a `null`,
 *    which invariant 1 says is a reading this box could not take rather than a key we chose
 *    not to believe.
 * 2. **Its length is DISCOVERED and already varies.** §3.4: *"a third card must appear without
 *    a code change."* Nothing downstream is entitled to a particular row count, so a shorter
 *    list is a shape the client already handles. `gpus[]` looks similar and is NOT: §9 makes a
 *    card's absence from a `gpus[]` that was read mean **retired** — *the card has left the
 *    machine* — so silently dropping a malformed GPU row would mint that verdict from a
 *    validation failure. `serving[]`'s equivalent is `SERVING_ENUMERATION`, and the entry
 *    filed here is what keeps that honest: a dropped row is never silent.
 * 3. **It is the one array whose element type the deploy ordering can change.** `instance`
 *    became a string on 2026-09-17; a server ahead of its client is exactly the case the
 *    ruling exists for.
 *
 * ⚠ **`errors[]` itself is NOT row-lenient**, and that is deliberate even though it is also an
 * array of independent entries: a malformed `errors[]` entry means the thing that reports
 * failures is itself malformed, and silently dropping one would hide the report of a failure
 * behind the report of a failure. It still refuses the snapshot.
 *
 * ⚠ **`serving: null` and a not-an-array `serving` still refuse.** `null` is §3.1's *"which
 * instances exist is unknown"* and is a legal value; a string or an object is the COLLECTION
 * being wrong rather than a member of it, and there is no row to drop.
 */
interface ServingList {
  readonly rows: readonly ServingInstance[] | null;
  /** One sentence per dropped row, already naming the row and the reason. */
  readonly refusals: readonly string[];
}

/**
 * ⚠⚠ **12c/RECONCILE — §4's `serving[]` AS THIS CLIENT HAS IT: the rows, and whether they are
 * all of them.** This is the seam `12c-A1` was found in.
 *
 * ### The defect, in one sentence
 *
 * The TEST phase carried the refusal count to §9's ledger and left §6.2's join reading the bare
 * array: `servedBy(snapshot.serving, index)` had no way to ask whether the array was complete,
 * so a row dropped for a bad `port` rendered the GPU card as **`served by · no instance`** —
 * `unserved`, which `gpu-panel.tsx`'s own comment defines as *"every list was READ and none of
 * them names this card … we looked, and nobody claims it"*. Measured: byte-identical to the
 * strip an instance that genuinely left the machine produces.
 *
 * ⚠ That is a direct contradiction of the sentence the owner ratified into §9 on 2026-09-18:
 * *"The collection was read successfully and the client discarded part of it, which is not the
 * same as the server not reporting it."* §9 got the rule; the join one panel over did not.
 *
 * ### Why a TYPE rather than a second argument
 *
 * A second parameter is forgettable, and 12b spent three phases closing a defect of exactly
 * that shape. **A shortened array means two different things, and every reader of one must be
 * told which** — so the array is not handed out on its own any more. `servedBy` and
 * {@link enumerationsRead} both take this value, there is one constructor
 * ({@link servingEnumeration}) and it demands the count, and {@link WireSnapshot} and
 * `Sample` carry it from here to the panel instead of dropping it at the ring. A caller that
 * has only the rows cannot call the join at all; it is a compile error, not a wrong page.
 *
 * ⚠ `rows` is the SAME array as `snapshot.serving`, never a copy — `parseSnapshot` builds both
 * from one value and `wire.test.ts` asserts the identity, so the two cannot drift.
 */
export type ServingEnumeration =
  /** `serving: null` — §3.1's *which instances exist is unknown*. Nothing was read. */
  | { readonly read: 'none' }
  /** The server sent more rows than these; {@link servingListOf} refused `refused` of them. */
  | { readonly read: 'partial'; readonly rows: readonly ServingInstance[]; readonly refused: number }
  /** Every row the server sent is here. The only state that supports a negative answer. */
  | { readonly read: 'all'; readonly rows: readonly ServingInstance[] };

/**
 * The one constructor for a {@link ServingEnumeration}, and it cannot be called without saying
 * how many rows were refused.
 *
 * ⚠ `refused` is **required**, and deliberately has no default. The TEST phase's
 * `enumerationsRead(snapshot, servingRowsRefused = 0)` defaulted the unsafe way — `0` asserts
 * *the enumeration WAS read*, so a caller that had not been updated reproduced the very defect
 * that loop fixed (`12c-A5`). A default that reintroduces a closed bug is worse than no
 * default, and the analogy it claimed (`PollOptions.enumerationsRead` defaults to the EMPTY
 * set, which retires nothing) points the other way.
 */
export const servingEnumeration = (
  rows: readonly ServingInstance[] | null,
  refused: number,
): ServingEnumeration => {
  if (rows === null) return { read: 'none' };
  return refused > 0 ? { read: 'partial', rows, refused } : { read: 'all', rows };
};

/** Before the first poll there is no snapshot, and therefore nothing read. */
export const SERVING_NOT_POLLED: ServingEnumeration = { read: 'none' };

const servingListOf = (value: unknown): Checked<ServingList> => {
  if (value === null) return { rows: null, refusals: [] };
  if (!Array.isArray(value)) return undefined;
  const rows: ServingInstance[] = [];
  const refusals: string[] = [];
  value.forEach((entry, i) => {
    const checked = servingInstanceOf(entry);
    // ⚠ The row is named by its INDEX in the array it arrived in, not by its `instance` — the
    // identity is one of the things that may be the reason it was refused, and a refusal that
    // names an unusable value tells the reader nothing they can look up.
    if (checked.ok) rows.push(checked.row);
    else refusals.push(`serving[${String(i)}] was dropped: ${checked.why}`);
  });
  return { rows, refusals };
};

const filesystemOf = (value: unknown): Checked<Filesystem> => {
  if (!isRecord(value)) return undefined;
  const usedGiB = branded(numberOrNull(field(value, 'usedGiB')), gib);
  const totalGiB = branded(numberOrNull(field(value, 'totalGiB')), gib);
  if (usedGiB === undefined || totalGiB === undefined) return undefined;
  return { usedGiB, totalGiB };
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

/**
 * §4's one optional field, validated 10b-S-G: **present when the key is absent** (an old
 * server, or a source with no subject) and **validated like any other field when it is
 * there**. §4 fixes `instance` as a non-null integer — never `null` — so a server sending
 * `instance: null` is refused exactly as a wrong-typed `instance` would be: this field marks
 * one row or it says nothing, and `null` is neither.
 */
const telemetryErrorOf = (value: unknown): Checked<TelemetryError> => {
  if (!isRecord(value)) return undefined;
  const rawSource = field(value, 'source');
  if (typeof rawSource !== 'string' || !Object.hasOwn(ERROR_SOURCES, rawSource)) return undefined;
  const message = field(value, 'message');
  if (typeof message !== 'string') return undefined;
  const rawInstance = optionalInstanceId(value, 'instance');
  if (rawInstance === undefined) return undefined;
  return rawInstance === ABSENT
    ? { source: rawSource as ErrorSource, message }
    : { source: rawSource as ErrorSource, message, instance: rawInstance };
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
  /**
   * ⚠⚠ **12c — §4's `serving[]` and whether it is all of it, carried OUT of the snapshot
   * because §4 has no field for it and both §9's ledger AND §6.2's join need to know.**
   *
   * ⚠ 12c/RECONCILE replaced `servingRowsRefused: number` with this. The count was right and
   * reached §9; it never reached the join, and the join is the reader that renders a claim
   * about a card. {@link ServingEnumeration} carries the full argument for why the completeness
   * travels as part of the value rather than beside it.
   *
   * ### The defect this closes, measured
   *
   * A dropped row leaves `serving[]` SHORTER — and a subject's absence from an enumeration
   * that *was read* is §9's definition of **retired**: `lib/conditions.ts`'s own table says
   * *"`serving: []` → retired — it has left the machine, and it leaves the ledger, the dot and
   * the count."* So a row refused for a bad `port` was rendered as *the instance is gone*: its
   * conditions left the ledger at severity `normal` after the ten-second debounce, and a live
   * `alarm` on that instance left the banner and the alarm count with them. Measured on
   * `servingPopulated` with both rows refused — `retired = [unit:llama-server@1.service/alarm,
   * health:1/alarm, …]`, `wentStale = []`.
   *
   * **That is the exact argument {@link servingListOf} gives for NOT dropping a `gpus[]` row**,
   * one array over: *"silently dropping a malformed GPU row would mint that verdict from a
   * validation failure."* `serving[]`'s equivalent verdict is minted through
   * `SERVING_ENUMERATION`, and filing an `errors[]` entry does not stop it — the entry keeps
   * §9's HEADER honest (`failingSourceCount`), which is a different claim.
   *
   * ⚠ **A count, not a boolean, and it lives here rather than in `errors[]`.** The refusal
   * entries are already in `snapshot.errors`, but recovering this fact from them means matching
   * `'serving[… ] was dropped'` in a message — the text-matching this project forbids
   * everywhere else (`collectServing`: *"never guessed downstream by matching … out of the
   * message text"*) — and `llama-env` is also the server's own source for ordinary env
   * problems, which must NOT suppress the enumeration.
   *
   * ⚠ **It is `read: 'all'` for every well-formed snapshot**, including one whose `serving` is a
   * genuinely empty `[]`: that array WAS read, it declares no instances, and retiring is the
   * right answer there. Only a refusal makes the list shorter than what the server sent.
   */
  readonly serving: ServingEnumeration;
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
  const serving = servingListOf(field(value, 'serving'));
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

  // ⚠⚠ 12c — the refusals ride in `errors[]`, APPENDED after the server's own entries.
  //
  // ⚠ Appended rather than prepended because §4 pins `errors[]`'s order as the server's
  // concatenation order and `events.ts` reads the LAST message per source: a refusal is the
  // most recent thing known about the serving layer on this poll, and putting it first would
  // both re-order every existing entry and leave the event log quoting a stale sentence.
  //
  // ⚠ **They carry no `instance`.** The identity is one of the fields that may have been the
  // reason for the refusal, so there is no row to attach the entry to — it renders under the
  // rows through `PanelNotes`, which is `serving-panel.tsx`'s existing home for a
  // collector-wide entry. That is also what makes §9's aggregate see it: any `errors[]` entry
  // at all puts a source into `failingSourceCount`, so a snapshot that dropped a row can
  // never read `● all healthy`, and a dropped row therefore cannot be counted as a healthy
  // instance by the header.
  const snapshot: TelemetrySnapshot = {
    ts: isoTimestamp(rawTs),
    hostname,
    standing,
    gpus,
    host,
    cooling,
    serving: serving.rows,
    storage,
    safety,
    errors:
      serving.refusals.length === 0
        ? errors
        : [...errors, ...serving.refusals.map((message) => ({ source: WIRE_REFUSAL_SOURCE, message }))],
  };
  return { snapshot, tsMs, serving: servingEnumeration(serving.rows, serving.refusals.length) };
};
