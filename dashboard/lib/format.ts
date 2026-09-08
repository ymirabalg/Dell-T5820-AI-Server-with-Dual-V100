/**
 * §6.6 — units, formatting and locale.
 *
 * Every quantity is shown in **the unit its own source reports**, so any figure on screen
 * can be checked against the command that produced it without arithmetic. That is why
 * there are three memory formatters here and not one: VRAM is MiB (`nvidia-smi`), RAM and
 * disk are GiB (`/proc/meminfo`, `statvfs`/`df -h`), and swap is GiB at a different
 * precision. The branded argument types make handing GiB to the MiB formatter a compile
 * error rather than a plausible wrong number.
 *
 * **Two laws, and they are the point of this module:**
 *
 * 1. **`null` renders as `—`.** Never `0`, never blank, never `N/A` (§6.6).
 * 2. **Zero renders as the numeral with its unit** — `0 RPM`, never `—` (§6.6, §6.5).
 *    "A fan reading 0 RPM is a dead fan on a box with two passively-cooled 250 W cards. A
 *    fan reading nothing is a driver that did not load."
 *
 * Everything here is pure: values in, strings out. No IO, no clock, no DOM.
 *
 * ⚠ **One ambient input, and it is spec text.** {@link formatTimeOfDay} and
 * {@link formatZoneAbbreviation} read the **host's timezone**, because §6.6 says times
 * render "in the browser's local timezone". They still take their instant as an argument —
 * nothing here reads a clock — but the zone is environment, so both carry an explicit
 * `timeZone` override that exists so a test can pin one. See HANDOVER §5.4.
 *
 * **Locale is pinned to `en-US` on every viewer** (§6.6) so a screenshot always reads the
 * same. The formatters use explicit {@link Intl.NumberFormat} instances rather than
 * `Number.prototype.toLocaleString()`, which would silently follow the host locale if the
 * argument were ever dropped.
 *
 * **Non-finite readings render `—`.** `NaN`, `Infinity` and `-Infinity` are not readings;
 * the brand constructors do not validate (`celsius(NaN)` type-checks) and a collector that
 * failed to parse must send `null` instead (HANDOVER §3). `NaN °C` is neither of §6.6's
 * two cases, so this is the backstop, not the contract.
 */

import type {
  BytesPerSecond,
  Celsius,
  Cooling,
  GiB,
  IsoTimestamp,
  LoadAverage,
  MHz,
  MiB,
  Percent,
  Port,
  Pwm,
  Rpm,
  Seconds,
  Tokens,
  Watts,
} from './types';

/** §6.6: "`null` renders as an em dash `—`. Never `0`, never blank, never `N/A`." */
export const EM_DASH = '—';

// ---------------------------------------------------------------------------
// Numeric core
// ---------------------------------------------------------------------------

const nf = (min: number, max: number): Intl.NumberFormat =>
  new Intl.NumberFormat('en-US', {
    minimumFractionDigits: min,
    maximumFractionDigits: max,
    useGrouping: true,
  });

/** Integer with `en-US` thousands separators — `26,452`. */
const INTEGER = nf(0, 0);
/** One decimal place — `249.8`. */
const ONE_DP = nf(1, 1);
/** Two decimal places — `0.02`. §6.6 pins swap and load average at 2 dp. */
const TWO_DP = nf(2, 2);

/**
 * `true` when a reading is a real number that can be rendered.
 *
 * `null` fails it (law 1) and so does `NaN`/`±Infinity`. `0` **passes** — that is law 2,
 * and this predicate is where it would be easiest to break by writing `if (!v)`.
 */
const readable = (v: number | null): v is number => v !== null && Number.isFinite(v);

/**
 * Render `v` through `fmt`, or `—` when there is no reading.
 *
 * An **exact** `-0` is normalised to `0`: `Intl.NumberFormat` renders negative zero as
 * `-0`, and a fan that reads `-0 RPM` looks like a different fault from one that reads
 * `0 RPM`.
 *
 * ⚠ That is the whole of what this guard does. It runs on the *input*, before rounding,
 * so a small negative still renders with its sign — `formatPercent(percent(-0.04))` is
 * `-0.0 %`. That is deliberate: a negative `cpuPct` or network rate is a collector bug
 * (a `/proc/stat` delta across a counter update, an NTP step), and rendering it as
 * `0.0 %` would hide it. Clamping belongs in the collector — see HANDOVER's step-3
 * obligation — not here.
 */
