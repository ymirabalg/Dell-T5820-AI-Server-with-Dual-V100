/**
 * O11's one projection: a snapshot in, §6.4's conditions out.
 *
 * What is asserted here is the *set* of conditions and their ids, not their colours — the
 * bands are `lib/severity.ts`'s and are already table-tested there. The three properties that
 * are genuinely this file's are the ones a second extraction would break: which rows produce a
 * condition at all (O12), which subject each one carries (§6.4), and that one reading shown in
 * two panels is one condition (§9, O3).
 */

import { describe, expect, test } from 'vitest';

import { CONDITION_KINDS, EMPTY_CONDITION_STATE, observePoll, standingIdsFrom } from '../conditions';
import type { ConditionObservation } from '../conditions';
import { everythingZero, nothingReadable, servingInstances, servingPopulated } from '../fixtures';
import { FAN_SERVICE_UNIT } from '../units';
import { celsius, gib, mib, pwm, rpm, throttleMask } from '../types';
import type { ErrorSource, Gpu, TelemetryError, TelemetrySnapshot } from '../types';
import { GPU_ENUMERATION, SERVING_ENUMERATION, VALUE_IS_A_BAND, conditionSource, conditionsFrom, enumerationsRead, errorsForPanel } from './observations';
import type { Panel } from './observations';

const card = everythingZero.gpus?.[0];
if (card === undefined) throw new Error('the everythingZero fixture lost its GPU');

/** A box under load: two cards, a warm one, both channels of serving, and every check read. */
const loaded: TelemetrySnapshot = {
  ...servingPopulated,
  gpus: [
    { ...card, index: 0, tempC: celsius(76), memUsedMiB: mib(26_452), memTotalMiB: mib(32_768) },
    {
      ...card,
      index: 1,
      tempC: celsius(63),
      memUsedMiB: mib(26_650),
      memTotalMiB: mib(32_768),
      throttleReasons: throttleMask('0x0000000000000004'),
    },
  ] satisfies Gpu[],
  host: { ...everythingZero.host, cpuTempC: celsius(58), memUsedGiB: gib(12.1), memTotalGiB: gib(61) },
  cooling: {
    fan1Rpm: rpm(1005),
    fan2Rpm: rpm(720),
    fan3Rpm: rpm(740),
    fan4Rpm: rpm(1111),
    fan5Rpm: rpm(4308),
    ch5Mode: 'manual',
    ch5Pwm: pwm(255),
    serviceState: 'active',
  },
};

const idsOf = (snapshot: TelemetrySnapshot): string[] =>
  conditionsFrom(snapshot).map((observed) => observed.id);

const find = (
  snapshot: TelemetrySnapshot,
  id: string,
): ConditionObservation | undefined => conditionsFrom(snapshot).find((o) => o.id === id);

