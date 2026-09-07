/**
 * **O11 — `conditionsFrom(snapshot)` is ONE function**, and it is what both §6.4's banner
 * and §6.4's event log are computed from.
 *
 * HANDOVER states the obligation and the reason: two extractions would let the banner and
 * the log disagree about the same machine, and §9 says "Reducing over `displaySeverity` is
 * what keeps the dot, the count and the banner from ever disagreeing". So there is one
 * projection from a snapshot to §6.4's conditions, it produces {@link ConditionObservation}s
 * carrying **raw** per-poll bands, and everything downstream goes through `observePoll` —
 * which is where the debounce, the ledger and the standing rule live (`lib/conditions.ts`).
 *
 * ### Rules this file has to keep, each of which is a hole somewhere else
 *
 * - **O12 / §6.3: a reading with no band produces no observation.** Every `severity*`
 *   function that can answer `null` means *this row does not apply* — `health: null` is "not
 *   probed this cycle", `fan5_engaged` in `ec-auto` is "the engaged band applies ONLY while
 *   engaged". Minting `normal` for any of them would assert health nobody measured.
 * - **O3 / §6.4: one reading, one condition.** Channel 5's zero is carried by
 *   `fan5_absolute` and is never a `fan_stopped` subject, so `fan_stopped` covers channels
 *   1–4 only.
 * - **§9: one fact, counted once.** `gpu-fan-control.service` is rendered in both COOLING and
 *   SAFETY, so it is emitted **twice** here — once from `cooling.serviceState`, once from
 *   `safety.fanServiceState` — and `observePoll` deduplicates by id. That is not sloppiness:
 *   O9 makes those two fields *one* D-Bus read written to both, so they cannot disagree, and
 *   emitting from both panels is what proves the dedupe is doing its job rather than the
 *   projection quietly doing it instead.
 * - **§6.4: the join key is `llama-server@<i>.service`, derived from the index.** From
 *   `lib/units.ts`, which is the one place either unit name is spelled.
 * - **`gpus: null` and `serving: null` are not `[]`.** No GPUs enumerated means no GPU
 *   conditions — not two healthy cards. And the difference outlives the poll: it is what
 *   {@link enumerationsRead} reports, and it is what lets §9 tell a card that **left** from a
 *   card we **stopped being able to see**.
 *
 * ### ⚠ This is NOT a panel surface
 *
 * `conditionsFrom` is deliberately **un-deduplicated** — `unit:gpu-fan-control.service` comes
 * out twice, once from COOLING and once from SAFETY, and §9's reduction is what collapses
 * them. A panel that mapped this output to rows would render the fan service twice and count
 * two alarms for one fault, which is the outcome §9 forbids by name. **The panel surface is
 * `RuntimeState.displayed`**, which is `observePoll`'s output: deduplicated, debounced, with
 * standing applied and stale conditions carried. A cell's *colour* is neither — §6.4 says it
 * comes from `lib/severity.ts` on the current reading, undebounced.
 *
 * ### Labels and values
 *
 * ⚠ §6.4 fixes the condition **ids**; it does not fix the label or the rendered value, and
 * `MOCK.html`'s event log is a reference rather than a source. The strings below follow the
 * mock's spelling (`fan 5`, `gpu-fan-control.service`, `llama-server@1`) and every value
 * goes through `lib/format.ts`, so invariant 1's `—`-not-`0` law is applied once, where it
 * is tested. Recorded in the step notes as copy this step chose.
 */

import { EM_DASH, formatCelsius, formatCh5Pwm, formatGiB, formatMiBPair, formatRpm, formatSwapGiB, formatText } from '../format';
import type { ConditionKind, ConditionObservation } from '../conditions';
import { observation } from '../conditions';
import {
  severityCpuTemp,
  severityDiskFree,
  severityDkms,
  severityFan5Absolute,
  severityFan5Engaged,
  severityFanStopped,
  severityGpuTemp,
  severityHealth,
  severityLink,
  severityMemory,
  severityPwm5Present,
  severityThrottle,
  severityUfw,
  severityUnitState,
  severityVram,
} from '../severity';
import type { CoolingChannels, ErrorSource, Rpm, TelemetryError, TelemetrySnapshot } from '../types';
import { FAN_SERVICE_UNIT, servingUnitName } from '../units';