const render = (v: number | null, fmt: Intl.NumberFormat, unit: string): string =>
  readable(v) ? `${fmt.format(v === 0 ? 0 : v)}${unit}` : EM_DASH;

// ---------------------------------------------------------------------------
// §6.6 rows
// ---------------------------------------------------------------------------

/** GPU temp, CPU temp — integer °C. `66 °C`, `0 °C`, `—`. */
export const formatCelsius = (v: Celsius | null): string => render(v, INTEGER, ' °C');

/** GPU power — 1 dp W, checked against `power.draw`. `249.8 W`. */
export const formatWatts = (v: Watts | null): string => render(v, ONE_DP, ' W');

/** VRAM — MiB, thousands separated. `26,452 MiB`. */
export const formatMiB = (v: MiB | null): string => render(v, INTEGER, ' MiB');

/**
 * VRAM as §6.6 prints it: `26,452 / 32,768 MiB`.
 *
 * §6.6: "A pair with one side `null` renders per figure: `26,452 / — MiB`, so which half
 * is missing survives." Law 1 is therefore applied per figure. Both `null` collapses to a
 * single `—`, because `— / — MiB` is noise.
 */
export const formatMiBPair = (used: MiB | null, total: MiB | null): string => {
  if (!readable(used) && !readable(total)) return EM_DASH;
  const u = readable(used) ? INTEGER.format(used === 0 ? 0 : used) : EM_DASH;
  const t = readable(total) ? INTEGER.format(total === 0 ? 0 : total) : EM_DASH;
  return `${u} / ${t} MiB`;
};

/**
 * SM clock — §6.6: "integer, thousands separated — `1,290 MHz`".
 *
 * The separator was step 2's reading of §6.6's unconditional locale bullet before the row
 * said so; §6.6 now spells it out, matching the VRAM and fan rows.
 */
export const formatMHz = (v: MHz | null): string => render(v, INTEGER, ' MHz');

/**
 * RAM **and disk** — 1 dp GiB. `24.3 GiB`, `232.6 GiB`.
 *
 * §6.6 gives RAM and disk the same unit and the same precision, so they are the same
 * function. There is no `formatGB`: O19 deleted the `GB` brand and its formatter rather
 * than keeping two identical renderers apart by name. The disk figure was always GiB —
 * `statvfs.ts` divides by `BYTES_PER_GIB` = `1024³`, which is what `df -h` and `lsblk`
 * print (`/` is 232.6 GiB, not 249.8 GB) — and until O19 only the printed suffix lied.
 */
export const formatGiB = (v: GiB | null): string => render(v, ONE_DP, ' GiB');

/**
 * Swap — **2 dp** GiB (§6.6: "small values must not round to `0.0`").
 *
 * Deliberately a separate function from {@link formatGiB} despite the shared unit: any
 * swap in use is meaningful on this box, so 40 MiB of swap must read `0.04 GiB` and not
 * `0.0 GiB`, which is indistinguishable from none.
 */
export const formatSwapGiB = (v: GiB | null): string => render(v, TWO_DP, ' GiB');

/** Fan speed — integer RPM, thousands separated. `4,308 RPM`, and `0 RPM` for a dead fan. */
export const formatRpm = (v: Rpm | null): string => render(v, INTEGER, ' RPM');

/** Percentages — 1 dp. `81.3 %`. */
export const formatPercent = (v: Percent | null): string => render(v, ONE_DP, ' %');

/** Context length — tokens, thousands separated, bare numeral. `131,072` (§6.6). */
export const formatTokens = (v: Tokens | null): string => render(v, INTEGER, '');

/**
 * A TCP port — the bare number, **ungrouped**: `8080`, never `8,080`.
 *
 * ⚠ §6.6's table has no row for this; a port is an identifier, not a measured quantity, so
 * the locale bullet's thousands separators would be actively wrong. §6.2 lists it in the
 * SERVING row and `MOCK.html` renders it `:8080` — the colon is that panel's layout, not
 * part of the figure. Recorded as a small gap in the step-2 notes.
 *
 * Law 1 is why it exists at all: an instance discovered from its env filename alone has a
 * `null` port (`servingIdentityOnly`), and that must render `—`, never a blank cell.
 */