describe('⚠ §6.4’s condition ids, spelled the way §6.4 spells them', () => {
  test('⚠ a GPU’s three rows are subscripted by a bare index', () => {
    expect(idsOf(loaded)).toEqual(
      expect.arrayContaining([
        'gpu_temp:0',
        'gpu_throttle:0',
        'gpu_vram:0',
        'gpu_temp:1',
        'gpu_throttle:1',
        'gpu_vram:1',
      ]),
    );
  });

  test('⚠ a singleton kind carries no subject at all', () => {
    expect(idsOf(loaded)).toEqual(
      expect.arrayContaining([
        'cpu_temp',
        'ram',
        'fan5_absolute',
        'ufw_enforcing',
        'pwm5_present',
        'dkms_for_running_kernel',
        'link',
      ]),
    );
  });

  /*
   * ⚠ The **exact** set, not `arrayContaining`. Written loosely this test said nothing about
   * channel 5 joining the row — O3's whole point — and the harness said so: adding
   * `fan_stopped:5` left it green. Four channels, and no fifth.
   */
  test('⚠ fan_stopped is subscripted by a bare channel integer, 1 to 4', () => {
    expect(idsOf(loaded).filter((id) => id.startsWith('fan_stopped'))).toEqual([
      'fan_stopped:1',
      'fan_stopped:2',
      'fan_stopped:3',
      'fan_stopped:4',
    ]);
  });

  /*
   * ⚠ O3, and §6.3's reason for it: "Channel 5's zero is NOT a `fan_stopped` subject. It is
   * carried by `fan5_absolute`, whose row now has two sides. One tach must never produce two
   * conditions." The fixture is a channel 5 reading `0` — a stopped fan — and the assertion is
   * that it alarms **once**.
   */
  test('⚠ channel 5’s zero is fan5_absolute and is never a fan_stopped subject', () => {
    const zeroed: TelemetrySnapshot = {
      ...loaded,
      cooling: { ...loaded.cooling, fan5Rpm: rpm(0) },
    };
    const ids = idsOf(zeroed);
    expect(ids).not.toContain('fan_stopped:5');
    expect(ids.filter((id) => id === 'fan5_absolute')).toHaveLength(1);
    expect(find(zeroed, 'fan5_absolute')?.rawSeverity).toBe('alarm');
  });

  /*
   * ⚠ §6.4: "The join key between a serving instance and its unit is `llama-server@<i>.service`
   * … the SERVING panel derives the unit name from the index rather than the two being matched
   * by string." Derived from `lib/units.ts`, which is the one place either name is spelled.
   */
  test('⚠ a serving instance’s unit id is derived from its index', () => {
    const ids = idsOf(servingPopulated);
    expect(ids).toEqual(
      expect.arrayContaining([
        'unit:llama-server@0.service',
        'unit:llama-server@1.service',
        'health:0',
        'health:1',
      ]),
    );
  });

  /*
   * ⚠ The literal, not the imported constant. Written as `` `unit:${FAN_SERVICE_UNIT}` `` this
   * test was **inert**: renaming the constant moved both sides of the assertion together, and
   * the harness said so. §3.6's check watches this exact unit name and nothing else does.
   */
  test('⚠ the fan service is named gpu-fan-control.service, from lib/units.ts', () => {
    expect(FAN_SERVICE_UNIT).toBe('gpu-fan-control.service');
    expect(idsOf(loaded)).toContain('unit:gpu-fan-control.service');
  });

  test('every §6.4 kind is reachable from a snapshot this box can produce', () => {
    const kinds = new Set(conditionsFrom(loaded).map((o) => o.kind));
    // `fan5_engaged` needs an engaged channel; the loaded fixture has HIGH duty.
    expect([...CONDITION_KINDS].filter((kind) => !kinds.has(kind))).toEqual([]);
  });
});

describe('⚠ O12: a reading with no §6.3 band produces no condition', () => {
  test('⚠ a snapshot where nothing could be read produces only the total safety rows', () => {
    // §6.3's three safety checks are **total** — `null` is watch, never absent — so they are
    // the only rows a completely blind snapshot can colour. Anything else would be a band
    // invented from a failed read.
    expect(idsOf(nothingReadable).sort()).toEqual([
      'dkms_for_running_kernel',
      'pwm5_present',
      'ufw_enforcing',
    ]);
  });

  /*
   * No ⚠. `snapshot.gpus ?? []` has no single plausible wrong implementation inside this
   * function — the distinction between `null` and `[]` is made and defended at the **wire**,
   * where `W2` mutates it and `wire.test.ts` catches it. Kept because it states the rule where
   * a reader of this file will look for it.
   */
  test('gpus: null produces no GPU conditions, and is not two healthy cards', () => {
    const blind: TelemetrySnapshot = { ...loaded, gpus: null };
    expect(idsOf(blind).filter((id) => id.startsWith('gpu_'))).toEqual([]);
  });

  /* No ⚠, for the same reason as `gpus: null` above: the distinction is `wire.ts`'s. */
  test('serving: null produces no instance conditions, and is not "none configured"', () => {
    const blind: TelemetrySnapshot = { ...loaded, serving: null };
    expect(idsOf(blind).filter((id) => id.startsWith('health:'))).toEqual([]);
    expect(idsOf(blind).filter((id) => id.startsWith('unit:llama'))).toEqual([]);
  });

  test('⚠ health: null is "not probed this cycle" and carries no severity', () => {
    const unprobed: TelemetrySnapshot = {
      ...servingPopulated,
      serving: servingInstances.map((i) => ({ ...i, health: null })),
    };
    expect(idsOf(unprobed).filter((id) => id.startsWith('health:'))).toEqual([]);
  });

  test('⚠ the fan5 engaged row is absent in EC auto, where it would alarm on a healthy box', () => {
    const ecAuto: TelemetrySnapshot = {
      ...loaded,
      cooling: { ...loaded.cooling, ch5Mode: 'ec-auto', ch5Pwm: null, fan5Rpm: rpm(2210) },
    };
    expect(idsOf(ecAuto)).not.toContain('fan5_engaged');
    // …while the absolute row is unconditional and still there.
    expect(idsOf(ecAuto)).toContain('fan5_absolute');
  });

  test('⚠ a chassis channel that did not enumerate carries no fan_stopped condition', () => {
    const lost: TelemetrySnapshot = { ...loaded, cooling: { ...loaded.cooling, fan3Rpm: null } };
    expect(idsOf(lost)).not.toContain('fan_stopped:3');
    expect(idsOf(lost)).toContain('fan_stopped:4');
  });

  test('⚠ a unit state that could not be read carries no band', () => {
    const unread: TelemetrySnapshot = {
      ...loaded,
      cooling: { ...loaded.cooling, serviceState: null },
      safety: { ...loaded.safety, fanServiceState: null },
    };
    expect(idsOf(unread)).not.toContain(`unit:${FAN_SERVICE_UNIT}`);
  });
});