/**
 * §4's two enumerated collections, named once.
 *
 * These are the only two members of a snapshot whose *membership* can change — a card is
 * pulled, an instance is removed — and therefore the only two that can ever retire a
 * condition (§9). Every other reading either has a value or is `null`; nothing enumerates
 * `ufw_enforcing` or `unit:gpu-fan-control.service`, so those can only ever go **stale**.
 */
export const GPU_ENUMERATION = 'gpus';

/** §4's other enumerated collection. See {@link GPU_ENUMERATION}. */
export const SERVING_ENUMERATION = 'serving';

/**
 * Which enumerations this poll **read** — §9's evidence that a subject has left rather than
 * merely stopped answering.
 *
 * ⚠ `null` is not `[]`, and this is where the whole cost of keeping them apart is repaid:
 * `gpus: null` means *we could not enumerate*, so a card that was at 90 °C keeps its alarm;
 * `gpus: []` means *we enumerated and there are none*, so it is gone and the alarm goes with
 * it. §3.1 spends a paragraph on the distinction and §9 says "this is what it is for".
 */
export const enumerationsRead = (snapshot: TelemetrySnapshot): ReadonlySet<string> => {
  const read = new Set<string>();
  if (snapshot.gpus !== null) read.add(GPU_ENUMERATION);
  if (snapshot.serving !== null) read.add(SERVING_ENUMERATION);
  return read;
};

/**
 * Whether a kind's **rendered value** is drawn from a closed vocabulary, and is therefore
 * itself a band the event log can debounce and log a transition of.
 *
 * §6.4's event log shows `llama-server@1  active` and `throttle 0x4 → 0x24` — transitions of
 * a *state*, not of a severity band. `active → reloading` is `normal → normal` and would be
 * invisible to a log keyed on severity alone, yet it is exactly what that column is for. A
 * continuous metric has no such vocabulary: its value changes every poll, so its band is its
 * §6.3 severity and nothing else.
 *
 * A `Record<ConditionKind, boolean>` rather than a list, so a kind added to §6.4's table
 * without a decision here is a compile error.
 */
export const VALUE_IS_A_BAND: Readonly<Record<ConditionKind, boolean>> = {
  gpu_temp: false,
  gpu_throttle: true,
  gpu_vram: false,
  disk_free: false,
  unit: true,
  health: true,
  fan_stopped: false,
  cpu_temp: false,
  ram: false,
  fan5_engaged: false,
  fan5_absolute: false,
  ufw_enforcing: true,
  pwm5_present: true,
  dkms_for_running_kernel: true,
  link: true,
};

/** Which panel a condition belongs to — the event log's `source` column (`MOCK.html`). */
export const conditionSource = (kind: ConditionKind, subject: string | null): string => {
  switch (kind) {
    case 'gpu_temp':
    case 'gpu_throttle':
    case 'gpu_vram':
      return `gpu ${subject ?? '?'}`;
    case 'cpu_temp':
    case 'ram':
      return 'host';
    case 'fan_stopped':
    case 'fan5_engaged':
    case 'fan5_absolute':
      return 'cooling';
    case 'unit':
      return subject === FAN_SERVICE_UNIT ? 'cooling' : 'serving';
    case 'health':
      return 'serving';
    case 'disk_free':
    case 'link':
      return 'storage';
    case 'ufw_enforcing':
    case 'pwm5_present':
    case 'dkms_for_running_kernel':
      return 'safety';
  }
};

