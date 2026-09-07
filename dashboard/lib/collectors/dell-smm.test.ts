/**
 * §3.3's pure parsers and §3.7's `pwm5` probe.
 *
 * Everything here is text in, values out — no `/sys`, no root, no Dell. The wrapper that
 * fetches the bytes is tested separately in `cooling.test.ts`, which is the split that
 * lets the whole of §3.7's probe table be exercised including the states the live box
 * cannot be put into (the stock 4-fan driver, `EACCES`, a stalled fan).
 */

import { describe, expect, test } from 'vitest';

import { ch5EcAuto, ch5Manual } from '../fixtures';
import { pwm, rpm } from '../types';
import type { Cooling, UnitState } from '../types';
import {
  DELL_SMM_NAME,
  FAN_CHANNELS,
  NO_FANS,
  PWM5_EC_AUTO_ERRNO,
  PWM5_FILE,
  ch5ModeFrom,
  classifyPwm5Read,
  coolingFrom,
  errnoCodeOf,
  fanInputFile,
  parseDellSmmFans,
  pwm5PresentFrom,
  withServiceState,
} from './dell-smm';
import type { Pwm5Probe, Pwm5Read } from './dell-smm';
import {
  CAPTURED_DELL_SMM,
  DELL_SMM_FAN5_AT_NOMINAL,
  DELL_SMM_FAN5_EMPTY,
  DELL_SMM_FAN5_IMPLAUSIBLE,
  DELL_SMM_FAN5_NEGATIVE,
  DELL_SMM_FAN5_OVER_NOMINAL,
  DELL_SMM_FAN5_STALLED,
  DELL_SMM_STOCK,
  PWM5_ABOVE_RANGE,
  PWM5_BELOW_RANGE,
  PWM5_EMPTY,
  PWM5_FAR_ABOVE_RANGE,
  PWM5_HIGH,
  PWM5_OFF,
} from './samples';

/** The captured node with one file swapped — the only difference from reality is named. */
const withFan5 = (text: string): Readonly<Record<string, string>> => ({
  ...CAPTURED_DELL_SMM,
  fan5_input: text,
});

const ok = (text: string): Pwm5Read => ({ kind: 'ok', text });
const failed = (code: string | null, message = `${code ?? 'failure'}: reading pwm5`): Pwm5Read => ({
  kind: 'failed',
  code,
  message,
});

// ---------------------------------------------------------------------------
// Constants — the traps, expressed as what this module will look at
// ---------------------------------------------------------------------------

describe('what §3.3 permits reading', () => {
  test('the node is located by `name`, and the name is the driver’s', () => {
    expect(DELL_SMM_NAME).toBe('dell_smm');
    expect(CAPTURED_DELL_SMM['name']).toBe(`${DELL_SMM_NAME}\n`);
  });

  test('⚠ trap 1: the fan files are `fanN_input` — never `_target`, `_label`, `_max`', () => {
    // §3.3: "`fanN_input` is the only trustworthy fan telemetry. Everything else lies."
    // `fanN_target` clamps to the HIGH nominal (measured 5100 on this board while fan5 was
    // turning at 1915), and `fan5_label` returns EINVAL because GET_FAN_TYPE fails here.
    expect(FAN_CHANNELS.map(fanInputFile)).toEqual([
      'fan1_input',
      'fan2_input',
      'fan3_input',
      'fan4_input',
      'fan5_input',
    ]);
    for (const channel of FAN_CHANNELS) {
      expect(fanInputFile(channel)).not.toContain('target');
      expect(fanInputFile(channel)).not.toContain('label');
    }
  });

  test('⚠ trap 2: the duty file is `pwm5` and NOT `pwm5_enable`', () => {
    // `pwm5_enable` reads back `2` ("EC auto") even under manual control — measured on
    // this board 2026-09-06 — so a mode derived from it is wrong half the time.
    expect(PWM5_FILE).toBe('pwm5');
    expect(PWM5_FILE).not.toContain('enable');
  });

  test('§3.3 lists five channels, and channel 5 is the GPU/PCIe header', () => {
    expect(FAN_CHANNELS).toEqual([1, 2, 3, 4, 5]);
  });
});

// ---------------------------------------------------------------------------
// parseDellSmmFans
// ---------------------------------------------------------------------------