describe('⚠ §9: one reading shown in two panels is one condition', () => {
  /*
   * ⚠ `gpu-fan-control.service` is rendered in COOLING and in SAFETY, and O9 makes both fields
   * one D-Bus read. It is emitted twice on purpose — that is what proves `observePoll`'s dedupe
   * is doing the work — and the header must still read one alarm, not two.
   */
  test('⚠ the fan service is emitted from both panels and counted once', () => {
    const failed: TelemetrySnapshot = {
      ...loaded,
      cooling: { ...loaded.cooling, serviceState: 'failed' },
      safety: { ...loaded.safety, fanServiceState: 'failed' },
    };
    const observations = conditionsFrom(failed).filter((o) => o.id === `unit:${FAN_SERVICE_UNIT}`);
    expect(observations).toHaveLength(2);

    const { displayed } = observePoll(
      EMPTY_CONDITION_STATE,
      conditionsFrom(failed),
      standingIdsFrom([]),
      0,
    );
    expect(displayed.filter((d) => d.id === `unit:${FAN_SERVICE_UNIT}`)).toHaveLength(1);
  });

  test('⚠ the COOLING reading is the one that wins the tie, being first in §4’s field order', () => {
    const observations = conditionsFrom(loaded);
    const first = observations.findIndex((o) => o.id === `unit:${FAN_SERVICE_UNIT}`);
    const fan5 = observations.findIndex((o) => o.id === 'fan5_absolute');
    expect(first).toBeGreaterThan(fan5);
    expect(observations.filter((o) => o.kind === 'unit' && o.subject === FAN_SERVICE_UNIT)).toHaveLength(2);
  });
});

describe('the value a banner shows', () => {
  test('⚠ a value is formatted by lib/format.ts, so 0 reads as 0 RPM and null as an em dash', () => {
    const zero: TelemetrySnapshot = { ...loaded, cooling: { ...loaded.cooling, fan2Rpm: rpm(0) } };
    expect(find(zero, 'fan_stopped:2')?.value).toBe('0 RPM');

    const warm = find(loaded, 'gpu_temp:0');
    expect(warm?.value).toBe('76 °C');
  });

  test('⚠ the RAM row shows both of its triggers, because §6.3 gives it two', () => {
    const value = find(loaded, 'ram')?.value ?? '';
    expect(value).toContain('GiB');
    expect(value).toContain('swap');
  });

  test('⚠ the three-valued safety checks read yes / no / — and never true / false', () => {
    expect(find(loaded, 'ufw_enforcing')?.value).toBe('no');
    expect(find({ ...loaded, safety: { ...loaded.safety, ufwEnforcing: true } }, 'ufw_enforcing')?.value).toBe(
      'yes',
    );
    expect(find(nothingReadable, 'ufw_enforcing')?.value).toBe('—');
  });

  test('the fan5 engaged row names the duty as well as the tach', () => {
    expect(find(loaded, 'fan5_engaged')?.value).toContain('RPM');
    expect(find(loaded, 'fan5_engaged')?.value).toContain('pwm');
  });
});

