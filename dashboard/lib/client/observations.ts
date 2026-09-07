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

import { EM_DASH, formatCelsius, formatCh5Pwm, formatGB, formatGiB, formatMiBPair, formatRpm, formatSwapGiB, formatText } from '../format';
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
import type { CoolingChannels, Rpm, TelemetrySnapshot } from '../types';
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
      `${formatGB(filesystem.usedGB)} of ${formatGB(filesystem.totalGB)} used`,
      severityDiskFree(filesystem.usedGB, filesystem.totalGB),
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