/**
 * Where a reading can appear on screen: §6.1's grid, plus §6.2's header.
 *
 * ### ⚠ This is a SECOND vocabulary, on purpose. It is not `conditionSource`'s.
 *
 * The handoff put the choice as (a) two vocabularies, each with one definition, or (b) one
 * `Panel` type that the event log renders a coarser label from. **(a)**, and the argument is
 * not "the log reads better coarse" — it is that these are two *different joins* and neither
 * key set is a subset of the other:
 *
 * | | key | codomain | consumer |
 * |---|---|---|---|
 * | {@link conditionSource} | `ConditionKind` + subject | a **label**, `string`, with the subject interpolated (`gpu 0`) | §6.4's event-log source column |
 * | {@link errorsForPanel} | `ErrorSource` | a **closed set of places**, switched over exhaustively | §6.5's em-dash → `errors[]` join |
 *
 * HANDOVER's do-not-copy list forbids *a second mapping of a join that already exists*.
 * `ConditionKind → log label` and `ErrorSource → panel` are not the same join: they have
 * different keys, different codomains, and — decisively — a different *granularity that is
 * forced by the data*. Three places show that (b) cannot be made to work without inventing
 * something:
 *
 * - **`conditionSource` returns `string`, not a closed type**, because `gpu ${subject}` is
 *   interpolated per card. An exhaustive `switch` needs a closed codomain; a `string` one
 *   would make a nineteenth source a silent blank, which is exactly what §3.7's closed
 *   vocabulary exists to prevent.
 * - **CPU and MEMORY are two panels in §6.1 and one `'host'` in `conditionSource`.** Under
 *   (b) `cpu_temp` and `ram` would map to *different* members and the log would then
 *   re-collapse them — a mapping of a mapping, and two functions where (a) has two.
 * - **The header is not in §6.1's grid at all**, and `conditionSource` has no value for it,
 *   so `hostname` and `proc-uptime` would have nowhere to go. (a) gives the header a member;
 *   (b) would have to add one to the log's vocabulary that the log never renders.
 *
 * The cost of (a) is two vocabularies that could drift. It is paid the way this project pays
 * for `scripts/hash-password.py`: by measurement, not by a comment — every member below is
 * reached by a fixture on both sides, and `conditionSource` is unchanged, so there is nothing
 * to keep in step.
 *
 * ### Why `'gpu'` is one member and not one per card
 *
 * `nvidia-smi` is the **whole enumeration**, not a card: `gpus: null` blanks GPU 0 and GPU 1
 * together, and it is the only source either card has. A per-card member would make
 * {@link panelsForSource} a function of *how many cards answered*, which is not a fact about
 * a source — and there is no `errors[]` entry it could ever return for one card and not the
 * other. Both GPU panels ask for `'gpu'` and get the same answer, which is the truth.
 *
 * ### What is deliberately absent
 *
 * **§6.1's session event log is not a `Panel`.** It renders no reading, so it has no em dash
 * and nothing to explain; §6.5's join has no meaning there. Its feed is `state.events`.
 */
export type Panel =
  /** §6.2's header — hostname and uptime. Not in §6.1's grid, and it still shows readings. */
  | 'header'
  /** §6.1 row 1, both cards. See above: `nvidia-smi` cannot be attributed to one of them. */
  | 'gpu'
  /** §6.2's CPU panel: package temperature, utilisation, load average, and its subtitle. */
  | 'cpu'
  /** §6.2's MEMORY panel: RAM against 61 GiB, and swap on its own row. */
  | 'memory'
  /** §6.1's COOLING panel, spanning rows 2–3: five channels, the derived mode, the service. */
  | 'cooling'
  /** §6.2's SERVING panel: one row per `llama-server` instance. */
  | 'serving'
  /** §6.2's STORAGE & NETWORK panel: both mounts, `eno1` throughput and link state. */
  | 'storage'
  /** §6.2's SAFETY panel: §3.6's four checks. */
  | 'safety';