describe('the event log’s two supporting tables', () => {
  /*
   * No ⚠: this is **compiler**-enforced. `VALUE_IS_A_BAND` is a `Record<ConditionKind, boolean>`,
   * so a kind added to §6.4's table without a decision here is a `tsc` error, not a runtime one
   * — the harness covers it as the `types` mutation `T4`, which by construction contributes no
   * red-test line (HANDOVER §5.2 rule 4). The assertion stays as the readable statement of it.
   */
  test('every §6.4 kind has a decision about whether its value is itself a band', () => {
    expect(Object.keys(VALUE_IS_A_BAND).sort()).toEqual([...CONDITION_KINDS].sort());
  });

  test('⚠ the state-valued kinds are the ones drawn from a closed vocabulary', () => {
    const stateValued = Object.entries(VALUE_IS_A_BAND)
      .filter(([, isBand]) => isBand)
      .map(([kind]) => kind)
      .sort();
    expect(stateValued).toEqual([
      'dkms_for_running_kernel',
      'gpu_throttle',
      'health',
      'link',
      'pwm5_present',
      'ufw_enforcing',
      'unit',
    ]);
  });

  test('⚠ the fan service’s log source is cooling, and an llama unit’s is serving', () => {
    expect(conditionSource('unit', FAN_SERVICE_UNIT)).toBe('cooling');
    expect(conditionSource('unit', 'llama-server@1.service')).toBe('serving');
    expect(conditionSource('gpu_temp', '1')).toBe('gpu 1');
    expect(conditionSource('ufw_enforcing', null)).toBe('safety');
  });
});

// ---------------------------------------------------------------------------
// §9's evidence for *not there* against *not read*
// ---------------------------------------------------------------------------