export const formatPort = (v: Port | null): string =>
  readable(v) ? String(v === 0 ? 0 : v) : EM_DASH;

/**
 * Load average — three values, 2 dp, ` / `-separated: `1.24 / 1.08 / 0.91` (§6.6).
 *
 * Nullable as a whole, matching {@link LoadAverage}: all three come from one line of
 * `/proc/loadavg` in a single read, so there is no half-parsed state to render.
 */
export const formatLoadAverage = (v: LoadAverage | null): string => {
  if (v === null) return EM_DASH;
  const [one, five, fifteen] = v;
  if (!readable(one) || !readable(five) || !readable(fifteen)) return EM_DASH;
  return [one, five, fifteen].map((n) => TWO_DP.format(n === 0 ? 0 : n)).join(' / ');
};

/**
 * `v` rounded to two significant figures.
 *
 * Via `toPrecision`, which rounds the decimal representation, rather than by scaling with
 * a power of ten and rounding — `49 / 0.1` is `489.99999999999994` in binary floating
 * point, and the digit count is decided from this value.
 */
const twoSigFigsValue = (v: number): number => (v === 0 ? 0 : Number(v.toPrecision(2)));

/** Two significant figures, keeping the trailing zero: `1.2`, `490`, `0`, `0.0050`. */
const twoSigFigs = (v: number): string => {
  if (v === 0 || !Number.isFinite(v)) return '0';
  const rounded = twoSigFigsValue(v);
  const decimals = Math.max(0, 1 - Math.floor(Math.log10(Math.abs(rounded))));
  return nf(decimals, decimals).format(rounded);
};

/**
 * Network throughput — auto-scaled KB/s or MB/s at **2 significant figures** (§6.6).
 *
 * `1_243_000` → `1.2 MB/s`; `486_000` → `490 KB/s`; `0` → `0 KB/s` (law 2 — an idle link
 * is a reading). Values that round up to `1000 KB/s` are promoted to `1.0 MB/s`, so the
 * displayed figure never carries more digits than the rule allows.
 *
 * Decimal KB/MB (1e3), not KiB/MiB: `/proc/net/dev` counts bytes and §6.6 spells the units
 * `KB/s` and `MB/s`.
 */
export const formatBytesPerSecond = (v: BytesPerSecond | null): string => {
  if (!readable(v)) return EM_DASH;
  const bytes = v === 0 ? 0 : v;
  if (Math.abs(bytes) >= 1e6) return `${twoSigFigs(bytes / 1e6)} MB/s`;
  // 999_499 B/s is 1,000 KB/s at 2 s.f., which shows four digits for a two-figure rule.
  // Auto-scaling means that reading is 1.0 MB/s.
  const kb = twoSigFigsValue(bytes / 1e3);
  return Math.abs(kb) >= 1000
    ? `${twoSigFigs(bytes / 1e6)} MB/s`
    : `${twoSigFigs(bytes / 1e3)} KB/s`;
};

// ---------------------------------------------------------------------------
// Channel 5 — the row §6.6 spells "state name then raw value"
// ---------------------------------------------------------------------------

/** The three states the SMM interface can actually express. See {@link pwmStateName}. */
export type PwmStateName = 'OFF' | 'LOW' | 'HIGH';

/** The `pwm` register's range. Anything outside it is not a reading of this register. */
const PWM_MIN = 0;
const PWM_MAX = 255;
/** §6.3: "the HIGH quantisation band" — the boundary engagement is defined by. */
const PWM_HIGH_FLOOR = 192;
/** The driver's OFF/LOW split; §6.6 names it. */
const PWM_LOW_FLOOR = 64;