/**
 * Which panels one §3.7 source blanks when it fails.
 *
 * ⚠ **An exhaustive `switch`, and not a `Record` or a lookup object.** §3.7's eighteen
 * sources are a closed set and `noFallthroughCasesInSwitch` is on, so a nineteenth source is
 * a compile error here — under `strictNullChecks` a missing case makes the function able to
 * return `undefined` against a declared `readonly Panel[]`. A `Record` with a default, or
 * anything keyed by `string`, turns that compile error into a silently unexplained em dash,
 * which is the one outcome §6.5 exists to prevent.
 *
 * ### ⚠ Three sources are not 1:1, and each is a real fan-out rather than an ambiguity
 *
 * - **`dbus` reaches THREE panels.** It is filed by two collectors and consumed by three
 *   figures: `collectSafety` reads `gpu-fan-control.service` once (O9) and that one read is
 *   written to **`cooling.serviceState`** and to **`safety.fanServiceState`**, while
 *   `collectServing` reads the `llama-server@<i>` units into **`serving[].unitState`**. One
 *   D-Bus failure genuinely blanks a figure on COOLING, on SERVING **and** on SAFETY.
 * - **`dell-smm` reaches TWO.** ⚠ This one is *not* in the handoff's table and was found by
 *   reading `lib/telemetry/snapshot.ts`: the assembly writes
 *   `assembledSafety.pwm5Present = cooling.pwm5Present`, so the cooling collector's probe is
 *   what stands behind §6.2's SAFETY `pwm5 present` row as well as every fan channel and the
 *   derived mode. §3.7 requires that row to carry an explanation beside it —
 *   *"an alarm with no explanation beside it is not actionable"* — and `dell-smm` is the only
 *   source that can supply one.
 * - **`hostname` and `proc-uptime` reach the HEADER**, which §6.1's grid does not contain.
 *   Without {@link Panel}'s `'header'` member both entries would be unreachable: filed by a
 *   collector, carried on the wire, and matched to nothing.
 *
 * ### And one source that looks like a fan-out and is not
 *
 * ⚠ **`nvidia-smi` does NOT reach COOLING**, even though §6.2 draws the GPU temperature trace
 * and the fan RPM trace on shared time inside the COOLING panel. §6.5 is explicit: when
 * `nvidia-smi` is absent the GPU panels say so and *"no other panel is affected"*. The
 * cooling chart losing a trace is the GPU panel's outage rendered again, not a second fault
 * for COOLING to explain, and duplicating the entry would state one fact twice — the thing
 * §6.5's own exception is written to stop.
 *
 * Each list is in §4's field order (gpus, host, cooling, serving, storage, safety), matching
 * `errors[]`'s own documented order so nothing here re-sorts anything.
 */
const panelsForSource = (source: ErrorSource): readonly Panel[] => {
  switch (source) {
    // ---- §3.1. The enumeration, not a card.
    case 'nvidia-smi':
      return ['gpu'];

    // ---- §3.2, split across three panels and the header by the FIGURE each one blanks.
    // ⚠ `collectHost` files nine sources for one crash precisely so this split is possible;
    // folding them back onto one `'host'` panel is the mistake `conditionSource` cannot make
    // because it is not asked this question.
    case 'coretemp':
    case 'proc-stat':
    case 'proc-loadavg':
      return ['cpu'];
    // ⚠ The CPU panel's SUBTITLE — `<cpuModel> · 6C / 12T` (§6.2) — not a body row. It is
    // identity rather than measurement, and a subtitle is `—` when its field is `null` like
    // any other reading, so it owes an entry on the same terms.
    case 'proc-cpuinfo':
      return ['cpu'];
    case 'proc-meminfo':
      return ['memory'];
    // §6.2's header carries the hostname and the uptime, and that list is exhaustive.
    case 'hostname':
    case 'proc-uptime':
      return ['header'];
    // §3.7 keeps these two apart deliberately — sysfs for the link, /proc for the counters —
    // so that a failed link read is not attributed to the byte counters. Both land on the
    // same panel, and separating them still buys the message beside the right figure.
    case 'proc-net-dev':
    case 'net-operstate':
      return ['storage'];

    // ---- §3.3 + §3.6's `pwm5Present`. See the fan-out note above.
    case 'dell-smm':
      return ['cooling', 'safety'];

    // ---- §3.3 + §3.4 + §3.6. The three-panel fan-out. See the note above.
    case 'dbus':
      return ['cooling', 'serving', 'safety'];

    // ---- §3.4.
    case 'llama-env':
    case 'llama-health':
    case 'llama-models':
      return ['serving'];

    // ---- §3.5.
    case 'statvfs':
      return ['storage'];

    // ---- §3.6.
    case 'ufw':
    case 'dkms':
      return ['safety'];
  }
};