describe('⚠ which enumerations a poll could read', () => {
  /*
   * ⚠ §3.1 spends a paragraph keeping `null` and `[]` apart and §9 says "this is what it is
   * for": `gpus: null` means *we could not enumerate*, so a card that was at 90 °C keeps its
   * alarm; `gpus: []` means *we enumerated and there are none*, so it has left and the alarm
   * goes with it. Getting this backwards turns the header green at the moment the dashboard
   * loses the ability to look.
   */
  test('⚠ null is not [] — an unread collection retires nothing', () => {
    expect([...enumerationsRead({ ...loaded, gpus: null, serving: null })]).toEqual([]);
    expect([...enumerationsRead({ ...loaded, gpus: [], serving: [] })].sort()).toEqual([
      GPU_ENUMERATION,
      SERVING_ENUMERATION,
    ]);
  });

  test('each collection is reported independently', () => {
    expect([...enumerationsRead({ ...loaded, gpus: null })]).toEqual([SERVING_ENUMERATION]);
    expect([...enumerationsRead({ ...loaded, serving: null })]).toEqual([GPU_ENUMERATION]);
  });

  /*
   * ⚠ The join between an observation and its enumeration is made **where the observation is
   * produced**, and that is the point: `unit:llama-server@0.service` and
   * `unit:gpu-fan-control.service` are the same kind with different answers, and only the
   * projection knows which is which. Deciding later would mean re-deriving §6.4's join key by
   * pattern — a second spelling of the name `lib/units.ts` exists to prevent.
   */
  test('⚠ an enumerated subject names its collection, and an unenumerated one names none', () => {
    expect(find(loaded, 'gpu_temp:0')?.enumeration).toBe(GPU_ENUMERATION);
    expect(find(loaded, 'gpu_vram:1')?.enumeration).toBe(GPU_ENUMERATION);
    expect(find(loaded, 'health:0')?.enumeration).toBe(SERVING_ENUMERATION);
    expect(find(loaded, 'unit:llama-server@0.service')?.enumeration).toBe(SERVING_ENUMERATION);

    // Nothing enumerates these, so they can only ever go stale — never be retired.
    expect(find(loaded, `unit:${FAN_SERVICE_UNIT}`)?.enumeration ?? null).toBeNull();
    expect(find(loaded, 'ufw_enforcing')?.enumeration ?? null).toBeNull();
    expect(find(loaded, 'fan_stopped:3')?.enumeration ?? null).toBeNull();
    expect(find(loaded, 'disk_free:home')?.enumeration ?? null).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// D4 — §6.5's `ErrorSource` → panel join
// ---------------------------------------------------------------------------

/**
 * §3.7's eighteen sources, in the spec's own listing order.
 *
 * ⚠ Written out rather than derived, because there is nothing to derive it from: `ErrorSource`
 * is a type and erases. The `satisfies` keeps it honest in one direction (no invented source)
 * and the "every source reaches a panel" test below keeps the count honest in the other.
 */
const ALL_SOURCES = [
  'nvidia-smi',
  'coretemp',
  'proc-stat',
  'proc-meminfo',
  'proc-loadavg',
  'proc-uptime',
  'proc-net-dev',
  'net-operstate',
  'proc-cpuinfo',
  'hostname',
  'dell-smm',
  'dbus',
  'llama-env',
  'llama-health',
  'llama-models',
  'statvfs',
  'ufw',
  'dkms',
] as const satisfies readonly ErrorSource[];

/** §6.1's grid plus §6.2's header — the whole `Panel` union, for the symmetry table. */
const ALL_PANELS = [
  'header',
  'gpu',
  'cpu',
  'memory',
  'cooling',
  'serving',
  'storage',
  'safety',
] as const satisfies readonly Panel[];

const withErrors = (errors: readonly TelemetryError[]): TelemetrySnapshot => ({ ...loaded, errors });

/** Every source failing at once, so one snapshot exercises the whole mapping. */
const everySourceFailed = withErrors(
  ALL_SOURCES.map((source) => ({ source, message: `${source}: could not be read` })),
);

const sourcesOn = (panel: Panel): ErrorSource[] =>
  errorsForPanel(everySourceFailed, panel).map((error) => error.source);

/**
 * Both sides of the boundary in one value: the panels a source reaches, and — by the panels
 * absent from the result — the panels it does not.
 */
const panelsCarrying = (source: ErrorSource): Panel[] =>
  ALL_PANELS.filter((panel) => sourcesOn(panel).includes(source));

describe('⚠ §6.5: the errors[] entries that explain a panel’s em dashes', () => {
  /**
   * ⚠ The fan-out most likely to be got wrong and least likely to be noticed. `dbus` is filed
   * by TWO collectors and read by THREE figures: `collectSafety` reads
   * `gpu-fan-control.service` once (O9) and that read is written to `cooling.serviceState`
   * **and** `safety.fanServiceState`, while `collectServing` reads the `llama-server@<i>`
   * units into `serving[].unitState`. The handoff's own table names only cooling and serving.
   */
  test('⚠ dbus reaches cooling, serving AND safety, because one read lands on three panels', () => {
    expect(panelsCarrying('dbus')).toEqual(['cooling', 'serving', 'safety']);
  });

  /**
   * ⚠ Not in the handoff's table either, and found in `lib/telemetry/snapshot.ts`: the
   * assembly writes `assembledSafety.pwm5Present = cooling.pwm5Present`, so the cooling
   * collector's probe is what stands behind §6.2's SAFETY `pwm5 present` row. §3.7 requires
   * that row to carry an explanation beside it and `dell-smm` is the only source that has one.
   */
  test('⚠ dell-smm reaches safety as well as cooling, because pwm5Present is the cooling probe', () => {
    expect(panelsCarrying('dell-smm')).toEqual(['cooling', 'safety']);
  });

  /**
   * ⚠ §6.5: when `nvidia-smi` is absent the GPU panels say so and *"no other panel is
   * affected"* — including COOLING, whose shared-time chart draws the GPU temperature trace.
   * That chart losing a trace is the GPU panel's outage rendered again, not a second fault.
   */
  test('⚠ nvidia-smi reaches the GPU panel and no other, not even the cooling chart', () => {
    expect(panelsCarrying('nvidia-smi')).toEqual(['gpu']);
  });

  /**
   * ⚠ §6.2's header carries the hostname and the uptime, and that list is exhaustive. Without
   * a `'header'` member both entries would be unreachable — filed, carried on the wire, and
   * matched to nothing.
   */
  test('⚠ hostname and proc-uptime reach the header, which is not in §6.1’s grid', () => {
    expect(panelsCarrying('hostname')).toEqual(['header']);
    expect(panelsCarrying('proc-uptime')).toEqual(['header']);
    expect(sourcesOn('header')).toEqual(['proc-uptime', 'hostname']);
  });

  /**
   * ⚠ The reason this is a second vocabulary. `conditionSource` answers `'host'` for both
   * `cpu_temp` and `ram`; §6.1 draws CPU and MEMORY as two panels, so an em dash on the RAM
   * bar and an em dash on the package temperature have different explanations.
   */
  test('⚠ CPU and MEMORY are two panels here, where the event log has one host', () => {
    expect(sourcesOn('cpu')).toEqual(['coretemp', 'proc-stat', 'proc-loadavg', 'proc-cpuinfo']);
    expect(sourcesOn('memory')).toEqual(['proc-meminfo']);
    // The other half of the claim: the log really does collapse them, and is left alone.
    expect(conditionSource('cpu_temp', null)).toBe('host');
    expect(conditionSource('ram', null)).toBe('host');
  });

  /**
   * ⚠ `proc-cpuinfo` blanks the CPU panel's SUBTITLE (`<cpuModel> · 6C / 12T`), not a body
   * row. A subtitle is `—` when its field is `null` like any other reading, so it owes an
   * entry on the same terms — and it belongs to CPU, not to the header where identity might
   * otherwise seem to live.
   */
  test('⚠ proc-cpuinfo belongs to CPU, whose subtitle it blanks, and not to the header', () => {
    expect(panelsCarrying('proc-cpuinfo')).toEqual(['cpu']);
  });

  /** ⚠ §3.7 keeps the link and the counters apart; both figures are on the same panel. */
  test('⚠ the link state and the byte counters land on storage & network together', () => {
    expect(sourcesOn('storage')).toEqual(['proc-net-dev', 'net-operstate', 'statvfs']);
  });

  /** ⚠ The remaining two panels, stated whole so the mapping is pinned in one place. */
  test('⚠ cooling, serving and safety carry exactly the sources their figures come from', () => {
    expect(sourcesOn('cooling')).toEqual(['dell-smm', 'dbus']);
    expect(sourcesOn('serving')).toEqual(['dbus', 'llama-env', 'llama-health', 'llama-models']);
    expect(sourcesOn('safety')).toEqual(['dell-smm', 'dbus', 'ufw', 'dkms']);
  });

  /**
   * ⚠ §6.5's rule is that an em dash always has an entry behind it. A source that reaches no
   * panel is an entry the operator can never be shown — the failure a `Record` with a default,
   * or a lookup keyed by `string`, would produce silently.
   */
  test('⚠ every one of §3.7’s eighteen sources reaches at least one panel', () => {
    const unreachable = ALL_SOURCES.filter((source) => panelsCarrying(source).length === 0);
    expect(unreachable).toEqual([]);
    expect(ALL_SOURCES).toHaveLength(18);
  });

  /**
   * ⚠ Fixture symmetry: for every panel, an entry that belongs to it **and** one that does
   * not. Written as a table so adding a `Panel` member without a mapping is a red test rather
   * than a panel that quietly explains nothing.
   */
  test.each(ALL_PANELS)(
    '⚠ each panel has both a source that belongs to it and one that does not, at %s',
    (panel) => {
      const mine = sourcesOn(panel);
      expect(mine.length).toBeGreaterThan(0);
      expect(mine.length).toBeLessThan(ALL_SOURCES.length);
    },
  );

  /**
   * ⚠ `errors[]`'s order is a decision pinned by `snapshot.test.ts`, and `events.ts` reads the
   * **last** message per source — so a panel that re-sorted would show a different D-Bus
   * sentence than the event log does for the same fault.
   */
  test('⚠ a panel’s entries keep snapshot.errors’ own order, including two from one source', () => {
    const snapshot = withErrors([
      { source: 'dbus', message: 'first: gpu-fan-control.service' },
      { source: 'statvfs', message: 'not this panel' },
      { source: 'llama-env', message: 'second: /etc/llama-server' },
      { source: 'dbus', message: 'third: llama-server@1.service' },
    ]);
    expect(errorsForPanel(snapshot, 'serving').map((error) => error.message)).toEqual([
      'first: gpu-fan-control.service',
      'second: /etc/llama-server',
      'third: llama-server@1.service',
    ]);
  });

  /* No ⚠: `Array.prototype.filter` cannot answer `null`, so there is no wrong implementation
     to write that this could distinguish. It is here because §6.5's caller relies on it. */
  test('a panel with nothing to explain gets an empty array, never null', () => {
    expect(errorsForPanel(everythingZero, 'cooling')).toEqual([]);
    expect(errorsForPanel(everythingZero, 'gpu')).toEqual([]);
  });

  /* No ⚠: the real fixture repeats a claim the synthetic snapshot already makes. It is here
     because `nothingReadable` is the snapshot a reader will reach for, and the entry it
     carries is exactly the two-panel one. */
  test('the nothingReadable fixture’s one entry explains cooling and safety, and no other panel', () => {
    expect(errorsForPanel(nothingReadable, 'cooling').map((e) => e.message)).toEqual([
      'no hwmon named dell_smm',
    ]);
    expect(errorsForPanel(nothingReadable, 'safety').map((e) => e.message)).toEqual([
      'no hwmon named dell_smm',
    ]);
    expect(errorsForPanel(nothingReadable, 'cpu')).toEqual([]);
    expect(errorsForPanel(nothingReadable, 'header')).toEqual([]);
  });
});
