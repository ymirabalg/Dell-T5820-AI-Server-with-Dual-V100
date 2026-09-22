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
import {
  LIVE_BOX_SERVING_WIRE,
  everythingZero,
  nothingReadable,
  servingGpusUnreadable,
  servingInstances,
  servingPerGpu,
  servingPopulated,
  servingSplit,
  servingTwoClaimants,
  servingUnmapped,
} from '../fixtures';
import { EM_DASH } from '../format';
import { FAN_SERVICE_UNIT } from '../units';
import { celsius, gib, mib, pwm, rpm, throttleMask } from '../types';
import type { ErrorSource, Gpu, ServingInstance, TelemetryError, TelemetrySnapshot } from '../types';
import { GPU_ENUMERATION, SERVING_ENUMERATION, VALUE_IS_A_BAND, conditionSource, conditionsFrom, enumerationsRead, errorsForPanel, servedBy, servedCards } from './observations';
import type { Panel } from './observations';
import { parseSnapshot, servingEnumeration } from './wire';
import { wireBodyOf } from './fake-env';

/**
 * ⚠⚠ 12c/RECONCILE — `servedBy` takes a {@link ServingEnumeration}, never a bare array, so
 * every call below has to say whether the list is all of it. These two helpers are the two
 * answers; there is no third, and no default.
 */
const allRead = (rows: readonly ServingInstance[] | null) => servingEnumeration(rows, []);
/**
 * …and the state `12c-A1` was found in: the server sent more rows than these.
 *
 * ⚠⚠ 12d — `refused` is now the refused rows' IDENTITIES, or `null` for a row whose own
 * `instance` did not validate, because §9's ruling of 2026-09-22 does opposite things in the
 * two cases. ⚠ The default is `[null]` — *one row was refused and we cannot say whose* — which
 * is the CONSERVATIVE branch (retirement frozen), so a call that does not care about §9 cannot
 * accidentally assert the permissive one.
 */