/**
 * The driver's 3-state quantisation of the 0–255 `pwm` range — **the only definition of
 * the `≥ 192` boundary in this project.**
 *
 * `dell-smm-hwmon` writes `clamp(DIV_ROUND_CLOSEST(val, 128), 0, 2)` with
 * `i8k_pwm_mult = DIV_ROUND_UP(255, 2) = 128`, so the sysfs range collapses onto three
 * values: §6.6's **`OFF` (0–63), `LOW` (64–191), `HIGH` (192–255)**. Nothing between them
 * exists.
 *
 * ⚠ `lib/severity.ts` reads engagement from **this function**, not from its own `>= 192`.
 * §6.3 defines "engaged" as `ch5Mode === 'manual' && ch5Pwm ≥ 192`, so the boundary is one
 * hardware fact used by both a formatter and a severity band; written twice it can drift,
 * and a drift means the COOLING panel labels a channel `LOW` while the engaged alarm band
 * is being applied to it.
 *
 * **`null` means the duty is not a reading**, which is a state §6.6 names: a non-finite
 * value (`pwm(NaN)` type-checks — the brand constructors do not validate) or one outside
 * the register's 0–255 range. §6.6: "When the mode is `manual` but the duty is not a
 * reading, render `—` and give the band **no severity** rather than assuming a state."
 * Assuming one is how a stalled fan at HIGH gets labelled `OFF` and banded `normal`.
 */
export const pwmStateName = (v: Pwm): PwmStateName | null => {
  if (!Number.isFinite(v) || v < PWM_MIN || v > PWM_MAX) return null;
  return v >= PWM_HIGH_FLOOR ? 'HIGH' : v >= PWM_LOW_FLOOR ? 'LOW' : 'OFF';
};

/**
 * Channel-5 PWM — §6.6: "state name then raw value — `HIGH pwm 255`".
 *
 * Takes the whole {@link Cooling} value rather than a mode and a number, because the
 * discriminated union is what guarantees a PWM exists exactly when the mode is `manual`;
 * a `(mode, pwm)` signature would let `('ec-auto', 255)` be passed.
 *
 * | `ch5Mode` | renders |
 * |---|---|
 * | `'manual'`, duty readable | `HIGH pwm 255` — the commissioned configuration |
 * | `'manual'`, duty not a reading | `—` (§6.6), and {@link module:lib/severity} gives it no severity |
 * | `'ec-auto'` | `EC auto` — **healthy** (§6.5, invariant 3): `pwm5` returned `ENODATA` |
 * | `null` | `unavailable` — §6.5: "the Cooling panel shows the channel as unavailable" |
 *
 * The `unavailable` case is the one exception to law 1 in this module, and it is spec
 * text: an em dash there would read as a missing figure rather than a missing *channel*,
 * and §6.5 requires "never a blank RPM that reads as zero".
 */
export const formatCh5Pwm = (cooling: Cooling): string => {
  switch (cooling.ch5Mode) {
    case 'manual': {
      const state = pwmStateName(cooling.ch5Pwm);
      return state === null ? EM_DASH : `${state} pwm ${INTEGER.format(cooling.ch5Pwm)}`;
    }
    case 'ec-auto':
      return 'EC auto';
    case null:
      return 'unavailable';
  }
};

// ---------------------------------------------------------------------------
// Uptime — §3.2's four forms
// ---------------------------------------------------------------------------

const pad2 = (n: number): string => String(n).padStart(2, '0');

/** Below this, the reading is `up <1 min` rather than a minute count. §3.2's fourth form. */
const UPTIME_SUB_MINUTE = 60;