describe('parseDellSmmFans (§3.3)', () => {
  test('the live box: five channels, each in its own field', () => {
    const { value, problems } = parseDellSmmFans(CAPTURED_DELL_SMM);
    expect(problems).toEqual([]);
    expect(value).toEqual({
      fan1Rpm: rpm(1028),
      fan2Rpm: rpm(718),
      fan3Rpm: rpm(615),
      fan4Rpm: rpm(1006),
      fan5Rpm: rpm(1915),
    });
  });

  test('⚠ no channel is mapped to another channel’s field', () => {
    // Every value distinct, so an off-by-one in the field mapping cannot hide. `fan2` is
    // the GPU-area OEM fan and `fan5` is the header this dashboard exists to watch.
    const { value } = parseDellSmmFans({
      fan1_input: '11\n',
      fan2_input: '22\n',
      fan3_input: '33\n',
      fan4_input: '44\n',
      fan5_input: '55\n',
    });
    expect(value.fan1Rpm).toBe(11);
    expect(value.fan2Rpm).toBe(22);
    expect(value.fan3Rpm).toBe(33);
    expect(value.fan4Rpm).toBe(44);
    expect(value.fan5Rpm).toBe(55);
  });

  test('⚠ invariant 1: a stalled fan is `0 RPM`, not null', () => {
    const { value, problems } = parseDellSmmFans(withFan5(DELL_SMM_FAN5_STALLED));
    expect(value.fan5Rpm).toBe(0);
    expect(value.fan5Rpm).not.toBeNull();
    expect(problems).toEqual([]);
  });

  test('⚠ invariant 1: a file that produced nothing is null, and IS reported', () => {
    // `Number('')` is `0`. Nothing downstream can tell that 0 from a dead fan.
    const { value, problems } = parseDellSmmFans(withFan5(DELL_SMM_FAN5_EMPTY));
    expect(value.fan5Rpm).toBeNull();
    expect(problems).toEqual(['`fan5_input` is not a reading']);
  });

  test('⚠ the two look nothing alike, which is the whole of invariant 1', () => {
    const stalled = parseDellSmmFans(withFan5(DELL_SMM_FAN5_STALLED)).value.fan5Rpm;
    const nothing = parseDellSmmFans(withFan5(DELL_SMM_FAN5_EMPTY)).value.fan5Rpm;
    expect(stalled === null).toBe(false);
    expect(nothing === null).toBe(true);
    expect(stalled).not.toBe(nothing);
  });

  test('a channel absent from the record is null with NO entry', () => {
    // The stock 4-fan driver has no `fan5_input` at all. That state is reported once, by
    // `pwm5Present: false` — a second entry per poll would be noise on a standing alarm.
    const { value, problems } = parseDellSmmFans(DELL_SMM_STOCK);
    expect(value.fan5Rpm).toBeNull();
    expect(value.fan1Rpm).toBe(1028);
    expect(problems).toEqual([]);
  });

  test('⚠ an implausible tach passes through as a READING — §6.3 alarms on it', () => {
    // 14451 RPM hung POST on this box. §6.3's absolute row is what turns it red; a
    // collector that rejected it would replace the alarm with an em dash.
    const { value, problems } = parseDellSmmFans(withFan5(DELL_SMM_FAN5_IMPLAUSIBLE));
    expect(value.fan5Rpm).toBe(14451);
    expect(problems).toEqual([]);
  });

  test('⚠ both sides of §6.3’s 5100 nominal survive the parser', () => {
    // The boundary is severity's to apply, not the parser's to pre-empt — so BOTH sides
    // have to arrive intact (HANDOVER §5).
    expect(parseDellSmmFans(withFan5(DELL_SMM_FAN5_AT_NOMINAL)).value.fan5Rpm).toBe(5100);
    expect(parseDellSmmFans(withFan5(DELL_SMM_FAN5_OVER_NOMINAL)).value.fan5Rpm).toBe(5101);
  });

  test('a negative revolution count is null, and carries no entry (§6.7)', () => {
    // "An out-of-range reading carries no `errors[]` entry either … a successful read of
    // an impossible value." An unsigned counter cannot be −1.
    const { value, problems } = parseDellSmmFans(withFan5(DELL_SMM_FAN5_NEGATIVE));
    expect(value.fan5Rpm).toBeNull();
    expect(problems).toEqual([]);
  });

  test('⚠ zero is on the readable side of that floor', () => {
    // The other half of the same boundary. `0` is a reading; `−1` is not.
    expect(parseDellSmmFans(withFan5('0\n')).value.fan5Rpm).toBe(0);
    expect(parseDellSmmFans(withFan5('-1\n')).value.fan5Rpm).toBeNull();
  });

  test('junk that `parseInt` would truncate is rejected outright', () => {
    for (const junk of ['1915 RPM\n', '19.15\n', '0x77\n', 'off\n', '1_915\n', '   \n']) {
      const { value, problems } = parseDellSmmFans(withFan5(junk));
      expect(value.fan5Rpm, junk).toBeNull();
      expect(problems, junk).toEqual(['`fan5_input` is not a reading']);
    }
  });

  test('one bad channel does not blank the other four', () => {
    const { value, problems } = parseDellSmmFans({ ...CAPTURED_DELL_SMM, fan3_input: 'x\n' });
    expect(value.fan3Rpm).toBeNull();
    expect(value.fan1Rpm).toBe(1028);
    expect(value.fan5Rpm).toBe(1915);
    expect(problems).toEqual(['`fan3_input` is not a reading']);
  });

  test('an empty record is all null — never five zeroes', () => {
    expect(parseDellSmmFans({}).value).toEqual(NO_FANS);
    expect(parseDellSmmFans({}).problems).toEqual([]);
  });

  test('NO_FANS is five nulls', () => {
    expect(Object.values(NO_FANS)).toEqual([null, null, null, null, null]);
  });

  test('nothing throws, whatever the bytes are', () => {
    for (const junk of ['', '\0', '\r\n', 'a'.repeat(10_000), '9'.repeat(400)]) {
      expect(() => parseDellSmmFans(withFan5(junk))).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// errnoCodeOf
// ---------------------------------------------------------------------------

describe('errnoCodeOf', () => {
  test('takes the code off a Node fs rejection', () => {
    const e = Object.assign(new Error('ENODATA: no data available, read'), { code: 'ENODATA' });
    expect(errnoCodeOf(e)).toBe('ENODATA');
  });

  test('is null when there is no code — never a guess from the message', () => {
    // HANDOVER: "Do not match on message text." A message that *says* ENODATA but carries
    // no code must not be treated as EC auto.
    expect(errnoCodeOf(new Error('ENODATA: no data available, read'))).toBeNull();
    expect(errnoCodeOf(Object.assign(new Error('x'), { code: 61 }))).toBeNull();
    expect(errnoCodeOf(Object.assign(new Error('x'), { code: '' }))).toBeNull();
    expect(errnoCodeOf('ENODATA')).toBeNull();
    expect(errnoCodeOf(null)).toBeNull();
    expect(errnoCodeOf(undefined)).toBeNull();
  });

  test('a plain object carrying a code still answers — rejections are not always Errors', () => {
    expect(errnoCodeOf({ code: 'EACCES' })).toBe('EACCES');
  });
});

// ---------------------------------------------------------------------------
// classifyPwm5Read — §3.7 rows 3, 4 and 5
// ---------------------------------------------------------------------------

describe('classifyPwm5Read (§3.7)', () => {
  test('⚠ ENODATA is EC auto, and carries NO errors[] entry', () => {
    // Invariant 3, and the state the live box was in at capture time (both cards 40 °C,
    // below `AUTO_BELOW=55`, so the service had handed the channel back to the EC).
    const { value, problems } = classifyPwm5Read(failed(PWM5_EC_AUTO_ERRNO));
    expect(value).toEqual({ outcome: 'ec-auto' });
    expect(problems).toEqual([]);
  });

  test('the ENODATA constant is the errno the driver really returns', () => {
    expect(PWM5_EC_AUTO_ERRNO).toBe('ENODATA');
  });

  test('a numeric read is manual, carrying the duty', () => {
    expect(classifyPwm5Read(ok(PWM5_HIGH))).toEqual({
      value: { outcome: 'manual', duty: pwm(255) },
      problems: [],
    });
  });

  test('⚠ O6, low side: 0 is a READING — `OFF pwm 0`, not "no duty"', () => {
    const { value, problems } = classifyPwm5Read(ok(PWM5_OFF));
    expect(value).toEqual({ outcome: 'manual', duty: pwm(0) });
    expect(problems).toEqual([]);
  });

  test('⚠ O6, both sides of the register: −1 and 256 are not readings', () => {
    // HANDOVER O6: "0 and 255 are readings, −1 and 256 are `null`, and all four need
    // fixtures." All four are here, two above and two in this test.
    expect(classifyPwm5Read(ok(PWM5_BELOW_RANGE)).value).toEqual({ outcome: 'unreadable' });
    expect(classifyPwm5Read(ok(PWM5_ABOVE_RANGE)).value).toEqual({ outcome: 'unreadable' });
    expect(classifyPwm5Read(ok(PWM5_HIGH)).value).toEqual({ outcome: 'manual', duty: pwm(255) });
    expect(classifyPwm5Read(ok(PWM5_OFF)).value).toEqual({ outcome: 'manual', duty: pwm(0) });
  });

  test('an out-of-range duty carries NO errors[] entry (§6.7)', () => {
    // "A `utilization.gpu` of `150` or a `pwm5` of `999` is a successful read of an
    // impossible value: it becomes `null` and … no `errors[]` entry."
    expect(classifyPwm5Read(ok(PWM5_FAR_ABOVE_RANGE)).problems).toEqual([]);
    expect(classifyPwm5Read(ok(PWM5_BELOW_RANGE)).problems).toEqual([]);
  });

  test('⚠ a truncated read is NOT a duty of zero, and it IS reported', () => {
    // `Number('')` is `0`, which would render the entirely plausible `OFF pwm 0` and
    // disengage §6.3's band on a channel that may be being driven HIGH.
    const { value, problems } = classifyPwm5Read(ok(PWM5_EMPTY));
    expect(value).toEqual({ outcome: 'unreadable' });
    expect(problems).toEqual(['`pwm5` is not a reading']);
  });

  test('junk text is unreadable and reported', () => {
    for (const junk of ['auto\n', '2.5\n', '0xff\n', '255 pwm\n', '  \n']) {
      const { value, problems } = classifyPwm5Read(ok(junk));
      expect(value, junk).toEqual({ outcome: 'unreadable' });
      expect(problems, junk).toEqual(['`pwm5` is not a reading']);
    }
  });

  test('every other errno leaves the mode unknown, and IS reported', () => {
    for (const code of ['EACCES', 'EIO', 'ENOENT', 'EINVAL', 'UNKNOWN']) {
      const { value, problems } = classifyPwm5Read(failed(code));
      expect(value, code).toEqual({ outcome: 'unreadable' });
      expect(problems, code).toEqual([`${code}: reading pwm5`]);
    }
  });

  test('⚠ the ENODATA test is EXACT equality — a near miss is not the healthy state', () => {
    // A8c. `read.code === PWM5_EC_AUTO_ERRNO` is the whole of invariant 3's gate, and
    // without a near miss in the table a mutation to `.toLowerCase()`, `.includes()` or a
    // trimmed compare passes everything. Every one of these is a code Node does not emit,
    // so treating any of them as EC auto would be *inventing* the healthy answer from a
    // rejection that means something else — the one direction §3.7 forbids outright.
    for (const code of ['enodata', 'EnoData', 'ENODATA ', ' ENODATA', 'ENODATA2', 'NODATA']) {
      const { value, problems } = classifyPwm5Read(failed(code));
      expect(value, code).toEqual({ outcome: 'unreadable' });
      expect(value, code).not.toEqual({ outcome: 'ec-auto' });
      // …and unlike EC auto, every one of them is reported (invariant 3's other half).
      expect(problems, code).toHaveLength(1);
    }
    // The one that IS the healthy state, for contrast.
    expect(classifyPwm5Read(failed('ENODATA')).value).toEqual({ outcome: 'ec-auto' });
    expect(classifyPwm5Read(failed('ENODATA')).problems).toEqual([]);
  });

  test('⚠ a rejection with no code is unreadable, never EC auto', () => {
    // The safe direction: a lost errno must not be *promoted* to the healthy state.
    const { value, problems } = classifyPwm5Read(failed(null, 'timed out after 2000 ms'));
    expect(value).toEqual({ outcome: 'unreadable' });
    expect(problems).toEqual(['timed out after 2000 ms']);
  });

  test('⚠ a message that merely mentions ENODATA is not EC auto', () => {
    expect(classifyPwm5Read(failed('EIO', 'ENODATA is not what happened')).value).toEqual({
      outcome: 'unreadable',
    });
  });

  test('every classification is total — nothing throws, nothing is undefined', () => {
    const reads: Pwm5Read[] = [
      ok(''),
      ok('\x00'),
      ok('9'.repeat(400)),
      failed(null, ''),
      failed('ENODATA'),
    ];
    for (const read of reads) {
      const result = classifyPwm5Read(read);
      expect(result.value.outcome).toBeTruthy();
      expect(Array.isArray(result.problems)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ⚠ O8 — the two fields come from ONE probe and NEITHER is derived from the other
// ---------------------------------------------------------------------------

/** All five of §3.7's outcomes, once each. Every table below iterates this. */
const ALL_PROBES: readonly Pwm5Probe[] = [
  { outcome: 'unlocated' },
  { outcome: 'absent' },
  { outcome: 'manual', duty: pwm(255) },
  { outcome: 'ec-auto' },
  { outcome: 'unreadable' },
];

describe('§3.7’s probe table (O8)', () => {
  test.each([
    ['unlocated', { outcome: 'unlocated' } as Pwm5Probe, null, null],
    ['absent', { outcome: 'absent' } as Pwm5Probe, false, null],
    ['manual', { outcome: 'manual', duty: pwm(128) } as Pwm5Probe, true, 'manual'],
    ['ec-auto', { outcome: 'ec-auto' } as Pwm5Probe, true, 'ec-auto'],
    ['unreadable', { outcome: 'unreadable' } as Pwm5Probe, true, null],
  ])('%s → pwm5Present %s, ch5Mode %s', (_name, probe, present, mode) => {
    expect(pwm5PresentFrom(probe)).toBe(present);
    expect(ch5ModeFrom(probe)).toBe(mode);
  });

  test('⚠ the ONLY implication that holds: ch5Mode !== null ⟹ pwm5Present === true', () => {
    for (const probe of ALL_PROBES) {
      if (ch5ModeFrom(probe) !== null) expect(pwm5PresentFrom(probe)).toBe(true);
    }
  });

  test('⚠ pwm5Present is NOT a function of ch5Mode — three values share `ch5Mode: null`', () => {
    // This is the failure §3.7 calls the worst inversion in the project: writing
    // `pwm5Present = ch5Mode !== null` collapses these three into `false`, so a `/sys`
    // mount typo or an EACCES becomes a SAFETY alarm asserting GPU fan control is gone.
    const present = ALL_PROBES.filter((p) => ch5ModeFrom(p) === null).map(pwm5PresentFrom);
    expect(new Set(present)).toEqual(new Set([null, false, true]));
  });

  test('⚠ ch5Mode is NOT a function of pwm5Present — three modes share `pwm5Present: true`', () => {
    // The converse direction, which fails just as hard: a node that exists can be under
    // manual control, in healthy EC auto, or unreadable.
    const modes = ALL_PROBES.filter((p) => pwm5PresentFrom(p) === true).map(ch5ModeFrom);
    expect(new Set(modes)).toEqual(new Set(['manual', 'ec-auto', null]));
  });

  test('both projections are unary on Pwm5Probe — neither takes the other’s answer', () => {
    // ⚠ This is NOT a proof of independence and its name no longer claims to be one. A
    // unary function can call anything it likes; `pwm5PresentFrom = (p) => ch5ModeFrom(p)
    // !== null` is unary and is exactly §3.7's forbidden biconditional. The extensional
    // protection is the two counter-example tests above; the *structural* rule is asserted
    // over the source text in `lib/guardrails.test.ts`, which is how this project already
    // enforces structure. All this checks is the signature the other two rely on.
    expect(pwm5PresentFrom.length).toBe(1);
    expect(ch5ModeFrom.length).toBe(1);
  });

  test('`false` is reachable ONLY from `absent` — never from a failure to look', () => {
    const alarming = ALL_PROBES.filter((p) => pwm5PresentFrom(p) === false);
    expect(alarming).toEqual([{ outcome: 'absent' }]);
  });

  test('`unlocated` is unknown, not the alarm (§3.7)', () => {
    expect(pwm5PresentFrom({ outcome: 'unlocated' })).toBeNull();
    expect(pwm5PresentFrom({ outcome: 'unlocated' })).not.toBe(false);
  });

  test('EC auto is a healthy MODE, and does not touch the safety row', () => {
    // Invariant 3. `ENODATA` is the driver saying state 3 (AUTO) exceeds `i8k_fan_max`.
    expect(ch5ModeFrom({ outcome: 'ec-auto' })).toBe('ec-auto');
    expect(pwm5PresentFrom({ outcome: 'ec-auto' })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// coolingFrom / withServiceState
// ---------------------------------------------------------------------------

const FANS = parseDellSmmFans(CAPTURED_DELL_SMM).value;

describe('coolingFrom (§3.3’s discriminated union)', () => {
  test('manual carries the duty; the union makes it non-null', () => {
    const cooling = coolingFrom(FANS, { outcome: 'manual', duty: pwm(255) }, 'active');
    expect(cooling.ch5Mode).toBe('manual');
    if (cooling.ch5Mode !== 'manual') throw new Error('narrowing failed');
    expect(cooling.ch5Pwm).toBe(255);
  });

  test('ec-auto has no duty — and that is not a missing reading', () => {
    const cooling = coolingFrom(FANS, { outcome: 'ec-auto' }, 'active');
    expect(cooling).toMatchObject({ ch5Mode: 'ec-auto', ch5Pwm: null });
  });

  test.each([['unlocated'], ['absent'], ['unreadable']])(
    '%s is CoolingUnavailable — mode null, duty null',
    (outcome) => {
      const cooling = coolingFrom(FANS, { outcome } as Pwm5Probe, null);
      expect(cooling.ch5Mode).toBeNull();
      expect(cooling.ch5Pwm).toBeNull();
    },
  );

  test('⚠ the variant always agrees with ch5ModeFrom — one probe, one answer', () => {
    // Two switches over the same union could drift. They must not: `formatCh5Pwm`
    // switches on `ch5Mode` and would render `unavailable` for a channel the safety row
    // called present.
    for (const probe of ALL_PROBES) {
      expect(coolingFrom(FANS, probe, null).ch5Mode).toBe(ch5ModeFrom(probe));
    }
  });

  test('the fan readings are carried through untouched', () => {
    const cooling = coolingFrom(FANS, { outcome: 'ec-auto' }, null);
    expect(cooling).toMatchObject(FANS);
  });

  test('serviceState is a parameter, not a reading — step 4 never touches D-Bus', () => {
    expect(coolingFrom(FANS, { outcome: 'ec-auto' }, null).serviceState).toBeNull();
    expect(coolingFrom(FANS, { outcome: 'ec-auto' }, 'failed').serviceState).toBe('failed');
  });

  test('it reproduces the canonical fixtures’ shape (HANDOVER §7)', () => {
    const manual = coolingFrom(
      {
        fan1Rpm: rpm(1005),
        fan2Rpm: rpm(720),
        fan3Rpm: rpm(740),
        fan4Rpm: rpm(1111),
        fan5Rpm: rpm(4308),
      },
      { outcome: 'manual', duty: pwm(255) },
      'active',
    );
    expect(manual).toEqual(ch5Manual);

    const auto = coolingFrom(
      {
        fan1Rpm: rpm(1005),
        fan2Rpm: rpm(720),
        fan3Rpm: rpm(740),
        fan4Rpm: rpm(1111),
        fan5Rpm: rpm(2210),
      },
      { outcome: 'ec-auto' },
      'active',
    );
    expect(auto).toEqual(ch5EcAuto);
  });
});

describe('withServiceState (O9)', () => {
  const states: (UnitState | null)[] = ['active', 'failed', 'inactive', 'reloading', null];

  test.each(states.map((s) => [String(s), s] as const))(
    'writes %s into every variant, preserving the variant',
    (_label, state) => {
      const variants: Cooling[] = [
        coolingFrom(FANS, { outcome: 'manual', duty: pwm(255) }, null),
        coolingFrom(FANS, { outcome: 'ec-auto' }, null),
        coolingFrom(FANS, { outcome: 'absent' }, null),
      ];
      for (const before of variants) {
        const after = withServiceState(before, state);
        expect(after.serviceState).toBe(state);
        expect(after.ch5Mode).toBe(before.ch5Mode);
        expect(after.ch5Pwm).toBe(before.ch5Pwm);
        expect(after.fan5Rpm).toBe(before.fan5Rpm);
      }
    },
  );

  test('it does not mutate its argument', () => {
    const before = coolingFrom(FANS, { outcome: 'manual', duty: pwm(255) }, null);
    withServiceState(before, 'active');
    expect(before.serviceState).toBeNull();
  });

  test('a manual channel keeps a duty that narrowing can still reach', () => {
    const after = withServiceState(
      coolingFrom(FANS, { outcome: 'manual', duty: pwm(200) }, null),
      'active',
    );
    if (after.ch5Mode !== 'manual') throw new Error('the variant was lost');
    expect(after.ch5Pwm).toBe(200);
  });
});