/**
 * §6.5's join: the `errors[]` entries that explain this panel's em dashes.
 *
 * *"A single sensor read fails → that figure shows `—`, its `errors` entry is available, the
 * rest of the panel renders."* This is the "is available" half. It is written **once**,
 * beside {@link conditionSource}, so no panel invents its own filter — and it is what makes
 * §6.5's one exception (*"an `—` whose cause is already shown beside it"*, and only when the
 * coloured neighbour is **in the same panel**) expressible at all.
 *
 * - **Order is `snapshot.errors`' own order**, preserved by filtering rather than rebuilt.
 *   §4's concatenation order is a decision pinned by a test (`snapshot.ts`), and `events.ts`
 *   reads the **last** message per source — so a panel that re-sorted would show a different
 *   D-Bus sentence than the event log for the same fault.
 * - **`[]`, never `null`**, for a panel with nothing to explain. `null` on this project means
 *   *unknown*, and "no entry explains this panel" is knowledge, not a gap.
 *
 * ⚠ This answers *which entries exist*, not *which em dash they belong to*. A source can
 * blank several figures on one panel — `dell-smm` blanks five channels and the mode — and
 * §3.7's granularity is per source, not per figure. A panel showing an entry beside a row is
 * therefore showing the entry for that row's **source**, which is the finest join §4 offers.
 */
export const errorsForPanel = (
  snapshot: TelemetrySnapshot,
  panel: Panel,
): readonly TelemetryError[] =>
  snapshot.errors.filter((error) => panelsForSource(error.source).includes(panel));

/** §6.3's three-valued safety checks render `yes` / `no` / `—`, never `true` / `false`. */
const yesNo = (value: boolean | null): string => (value === null ? EM_DASH : value ? 'yes' : 'no');

/** §6.4's `disk_free` subjects, and the mount point each one names on screen. */
const DISKS = [
  { subject: 'root', label: '/' },
  { subject: 'home', label: '/home' },
] as const;

/** §6.3's `fan1`–`fan4` row. ⚠ Channel 5 is **not** a subject of this kind (O3). */
const CHASSIS_CHANNELS: readonly (readonly [number, (c: CoolingChannels) => Rpm | null])[] = [
  [1, (c) => c.fan1Rpm],
  [2, (c) => c.fan2Rpm],
  [3, (c) => c.fan3Rpm],
  [4, (c) => c.fan4Rpm],
];

/**
 * Every §6.3 row this snapshot has a band for, in §4's own field order — gpus, host,
 * cooling, serving, storage, safety.
 *
 * The order is the order `observePoll`'s dedupe resolves ties in (first wins) and the order
 * the event log reads, so it is fixed here rather than left to whichever loop happens to run
 * first. It matches `errors[]`'s documented order, which is the order §6.5 already matches
 * a `—` to its explanation in.
 */
