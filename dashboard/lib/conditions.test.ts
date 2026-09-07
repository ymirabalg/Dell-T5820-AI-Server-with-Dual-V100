/**
 * §6.4 — the condition pipeline: debounce → ledger → standing, plus §9's aggregate.
 *
 * The failure modes under test are the ones §6.4 is written to prevent:
 *
 * 1. a permanent banner nobody reads — so a declared, unchanged alarm displays at watch;
 * 2. a banner that never fires again — so the moment the condition changes, **including
 *    clearing and later regressing**, full alarm behaviour comes back and *stays* back;
 * 3. a single-poll flicker destroying (1) — so the ledger is fed the **confirmed** band,
 *    which is what {@link observePoll} exists to make unskippable.
 *
 * (2) and (3) pull in opposite directions on the same field, which is why both are here.
 */

import { describe, expect, test } from 'vitest';

import {
  CONDITION_KINDS,
  CONDITION_KIND_RULES,
  DEBOUNCE_MS,
  EMPTY_CONDITION_STATE,
  EMPTY_LEDGER,
  aggregateSeverity,
  alarmCount,
  bannerConditions,
  conditionId,
  observation,
  observePoll,
  observeSeverity,
  restartPendingRuns,
  standingIdsFrom,
  startBandHold,
  stepBandHold,
} from './conditions';
import type {
  ConditionKind,
  ConditionObservation,
  ConditionState,
  DisplayedCondition,
  StandingIds,
} from './conditions';
import { severityUfw } from './severity';
import type { Severity } from './types';

const NOTHING_STANDING: StandingIds = standingIdsFrom([]);

const ufw = (rawSeverity: Severity = 'alarm'): ConditionObservation =>
  observation({
    kind: 'ufw_enforcing',
    subject: null,
    label: 'ufw enforcing',
    value: rawSeverity === 'alarm' ? 'no' : 'yes',
    rawSeverity,
  });

const gpuTemp = (index: string, rawSeverity: Severity): ConditionObservation =>
  observation({
    kind: 'gpu_temp',
    subject: index,
    label: `GPU ${index} temperature`,
    value: '82 °C',
    rawSeverity,
  });

/**
 * Drive a session through a sequence of bands, holding each one long enough to be
 * confirmed, and return the {@link DisplayedCondition} at the end of each band.
 *
 * Each band is observed **twice**, a minute apart, because a band cannot be confirmed by
 * the poll that first sees it — zero wall time has elapsed at that instant. §6.4: "At the
 * 30 s cadence a single sample can therefore confirm a transition", i.e. one *further*
 * sample. That isolates the ledger from the debounce; the debounce is exercised on its own
 * below, and the two together under "the composition".
 */
const runConfirmed = (
  build: (severity: Severity) => ConditionObservation,
  severities: readonly Severity[],
  standing: StandingIds = NOTHING_STANDING,
): readonly DisplayedCondition[] => {
  let state: ConditionState = EMPTY_CONDITION_STATE;
  const out: DisplayedCondition[] = [];
  severities.forEach((severity, i) => {
    let displayed: DisplayedCondition | undefined;
    for (const offset of [0, 30_000]) {
      const result = observePoll(state, [build(severity)], standing, i * 60_000 + offset);
      state = result.state;
      displayed = result.displayed[0];
    }
    if (displayed === undefined) throw new Error('observePoll dropped an observation');
    out.push(displayed);
  });
  return out;
};

const last = (xs: readonly DisplayedCondition[]): DisplayedCondition => {
  const x = xs.at(-1);
  if (x === undefined) throw new Error('no polls');
  return x;
};

// ---------------------------------------------------------------------------
// §6.4's condition-id vocabulary
// ---------------------------------------------------------------------------

describe('the condition vocabulary — §6.4 verbatim', () => {
  test('every kind in §6.4 s table, and nothing else', () => {
    const census: Record<ConditionKind, true> = {
      gpu_temp: true,
      gpu_throttle: true,
      gpu_vram: true,
      disk_free: true,
      unit: true,
      health: true,
      fan_stopped: true,
      cpu_temp: true,
      ram: true,
      fan5_engaged: true,
      fan5_absolute: true,
      ufw_enforcing: true,
      pwm5_present: true,
      dkms_for_running_kernel: true,
      link: true,
    };
    expect([...CONDITION_KINDS].sort()).toEqual(Object.keys(census).sort());
    expect(new Set(CONDITION_KINDS).size).toBe(CONDITION_KINDS.length);
    expect(CONDITION_KINDS).toHaveLength(15);
  });

  test('§6.4 s singleton column', () => {
    const singletons = CONDITION_KINDS.filter((k) => CONDITION_KIND_RULES[k].singleton);
    expect([...singletons].sort()).toEqual(
      [
        'cpu_temp',
        'dkms_for_running_kernel',
        'fan5_absolute',
        'fan5_engaged',
        'link',
        'pwm5_present',
        'ram',
        'ufw_enforcing',
      ].sort(),
    );
  });

  test('§6.3 s two fan5 rows are two kinds, not one', () => {
    expect(CONDITION_KINDS).toContain('fan5_engaged');
    expect(CONDITION_KINDS).toContain('fan5_absolute');
  });

  test('⚠ `fan_stopped` is subscripted by channel, and channel 5 is NOT one of its subjects', () => {
    // §6.4: "Channel 5's zero is NOT a `fan_stopped` subject. It is carried by
    // `fan5_absolute`, whose row now has two sides. One tach must never produce two
    // conditions (O3)." A `fan_stopped:5` alongside `fan5_absolute` would make one stalled
    // reference fan read as `2 alarms` in the header.
    expect(CONDITION_KIND_RULES['fan_stopped'].singleton).toBe(false);
    expect(conditionId('fan_stopped', '3')).toBe('fan_stopped:3');
    // The kind exists precisely so that the four chassis headers have somewhere to go that
    // is not `fan5_absolute`; §6.3 gives them their own row.
    expect(CONDITION_KINDS).toContain('fan5_absolute');
  });

  test('the three §6.3 rows added after step 2 s build all have a kind', () => {
    expect(CONDITION_KINDS).toContain('dkms_for_running_kernel');
    expect(CONDITION_KINDS).toContain('health');
    expect(CONDITION_KINDS).toContain('link');
  });

  test('only `unit` forbids a bare kind in STANDING (§6.4)', () => {
    const forbidden = CONDITION_KINDS.filter(
      (k) => !CONDITION_KIND_RULES[k].bareKindAllowedInStanding,
    );
    expect(forbidden).toEqual(['unit']);
  });

  test('ids are the kind alone, or kind:subject', () => {
    expect(conditionId('ufw_enforcing', null)).toBe('ufw_enforcing');
    expect(conditionId('gpu_temp', '0')).toBe('gpu_temp:0');
    expect(conditionId('disk_free', 'home')).toBe('disk_free:home');
    expect(conditionId('unit', 'llama-server@1.service')).toBe('unit:llama-server@1.service');
  });

  test('observation() derives the id from the kind and subject', () => {
    expect(ufw().id).toBe('ufw_enforcing');
    expect(gpuTemp('1', 'alarm').id).toBe('gpu_temp:1');
  });

  test('a kind outside the vocabulary does not type-check', () => {
    // @ts-expect-error the vocabulary is closed; a new condition is a spec change.
    conditionId('gpu_fan_speed', null);
    // @ts-expect-error `fan5` was split into fan5_engaged and fan5_absolute by §6.4.
    conditionId('fan5', null);
  });
});