/**
 * `uptimeSec` for the header, in §3.2's **four** forms, "so a freshly rebooted box is not
 * shown as `up 0 d 00:14`":
 *
 * | uptime | renders |
 * |---|---|
 * | ≥ 1 day | `up 2 d 02:01` |
 * | 1 hour – 1 day | `up 02:01` |
 * | 1 minute – 1 hour | `up 14 min` |
 * | < 1 minute | `up <1 min` |
 *
 * ⚠ **The fourth form was added in step 3's reconciliation, and it is a behaviour change
 * to step 2's file.** This function used to return `up 0 min` below a minute. §3.2 carries
 * an `up <1 min` clause — added to answer step 2's own reported gap S2, *"§3.2's uptime
 * forms do not cover below one minute"* — so the spec is the newer half and the code was
 * the leftover. `up 0 min` is §3.2's stated defect (`up 0 d 00:14`) one scale down, and on
 * a project whose step 12 is "survives a reboot" it is precisely the minute someone will be
 * staring at the header.
 *
 * ⚠ **This does NOT breach §6.6's law 2** ("zero renders as the numeral with its unit").
 * §6.6 states its own purpose — it is "the §6.5 rule expressed as a formatting law", and
 * that rule is *"zero and unknown must never look alike"*. `up <1 min` is neither `—` nor
 * blank, so a zero reading stays visibly distinct from an unreadable one, which is the
 * whole point. The law table already carries per-quantity renderings: `formatCh5Pwm(0)` is
 * `OFF pwm 0` and `formatPort(0)` is `0` with no unit at all.
 *
 * Law 1 still applies: an unreadable `/proc/uptime` renders `—`, never `up <1 min`.
 *
 * Not locale-formatted — these are clock digits and a day count, not a measured quantity,
 * and a box up for 1,234 days should read `up 1234 d`, not `up 1,234 d`. Truncating
 * rather than rounding, so the figure never claims a minute that has not elapsed.
 *
 * ⚠ **`prefix` is the leading word, not a second formatter — added for §6.4's banner, ruled
 * 2026-09-08 (S-C).** The sticky alarm banner's "since" used to be a clock time
 * (`since 03:00:14`), indistinguishable from six hours ago on a wall panel open since Friday.
 * The ruling renders it as an ELAPSED duration instead (`for 2 d 06:00`) — the SAME
 * day/hour/minute arithmetic as uptime, "how long has X been going", only the leading word
 * differs. Rather than a fifth duration formatter (§6.6 pins the locale once, and this project
 * has already had to fix a locale in four places), the caller passes the word it needs.
 * Defaults to `'up'` so every existing call site — the header, `api.probe.ts`, every test in
 * this file — is unchanged.
 */
export const formatUptime = (v: Seconds | null, prefix: 'up' | 'for' = 'up'): string => {
  if (!readable(v) || v < 0) return EM_DASH;
  const total = Math.floor(v);
  const days = Math.floor(total / 86_400);
  const hours = Math.floor((total % 86_400) / 3_600);
  const minutes = Math.floor((total % 3_600) / 60);
  if (days >= 1) return `${prefix} ${days} d ${pad2(hours)}:${pad2(minutes)}`;
  if (hours >= 1) return `${prefix} ${pad2(hours)}:${pad2(minutes)}`;
  if (total < UPTIME_SUB_MINUTE) return `${prefix} <1 min`;
  return `${prefix} ${minutes} min`;
};

/**
 * §6.2's age indicator — how old the newest reading is.
 *
 * ⚠ **A negative age never renders as a negative number** (§6.6). A `ts` ahead of the
 * browser's clock is clock **skew**, not a reading from the future: `-4 s` would invite an
 * operator to read it as *fresher than now*, which is the one thing it cannot be. It renders
 * `0 s`, and §6.7's `stale` mode — which treats a negative age as not-current — is what says
 * the rest. The two rules are a pair; neither is safe alone, because a clamp with no mode
 * would hide the skew entirely.
 *
 * ⚠ `null` is not an age of zero. Before the first sample there is nothing to be old, and law
 * 1 governs: `—`.
 *
 * Rendered as seconds under a minute, then `m:ss`, then `h:mm:ss` — clock digits, so not
 * locale-formatted, on the same reasoning as {@link formatUptime}. Truncated rather than
 * rounded, so the figure never claims a second that has not elapsed.
 */
export const formatAge = (ms: number | null): string => {
  if (!readable(ms)) return EM_DASH;
  const total = Math.floor(Math.max(0, ms) / 1000);
  if (total < 60) return `${total} s`;
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  if (minutes < 60) return `${minutes}:${pad2(seconds)}`;
  return `${Math.floor(minutes / 60)}:${pad2(minutes % 60)}:${pad2(seconds)}`;
};

// ---------------------------------------------------------------------------
// Text
// ---------------------------------------------------------------------------

/**
 * Any free-text field — model alias, kernel, hostname, GPU name, bus id.
 *
 * `null` **and blank** both render `—`: §6.6 forbids a blank cell as firmly as it forbids
 * `N/A`, and a whitespace-only string from a parser is not a reading.
 */
export const formatText = (v: string | null): string => {
  if (v === null) return EM_DASH;
  const trimmed = v.trim();
  return trimmed === '' ? EM_DASH : trimmed;
};