const partlyRead = (rows: readonly ServingInstance[], refused: readonly (string | null)[] = [null]) =>
  servingEnumeration(rows, refused);

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

  test('⚠⚠ 12c — a NAMED instance’s condition ids: `health:split` and `unit:llama-split.service`', () => {
    // §6.4's subject IS the identity, verbatim, and the `unit:` id comes from the MAPPING.
    // ⚠ `unit:llama-server@split.service` is the wrong answer a template produces, and it is
    // asserted absent rather than merely "the right one is present": both can be true at once
    // if something pushes two conditions for one instance.
    const split: TelemetrySnapshot = { ...servingPopulated, serving: servingSplit };
    const ids = idsOf(split).filter((id) => id.startsWith('health:') || id.startsWith('unit:llama'));
    expect(ids).toEqual(['unit:llama-split.service', 'health:split']);
    expect(ids).not.toContain('unit:llama-server@split.service');
  });

  test('⚠⚠ 12c — an identity the mapping cannot name gets its `health:` row and NO `unit:` row', () => {
    // A `unit:` condition for `llama-server@default.service` would be a §6.3 row — and a
    // `STANDING`-suppressible id — against a unit that has never existed. The instance is not
    // dropped either: `health:default` is a real reading of a real process.
    //
    // ⚠⚠ **`unitState` is `'failed'` here, and the fixture would be INERT without it.** The
    // collector leaves an unmappable instance's `unitState` `null`, and O12 already drops a
    // condition with no band — so on the collector's own output this test passes whether the
    // mapping is consulted or not, and the step-8 ledger reported exactly that (`12c-OB12`
    // DID NOT BITE). A server whose row carries a state we cannot name a unit for is reachable
    // over the wire, and it is the only shape that makes the rule observable: the client must
    // not invent a condition id for a unit it cannot name, whatever the row says.
    const unmapped: TelemetrySnapshot = {
      ...servingPopulated,
      serving: servingUnmapped.map((i) => ({ ...i, unitState: 'failed' as const })),
    };
    // ⚠ `unit:gpu-fan-control.service` is §9's two-panel reading and is nothing to do with
    // this rule, so the filter is `unit:llama` — narrow enough to exclude it and wide enough
    // to catch any fabricated `llama-*` unit, which is what the mutation would produce.
    const ids = idsOf(unmapped).filter((id) => id.startsWith('health:') || id.startsWith('unit:llama'));
    expect(ids).toEqual(['health:default']);
    expect(idsOf(unmapped).some((id) => id.includes('default.service'))).toBe(false);
  });

  test('⚠⚠ 12c — the health condition’s LABEL is the unit’s own name, not a template over the identity', () => {
    // §6.4's banner and the event log both read this label. ⚠ It is asserted on a NAMED
    // instance because that is the only place the two spellings differ: for `0` both produce
    // `llama-server@0 /health`, which is why a numeric fixture cannot discriminate them.
    const split: TelemetrySnapshot = { ...servingPopulated, serving: servingSplit };
    expect(find(split, 'health:split')?.label).toBe('llama-split /health');
    expect(find(split, 'health:split')?.label).not.toContain('llama-server@');
    // …and the numbered case is unchanged, which is the half a rewrite would break silently.
    const perGpu: TelemetrySnapshot = { ...servingPopulated, serving: servingInstances };
    expect(find(perGpu, 'health:0')?.label).toBe('llama-server@0 /health');
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
  /**
   * ⚠⚠ 12d — the collections this poll READ, as a sorted list of keys. The value beside each
   * key is the per-subject exclusion and is asserted separately below, because the two
   * questions — *was it read* and *for whom* — are what §9's 2026-09-22 ruling pulled apart.
   */
  const keys = (r: ReturnType<typeof enumerationsRead>): string[] => [...r.keys()].sort();
  const read = (snapshot: TelemetrySnapshot) => enumerationsRead(snapshot, allRead(snapshot.serving));

  test('⚠ null is not [] — an unread collection retires nothing', () => {
    expect(keys(read({ ...loaded, gpus: null, serving: null }))).toEqual([]);
    expect(keys(read({ ...loaded, gpus: [], serving: [] }))).toEqual([
      GPU_ENUMERATION,
      SERVING_ENUMERATION,
    ]);
  });

  test('each collection is reported independently', () => {
    expect(keys(read({ ...loaded, gpus: null }))).toEqual([SERVING_ENUMERATION]);
    expect(keys(read({ ...loaded, serving: null }))).toEqual([GPU_ENUMERATION]);
  });

  test('⚠⚠ a row refused for its own IDENTITY is not a read enumeration, and there is no default that says it is', () => {
    // ⚠ `12c-A5`: this argument arrived as `servingRowsRefused = 0`, and `0` means *the
    // enumeration WAS read*. A caller that had not been updated therefore retired an instance
    // for a validation failure — the exact defect the argument exists to close, reintroduced by
    // its own default. It is required now, and it is the same VALUE `servedBy` takes, so the
    // ledger and the join cannot be told different things about one array.
    //
    // ⚠⚠ 12d narrowed this to the row it is still true of: an ANONYMOUS refusal (`[null]`).
    const rows = loaded.serving ?? [];
    expect(keys(enumerationsRead(loaded, partlyRead(rows, [null])))).toEqual([GPU_ENUMERATION]);
    expect(keys(enumerationsRead(loaded, allRead(rows)))).toEqual([
      GPU_ENUMERATION,
      SERVING_ENUMERATION,
    ]);
  });

  /**
   * ⚠⚠ **12d — §9's ruling of 2026-09-22, both branches, and the pair IS the test.**
   *
   * *A partial read retires what it can.* A refused row whose `instance` parsed names the one
   * subject we failed to read, so the enumeration counts as READ and holds back that identity
   * alone; a refused row whose identity did **not** parse names nobody, so no subject may be
   * shown absent and the enumeration is not reported as read at all.
   *
   * ⚠ Every fixture below uses an identity (`'7'`) that is neither of the loaded snapshot's
   * instances and neither card index, so *protected*, *present* and *absent* cannot coincide
   * — a fixture whose two candidate answers are the same value cannot discriminate between
   * them (HANDOVER §0.6).
   */
  test('⚠⚠ a refused row whose identity PARSED holds back that identity and reports the enumeration read', () => {
    const rows = loaded.serving ?? [];
    const result = enumerationsRead(loaded, partlyRead(rows, ['7']));
    expect(keys(result)).toEqual([GPU_ENUMERATION, SERVING_ENUMERATION]);
    expect([...(result.get(SERVING_ENUMERATION)?.held ?? [])]).toEqual(['7']);
    // ⚠ The anti-vacuity half: `gpus` was read too, and NOTHING is held back there. A fix that
    // held everything back everywhere would satisfy the line above and retire nothing at all.
    expect([...(result.get(GPU_ENUMERATION)?.held ?? [])]).toEqual([]);
    // ⚠⚠ 12d/RECONCILE — and the OTHER half of the pair is the membership, which is a
    // different list: `'7'` is the identity we could not read and `['0','1']` are the rows we
    // did. A single set could not say both, which is why this value is a pair.
    expect([...(result.get(SERVING_ENUMERATION)?.members ?? [])].sort()).toEqual(['0', '1']);
    expect([...(result.get(GPU_ENUMERATION)?.members ?? [])].sort()).toEqual(['0', '1']);
  });

  test('⚠⚠ an ANONYMOUS refusal freezes the whole serving enumeration, and one anonymous row among named ones is enough', () => {
    const rows = loaded.serving ?? [];
    // Two refusals, one of which could not be identified. The named one is NOT a licence to
    // retire the rest: we still cannot tell who the other row was about.
    expect(keys(enumerationsRead(loaded, partlyRead(rows, ['7', null])))).toEqual([GPU_ENUMERATION]);
    expect(keys(enumerationsRead(loaded, partlyRead(rows, [null, '7'])))).toEqual([GPU_ENUMERATION]);
    // …and the twin, so this is not the vacuous "never report serving": two NAMED refusals do
    // report it, holding back exactly the two identities.
    const named = enumerationsRead(loaded, partlyRead(rows, ['7', '9']));
    expect(keys(named)).toEqual([GPU_ENUMERATION, SERVING_ENUMERATION]);
    expect([...(named.get(SERVING_ENUMERATION)?.held ?? [])].sort()).toEqual(['7', '9']);
  });

  test('⚠⚠ 12d/RECONCILE — each collection reports ITS OWN membership, on a fixture where the two DISAGREE', () => {
    // ⚠⚠ The coincidence this test exists to break: `loaded`'s cards are 0 and 1 and its
    // instances are `'0'` and `'1'`, so a membership read off the WRONG collection is
    // byte-identical to the right one on every other fixture in this file (HANDOVER §0.6 —
    // "a fixture whose two candidate answers are the same value cannot discriminate").
    // Here the serving list holds one instance called `'7'`, which is no card index.
    const first = (loaded.serving ?? [])[0];
    if (first === undefined) throw new Error('fixture lost its serving rows');
    const crossed: TelemetrySnapshot = { ...loaded, serving: [{ ...first, instance: '7' }] };
    const result = enumerationsRead(crossed, allRead(crossed.serving));
    expect([...(result.get(GPU_ENUMERATION)?.members ?? [])].sort()).toEqual(['0', '1']);
    expect([...(result.get(SERVING_ENUMERATION)?.members ?? [])]).toEqual(['7']);
    // ⚠ And the membership is the row's IDENTITY, never its position in the array — `'7'` sits
    // at index 0, so a position-shaped implementation answers `['0']` here and is right on
    // every fixture where the identities happen to count from zero.
    expect([...(result.get(SERVING_ENUMERATION)?.members ?? [])]).not.toEqual(['0']);
  });

  test('⚠ a complete read holds nothing back, which is not the same as not being read', () => {
    // ⚠ §3.1's `null` ≠ `[]` one level further in: an EMPTY exclusion set and an ABSENT key
    // are different answers, and only one of them retires. `serving: null` gives no key at
    // all; a clean read gives the key with an empty set.
    const clean = enumerationsRead(loaded, allRead(loaded.serving));
    expect(clean.has(SERVING_ENUMERATION)).toBe(true);
    expect([...(clean.get(SERVING_ENUMERATION)?.held ?? [])]).toEqual([]);
    // ⚠⚠ 12d/RECONCILE — *nothing held back* is not *nobody there*. The membership of a clean
    // read is the rows themselves, and reading the two off one set is what let a subject still
    // in the list be retired for going quiet (§9 row 2's own "Because").
    expect([...(clean.get(SERVING_ENUMERATION)?.members ?? [])].sort()).toEqual(['0', '1']);
    const unread = enumerationsRead(loaded, servingEnumeration(null, []));
    expect(unread.has(SERVING_ENUMERATION)).toBe(false);
    expect(unread.get(SERVING_ENUMERATION)).toBeUndefined();
  });

  /*
   * ⚠ The join between an observation and its enumeration is made **where the observation is
   * produced**, and that is the point: `unit:llama-server@0.service` and
   * `unit:gpu-fan-control.service` are the same kind with different answers, and only the
   * projection knows which is which. Deciding later would mean re-deriving §6.4's join key by
   * pattern — a second spelling of the name `lib/units.ts` exists to prevent.
   */
  test('⚠ an enumerated subject names its collection, and an unenumerated one names none', () => {
    expect(find(loaded, 'gpu_temp:0')?.enumeration).toEqual({ name: GPU_ENUMERATION, member: '0' });
    expect(find(loaded, 'gpu_vram:1')?.enumeration).toEqual({ name: GPU_ENUMERATION, member: '1' });
    expect(find(loaded, 'health:0')?.enumeration).toEqual({ name: SERVING_ENUMERATION, member: '0' });
    // ⚠⚠ 12d — the member of a `unit:` condition is the INSTANCE IDENTITY, not the unit name
    // that is its own subject. A refused `serving[]` row names `'0'`, never
    // `llama-server@0.service`, so a member taken from `subject` would protect nothing and
    // retire the alarm §9's ruling exists to keep. This assertion is the whole difference.
    expect(find(loaded, 'unit:llama-server@0.service')?.enumeration).toEqual({
      name: SERVING_ENUMERATION,
      member: '0',
    });
    expect(find(loaded, 'unit:llama-server@0.service')?.subject).toBe('llama-server@0.service');

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

describe('⚠⚠ 12b — the INVERTED join: a card asks which instance lists it', () => {
  test('⚠ a server that does not publish `gpus` falls back to the index join, SILENTLY', () => {
    // §3.4's ruling, and the reason it is correct rather than a compromise: a server old
    // enough not to publish the field cannot be in split mode, because split mode arrives
    // with the same deployment that adds it. `servingInstances` is that server's shape.
    const zero = servedBy(allRead(servingInstances), 0);
    expect(zero.kind).toBe('indexed');
    expect(zero.kind === 'indexed' ? zero.instance?.instance : null).toBe('0');
    const one = servedBy(allRead(servingInstances), 1);
    expect(one.kind === 'indexed' ? one.instance?.instance : null).toBe('1');
  });

  test('⚠⚠ 12c — the index fallback joins by IDENTITY, never by the row’s position in serving[]', () => {
    // ⚠ Every fixture in this project is dense and in order, so `serving[index]` and
    // `find(s => s.instance === String(index))` agree on all of them — the coincidence 12b
    // named, one layer down from the one it fixed. Here `0.env` is absent (a `set-model`
    // rollback mid-write, a `.bak` in the scanned directory), so `serving[]` carries instance
    // `1` ALONE: positionally that row is index 0, and by identity it is card 1's.
    const sparse = [servingInstances[1] as ServingInstance];
    const zero = servedBy(allRead(sparse), 0);
    expect(zero.kind === 'indexed' ? zero.instance : undefined).toBeNull();
    const one = servedBy(allRead(sparse), 1);
    expect(one.kind === 'indexed' ? one.instance?.instance : null).toBe('1');
  });

  test('⚠ `serving: null` is `indexed` with NO instance — unknown cannot become a claim', () => {
    // "Which instances exist is unknown" says nothing about cards, and the `llama-env` entry
    // that explains it already sits on the SERVING panel.
    expect(servedBy(allRead(null), 0)).toEqual({ kind: 'indexed', instance: null });
  });

  test('⚠ per-GPU mode gives today’s answer FOR A REASON: instance N declares card N', () => {
    const zero = servedBy(allRead(servingPerGpu), 0);
    expect(zero.kind).toBe('declared');
    expect(zero.kind === 'declared' ? zero.instance.instance : null).toBe('0');
    expect(zero.kind === 'declared' ? zero.alongside : null).toEqual([]);
  });

  test('⚠ SPLIT MODE: one instance, both cards, and each card names the OTHER one', () => {
    // The arrangement the old join had no answer for. `alongside` is what the GPU card
    // renders as "served jointly with GPU M", and it excludes the asking card — a list that
    // included it would make GPU 0 say it is served jointly with itself.
    const zero = servedBy(allRead(servingSplit), 0);
    const one = servedBy(allRead(servingSplit), 1);
    expect(zero.kind === 'declared' ? zero.alongside : null).toEqual([1]);
    expect(one.kind === 'declared' ? one.alongside : null).toEqual([0]);
    // ⚠⚠ 12c — `'split'`, not `0`. The fixture now carries the identity the box really
    // produces, and a NUMERIC identity was the loop's second coincidence: `String(instance)`,
    // `Number(instance)` and a template unit name all keep working on one.
    expect(one.kind === 'declared' ? one.instance.instance : null).toBe('split');
  });

  test('⚠⚠ 12c — TWO instances claiming ONE card resolve to the LOWER identity, in any list order', () => {
    // §3.4 says nothing about two claimants, and it is a real state during a half-finished
    // mode switch — systemd's `Conflicts=` is what normally prevents it. The rule is
    // `compareInstances`: a numbered instance beats every named one, so card 0 names `0`.
    //
    // ⚠⚠ **The fixture arrives in the OPPOSITE order to the answer** (`split` is element 0),
    // and this is asserted BOTH ways round. A join that took `serving[]`'s first claimant by
    // position would answer `split` here and would agree with the rule on every other fixture
    // in this project, because the collector sorts before the wire ever sees them.
    const forwards = servedBy(allRead(servingTwoClaimants), 0);
    const backwards = servedBy(allRead([...servingTwoClaimants].reverse()), 0);
    expect(forwards.kind).toBe('declared');
    expect(forwards.kind === 'declared' ? forwards.instance.instance : null).toBe('0');
    expect(backwards).toEqual(forwards);
    // ⚠ And the model comes with it, which is the failure §6.2 names: the WRONG model on a
    // card rather than a missing one.
    expect(forwards.kind === 'declared' ? forwards.instance.model : null).toBe('qwen3.6-27b');
  });

  test('⚠⚠ 12c — the winner is chosen PER CARD, not once per snapshot', () => {
    // Card 1 is claimed by `split` alone, on the same fixture whose card 0 goes to `0`. A
    // reduction that picked one winner for the whole snapshot would give card 1 to instance
    // `0`, which does not list it.
    const one = servedBy(allRead(servingTwoClaimants), 1);
    expect(one.kind === 'declared' ? one.instance.instance : null).toBe('split');
    expect(one.kind === 'declared' ? one.alongside : null).toEqual([0]);
  });

  test('⚠ a MIS-PINNED instance names the card it really serves, not the card its number implies', () => {
    // The property the inversion buys, stated as a test: instance 0 pinned to card 1. Under
    // `gpu.index === serving.instance` this was invisible; now GPU 1 says instance 0 and GPU
    // 0 says nothing serves it.
    const misPinned = [{ ...(servingPerGpu[0] as ServingInstance), gpus: [1] }];
    expect(servedBy(allRead(misPinned), 1).kind).toBe('declared');
    expect(servedBy(allRead(misPinned), 0).kind).toBe('unserved');
  });

  test('⚠ every list READ and none naming this card is `unserved`, which is NOT `unknown`', () => {
    // §6.5's retired-vs-stale distinction one level down: we looked, and nobody claims it.
    // An em dash here would say "we could not look", which is a different fact.
    expect(servedBy(allRead(servingPerGpu), 7).kind).toBe('unserved');
  });

  test('⚠ a `gpus` that could not be READ makes the card `unknown`, even for a card nobody claims', () => {
    // Invariant 1. The instance whose list is null might be the one serving this card, so
    // asserting "nothing serves it" would be a claim made on a reading we do not have.
    expect(servedBy(allRead(servingGpusUnreadable), 1).kind).toBe('unknown');
  });

  test('⚠ a claimed card beats an unreadable sibling — `unknown` is the LAST resort', () => {
    // A reading that exists is not made uncertain by one that does not: instance 0 declares
    // card 0, so card 0 has its answer however instance 1's read went.
    const mixed = [
      { ...(servingPerGpu[0] as ServingInstance), gpus: [0] },
      { ...(servingPerGpu[1] as ServingInstance), gpus: null },
    ];
    expect(servedBy(allRead(mixed), 0).kind).toBe('declared');
    expect(servedBy(allRead(mixed), 1).kind).toBe('unknown');
  });

  test('⚠ the fallback is chosen by the SNAPSHOT, not per row', () => {
    // A row without the key on a snapshot where another row HAS it cannot re-enable the
    // index join for its own card — that would let one unreadable unit silently restore the
    // coincidence this change exists to stop relying on. (`collectServing` cannot produce a
    // mixed snapshot; this is the defence, and it is why `some(declaresGpus)` is the test.)
    const mixed = [servingInstances[0] as ServingInstance, { ...(servingInstances[1] as ServingInstance), gpus: [1] }];
    expect(servedBy(allRead(mixed), 0).kind).toBe('unserved');
    expect(servedBy(allRead(mixed), 1).kind).toBe('declared');
  });

  test('⚠ an instance declaring `[]` claims nothing, and does not make other cards unknown', () => {
    // `CUDA_VISIBLE_DEVICES=` is an answer, so the snapshot was fully read: `unserved`.
    const none = [{ ...(servingPerGpu[0] as ServingInstance), gpus: [] }];
    expect(servedBy(allRead(none), 0).kind).toBe('unserved');
  });

  test('⚠⚠ 12b-TEST — the `unknown` em dash is explained on SERVING, NOT on the GPU card', () => {
    // ⚠ Invariant 1 says an em dash always has an entry behind it, and for `servedBy`'s
    // `unknown` that entry is **on another panel**: `panelsForSource('dbus')` is
    // `['cooling','serving','safety']` and 12b left it alone deliberately, because adding
    // `'gpu'` would change what the LIVE box renders today the moment any unrelated `dbus`
    // entry exists. Pinned here so the compromise is a recorded decision rather than
    // something a later reader discovers and takes for an oversight — and so that widening
    // the fan-out becomes a visible change to this test rather than a silent one.
    const snapshot: TelemetrySnapshot = {
      ...everythingZero,
      serving: servingGpusUnreadable,
      errors: [
        {
          source: 'dbus',
          message: 'llama-server@0.service: Environment: org.freedesktop.DBus.Error.AccessDenied: no detail',
          instance: '0',
        },
      ],
    };
    expect(servedBy(allRead(snapshot.serving), 0).kind).toBe('unknown');
    expect(errorsForPanel(snapshot, 'gpu')).toEqual([]);
    expect(errorsForPanel(snapshot, 'serving')).toHaveLength(1);
    expect(errorsForPanel(snapshot, 'serving')[0]?.message).toContain('Environment');
  });

  test('⚠⚠ 12b-RECONCILE — a row SPREAD with `gpus: undefined` still DECLARES: a present key is not an absent one', () => {
    /*
     * ⚠ `declaresGpus` is `Object.hasOwn`, never `instance.gpus !== undefined`, and 12b's
     * adversarial reverted it to the second spelling with all 3634 tests green (`R1`) — the
     * protection was argued at length in two doc comments and asserted nowhere. This is the
     * shape that separates them, and it is one this project's own code writes:
     * `{ ...instance, gpus: undefined }` has the key. `lib/collectors/serving.test.ts:400`
     * already spreads a row that way for an unrelated assertion.
     *
     * ⚠ What the two spellings cost is not cosmetic. With `!== undefined`, a snapshot in which
     * one row was spread stops declaring, `some(declaresGpus)` goes false, and **the index join
     * is silently re-enabled for the whole snapshot** — the coincidence this loop exists to
     * stop relying on, restored by a spread. The verdict below (`unserved` for the spread row)
     * is 12b-A9's ruling and is the parent's to change; that it is not `indexed` is this test's
     * subject.
     */
    // ⚠ The cast is the finding, not a workaround. `exactOptionalPropertyTypes` is on, so
    // TypeScript REFUSES `{ ...instance, gpus: undefined }` against `gpus?: readonly number[] |
    // null` — the shape cannot be written in typed code in this tree, which narrows R1's
    // surface to what arrives across the wire boundary, where `parseSnapshot` takes `unknown`.
    // That boundary is `optionalCardList`'s own `Object.hasOwn` (12b-WR6), and it refuses such
    // a row outright. So this is the SECOND line, asserted here because the first is one
    // character away from turning the row into an older server's instead (see that test).
    const spread = { ...(servingPerGpu[0] as ServingInstance), gpus: undefined } as unknown as ServingInstance;
    expect(Object.hasOwn(spread, 'gpus')).toBe(true);
    expect(servedBy(allRead([spread]), 0)).toEqual({ kind: 'unserved' });

    // …and the same snapshot with the key genuinely ABSENT is the older-server path, which is
    // the answer the spread must not be allowed to borrow.
    const absent = servingInstances[0] as ServingInstance;
    expect(Object.hasOwn(absent, 'gpus')).toBe(false);
    expect(servedBy(allRead([absent]), 0)).toEqual({ kind: 'indexed', instance: absent });
  });

  test('⚠ `serving: []` is `indexed` with no instance — not `unserved`', () => {
    // No instance carries the key because there is no instance, so this is the older-server
    // path by construction, and it renders exactly what an empty `serving` renders today.
    expect(servedBy(allRead([]), 0)).toEqual({ kind: 'indexed', instance: null });
  });
});

/**
 * ⚠⚠ **12c/RECONCILE (`12c-A1`) — a list this client SHORTENED cannot support a negative
 * answer.**
 *
 * The loop's governing finding, and it is §9's ratified sentence applied one panel over:
 * *"The collection was read successfully and the client discarded part of it, which is not the
 * same as the server not reporting it."* §9 got that rule on 2026-09-18; `servedBy` was still
 * being handed `snapshot.serving` with nothing to say the array had been cut, so a row refused
 * for a bad `port` rendered the GPU card as `served by · no instance` — `unserved`, which
 * `gpu-panel.tsx` defines in its own comment as *"every list was READ and none of them names
 * this card … we looked, and nobody claims it"*. Measured, that strip was byte-identical to
 * the one an instance that genuinely left the machine produces.
 *
 * The rule is stated on `servedBy`: **an incomplete list may only produce a POSITIVE answer.**
 * Every test below is one half of it, and the `allRead` twin beside each is what stops the fix
 * from being "always answer `unknown`".
 */
describe('⚠⚠ 12c/RECONCILE — a REFUSED row cannot make the card say `no instance`', () => {
  const perGpu = [...servingPerGpu];

  test('⚠⚠ an unclaimed card on a PARTIAL list is `unknown`, and on a COMPLETE one is `unserved`', () => {
    // ⚠ The pair is the test. `unserved` is a positive claim and must survive for a list that
    // really was read in full, or the fix has traded one wrong answer for another — a page
    // that can never say "nobody serves this card" cannot show a mis-pinned instance either,
    // which is the property the inversion was built for.
    const claimedElsewhere = [{ ...(perGpu[0] as ServingInstance), gpus: [1] }];
    expect(servedBy(allRead(claimedElsewhere), 0).kind).toBe('unserved');
    // ⚠⚠ 12d — `incomplete`, not `unknown`. §3.4's ruling of 2026-09-22 gives a partially-read
    // list its OWN answer; `unknown` is *this reading could not be taken*, which is a different
    // fact and is asserted apart from this one below.
    expect(servedBy(partlyRead(claimedElsewhere, [null]), 0).kind).toBe('incomplete');
  });

  test('⚠⚠ a row that IS here still wins on a partial list — the refusal blanks nothing it did read', () => {
    // The other direction, and the reason the rule is "no NEGATIVE answer" rather than "no
    // answer". A refusal elsewhere in the array is not a reason to drop a model this client
    // parsed: that would put an em dash on a card whose instance is right there.
    const declared = servedBy(partlyRead(perGpu, [null]), 0);
    expect(declared.kind).toBe('declared');
    expect(declared.kind === 'declared' ? declared.instance.instance : null).toBe('0');
    expect(declared.kind === 'declared' ? declared.instance.model : null).toBe(
      (perGpu[0] as ServingInstance).model,
    );
  });

  test('⚠⚠ the old-server INDEX fallback cannot invent an instance out of a partial list', () => {
    // `12c-build.md` §6 Q7's new path, which the build recorded and left open: a snapshot whose
    // ONLY row was refused arrives as an empty array, no row carries `gpus`, and the fallback
    // printed `served by instance 0` — naming an instance for a row that had just been thrown
    // away. Q7's own case (a genuinely empty list on a pre-`gpus` server) is `allRead` and is
    // asserted beside it, unchanged.
    expect(servedBy(partlyRead([], [null]), 0)).toEqual({ kind: 'incomplete' });
    expect(servedBy(allRead([]), 0)).toEqual({ kind: 'indexed', instance: null });
    // ⚠ …but a row the client DID read still answers by index: it is a positive match on a row
    // that is here, and an old server's index join is the only arrangement that exists on it.
    const older = [servingInstances[0] as ServingInstance];
    expect(servedBy(partlyRead(older, [null]), 0)).toEqual({ kind: 'indexed', instance: older[0] });
    expect(servedBy(partlyRead(older, [null]), 1).kind).toBe('incomplete');
  });

  test('⚠ `serving: null` is unchanged — `unread` is not the same state as `partial`', () => {
    // Three states, not two. `none` keeps 12b's rendering (*served by instance N* with an em
    // dash for the model, explained by the `llama-env` entry already on the SERVING panel);
    // `partial` is the new one. Collapsing them would change what the live box renders for a
    // failure that has nothing to do with this loop.
    expect(servedBy(allRead(null), 0)).toEqual({ kind: 'indexed', instance: null });
    expect(servedBy(allRead(null), 1)).toEqual({ kind: 'indexed', instance: null });
  });

  test('⚠⚠ two rows carrying ONE identity tie, and the tie keeps the FIRST — the `< 0` in the reduce', () => {
    // ⚠ `12c-A11` #3: reverting the claimant reduce's `< 0` to `<= 0` left the whole suite
    // green, because no fixture could produce a tie. This one can, and it needs no contrivance
    // — §3's number bridge admits `0` and `"0"` as two spellings of ONE identity, so a server
    // that sends both puts two rows with the same `instance` into one array (`12c-A9`).
    // `compareInstances` is a total order on distinct identities (asserted in `units.test.ts`),
    // so a tie means *the same identity twice* and array order is the only remaining tiebreak.
    // `<= 0` would hand the card the LAST row's model instead of the first's.
    const body = (serving: unknown) => ({
      ...(wireBodyOf(everythingZero) as Record<string, unknown>),
      serving,
    });
    const row = (instance: unknown, model: string, port: number) => ({
      instance,
      port,
      unitState: 'active',
      model,
      ctx: 131072,
      health: 'ok',
      gpus: [0],
    });
    const parsed = parseSnapshot(body([row(0, 'first-spelling', 8080), row('0', 'second-spelling', 8081)]));
    expect(parsed?.snapshot.serving?.map((r) => r.instance)).toEqual(['0', '0']);
    expect(parsed?.serving.read).toBe('all');
    const answer = servedBy(parsed!.serving, 0);
    expect(answer.kind === 'declared' ? answer.instance.model : null).toBe('first-spelling');
  });

  test('⚠⚠ end to end through `parseSnapshot`: one bad `port` no longer says `no instance`', () => {
    // ⚠ The measurement the finding was made with, as a test: the ONLY thing that varies is
    // row 0's `port`, and before this the two snapshots gave card 1 the same `unserved` — a
    // dropped row and a departed instance were indistinguishable on the card.
    const rows = JSON.parse(LIVE_BOX_SERVING_WIRE) as Record<string, unknown>[];
    const withGpus = rows.map((row, i) => ({ ...row, gpus: [i] }));
    const body = (serving: unknown) => ({
      ...(wireBodyOf(everythingZero) as Record<string, unknown>),
      serving,
    });

    const clean = parseSnapshot(body(withGpus));
    expect(servedBy(clean!.serving, 1).kind).toBe('declared');

    const broken = parseSnapshot(body([{ ...(withGpus[0] as object), port: 'nope' }, withGpus[1]]));
    expect(broken!.serving.read).toBe('partial');
    expect(servedBy(broken!.serving, 1).kind).toBe('declared'); // row 1 is here and claims it
    expect(servedBy(broken!.serving, 0).kind).toBe('incomplete'); // row 0 was refused, not absent
  });
});

/**
 * ⚠⚠ **12d — §3.4's ruling of 2026-09-22: a partially-read list gets its OWN answer.**
 *
 * 12c built the negative branches as `unknown`, invariant 1's em dash, and recorded it as
 * `12c-Q1` because an em dash already means *this reading could not be taken* — which is what
 * an unreadable `gpus` shows. Two different facts rendering identically is invariant 1's own
 * failure one level up, and the owner ruled a third form. These tests are the DISCRIMINATION:
 * each one puts the two states side by side and asserts they differ.
 */
describe('⚠⚠ 12d — a partial read and an unreadable `gpus` are different answers', () => {
  test('⚠⚠ a refused row answers `incomplete` where an unreadable `gpus` answers `unknown`', () => {
    // ⚠ The pair IS the test — asserting `incomplete` alone would pass for an implementation
    // that answered `incomplete` everywhere, which would lose the em dash instead of the
    // conflation. The two fixtures differ in exactly one thing: whether the list was cut.
    const cut = servedBy(partlyRead([{ ...(servingPerGpu[1] as ServingInstance) }], ['0']), 0);
    const unreadable = servedBy(allRead(servingGpusUnreadable), 1);
    expect(cut.kind).toBe('incomplete');
    expect(unreadable.kind).toBe('unknown');
    expect(cut.kind).not.toBe(unreadable.kind);
  });

  test('⚠⚠ `incomplete` never displaces a POSITIVE answer, and never displaces `unserved` on a complete list', () => {
    // The two anti-vacuity halves, together. A fix that returned `incomplete` from the top of
    // the function would satisfy the test above and blind the panel — `declared` must survive
    // on a partial list (the row is here and claims the card) and `unserved` must survive on a
    // complete one (nobody claims it), or a mis-pinned instance goes invisible again.
    expect(servedBy(partlyRead([...servingPerGpu], ['7']), 0).kind).toBe('declared');
    expect(servedBy(allRead([{ ...(servingPerGpu[0] as ServingInstance), gpus: [1] }]), 0).kind).toBe(
      'unserved',
    );
    // …and neither of those is `incomplete`, which is what "never displaces" means.
    expect(servedBy(partlyRead([...servingPerGpu], ['7']), 0).kind).not.toBe('incomplete');
  });

  test('⚠ when the list was cut AND a row we did read has an unreadable `gpus`, the cut is what the card says', () => {
    // ⚠ Both statements are true at once and §6.2 does not say which wins — recorded as a spec
    // silence in `12d-build.md`. Built as: the cut wins, because a refused row has no SERVING
    // row to carry its explanation while an unreadable `gpus` already has its `dbus` entry on
    // the row it belongs to. This test pins the CHOICE so a later change to it is deliberate.
    const both = servedBy(partlyRead([...servingGpusUnreadable], ['7']), 1);
    expect(both.kind).toBe('incomplete');
    // The twin: the same rows with nothing refused still answer `unknown`, so this test is
    // about precedence and not about having broken the em dash.
    expect(servedBy(allRead(servingGpusUnreadable), 1).kind).toBe('unknown');
  });

  test('⚠⚠ `serving: null` stays `indexed` — the third form is for a list read in PART, not one not read', () => {
    // Three states, and the new form belongs to exactly one of them. `none` keeps 12b's
    // rendering, which is what the live box shows when `serving` cannot be enumerated at all.
    expect(servedBy(servingEnumeration(null, []), 0)).toEqual({ kind: 'indexed', instance: null });
    expect(servedBy(partlyRead([], [null]), 0)).toEqual({ kind: 'incomplete' });
  });
});

describe('⚠⚠ 12b — `servedCards`: §3.4’s four shapes as the SERVING row’s own words', () => {
  test.each([
    ['one card', [0], 'GPU 0'],
    ['the other card', [1], 'GPU 1'],
    ['both cards', [0, 1], 'GPUs 0, 1'],
    ['three cards', [0, 1, 2], 'GPUs 0, 1, 2'],
    ['no card', [], 'no GPUs'],
  ])('⚠ the SERVING row names %s as %s', (_name, gpus, expected) => {
    expect(servedCards(gpus)).toBe(expected);
  });

  test('⚠ `null` is an em dash and ABSENT is nothing at all — the two §3.4 forbids collapsing', () => {
    // `null`: the unit exists and could not be read — invariant 1, with the `dbus` entry
    // beside it. `undefined`: the key is not on the wire, so the row renders exactly as it
    // did before this field existed, and printing an em dash there would put a failure on a
    // healthy box.
    expect(servedCards(null)).toBe(EM_DASH);
    expect(servedCards(undefined)).toBeNull();
    expect(servedCards(null)).not.toBe(servedCards(undefined));
  });
});

/**
 * ⚠⚠ **12c/TEST — `servedBy` is a function of the SET, proven over EVERY permutation.**
 *
 * The build asserts `servingTwoClaimants` and its reverse agree. Two orders agreeing is not the
 * property: a join that read `serving[1]` rather than `serving[0]` would agree on a two-element
 * reversal as well, and the rule §6.2's inverted join actually needs is that **no arrangement
 * of the same rows can move a model onto another card**. That is a claim about all of them, and
 * with four rows there are twenty-four.
 *
 * ⚠ The fixture is built so that every plausible wrong rule gives a DIFFERENT answer on at
 * least one card:
 *
 * | card | claimants | winner | what it kills |
 * |---|---|---|---|
 * | 0 | `10`, `2` | **`2`** | a lexical order over numbers — `'10' < '2'` |
 * | 1 | `2`, `split` | **`2`** | names sorted in with numbers, and `Number('split')` |
 * | 2 | `split`, `01` | **`01`** | `Number()` on either side; `01` is a NAME here, and it is the lower one |
 *
 * ⚠ `01` is on purpose. It is numeric-LOOKING and not canonical, so `isNumericInstance` calls it
 * a name and it sorts among the names by code point — `'0' < 's'`, so it beats `split`. An
 * implementation that reached for `Number(a) - Number(b)` anywhere gets `1 - NaN` and a
 * comparator that returns `NaN`, which `Array.sort` and this `reduce` both read as "not less
 * than" — silently, and differently depending on which pairs get compared.
 */
describe('⚠⚠ 12c/TEST — the join does not depend on array POSITION, over every permutation', () => {
  const claimants: readonly ServingInstance[] = [
    { ...(servingInstances[0] as ServingInstance), instance: '10', gpus: [0] },
    { ...(servingInstances[0] as ServingInstance), instance: '2', gpus: [0, 1], model: 'qwen-two' },
    { ...(servingInstances[0] as ServingInstance), instance: 'split', gpus: [1, 2], model: 'gemma-split' },
    { ...(servingInstances[0] as ServingInstance), instance: '01', gpus: [2], model: 'padded' },
  ];

  /** Every ordering of the four rows — 24 of them, generated rather than listed. */
  const permutations = <T>(items: readonly T[]): T[][] =>
    items.length <= 1
      ? [[...items]]
      : items.flatMap((item, i) =>
          permutations([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
        );

  const orders = permutations(claimants);

  // ⚠ NOT ⚠-marked: nothing in `lib/` can falsify it. It is this block's anti-vacuity term —
  // a generator that returned `[items]` would make every assertion below a restatement of the
  // single canonical order — and a ⚠ the ledger can never redden is a claim with no evidence.
  test('the generator really produces all 24 DISTINCT orders', () => {
    expect(orders).toHaveLength(24);
    expect(new Set(orders.map((o) => o.map((r) => r.instance).join(','))).size).toBe(24);
  });

  test.each([
    ['card 0, where a lexical order over numbers would answer `10`', 0, '2', [1]],
    ['card 1, where sorting names in with numbers would answer `split`', 1, '2', [0]],
    ['card 2, where any `Number()` would answer `split`', 2, '01', []],
  // ⚠ The `%s` is LAST, not first. Step 8's ledger splits a `test.each` name at the placeholder
  // to get a matchable prefix, so `⚠⚠ %s: …` leaves the key `⚠⚠` — two characters, matching
  // every ⚠⚠ FAIL line in the run and therefore certifying nothing. The harness caught it:
  // `UNMATCHABLE LEDGER KEYS … ledger key '⚠⚠' (2 chars)`.
  ])('⚠⚠ EVERY one of the 24 orders gives the same instance — %s', (_name, index, winner, alongside) => {
    for (const order of orders) {
      const answer = servedBy(allRead(order), index);
      expect(answer.kind).toBe('declared');
      expect(answer.kind === 'declared' ? answer.instance.instance : null).toBe(winner);
      // ⚠ The model travels with the winner, which is §6.2's named failure: the WRONG model on
      // a card rather than a missing one. Asserting the identity alone would miss a join that
      // picked the right row and rendered a neighbour's reading.
      expect(answer.kind === 'declared' ? answer.instance.model : null).toBe(
        claimants.find((c) => c.instance === winner)?.model,
      );
      expect(answer.kind === 'declared' ? answer.alongside : null).toEqual(alongside);
    }
  });

  test('⚠⚠ the whole ANSWER is identical across all 24 orders, field for field', () => {
    // The permutation loop above asserts three chosen facts; this asserts there is nothing
    // else in the result that moved. `toEqual` over the full `ServedBy` for every card and
    // every order — 72 comparisons — against the canonical order's own answer.
    for (const index of [0, 1, 2]) {
      const expected = servedBy(allRead([...claimants]), index);
      for (const order of orders) expect(servedBy(allRead(order), index)).toEqual(expected);
    }
  });

  test('⚠ a card NO ONE claims is `unserved` in every order, not the lowest instance anyway', () => {
    // The reduce starts at `null` and a `filter` that matched nothing must stay nothing. A
    // winner chosen before the claim was checked would hand card 3 to instance `2`.
    for (const order of orders) expect(servedBy(allRead(order), 3).kind).toBe('unserved');
  });
});

/**
 * ⚠⚠ **12c/TEST — the unit-name MISS, and the fifth thing it does.**
 *
 * The build lists four: the unit is not asked about, an `errors[]` entry names the instance,
 * `unitState`/`gpus` are `null`, and no `unit:` condition is minted. The fifth is what the entry
 * does once it is on the wire — `dbus` is a THREE-panel source (`panelsForSource` →
 * `['cooling', 'serving', 'safety']`), so a serving-layer lookup failure is offered to COOLING
 * and SAFETY as well, and the only thing that keeps it off them is that it carries an
 * `instance`. That is 10b-S-G's filter, written for a different failure, silently load-bearing
 * for this one.
 */
describe('⚠⚠ 12c/TEST — a mapping miss reaches THREE panels, and one field is why it shows on one', () => {
  const missEntry: TelemetryError = {
    source: 'dbus',
    message:
      'no systemd unit is known for instance `default` (`default.env` in /etc/llama-server), ' +
      'so its unit state and the cards it serves were not read',
    instance: 'default',
  };
  const missed: TelemetrySnapshot = {
    ...servingPopulated,
    serving: servingUnmapped,
    errors: [missEntry],
  };

  test('⚠⚠ `errorsForPanel` offers the miss to COOLING and SAFETY too — the fan-out is real', () => {
    // Asserted so the panel tests' premise is on the record rather than assumed. §3.7's `dbus`
    // genuinely blanks a figure on all three panels, so the routing is right; what makes the
    // miss land on one panel is the entry's `instance`, not the routing.
    expect(errorsForPanel(missed, 'serving')).toEqual([missEntry]);
    expect(errorsForPanel(missed, 'cooling')).toEqual([missEntry]);
    expect(errorsForPanel(missed, 'safety')).toEqual([missEntry]);
  });


});