// ---------------------------------------------------------------------------
// STANDING is configured, never inferred — and §6.4's four malformedness rules
// ---------------------------------------------------------------------------

describe('judging STANDING, as §4 delivers it', () => {
  const empties: readonly (readonly [readonly string[]])[] = [
    [[]],
    [['']],
    [['   ']],
    [['', '']],
    [[' ', '']],
  ];
  test.each(empties)('%j means nothing is standing', (entries) => {
    const parsed = standingIdsFrom(entries);
    expect(parsed.ids.size).toBe(0);
    expect(parsed.unknown).toEqual([]);
  });

  test('the entry the spec names', () => {
    expect([...standingIdsFrom(['ufw_enforcing']).ids]).toEqual(['ufw_enforcing']);
  });

  /*
   * ⚠ The comma is `lib/auth/config.ts`'s and the whitespace an env file's — `STANDING=a, b`
   * is what an operator types. Trimming is the one liberty taken here, and it is taken
   * *before* matching so that the id vocabulary itself stays exact.
   */
  test('an env file’s padding is tolerated, and matching is otherwise exact', () => {
    const parsed = standingIdsFrom([' ufw_enforcing ', ' pwm5_present']);
    expect([...parsed.ids].sort()).toEqual(['pwm5_present', 'ufw_enforcing']);
    expect(parsed.unknown).toEqual([]);
  });

  test('a non-singleton kind may name a subject', () => {
    const parsed = standingIdsFrom(['unit:llama-server@1.service', 'disk_free:home']);
    expect([...parsed.ids].sort()).toEqual(['disk_free:home', 'unit:llama-server@1.service']);
    expect(parsed.unknown).toEqual([]);
  });

  test('an unrecognised kind is reported, not silently accepted', () => {
    const parsed = standingIdsFrom(['ufw_enforcing', 'gpu_fan_speed', 'UFW_ENFORCING']);
    expect([...parsed.ids]).toEqual(['ufw_enforcing']);
    expect(parsed.unknown).toEqual(['gpu_fan_speed', 'UFW_ENFORCING']);
  });

  test('a typo suppresses nothing — the safe direction, and it is visible', () => {
    const parsed = standingIdsFrom(['ufw-enforcing']);
    expect(parsed.ids.size).toBe(0);
    expect(parsed.unknown).toEqual(['ufw-enforcing']);
    expect(last(runConfirmed(ufw, ['alarm'], parsed)).banner).toBe(true);
  });

  // §6.4: "A subject on a singleton kind is malformed, not a narrower match."
  const malformed: readonly [string, string][] = [
    ['ufw_enforcing:yes', 'a subject on a singleton kind'],
    ['pwm5_present:true', 'a subject on a singleton kind'],
    ['dkms_for_running_kernel:false', 'a subject on a singleton kind'],
    ['link:up', 'a subject on a singleton kind'],
    ['gpu_temp:', 'an empty subject'],
    ['unit:', 'an empty subject'],
    ['unit', 'a bare `unit`'],
  ];
  test.each(malformed)('%s is malformed — %s', (entry) => {
    const parsed = standingIdsFrom([entry]);
    expect(parsed.ids.size).toBe(0);
    expect(parsed.unknown).toEqual([entry]);
  });

  test('STANDING=ufw_enforcing:yes suppresses nothing AND is reported', () => {
    // The mistake an operator will actually make: every other line of an env file is
    // KEY=value. Suppressing nothing is safe; being invisible while doing it is not.
    const parsed = standingIdsFrom(['ufw_enforcing:yes']);
    expect(parsed.unknown).toEqual(['ufw_enforcing:yes']);
    const displayed = last(runConfirmed(ufw, ['alarm'], parsed));
    expect(displayed.declaredStanding).toBe(false);
    expect(displayed.banner).toBe(true);
  });

  test('STANDING=unit cannot silence gpu-fan-control.service (§6.4)', () => {
    const parsed = standingIdsFrom(['unit']);
    expect(parsed.ids.size).toBe(0);
    expect(parsed.unknown).toEqual(['unit']);

    const fanService = observation({
      kind: 'unit',
      subject: 'gpu-fan-control.service',
      label: 'gpu-fan-control.service',
      value: 'failed',
      rawSeverity: 'alarm',
    });
    const { displayed } = observePoll(EMPTY_CONDITION_STATE, [fanService], parsed, 0);
    expect(displayed[0]?.suppressed).toBe(false);
    expect(displayed[0]?.banner).toBe(true);
  });

  test('naming the unit explicitly still works — the narrow form is the only form', () => {
    const parsed = standingIdsFrom(['unit:llama-server@1.service']);
    const dead = observation({
      kind: 'unit',
      subject: 'llama-server@1.service',
      label: 'llama-server@1.service',
      value: 'failed',
      rawSeverity: 'alarm',
    });
    const fanService = observation({
      kind: 'unit',
      subject: 'gpu-fan-control.service',
      label: 'gpu-fan-control.service',
      value: 'failed',
      rawSeverity: 'alarm',
    });
    const { displayed } = observePoll(EMPTY_CONDITION_STATE, [dead, fanService], parsed, 0);
    expect(displayed[0]?.suppressed).toBe(true);
    expect(displayed[1]?.suppressed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The standing rule
// ---------------------------------------------------------------------------

describe('a standing condition displays at watch and never banners', () => {
  const standing = standingIdsFrom(['ufw_enforcing']);

  test('today on this box: ufw is not enforcing, and that is declared standing', () => {
    const observed = observation({
      kind: 'ufw_enforcing',
      subject: null,
      label: 'ufw enforcing',
      value: 'no',
      rawSeverity: severityUfw(false),
    });
    const { displayed } = observePoll(EMPTY_CONDITION_STATE, [observed], standing, 0);
    const d = displayed[0];

    expect(d?.severity).toBe('alarm');
    expect(d?.displaySeverity).toBe('watch');
    expect(d?.declaredStanding).toBe(true);
    expect(d?.suppressed).toBe(true);
    expect(d?.banner).toBe(false);
  });

  test('the real severity is never overwritten — the row still names it', () => {
    expect(last(runConfirmed(ufw, ['alarm'], standing)).severity).toBe('alarm');
  });

  test('the same condition undeclared holds the banner open', () => {
    const d = last(runConfirmed(ufw, ['alarm']));
    expect(d.declaredStanding).toBe(false);
    expect(d.suppressed).toBe(false);
    expect(d.displaySeverity).toBe('alarm');
    expect(d.banner).toBe(true);
  });

  test('watch and normal pass through untouched — there is nothing to concede', () => {
    for (const severity of ['normal', 'watch'] as const) {
      const d = last(runConfirmed(ufw, [severity], standing));
      expect(d.displaySeverity).toBe(severity);
      expect(d.suppressed).toBe(false);
      expect(d.banner).toBe(false);
    }
  });

  test('declaring a kind covers its subjects; declaring a subject covers only that one', () => {
    const byKind = standingIdsFrom(['gpu_temp']);
    const both = [gpuTemp('0', 'alarm'), gpuTemp('1', 'alarm')];
    const byKindOut = observePoll(EMPTY_CONDITION_STATE, both, byKind, 0).displayed;
    expect(byKindOut[0]?.suppressed).toBe(true);
    expect(byKindOut[1]?.suppressed).toBe(true);

    const bySubject = standingIdsFrom(['gpu_temp:0']);
    const bySubjectOut = observePoll(EMPTY_CONDITION_STATE, both, bySubject, 0).displayed;
    expect(bySubjectOut[0]?.suppressed).toBe(true);
    expect(bySubjectOut[1]?.suppressed).toBe(false);
    expect(bySubjectOut[1]?.banner).toBe(true);
  });

  test('nothing becomes standing implicitly, however long it has been true', () => {
    const run = runConfirmed(ufw, ['alarm', 'alarm', 'alarm', 'alarm']);
    expect(last(run).banner).toBe(true);
    expect(last(run).declaredStanding).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The sticky `changed` rule — the divergence needs a FOURTH observation
// ---------------------------------------------------------------------------

describe('the ledger — a standing condition returns to full alarm the moment it changes', () => {
  const standing = standingIdsFrom(['ufw_enforcing']);

  test('a first observation is not a change', () => {
    expect(observeSeverity(undefined, 'alarm')).toEqual({
      firstSeverity: 'alarm',
      lastSeverity: 'alarm',
      changed: false,
    });
  });

  test('repeating the same severity is not a change', () => {
    expect(last(runConfirmed(ufw, ['alarm', 'alarm', 'alarm'], standing)).suppressed).toBe(true);
  });

  test('clearing is a change', () => {
    const run = runConfirmed(ufw, ['alarm', 'normal'], standing);
    expect(last(run).severity).toBe('normal');
    expect(last(run).suppressed).toBe(false);
  });

  test('§6.4 verbatim: it clears and later REGRESSES — the banner must come back', () => {
    const d = last(runConfirmed(ufw, ['alarm', 'normal', 'alarm'], standing));
    expect(d.declaredStanding).toBe(true);
    expect(d.suppressed).toBe(false);
    expect(d.displaySeverity).toBe('alarm');
    expect(d.banner).toBe(true);
  });

  /**
   * The regression above passes under **both** the sticky fold and the naive
   * "differs from the previous poll" one, because its third observation compares `alarm`
   * against `normal`. They diverge only at a fourth observation, where the naive fold
   * resets `changed` to `false` and silently re-suppresses the condition.
   *
   * At a 5 s cadence that is a banner on screen for five seconds and then gone for the
   * rest of the session, on the one condition §6.4 names by name.
   */
  test('§6.4: `changed` is STICKY — the regression banner survives a fourth poll', () => {
    const run = runConfirmed(ufw, ['alarm', 'normal', 'alarm', 'alarm'], standing);
    expect(run.map((d) => d.banner)).toEqual([false, false, true, true]);
    expect(last(run).suppressed).toBe(false);
  });

  test('and it survives every poll after that — not just the fourth', () => {
    const run = runConfirmed(
      ufw,
      ['alarm', 'normal', 'alarm', 'alarm', 'alarm', 'alarm'],
      standing,
    );
    expect(run.slice(2).every((d) => d.banner)).toBe(true);
  });

  test('the fold itself: sticky, over four observations', () => {
    let entry = observeSeverity(undefined, 'alarm');
    entry = observeSeverity(entry, 'normal');
    entry = observeSeverity(entry, 'alarm');
    expect(entry.changed).toBe(true);
    entry = observeSeverity(entry, 'alarm');
    expect(entry.changed).toBe(true);
    expect(entry.firstSeverity).toBe('alarm');
    expect(entry.lastSeverity).toBe('alarm');
  });

  test('the state is immutable — observing returns new maps', () => {
    const first = observePoll(EMPTY_CONDITION_STATE, [ufw()], NOTHING_STANDING, 0);
    const second = observePoll(first.state, [ufw('normal')], NOTHING_STANDING, 60_000);
    expect(EMPTY_CONDITION_STATE.ledger.size).toBe(0);
    expect(EMPTY_CONDITION_STATE.holds.size).toBe(0);
    expect(EMPTY_LEDGER.size).toBe(0);
    expect(second.state).not.toBe(first.state);
    expect(second.state.ledger).not.toBe(first.state.ledger);
  });

  test('conditions are tracked per id, so two GPUs do not share a ledger entry', () => {
    const standingBoth = standingIdsFrom(['gpu_temp']);
    let state: ConditionState = EMPTY_CONDITION_STATE;
    state = observePoll(
      state,
      [gpuTemp('0', 'alarm'), gpuTemp('1', 'normal')],
      standingBoth,
      0,
    ).state;
    const { displayed } = observePoll(
      state,
      [gpuTemp('0', 'alarm'), gpuTemp('1', 'alarm')],
      standingBoth,
      60_000,
    );
    expect(displayed[0]?.suppressed).toBe(true);
    expect(displayed[1]?.suppressed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// The composition — §6.4's "the two mechanisms are one pipeline, not two"
// ---------------------------------------------------------------------------

describe('the ledger is fed the CONFIRMED band, never a raw per-poll severity', () => {
  const standing = standingIdsFrom(['gpu_temp:0']);

  /**
   * §6.4's own example, at the 79/80 °C knee, on a card declared standing during a known
   * hot run. One `watch` poll at a 1 s cadence must not un-suppress the condition for the
   * rest of the session — "the banner it was written to prevent becomes permanent".
   */
  test('a single-poll flicker at a 1 s cadence leaves a standing condition suppressed', () => {
    const sequence: readonly Severity[] = ['alarm', 'alarm', 'watch', 'alarm', 'alarm', 'alarm'];
    let state: ConditionState = EMPTY_CONDITION_STATE;
    const out: DisplayedCondition[] = [];
    sequence.forEach((severity, i) => {
      const result = observePoll(state, [gpuTemp('0', severity)], standing, i * 1_000);
      state = result.state;
      const d = result.displayed[0];
      if (d === undefined) throw new Error('dropped');
      out.push(d);
    });

    expect(out.map((d) => d.severity)).toEqual([
      'alarm',
      'alarm',
      'alarm',
      'alarm',
      'alarm',
      'alarm',
    ]);
    expect(out.every((d) => d.suppressed)).toBe(true);
    expect(out.some((d) => d.banner)).toBe(false);
  });

  test('a band held for ten seconds DOES reach the ledger and un-suppress', () => {
    const sequence: readonly [Severity, number][] = [
      ['alarm', 0],
      ['watch', 1_000],
      ['watch', 12_000],
      ['alarm', 13_000],
    ];
    let state: ConditionState = EMPTY_CONDITION_STATE;
    const out: DisplayedCondition[] = [];
    for (const [severity, t] of sequence) {
      const result = observePoll(state, [gpuTemp('0', severity)], standing, t);
      state = result.state;
      const d = result.displayed[0];
      if (d === undefined) throw new Error('dropped');
      out.push(d);
    }
    // t=12_000 confirms `watch` (first seen at 1_000), which is a change; from then on the
    // condition is no longer the understood, unchanging fact it was declared to be.
    expect(out.map((d) => d.severity)).toEqual(['alarm', 'alarm', 'watch', 'watch']);
    expect(out[2]?.suppressed).toBe(false);
    expect(out[3]?.suppressed).toBe(false);
  });

  test('the displayed severity is never a raw one — a 9,999 ms alarm does not banner', () => {
    let state: ConditionState = EMPTY_CONDITION_STATE;
    state = observePoll(state, [gpuTemp('0', 'normal')], NOTHING_STANDING, 0).state;
    const nearly = observePoll(state, [gpuTemp('0', 'alarm')], NOTHING_STANDING, 9_999);
    expect(nearly.displayed[0]?.severity).toBe('normal');
    expect(nearly.displayed[0]?.banner).toBe(false);
    const confirmed = observePoll(nearly.state, [gpuTemp('0', 'alarm')], NOTHING_STANDING, 20_000);
    expect(confirmed.displayed[0]?.severity).toBe('alarm');
    expect(confirmed.displayed[0]?.banner).toBe(true);
  });

  test('§6.4: "when it started" is the FIRST observation of the confirmed band', () => {
    let state: ConditionState = EMPTY_CONDITION_STATE;
    state = observePoll(state, [gpuTemp('0', 'normal')], NOTHING_STANDING, 0).state;
    state = observePoll(state, [gpuTemp('0', 'alarm')], NOTHING_STANDING, 4_000).state;
    const { displayed } = observePoll(state, [gpuTemp('0', 'alarm')], NOTHING_STANDING, 20_000);
    expect(displayed[0]?.severity).toBe('alarm');
    // 4_000 — when the band was first seen — not 14_000, when it was confirmed.
    expect(displayed[0]?.sinceMs).toBe(4_000);
  });

  test('§9: one reading in two panels is ONE condition, counted once', () => {
    // `cooling.serviceState` and `safety.fanServiceState` are the same D-Bus read.
    const fromCooling = observation({
      kind: 'unit',
      subject: 'gpu-fan-control.service',
      label: 'fan service',
      value: 'failed',
      rawSeverity: 'alarm',
    });
    const fromSafety = observation({
      kind: 'unit',
      subject: 'gpu-fan-control.service',
      label: 'gpu-fan-control.service',
      value: 'failed',
      rawSeverity: 'alarm',
    });
    const { displayed } = observePoll(
      EMPTY_CONDITION_STATE,
      [fromCooling, fromSafety],
      NOTHING_STANDING,
      0,
    );
    expect(displayed).toHaveLength(1);
    expect(alarmCount(displayed)).toBe(1);
    // The first observation wins, so the list is deterministic.
    expect(displayed[0]?.label).toBe('fan service');
  });
});

// ---------------------------------------------------------------------------
// §9's aggregate — one reduction, read as a dot and as a count
// ---------------------------------------------------------------------------

describe('§9 — the dot and the alarm count are one reduction over displaySeverity', () => {
  test('a suppressed standing alarm is neither red nor counted', () => {
    const standing = standingIdsFrom(['ufw_enforcing']);
    const { displayed } = observePoll(EMPTY_CONDITION_STATE, [ufw()], standing, 0);
    expect(aggregateSeverity(displayed)).toBe('watch');
    expect(alarmCount(displayed)).toBe(0);
    // Its truth is still named in the row it is displayed in.
    expect(displayed[0]?.severity).toBe('alarm');
  });

  test('an undeclared alarm is red and counted', () => {
    const { displayed } = observePoll(EMPTY_CONDITION_STATE, [ufw()], NOTHING_STANDING, 0);
    expect(aggregateSeverity(displayed)).toBe('alarm');
    expect(alarmCount(displayed)).toBe(1);
  });

  test('the count is the banner list, so the dot and the banner cannot disagree', () => {
    const standing = standingIdsFrom(['ufw_enforcing']);
    const { displayed } = observePoll(
      EMPTY_CONDITION_STATE,
      [ufw(), gpuTemp('0', 'alarm'), gpuTemp('1', 'watch')],
      standing,
      0,
    );
    expect(alarmCount(displayed)).toBe(bannerConditions(displayed).length);
    expect(alarmCount(displayed)).toBe(1);
    expect(bannerConditions(displayed)[0]?.id).toBe('gpu_temp:0');
    expect(aggregateSeverity(displayed)).toBe('alarm');
  });

  test('nothing observed is not health — the aggregate is null, never normal', () => {
    expect(aggregateSeverity([])).toBeNull();
    expect(aggregateSeverity([])).not.toBe('normal');
    expect(alarmCount([])).toBe(0);
  });

  test('a watch-level condition colours its cell but never raises a banner (§6.4)', () => {
    const { displayed } = observePoll(
      EMPTY_CONDITION_STATE,
      [ufw('watch')],
      NOTHING_STANDING,
      0,
    );
    expect(bannerConditions(displayed)).toEqual([]);
    expect(aggregateSeverity(displayed)).toBe('watch');
  });
});

// ---------------------------------------------------------------------------
// The debounce state machine on its own
// ---------------------------------------------------------------------------

describe('§6.4 debounce', () => {
  test('ten seconds, in milliseconds', () => {
    expect(DEBOUNCE_MS).toBe(10_000);
  });

  test('the first reading of a session is confirmed immediately', () => {
    const hold = startBandHold<Severity>('normal', 1_000);
    expect(hold.confirmed).toBe('normal');
    expect(hold.pending).toBe('normal');
    expect(hold.confirmedSinceMs).toBe(1_000);
  });

  test('a new band is pending, not confirmed, the instant it appears', () => {
    const hold = stepBandHold(startBandHold<Severity>('normal', 0), 'alarm', 5_000);
    expect(hold.pending).toBe('alarm');
    expect(hold.pendingSinceMs).toBe(5_000);
    expect(hold.confirmed).toBe('normal');
  });

  test('9,999 ms is not enough and 10,000 ms is', () => {
    const start = stepBandHold(startBandHold<Severity>('normal', 0), 'alarm', 1_000);
    expect(stepBandHold(start, 'alarm', 1_000 + 9_999).confirmed).toBe('normal');
    expect(stepBandHold(start, 'alarm', 1_000 + 10_000).confirmed).toBe('alarm');
  });

  test('79 → 80 → 79 at a 5 s cadence stays quiet', () => {
    let hold = startBandHold<Severity>('watch', 0);
    hold = stepBandHold(hold, 'alarm', 5_000);
    hold = stepBandHold(hold, 'watch', 10_000);
    hold = stepBandHold(hold, 'watch', 15_000);
    expect(hold.confirmed).toBe('watch');
    expect(hold.confirmedSinceMs).toBe(0);
  });

  test('at a 30 s cadence a single further sample confirms a transition', () => {
    let hold = startBandHold<Severity>('normal', 0);
    hold = stepBandHold(hold, 'alarm', 30_000);
    expect(hold.confirmed).toBe('normal');
    hold = stepBandHold(hold, 'alarm', 60_000);
    expect(hold.confirmed).toBe('alarm');
  });

  test('at a 1 s cadence it takes ten more samples — same wall time, not same poll count', () => {
    let hold = startBandHold<Severity>('normal', 0);
    // The band is first seen at t = 1 s, so the ten seconds run to t = 11 s. Nine further
    // samples are not enough; the tenth is. At 30 s the count is one — see above.
    for (let t = 1_000; t <= 10_000; t += 1_000) {
      hold = stepBandHold(hold, 'alarm', t);
      expect(hold.confirmed).toBe('normal');
    }
    hold = stepBandHold(hold, 'alarm', 11_000);
    expect(hold.confirmed).toBe('alarm');
    expect(hold.confirmedSinceMs).toBe(1_000);
  });

  test('the banner timestamp is when the band was first observed, not when confirmed', () => {
    let hold = startBandHold<Severity>('normal', 0);
    hold = stepBandHold(hold, 'alarm', 4_000);
    hold = stepBandHold(hold, 'alarm', 20_000);
    expect(hold.confirmed).toBe('alarm');
    expect(hold.confirmedSinceMs).toBe(4_000);
  });

  test('an unchanged state is returned by identity, so === means "nothing moved"', () => {
    const hold = startBandHold<Severity>('normal', 0);
    expect(stepBandHold(hold, 'normal', 1_000)).toBe(hold);
    expect(stepBandHold(hold, 'normal', 500_000)).toBe(hold);
  });

  test('identity holds on a backwards clock too, when there is no pending run', () => {
    const hold = startBandHold<Severity>('normal', 100_000);
    expect(stepBandHold(hold, 'normal', 50_000)).toBe(hold);
  });

  test('a band that flickers back to the confirmed one resets the pending run', () => {
    let hold = startBandHold<Severity>('normal', 0);
    hold = stepBandHold(hold, 'alarm', 1_000);
    hold = stepBandHold(hold, 'normal', 2_000);
    expect(hold.pending).toBe('normal');
    expect(hold.pendingSinceMs).toBe(2_000);
    hold = stepBandHold(hold, 'alarm', 3_000);
    hold = stepBandHold(hold, 'alarm', 3_000 + 9_999);
    expect(hold.confirmed).toBe('normal');
  });

  test('a wall clock that jumps backwards cannot confirm early or strand a band', () => {
    let hold = startBandHold<Severity>('normal', 100_000);
    hold = stepBandHold(hold, 'alarm', 110_000);
    hold = stepBandHold(hold, 'alarm', 50_000);
    expect(hold.pendingSinceMs).toBe(50_000);
    expect(hold.confirmed).toBe('normal');
    hold = stepBandHold(hold, 'alarm', 60_000);
    expect(hold.confirmed).toBe('alarm');
  });

  test('the hold is configurable, so step 8 can test it without waiting', () => {
    const hold = stepBandHold(startBandHold<Severity>('normal', 0), 'alarm', 5, 1);
    expect(hold.confirmed).toBe('normal');
    expect(stepBandHold(hold, 'alarm', 10, 1).confirmed).toBe('alarm');
  });

  test('it debounces any band, not just a severity', () => {
    // §6.4's own event-log example is a non-severity transition: fan5 EC auto → HIGH.
    let hold = startBandHold('EC auto', 0);
    hold = stepBandHold(hold, 'HIGH', 1_000);
    expect(hold.confirmed).toBe('EC auto');
    hold = stepBandHold(hold, 'HIGH', 11_000);
    expect(hold.confirmed).toBe('HIGH');
  });
});

// ---------------------------------------------------------------------------
// §9's dedupe — one condition, counted once, at the WORST severity
// ---------------------------------------------------------------------------

const fanService = (state: string, rawSeverity: Severity): ConditionObservation =>
  observation({
    kind: 'unit',
    subject: 'gpu-fan-control.service',
    label: 'gpu-fan-control.service',
    value: state,
    rawSeverity,
  });

describe('⚠ §9: one reading in two panels is one condition, at the worst severity', () => {
  /*
   * ⚠ **F6.** `gpu-fan-control.service` reaches the browser twice — `cooling.serviceState` and
   * `safety.fanServiceState`. The server writes both from one D-Bus read, so they *should*
   * agree; "should" is an assertion about the server made inside the client, which is the
   * posture O10 exists to forbid, and `parseSnapshot` validates each field separately and
   * never compares them. Taking the first let whichever panel happened to be projected first
   * decide: a `failed` service behind an `active` reading rendered a **red cell under a green
   * dot**, which is the disagreement §9's own row exists to prevent, reached from the one
   * direction §9 did not consider.
   */
  test('⚠ a disagreeing pair keeps the worse severity, whichever order it arrives in', () => {
    const healthy = fanService('active', 'normal');
    const broken = fanService('failed', 'alarm');

    for (const pair of [[healthy, broken], [broken, healthy]]) {
      const { displayed } = observePoll(EMPTY_CONDITION_STATE, pair, NOTHING_STANDING, 0);
      expect(displayed).toHaveLength(1);
      expect(displayed[0]?.severity).toBe('alarm');
      // "…with the value that carries it" — a red row that named `active` would be its own lie.
      expect(displayed[0]?.value).toBe('failed');
    }
  });

  /*
   * ⚠ The consequence worth stating on its own: the push order in `conditionsFrom` stops being
   * load-bearing. Reversing it used to change which verdict survived, and no test pinned it.
   */
  test('⚠ the dedupe’s answer does not depend on the projection’s order', () => {
    const a = fanService('active', 'normal');
    const b = fanService('failed', 'alarm');
    const forwards = observePoll(EMPTY_CONDITION_STATE, [a, b], NOTHING_STANDING, 0);
    const backwards = observePoll(EMPTY_CONDITION_STATE, [b, a], NOTHING_STANDING, 0);
    expect(forwards.displayed[0]?.severity).toBe(backwards.displayed[0]?.severity);
    expect(forwards.displayed[0]?.value).toBe(backwards.displayed[0]?.value);
  });

  test('⚠ an agreeing pair is still one condition, and reports no conflict', () => {
    const twice = fanService('active', 'normal');
    const { displayed, conflicts } = observePoll(
      EMPTY_CONDITION_STATE,
      [twice, twice],
      NOTHING_STANDING,
      0,
    );
    expect(displayed).toHaveLength(1);
    expect(conflicts).toEqual([]);
  });

  test('⚠ a disagreement is reported, so a server defect is visible rather than absorbed', () => {
    const { conflicts } = observePoll(
      EMPTY_CONDITION_STATE,
      [fanService('active', 'normal'), fanService('failed', 'alarm')],
      NOTHING_STANDING,
      0,
    );
    expect(conflicts).toEqual([
      {
        id: 'unit:gpu-fan-control.service',
        label: 'gpu-fan-control.service',
        kept: 'failed',
        others: ['active'],
      },
    ]);
  });
});

// ---------------------------------------------------------------------------
// §9 / §6.5 — a condition whose subject stops being reported
// ---------------------------------------------------------------------------

const GPUS = new Set(['gpus']);

const gpuTempIn = (index: string, rawSeverity: Severity): ConditionObservation =>
  observation({
    kind: 'gpu_temp',
    subject: index,
    label: `GPU ${index} temperature`,
    value: '90 °C',
    rawSeverity,
    enumeration: 'gpus',
  });

/** A session with GPU 0 confirmed at `alarm` — the 90 °C card §9's row is written about. */
const hotCard = (): ConditionState => {
  let state = EMPTY_CONDITION_STATE;
  for (const at of [0, 30_000]) {
    state = observePoll(state, [gpuTempIn('0', 'alarm')], NOTHING_STANDING, at, {
      enumerationsRead: GPUS,
    }).state;
  }
  return state;
};

describe('⚠ §9: an unobservable alarm is unknown, not resolved', () => {
  /*
   * ⚠ **F3, and it is the failure this dashboard exists to prevent.** A card at 90 °C whose
   * `nvidia-smi` then fails used to take the header from `● 1 alarm` to `● all healthy` with
   * no log line: `displayed` was built from *this poll's* observations, so a condition that
   * disappeared left the reduction without leaving a trace. §6.5's "nothing else is affected"
   * governs the GPU **panels**; it was never a statement about §9's aggregate.
   */
  test('⚠ nvidia-smi failing keeps the alarm, its severity and its since', () => {
    const before = hotCard();
    const hot = observePoll(before, [gpuTempIn('0', 'alarm')], NOTHING_STANDING, 60_000, {
      enumerationsRead: GPUS,
    });
    expect(aggregateSeverity(hot.displayed)).toBe('alarm');
    expect(alarmCount(hot.displayed)).toBe(1);

    // `gpus: null` — the enumeration could not be read, so nothing was learned about the card.
    const blind = observePoll(hot.state, [], NOTHING_STANDING, 90_000, { enumerationsRead: new Set() });
    expect(aggregateSeverity(blind.displayed)).toBe('alarm');
    expect(alarmCount(blind.displayed)).toBe(1);
    expect(blind.displayed[0]?.stale).toBe(true);
    expect(blind.displayed[0]?.sinceMs).toBe(hot.displayed[0]?.sinceMs);
    expect(blind.retired).toEqual([]);
  });

  /*
   * ⚠ The mirror failure, and it is as bad: a dashboard that latches an alarm about a card
   * somebody deliberately pulled is un-clearable without a reload. `gpus: [{index:0}]` for GPU
   * 1 is a **positive observation** that the subject has left, and that is an answer.
   */
  test('⚠ a card that is observed gone is retired — the ledger, the dot and the count', () => {
    let state = EMPTY_CONDITION_STATE;
    const both = [gpuTempIn('0', 'normal'), gpuTempIn('1', 'alarm')];
    for (const at of [0, 30_000]) {
      state = observePoll(state, both, NOTHING_STANDING, at, { enumerationsRead: GPUS }).state;
    }
    expect(alarmCount(observePoll(state, both, NOTHING_STANDING, 60_000, { enumerationsRead: GPUS }).displayed)).toBe(1);

    // GPU 1 is gone, and `gpus` was read: two polls ten seconds apart confirm it.
    const first = observePoll(state, [gpuTempIn('0', 'normal')], NOTHING_STANDING, 60_000, {
      enumerationsRead: GPUS,
    });
    expect(first.retired).toEqual([]);
    expect(alarmCount(first.displayed)).toBe(1);

    const gone = observePoll(first.state, [gpuTempIn('0', 'normal')], NOTHING_STANDING, 75_000, {
      enumerationsRead: GPUS,
    });
    expect(gone.retired.map((d) => d.id)).toEqual(['gpu_temp:1']);
    expect(gone.displayed.map((d) => d.id)).toEqual(['gpu_temp:0']);
    expect(alarmCount(gone.displayed)).toBe(0);
    expect(gone.state.ledger.has('gpu_temp:1')).toBe(false);
    expect(gone.state.holds.has('gpu_temp:1')).toBe(false);
  });

  /*
   * ⚠ §6.5: "Confirmed over the same ten seconds, so one flickering enumeration cannot retire
   * a card." One bad poll must not take an alarm down.
   */
  test('⚠ one flickering enumeration retires nothing', () => {
    let state = EMPTY_CONDITION_STATE;
    const both = [gpuTempIn('0', 'normal'), gpuTempIn('1', 'alarm')];
    for (const at of [0, 30_000]) {
      state = observePoll(state, both, NOTHING_STANDING, at, { enumerationsRead: GPUS }).state;
    }
    const blip = observePoll(state, [gpuTempIn('0', 'normal')], NOTHING_STANDING, 31_000, {
      enumerationsRead: GPUS,
    });
    expect(blip.retired).toEqual([]);
    const back = observePoll(blip.state, both, NOTHING_STANDING, 32_000, { enumerationsRead: GPUS });
    expect(back.retired).toEqual([]);
    expect(alarmCount(back.displayed)).toBe(1);
  });

  /*
   * ⚠ "Staleness never raises a severity and never lowers one" (§9). Every collector hiccup
   * promoting a stale `normal` to amber would devalue amber; a subject that was fine when it
   * was last read is not evidence of harm.
   */
  test('⚠ a stale normal stays normal — staleness is the mode, never the band', () => {
    let state = EMPTY_CONDITION_STATE;
    for (const at of [0, 30_000]) {
      state = observePoll(state, [gpuTempIn('0', 'normal')], NOTHING_STANDING, at, {
        enumerationsRead: GPUS,
      }).state;
    }
    const blind = observePoll(state, [], NOTHING_STANDING, 90_000, { enumerationsRead: new Set() });
    expect(blind.displayed[0]?.severity).toBe('normal');
    expect(blind.displayed[0]?.displaySeverity).toBe('normal');
    expect(aggregateSeverity(blind.displayed)).toBe('normal');
  });

  /*
   * ⚠ A subject nothing enumerates can never be retired, however readable the collections are.
   * `ufw_enforcing` disappears because its *reading* failed, not because ufw left the machine.
   */
  test('⚠ a condition no collection enumerates is always stale, never retired', () => {
    let state = EMPTY_CONDITION_STATE;
    for (const at of [0, 30_000]) {
      state = observePoll(state, [ufw()], NOTHING_STANDING, at, { enumerationsRead: GPUS }).state;
    }
    const blind = observePoll(state, [], NOTHING_STANDING, 90_000, { enumerationsRead: GPUS });
    expect(blind.retired).toEqual([]);
    expect(blind.displayed[0]?.stale).toBe(true);
    expect(alarmCount(blind.displayed)).toBe(1);
  });

  test('⚠ the stale edge is reported once, and the reading returning is reported once', () => {
    const state = hotCard();
    const first = observePoll(state, [], NOTHING_STANDING, 40_000, { enumerationsRead: new Set() });
    expect(first.wentStale).toEqual([]);

    const confirmed = observePoll(first.state, [], NOTHING_STANDING, 55_000, {
      enumerationsRead: new Set(),
    });
    expect(confirmed.wentStale.map((d) => d.id)).toEqual(['gpu_temp:0']);

    const again = observePoll(confirmed.state, [], NOTHING_STANDING, 70_000, {
      enumerationsRead: new Set(),
    });
    expect(again.wentStale).toEqual([]);

    const back = observePoll(again.state, [gpuTempIn('0', 'alarm')], NOTHING_STANDING, 80_000, {
      enumerationsRead: GPUS,
    });
    expect(back.returned.map((d) => d.id)).toEqual(['gpu_temp:0']);
    expect(back.displayed[0]?.stale).toBe(false);
  });

  /*
   * ⚠ §6.5's asymmetry, stated as a test because it is the thing a symmetric `stepBandHold`
   * would silently get wrong: absence is held for ten seconds, a returning reading is believed
   * at once. Waiting to believe a card that is answering is the same lie in the other
   * direction.
   */
  /*
   * ⚠ "One flickering enumeration cannot retire a card" has to hold on **every** cycle, not
   * only the first — which is what makes §6.5's asymmetry load-bearing rather than cosmetic.
   * A presence hold that debounced the *return* would still be sitting at *confirmed absent*
   * when the card came back, so the very next absent poll would retire it on the rebound.
   */
  test('⚠ a returning reading resets the ten seconds, so a flicker cannot retire on the rebound', () => {
    let state = EMPTY_CONDITION_STATE;
    const both = [gpuTempIn('0', 'normal'), gpuTempIn('1', 'alarm')];
    for (const at of [0, 30_000]) {
      state = observePoll(state, both, NOTHING_STANDING, at, { enumerationsRead: GPUS }).state;
    }
    // `nvidia-smi` stops answering for long enough to confirm both cards stale…
    for (const at of [40_000, 55_000]) {
      state = observePoll(state, [], NOTHING_STANDING, at, { enumerationsRead: new Set() }).state;
    }
    // …then it answers again, with both cards…
    state = observePoll(state, both, NOTHING_STANDING, 60_000, { enumerationsRead: GPUS }).state;
    // …and one poll later GPU 1 is missing from a readable enumeration. One poll is not ten
    // seconds, and a card that was answering a second ago must not be retired by it.
    const blip = observePoll(state, [gpuTempIn('0', 'normal')], NOTHING_STANDING, 61_000, {
      enumerationsRead: GPUS,
    });
    expect(blip.retired).toEqual([]);
    expect(alarmCount(blip.displayed)).toBe(1);
  });

  test('⚠ a returning reading is believed at once, not after another ten seconds', () => {
    const state = hotCard();
    const gone = observePoll(state, [], NOTHING_STANDING, 40_000, { enumerationsRead: new Set() });
    const confirmed = observePoll(gone.state, [], NOTHING_STANDING, 55_000, {
      enumerationsRead: new Set(),
    });
    const back = observePoll(confirmed.state, [gpuTempIn('0', 'alarm')], NOTHING_STANDING, 55_100, {
      enumerationsRead: GPUS,
    });
    expect(back.displayed[0]?.stale).toBe(false);
    expect(back.displayed[0]?.lastSeenMs).toBe(55_100);
    expect(back.returned.map((d) => d.id)).toEqual(['gpu_temp:0']);

    // …and it is believed **from then on**: a hold that debounced the return would still read
    // *confirmed absent* a moment later, so every subsequent poll would announce the same
    // reading returning again.
    const still = observePoll(back.state, [gpuTempIn('0', 'alarm')], NOTHING_STANDING, 55_200, {
      enumerationsRead: GPUS,
    });
    expect(still.returned).toEqual([]);
  });

  /*
   * ⚠ §6.4: "A poll in which a condition does not appear steps nothing. Its hold is frozen
   * rather than advanced." Without this a band that was *pending* when the collector failed
   * would be confirmed by an interval nobody sampled — and dated to before it.
   */
  test('⚠ an absent condition’s hold is frozen, so absence can never confirm a band', () => {
    let state = observePoll(EMPTY_CONDITION_STATE, [gpuTempIn('0', 'normal')], NOTHING_STANDING, 0, {
      enumerationsRead: GPUS,
    }).state;
    // A pending alarm, one second old.
    state = observePoll(state, [gpuTempIn('0', 'alarm')], NOTHING_STANDING, 1_000, {
      enumerationsRead: GPUS,
    }).state;
    const holdBefore = state.holds.get('gpu_temp:0');

    // Twenty minutes of not being read.
    const blind = observePoll(state, [], NOTHING_STANDING, 1_200_000, { enumerationsRead: new Set() });
    expect(blind.state.holds.get('gpu_temp:0')).toBe(holdBefore);
    expect(blind.displayed[0]?.severity).toBe('normal');
  });
});

// ---------------------------------------------------------------------------
// §6.4 — a gap ends any pending run
// ---------------------------------------------------------------------------

describe('⚠ §6.4: ten seconds of wall time means ten seconds the client was SAMPLING', () => {
  /*
   * ⚠ **F7.** The hold compares `nowMs − pendingSinceMs`, and `observePoll` runs only on an
   * accepted sample — so a hidden tab, a paused dashboard and a run of failed polls all
   * accumulated hold time with **no readings behind it**. Measured: one poll at 84 °C, an hour
   * hidden, one more poll at 84 °C, and the band was confirmed with its "since" dated to an
   * hour before the only other evidence for it. The mirror case is worse: a band the
   * intervening readings would have **rejected** is confirmed instead, because there were no
   * intervening readings.
   */
  test('⚠ one sample either side of an hour-long gap confirms nothing', () => {
    let state = observePoll(EMPTY_CONDITION_STATE, [gpuTemp('0', 'normal')], NOTHING_STANDING, 0).state;
    const pending = observePoll(state, [gpuTemp('0', 'alarm')], NOTHING_STANDING, 1_000);
    expect(pending.displayed[0]?.severity).toBe('normal');
    state = pending.state;

    const afterAnHour = observePoll(state, [gpuTemp('0', 'alarm')], NOTHING_STANDING, 3_601_000, {
      afterGap: true,
    });
    expect(afterAnHour.displayed[0]?.severity).toBe('normal');

    // …and it confirms on its own merits, ten seconds of *sampled* time later.
    const later = observePoll(afterAnHour.state, [gpuTemp('0', 'alarm')], NOTHING_STANDING, 3_612_000);
    expect(later.displayed[0]?.severity).toBe('alarm');
    // ⚠ "The banner's when it started may never name an instant on the far side of a gap."
    expect(later.displayed[0]?.sinceMs).toBe(3_601_000);
  });

  /*
   * ⚠ "A band that had already confirmed is not disturbed." It is the last thing actually
   * measured, and §6.5's stale rule governs it from there — restarting it would re-open a
   * settled question every time somebody backgrounded the tab.
   */
  test('⚠ a band that had already confirmed survives a gap untouched', () => {
    let state = EMPTY_CONDITION_STATE;
    for (const at of [0, 30_000]) {
      state = observePoll(state, [gpuTemp('0', 'alarm')], NOTHING_STANDING, at).state;
    }
    const before = observePoll(state, [gpuTemp('0', 'alarm')], NOTHING_STANDING, 40_000);
    const after = observePoll(before.state, [gpuTemp('0', 'alarm')], NOTHING_STANDING, 3_600_000, {
      afterGap: true,
    });
    expect(after.displayed[0]?.severity).toBe('alarm');
    expect(after.displayed[0]?.sinceMs).toBe(before.displayed[0]?.sinceMs);
  });

  test('restartPendingRuns leaves a settled hold alone, by identity', () => {
    const settled = startBandHold<Severity>('normal', 0);
    const holds = new Map([['a', settled]]);
    expect(restartPendingRuns(holds, 9_000)).toBe(holds);
  });

  test('restartPendingRuns moves a pending run to now and keeps its confirmed band', () => {
    const pending = stepBandHold(startBandHold<Severity>('normal', 0), 'alarm', 1_000);
    const holds = new Map([['a', pending]]);
    const after = restartPendingRuns(holds, 500_000).get('a');
    expect(after?.confirmed).toBe('normal');
    expect(after?.pending).toBe('alarm');
    expect(after?.pendingSinceMs).toBe(500_000);
  });
});