/**
 * `/proc/cpuinfo`'s `model name`, trimmed for display: §3.2 shows
 * `Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz` as **`Xeon W-2135`**.
 *
 * The trimming is a formatter's job, not a collector's (`lib/types.ts` on `Host.cpuModel`):
 * a snapshot that has already discarded text cannot be un-trimmed. The rule is
 * deliberately conservative — strip trademark marks, drop the clock clause the vendor
 * appends, drop a leading vendor token — and it **falls back to the trimmed original**
 * rather than to an empty cell, so an unfamiliar CPU string degrades to "too long", never
 * to a lie.
 */
export const formatCpuModel = (v: string | null): string => {
  const text = formatText(v);
  if (text === EM_DASH) return EM_DASH;
  const trimmed = text
    .replace(/\((?:R|TM|r|tm)\)/g, ' ')
    .replace(/\s+(?:CPU|Processor)\s*@.*$/i, '')
    .replace(/^(?:Genuine\s+)?(?:Intel|AMD)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  return trimmed === '' ? text : trimmed;
};

// ---------------------------------------------------------------------------
// Time of day — §6.2's `14:47:31 EDT`, and §6.6's timezone bullet
// ---------------------------------------------------------------------------

/**
 * §6.6's time options, in one place because {@link formatTimeOfDay} and
 * {@link formatZoneAbbreviation} must describe the **same instant in the same zone** —
 * the header prints them side by side and a disagreement between them is unreadable.
 *
 * ⚠ **`hourCycle: 'h23'`, and it is load bearing.** `en-US` defaults to **12-hour**, so
 * without it §6.2's `14:47:31` renders `02:47:31 PM`. That looks plausible in a mock and
 * is wrong on a wall panel, which is the failure mode this project keeps paying for.
 *
 * ⚠ **`h23`, not `h24`.** They differ at exactly one instant per day: midnight is
 * `00:00:00` under `h23` and `24:00:00` under `h24`. `24:00:00` is a legal ISO spelling of
 * the *end* of a day and reads on a header as a clock that has failed.
 *
 * ⚠ **`hourCycle` rather than `hour12: false`.** `hour12` wins over `hourCycle` when both
 * are given, and `hour12: false` has historically resolved to `h24` on `en-US` — the
 * midnight bug above, arrived at from the other direction. One option, stated once.
 *
 * `'2-digit'` on all three fields so an early-morning reading is `04:07:03` and the header
 * does not change width as the hour rolls over.
 *
 * ⚠ **The widths are intent, not the mechanism.** Measured on Node 24.16.0: under
 * `hourCycle: 'h23'` ICU resolves the hour field to `2-digit` whatever width is asked for
 * (`resolvedOptions().hour` reads `'2-digit'` even when `'numeric'` was passed), so
 * weakening them changes nothing observable. Step 2's harness carries that measurement
 * instead of a mutation, because an equivalent mutation is not evidence of anything.
 */
const TIME_OF_DAY_OPTIONS = {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
} as const satisfies Intl.DateTimeFormatOptions;

/**
 * The same options plus the abbreviation, written **once** so the two formatters cannot
 * drift into describing different clocks.
 *
 * ⚠ **`'short'`, and none of the four alternatives.** `long` is `Eastern Daylight Time`,
 * which does not fit a header. `shortGeneric`/`longGeneric` are `ET`/`Eastern Time` — they
 * are **DST-blind**, so the header would read the same all year and be wrong for eight
 * months of it. `shortOffset` is `GMT-4`, which throws away the `EDT` §6.2 asks for.
 */
const ZONE_OPTIONS = {
  ...TIME_OF_DAY_OPTIONS,
  timeZoneName: 'short',
} as const satisfies Intl.DateTimeFormatOptions;

/**
 * The viewer's own zone, resolved once at module load.
 *
 * §6.6 pins the **locale** on every viewer and deliberately does not pin the zone: "Times
 * are rendered in the browser's local timezone". **Omitting `timeZone` is how that is
 * spelled** — `Intl` then resolves the host's. A browser's zone does not change under a
 * running page, so these two are built once rather than per render.
 */
const LOCAL_TIME = new Intl.DateTimeFormat('en-US', TIME_OF_DAY_OPTIONS);
const LOCAL_ZONE = new Intl.DateTimeFormat('en-US', ZONE_OPTIONS);

const timeFormatter = (timeZone: string | undefined): Intl.DateTimeFormat =>
  timeZone === undefined
    ? LOCAL_TIME
    : new Intl.DateTimeFormat('en-US', { ...TIME_OF_DAY_OPTIONS, timeZone });

const zoneFormatter = (timeZone: string | undefined): Intl.DateTimeFormat =>
  timeZone === undefined
    ? LOCAL_ZONE
    : new Intl.DateTimeFormat('en-US', { ...ZONE_OPTIONS, timeZone });

/**
 * The instant a `ts` names, or `null` when it does not name one.
 *
 * ⚠ **This guard is not defensive decoration.** `Intl.DateTimeFormat.prototype.format`
 * **throws a `RangeError: Invalid time value`** on an invalid `Date` — measured on this
 * toolchain, Node 24.16.0. So the failure mode without it is not a cell reading
 * `Invalid Date`; it is the header throwing and React unmounting the page. Law 1 says `—`.
 *
 * ⚠ It deliberately does **not** re-validate the ISO shape. `lib/client/wire.ts` already
 * refuses a `ts` that is not a canonical ISO-8601 instant before it can reach a renderer,
 * and a second, differently-worded validator of the same format is second on HANDOVER §7's
 * do-not-copy list. This asks `Date` only the question a formatter has to ask: *is there an
 * instant here at all?*
 */
const instantOf = (ts: IsoTimestamp | null): Date | null => {
  if (ts === null) return null;
  const at = new Date(ts);
  return Number.isNaN(at.getTime()) ? null : at;
};

/**
 * §6.2's header clock — `14:47:31`.
 *
 * The server sends ISO-8601 **UTC** in `ts` (§6.6); this renders it **in the viewer's own
 * timezone**, 24-hour, with seconds, because the default cadence is 5 s and a clock with no
 * seconds looks frozen.
 *
 * `null` renders `—` (law 1), and so does a `ts` that names no instant — see
 * {@link instantOf} for why that path exists at all.
 *
 * ⚠ **The zone is a separate function, not a suffix on this string.** §6.6 shows the
 * abbreviation "once in the header" while the time sits beside it, and O14 forbids a caller
 * splitting a formatter's output on whitespace to get at half of it. See
 * {@link formatZoneAbbreviation}.
 *
 * @param timeZone An IANA zone name. **Omit it in the app** — §6.6's rule is the *viewer's*
 *   zone, and omitting it is how that is expressed. It exists because the host's timezone
 *   is ambient state that a test cannot assert against (HANDOVER §5.4: a test may consume
 *   entropy only for an assertion that holds for every value it could draw), so the tests
 *   pin a zone through it. An unknown zone name throws, as `Intl` does — a mistyped zone is
 *   a programming error and must not degrade into an em dash that reads as a lost reading.
 */
export const formatTimeOfDay = (ts: IsoTimestamp | null, timeZone?: string): string => {
  const at = instantOf(ts);
  return at === null ? EM_DASH : timeFormatter(timeZone).format(at);
};

/**
 * The zone abbreviation §6.2's header shows once beside the clock — `EDT`.
 *
 * ⚠ **It is a function of the instant, not of the machine.** The same viewer in the same
 * zone reads `EDT` in September and `EST` in January, so this takes the `ts` rather than
 * reading a zone name once at startup. A header that said `EST` all summer would be wrong
 * for eight months of the year, and silently.
 *
 * ⚠ **It is not always three letters and not always alphabetic.** `timeZoneName: 'short'`
 * yields `EDT` in New York, `GMT+2` in Berlin, `GMT+5:30` in Kolkata and `UTC` in UTC.
 * Nothing may assume a shape — not a caller, not a layout, not a test.
 *
 * Read out of `formatToParts`, **never** by splitting a formatted string on whitespace
 * (O14): `GMT+5:30` would survive that and `Eastern Daylight Time` would not, so the bug
 * would be invisible in the zone this box actually sits in.
 *
 * `null` — and a `ts` naming no instant — render `—` (law 1). Before the first poll there
 * is no instant, so there is no abbreviation to be right about.
 */
export const formatZoneAbbreviation = (ts: IsoTimestamp | null, timeZone?: string): string => {
  const at = instantOf(ts);
  if (at === null) return EM_DASH;
  const part = zoneFormatter(timeZone)
    .formatToParts(at)
    .find((p) => p.type === 'timeZoneName');
  return part === undefined ? EM_DASH : part.value;
};