export const conditionsFrom = (snapshot: TelemetrySnapshot): readonly ConditionObservation[] => {
  const out: ConditionObservation[] = [];
  const push = (
    kind: ConditionKind,
    subject: string | null,
    label: string,
    value: string,
    rawSeverity: ReturnType<typeof severityGpuTemp>,
    // ⚠ Which enumeration produced this subject, or `null` for one nothing enumerates. §9
    // reads it back to decide *retired* against *stale*; see {@link enumerationsRead}.
    enumeration: string | null = null,
  ): void => {
    // O12: no band, no condition. Never invent one.
    if (rawSeverity === null) return;
    out.push(observation({ kind, subject, label, value, rawSeverity, enumeration }));
  };

  // ---- GPUs (§3.1). `gpus: null` is "not enumerated", and is not two healthy cards.
  for (const gpu of snapshot.gpus ?? []) {
    const at = String(gpu.index);
    push(
      'gpu_temp',
      at,
      `GPU ${at} temperature`,
      formatCelsius(gpu.tempC),
      severityGpuTemp(gpu.tempC),
      GPU_ENUMERATION,
    );
    push(
      'gpu_throttle',
      at,
      `GPU ${at} throttle`,
      formatText(gpu.throttleReasons),
      severityThrottle(gpu.throttleReasons),
      GPU_ENUMERATION,
    );
    push(
      'gpu_vram',
      at,
      `GPU ${at} VRAM`,
      formatMiBPair(gpu.memUsedMiB, gpu.memTotalMiB),
      severityVram(gpu.memUsedMiB, gpu.memTotalMiB),
      GPU_ENUMERATION,
    );
  }

  // ---- Host (§3.2)
  const host = snapshot.host;
  push('cpu_temp', null, 'CPU temperature', formatCelsius(host.cpuTempC), severityCpuTemp(host.cpuTempC));
  push(
    'ram',
    null,
    'RAM',
    // ⚠ §6.3's RAM row has two independent triggers — used % and swap above 1 GiB — so the
    // banner has to show both or it names a value that did not move.
    `${formatGiB(host.memUsedGiB)} used · swap ${formatSwapGiB(host.swapUsedGiB)}`,
    severityMemory(host),
  );

  // ---- Cooling (§3.3)
  const cooling = snapshot.cooling;
  for (const [channel, read] of CHASSIS_CHANNELS) {
    const value = read(cooling);
    push('fan_stopped', String(channel), `fan ${channel}`, formatRpm(value), severityFanStopped(value));
  }
  push('fan5_absolute', null, 'fan 5', formatRpm(cooling.fan5Rpm), severityFan5Absolute(cooling));
  push(
    'fan5_engaged',
    null,
    'fan 5 engaged',
    `${formatRpm(cooling.fan5Rpm)} · ${formatCh5Pwm(cooling)}`,
    severityFan5Engaged(cooling),
  );
  // §9's "one reading shown in two panels": emitted here from COOLING and again from SAFETY.
  push(
    'unit',
    FAN_SERVICE_UNIT,
    FAN_SERVICE_UNIT,
    formatText(cooling.serviceState),
    severityUnitState(cooling.serviceState),
  );

  // ---- Serving (§3.4). `serving: null` is "which instances exist is unknown", not none.
  for (const instance of snapshot.serving ?? []) {
    const unit = servingUnitName(instance.instance);
    push(
      'unit',
      unit,
      unit,
      formatText(instance.unitState),
      severityUnitState(instance.unitState),
      SERVING_ENUMERATION,
    );
    push(
      'health',
      String(instance.instance),
      `llama-server@${instance.instance} /health`,
      formatText(instance.health),
      severityHealth(instance.health),
      SERVING_ENUMERATION,
    );
  }

  // ---- Storage & network (§3.5)
  for (const disk of DISKS) {
    const filesystem = disk.subject === 'root' ? snapshot.storage.root : snapshot.storage.home;
    push(
      'disk_free',
      disk.subject,
      `${disk.label} free`,
      `${formatGiB(filesystem.usedGiB)} of ${formatGiB(filesystem.totalGiB)} used`,
      severityDiskFree(filesystem.usedGiB, filesystem.totalGiB),
    );
  }
  push('link', null, 'eno1 link', formatText(snapshot.storage.net.link), severityLink(snapshot.storage.net.link));

  // ---- Safety (§3.6). All three checks are total: they always carry a band.
  const safety = snapshot.safety;
  push('ufw_enforcing', null, 'ufw enforcing', yesNo(safety.ufwEnforcing), severityUfw(safety.ufwEnforcing));
  push(
    'pwm5_present',
    null,
    'pwm5 present',
    yesNo(safety.pwm5Present),
    severityPwm5Present(safety.pwm5Present),
  );
  push(
    'dkms_for_running_kernel',
    null,
    'DKMS for running kernel',
    yesNo(safety.dkmsForRunningKernel),
    severityDkms(safety.dkmsForRunningKernel),
  );
  push(
    'unit',
    FAN_SERVICE_UNIT,
    FAN_SERVICE_UNIT,
    formatText(safety.fanServiceState),
    severityUnitState(safety.fanServiceState),
  );

  return out;
};
