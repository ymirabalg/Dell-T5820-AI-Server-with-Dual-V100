/**
 * O10 — the validator that exists because a cast asserts nothing.
 *
 * HANDOVER: "The constructors name a unit; they do not validate one. They are `v as T`,
 * erased at runtime — so **O10: no `as TelemetrySnapshot` on a `fetch` response**, and no
 * coercion of `serving: null` to `[]`."
 *
 * Every fixture here goes through `JSON.parse(JSON.stringify(…))` first, so what is validated
 * is wire data — no brands, no prototypes, no `undefined` — exactly as `fetch` would hand it
 * over.
 */

import { describe, expect, test } from 'vitest';

import {
  LIVE_BOX_SERVING_WIRE,
  everythingZero,
  nothingReadable,
  pwm5NodeAbsent,
  pwm5Unreadable,
  servingPopulated,
} from '../fixtures';
import { EMPTY_CONDITION_STATE, NOTHING_STANDING, observePoll } from '../conditions';
import { failingSourceCount } from './header-status';
import { wireBodyOf } from './fake-env';
import {
  GPU_ENUMERATION,
  SERVING_ENUMERATION,
  conditionsFrom,
  enumerationsRead,
  errorsForPanel,
} from './observations';
import { parseSnapshot } from './wire';

const body = (snapshot: unknown): Record<string, unknown> =>
  JSON.parse(JSON.stringify(snapshot)) as Record<string, unknown>;

const without = (key: string): Record<string, unknown> => {
  const clone = body(everythingZero);
  delete clone[key];
  return clone;
};

const withField = (key: string, value: unknown): Record<string, unknown> => ({
  ...body(everythingZero),
  [key]: value,
});

describe('a well-formed snapshot survives the wire unchanged', () => {
  test.each([
    ['everything read, many readings zero', everythingZero],
    ['nothing readable at all', nothingReadable],
    ['channel 5 absent — the DKMS alarm', pwm5NodeAbsent],
    ['channel 5 present but unreadable', pwm5Unreadable],
    ['two serving instances, one down', servingPopulated],
  ])('⚠ the fixture round-trips field for field — %s', (_name, snapshot) => {
    const parsed = parseSnapshot(wireBodyOf(snapshot));
    expect(parsed?.snapshot).toEqual(snapshot);
  });

  /*
   * ⚠ Invariant 1, at the door. `everythingZero` is a dead fan and an idle card; `nothingReadable`
   * is a driver that did not load. If the validator ever coalesced one into the other — a `??`,
   * a truthiness test, a `Number(x) || null` — this is what would catch it, and it is the single
   * worst bug this project can ship.
   */
  test('⚠ a reading of 0 stays 0 and a reading of null stays null', () => {
    const zero = parseSnapshot(wireBodyOf(everythingZero))?.snapshot;
    expect(zero?.cooling.fan5Rpm).toBe(0);
    expect(zero?.host.cpuPct).toBe(0);
    expect(zero?.storage.net.rxBytesPerSec).toBe(0);

    const nothing = parseSnapshot(wireBodyOf(nothingReadable))?.snapshot;
    expect(nothing?.cooling.fan5Rpm).toBeNull();
    expect(nothing?.host.cpuPct).toBeNull();
    expect(nothing?.storage.net.rxBytesPerSec).toBeNull();
  });

  /*
   * ⚠ §3.1 and HANDOVER's do-not-copy list: "`serving: null` is not `[]`, on the wire and after
   * any validation". `null` is "which instances exist is unknown"; `[]` is "none are configured".
   */
  test('⚠ serving: null stays null and serving: [] stays empty', () => {
    expect(parseSnapshot(withField('serving', null))?.snapshot.serving).toBeNull();
    expect(parseSnapshot(withField('serving', []))?.snapshot.serving).toEqual([]);
  });

  test('⚠ gpus: null stays null and is not two healthy cards', () => {
    expect(parseSnapshot(withField('gpus', null))?.snapshot.gpus).toBeNull();
  });

  test('a field the server added that this client does not know is ignored', () => {
    const parsed = parseSnapshot({ ...body(everythingZero), somethingNew: { a: 1 } });
    expect(parsed?.snapshot).toEqual(everythingZero);
  });
});

describe('⚠ ts is the axis, so it has to be a time', () => {
  test('⚠ the parsed epoch is the server’s ts and nothing else', () => {
    const parsed = parseSnapshot(withField('ts', '2026-09-06T14:02:11.482Z'));
    expect(parsed?.tsMs).toBe(Date.parse('2026-09-06T14:02:11.482Z'));
    expect(parsed?.snapshot.ts).toBe('2026-09-06T14:02:11.482Z');
  });

  test.each([
    ['a bare number Date.parse would happily accept', '5'],
    ['a local time with no zone', '2026-09-06T14:02:11'],
    ['a zone offset rather than Z', '2026-09-06T14:02:11+02:00'],
    ['a date with no time', '2026-09-06'],
    ['prose', 'just now'],
    ['empty', ''],
    ['an impossible month', '2026-13-01T00:00:00Z'],
    // ⚠ The last two rows are the only ones the SHAPE guard catches ALONE. Every row above is
    // also refused by F13's calendar round-trip, which compares 19 characters — so it cannot
    // see a non-canonical *spelling* of a correct instant, and without `ISO_UTC` both of these
    // would validate. They are not cosmetic: §6.7's dedupe is keyed on the `ts` **string**, so
    // one instant arriving under two spellings enters the ring twice, which is exactly the
    // duplicate point, flattened decimation bucket and double-counted event the dedupe exists
    // to prevent.
    ['a zero offset written out rather than Z', '2026-09-06T14:02:11.000+00:00'],
    ['more fractional digits than toISOString writes', '2026-09-06T14:02:11.4821Z'],
  ])('⚠ a ts that is not ISO-8601 UTC is refused — %s', (_name, ts) => {
    expect(parseSnapshot(withField('ts', ts))).toBeNull();
  });

  test('a ts that is not a string at all is refused', () => {
    expect(parseSnapshot(withField('ts', 1_700_000_000_000))).toBeNull();
    expect(parseSnapshot(withField('ts', null))).toBeNull();
  });
});

describe('⚠ a missing field is a broken server, not a null reading', () => {
  test.each([
    ['ts'],
    ['hostname'],
    ['gpus'],
    ['host'],
    ['cooling'],
    ['serving'],
    ['storage'],
    ['safety'],
    ['errors'],
  ])('⚠ the snapshot is refused when a top-level field is absent — %s', (key) => {
    expect(parseSnapshot(without(key))).toBeNull();
  });

  test('⚠ a missing reading inside a collection is refused too', () => {
    const cooling = body(everythingZero)['cooling'] as Record<string, unknown>;
    delete cooling['fan3Rpm'];
    expect(parseSnapshot({ ...body(everythingZero), cooling })).toBeNull();
  });

  test('the body itself has to be an object', () => {
    for (const value of [null, undefined, 'snapshot', 42, [], true]) {
      expect(parseSnapshot(value)).toBeNull();
    }
  });
});

describe('⚠ the closed vocabularies (§3.7)', () => {
  /*
   * ⚠ dbus.ts names the cost of skipping this: a seventh `ActiveState` "would put a seventh
   * value into a union the UI switches on exhaustively, and §6.3's `severityUnitState` would
   * return `undefined` for it — an uncoloured row on the panel that reports whether GPU fan
   * control is running".
   */
  test('⚠ a UnitState outside the six is refused, and each of the six is accepted', () => {
    for (const state of ['active', 'reloading', 'inactive', 'failed', 'activating', 'deactivating']) {
      const safety = { ...(body(everythingZero)['safety'] as object), fanServiceState: state };
      expect(parseSnapshot({ ...body(everythingZero), safety })).not.toBeNull();
    }
    const safety = { ...(body(everythingZero)['safety'] as object), fanServiceState: 'zombie' };
    expect(parseSnapshot({ ...body(everythingZero), safety })).toBeNull();
  });

  test('⚠ a LinkState outside the seven operstate values is refused', () => {
    const storage = body(everythingZero)['storage'] as Record<string, unknown>;
    const net = storage['net'] as object;
    expect(
      parseSnapshot({ ...body(everythingZero), storage: { ...storage, net: { ...net, link: 'flapping' } } }),
    ).toBeNull();
    expect(
      parseSnapshot({ ...body(everythingZero), storage: { ...storage, net: { ...net, link: 'dormant' } } }),
    ).not.toBeNull();
  });

  test('⚠ a HealthState outside ok/unhealthy/unreachable refuses the ROW (12c), and every row that carries one', () => {
    const instances = body(servingPopulated)['serving'] as Record<string, unknown>[];
    const bad = instances.map((i) => ({ ...i, health: 'degraded' }));
    // ⚠ 12c — the vocabulary is enforced exactly as before; what changed is the BLAST RADIUS.
    // Both rows carry the bad value, so both are dropped, and the snapshot still parses with
    // the rest of the machine on it rather than the page going dark.
    const parsed = parseSnapshot({ ...body(servingPopulated), serving: bad });
    expect(parsed).not.toBeNull();
    expect(parsed?.snapshot.serving).toEqual([]);
    expect(parsed?.snapshot.errors.filter((e) => e.message.includes('`health`'))).toHaveLength(2);
    // ⚠ And the vocabulary is still CLOSED: a legal value on the same rows keeps them.
    const good = instances.map((i) => ({ ...i, health: 'unhealthy' }));
    expect(parseSnapshot({ ...body(servingPopulated), serving: good })?.snapshot.serving).toHaveLength(2);
  });

  test('⚠ a nineteenth errors[] source is refused', () => {
    expect(
      parseSnapshot(withField('errors', [{ source: 'smartctl', message: 'disk is unhappy' }])),
    ).toBeNull();
    expect(
      parseSnapshot(withField('errors', [{ source: 'dell-smm', message: 'no hwmon' }])),
    ).not.toBeNull();
  });

  test('an errors[] entry with no message is refused', () => {
    expect(parseSnapshot(withField('errors', [{ source: 'ufw' }]))).toBeNull();
  });
});

describe('⚠ 10b-S-G — errors[].instance is the contract’s first OPTIONAL field', () => {
  /*
   * "Both directions need a fixture" — the rule three steps here have already broken. Side
   * one: an old server that has never heard of `instance` simply omits the key, and that
   * snapshot must still validate (SPEC.md §4: "an old server's snapshot still validates").
   */
  test('an errors[] entry with the key entirely ABSENT still validates, with no instance', () => {
    const parsed = parseSnapshot(withField('errors', [{ source: 'dell-smm', message: 'no hwmon' }]));
    expect(parsed).not.toBeNull();
    expect(parsed?.snapshot.errors).toHaveLength(1);
    expect(parsed?.snapshot.errors[0]?.instance).toBeUndefined();
    expect(Object.hasOwn(parsed?.snapshot.errors[0] as object, 'instance')).toBe(false);
  });

  // Side two: present and a valid non-null integer — validated and carried through, exactly
  // like `ServingInstance.instance` and `Gpu.index` already are.
  test('an errors[] entry with a valid instance carries it through unchanged', () => {
    const parsed = parseSnapshot(
      withField('errors', [{ source: 'llama-health', message: 'connect ECONNREFUSED', instance: '1' }]),
    );
    expect(parsed?.snapshot.errors[0]?.instance).toBe('1');
  });

  test('⚠⚠ 12c — a NUMERIC `errors[].instance` is read as its canonical decimal string', () => {
    // The live box's own spelling. §3.4 fixes a numeric identity AS its canonical decimal
    // string, so `1` and `'1'` name one instance and must land on one SERVING row — which is
    // what `serving-panel.tsx`'s `error.instance === instance.instance` compares.
    const parsed = parseSnapshot(
      withField('errors', [{ source: 'llama-health', message: 'connect ECONNREFUSED', instance: 1 }]),
    );
    expect(parsed?.snapshot.errors[0]?.instance).toBe('1');
  });

  /*
   * ⚠ Present but the WRONG type is invalid, on the same terms as every other field in this
   * file — it must not be silently coerced to "absent", which would treat a malformed
   * snapshot as an old, well-formed one and hide the fact that the server sent garbage.
   */
  test.each<[string, unknown]>([
    ['a float', 1.5],
    ['negative infinity', -Infinity],
    ['NaN, which JSON cannot carry but a hand-rolled server could send', Number.NaN],
    ['a negative integer', -1],
    // ⚠ 12c — the identity grammar, on the error side too: an id no ROW could ever carry
    // cannot name a row, and `a:b` would spell a second `health:` condition id.
    ['an empty string', ''],
    ['a string with a colon', 'a:b'],
    ['a string with a space', 'a b'],
    ['a non-canonical numeral', '01'],
    // `instance` is never nullable — an absent KEY is the "no subject" spelling, so a
    // present `null` is a third, illegal spelling of the same fact and must be refused.
    ['null — the field is optional, never nullable', null],
  ])('⚠ an errors[] entry with an instance that is %s is refused', (_name, badInstance) => {
    expect(
      parseSnapshot(
        withField('errors', [{ source: 'llama-health', message: 'connect ECONNREFUSED', instance: badInstance }]),
      ),
    ).toBeNull();
  });

  test('⚠ the fixture round-trips with the key both present and absent in the same array', () => {
    // Two entries, one instance-bearing and one not, prove the two shapes coexist in a
    // single `errors[]` without either one contaminating the other.
    const parsed = parseSnapshot(
      withField('errors', [
        { source: 'dbus', message: 'NoSuchUnit llama-server@1.service', instance: '1' },
        { source: 'ufw', message: 'ENABLED= missing' },
      ]),
    );
    expect(parsed?.snapshot.errors[0]?.instance).toBe('1');
    expect(parsed?.snapshot.errors[1]?.instance).toBeUndefined();
  });
});

describe('⚠ §3.3’s cooling union is validated, which is what a cast could never do', () => {
  const withCooling = (over: Record<string, unknown>): unknown => ({
    ...body(everythingZero),
    cooling: { ...(body(everythingZero)['cooling'] as object), ...over },
  });

  /*
   * ⚠ §6.6: "A duty that is not a reading leaves the MODE undetermined, not merely the duty —
   * the contract cannot represent `manual` with an absent duty." Accepting this shape would
   * hand `ch5Engagement` a manual channel with no duty and put the COOLING panel one `??` away
   * from asserting health it never measured.
   */
  test('⚠ manual with no duty is not a state the contract can hold', () => {
    expect(parseSnapshot(withCooling({ ch5Mode: 'manual', ch5Pwm: null }))).toBeNull();
  });

  test('⚠ ec-auto with a duty is refused — ENODATA means there is no duty to read', () => {
    expect(parseSnapshot(withCooling({ ch5Mode: 'ec-auto', ch5Pwm: 255 }))).toBeNull();
  });

  test('⚠ an unavailable channel with a duty is refused', () => {
    expect(parseSnapshot(withCooling({ ch5Mode: null, ch5Pwm: 128 }))).toBeNull();
  });

  test('⚠ each of the three legal variants is accepted', () => {
    expect(parseSnapshot(withCooling({ ch5Mode: 'manual', ch5Pwm: 255 }))).not.toBeNull();
    expect(parseSnapshot(withCooling({ ch5Mode: 'ec-auto', ch5Pwm: null }))).not.toBeNull();
    expect(parseSnapshot(withCooling({ ch5Mode: null, ch5Pwm: null }))).not.toBeNull();
  });

  test('a mode outside the three is refused', () => {
    expect(parseSnapshot(withCooling({ ch5Mode: 'auto', ch5Pwm: null }))).toBeNull();
  });

  test('⚠ a duty of 0 is a reading — OFF — and is not an absent one', () => {
    const parsed = parseSnapshot(withCooling({ ch5Mode: 'manual', ch5Pwm: 0 }));
    expect(parsed?.snapshot.cooling.ch5Pwm).toBe(0);
  });

  /*
   * ⚠ **F10.** §6.7 spells this case out by number: "A `pwm5` of `999` … leaves the mode
   * undetermined, so the cooling cell reads `unavailable` rather than `—`." `manual` asserts
   * the duty **is** a reading, and an out-of-range or fractional one is not — the same
   * sentence that already refuses `{ manual, null }`. Fixture symmetry on both bounds, and the
   * row that earns the change is `12.7`: `pwmStateName` rounds it and the cell renders
   * **`OFF pwm 13`**, an integer the machine never reported.
   */
  test.each([
    ['below the range', -1],
    ['above the range', 256],
    ['the reading that once hung POST, as a duty', 999],
    ['not an integer', 12.7],
    ['a string', '255'],
  ])('⚠ a manual duty that is not a reading refuses the snapshot — %s', (_name, duty) => {
    expect(parseSnapshot(withCooling({ ch5Mode: 'manual', ch5Pwm: duty }))).toBeNull();
  });

  test('⚠ both ends of the driver’s range are readings, and are kept', () => {
    expect(parseSnapshot(withCooling({ ch5Mode: 'manual', ch5Pwm: 0 }))?.snapshot.cooling.ch5Pwm).toBe(0);
    expect(parseSnapshot(withCooling({ ch5Mode: 'manual', ch5Pwm: 255 }))?.snapshot.cooling.ch5Pwm).toBe(255);
  });
});

describe('⚠ §4’s `standing` — configuration, echoed verbatim, judged only in the browser', () => {
  test('⚠ the key is required, like every other key in this contract', () => {
    expect(parseSnapshot(without('standing'))).toBeNull();
  });

  /*
   * ⚠ `null` is not one of its values at any depth. Every `null` in this contract means *a
   * reading this box could not take*; `standing` is not a reading, and an unset `STANDING`
   * is `[]` — nothing is standing, which is the **louder** direction.
   */
  test.each([
    ['null', null],
    ['a string', 'ufw_enforcing'],
    ['an object', { ufw_enforcing: true }],
    ['an array with a null entry', ['ufw_enforcing', null]],
    ['an array of numbers', [1]],
  ])('⚠ standing sent as %s is refused', (_name, standing) => {
    expect(parseSnapshot(withField('standing', standing))).toBeNull();
  });

  /*
   * ⚠ The validator must **not** judge the ids. §6.4's "an id that matches no kind is reported
   * as unknown" is `parseStandingIds`'s job, in the browser, and one malformed entry failing a
   * poll would blank a whole dashboard over a typo in a config file.
   */
  test('⚠ a malformed id is carried through rather than failing the poll', () => {
    const declared = ['ufw_enforcing:yes', 'unit', ' gpu_temp '];
    expect(parseSnapshot(withField('standing', declared))?.snapshot.standing).toEqual(declared);
  });

  test('an empty list is a snapshot with nothing standing', () => {
    expect(parseSnapshot(withField('standing', []))?.snapshot.standing).toEqual([]);
  });
});

describe('⚠ `ts` is a time, and it is the time it says it is', () => {
  const withTs = (ts: unknown): unknown => ({ ...body(everythingZero), ts });

  /*
   * ⚠ **F13.** `Date.parse` **rolls an impossible date forward**: `2026-02-30T00:00:00.000Z`
   * matches the ISO shape, parses happily, and lands on 2026-03-02 — a sample placed two days
   * from where it says it is, on the axis §6.7 insists is drawn "against time, not index".
   * `wire.ts` used to claim the format check left only `2026-13-01` to catch, which was a
   * comment naming a property the code did not have.
   */
  test.each([
    ['a day that does not exist', '2026-02-30T00:00:00.000Z'],
    ['the 31st of a 30-day month', '2026-04-31T00:00:00.000Z'],
    ['a 13th month', '2026-13-01T00:00:00.000Z'],
    ['an hour that does not exist', '2026-09-06T24:30:00.000Z'],
  ])('⚠ an impossible calendar date is refused, never rolled forward — %s', (_name, ts) => {
    expect(parseSnapshot(withTs(ts))).toBeNull();
  });

  test('⚠ a leap day that does exist is accepted', () => {
    const parsed = parseSnapshot(withTs('2028-02-29T00:00:00.000Z'));
    expect(parsed?.tsMs).toBe(Date.parse('2028-02-29T00:00:00.000Z'));
  });

  test('a fractional second shorter than three digits still round-trips', () => {
    expect(parseSnapshot(withTs('2026-09-06T14:00:00.5Z'))?.tsMs).toBe(
      Date.parse('2026-09-06T14:00:00.500Z'),
    );
  });
});

describe('a reading of the wrong type is refused', () => {
  const withHost = (over: Record<string, unknown>): unknown => ({
    ...body(everythingZero),
    host: { ...(body(everythingZero)['host'] as object), ...over },
  });

  test('⚠ a temperature sent as a string is not a temperature', () => {
    expect(parseSnapshot(withHost({ cpuTempC: '42' }))).toBeNull();
  });

  test('⚠ a three-valued safety check sent as a string is refused', () => {
    const safety = { ...(body(everythingZero)['safety'] as object), ufwEnforcing: 'yes' };
    expect(parseSnapshot({ ...body(everythingZero), safety })).toBeNull();
  });

  test.each([
    ['too short', [1, 2]],
    ['too long', [1, 2, 3, 4]],
    ['strings', ['1.24', '1.08', '0.91']],
    ['an object', { one: 1, five: 1, fifteen: 1 }],
  ])('⚠ a load average that is not three numbers is refused — %s', (_name, loadAvg) => {
    expect(parseSnapshot(withHost({ loadAvg }))).toBeNull();
  });

  test('⚠ a load average of exactly three numbers is accepted, and null is too', () => {
    expect(parseSnapshot(withHost({ loadAvg: [1.24, 1.08, 0.91] }))).not.toBeNull();
    expect(parseSnapshot(withHost({ loadAvg: null }))?.snapshot.host.loadAvg).toBeNull();
  });

  test('⚠ a hostname sent as a number is refused', () => {
    expect(parseSnapshot(withField('hostname', 7))).toBeNull();
    expect(parseSnapshot(withField('hostname', null))?.snapshot.hostname).toBeNull();
  });

  test('gpus as an object rather than an array is refused', () => {
    expect(parseSnapshot(withField('gpus', { 0: {} }))).toBeNull();
  });

  test('one malformed GPU refuses the whole snapshot rather than dropping a card', () => {
    const gpus = body(everythingZero)['gpus'] as Record<string, unknown>[];
    expect(parseSnapshot(withField('gpus', [...gpus, { index: 1 }]))).toBeNull();
  });

  test('⚠⚠ 12c — `gpus[]` STILL refuses the whole snapshot: row-level leniency is `serving[]` alone', () => {
    // ⚠ The half of §3.4's second ruling that is easiest to over-apply. `gpus[]` looks exactly
    // like `serving[]` — an array of independent readings, one per subject — and dropping a
    // member of it would mint §9's *retired* verdict (*the card has left the machine*) out of
    // a validation failure. The two arrays get opposite treatment on purpose, and this pair of
    // assertions is what says so rather than leaving it to a comment.
    const gpus = body(everythingZero)['gpus'] as Record<string, unknown>[];
    expect(parseSnapshot(withField('gpus', [...gpus, { index: 1 }]))).toBeNull();
    const serving = body(servingPopulated)['serving'] as Record<string, unknown>[];
    expect(
      parseSnapshot({ ...body(servingPopulated), serving: [...serving, { instance: 'x' }] })?.snapshot.serving,
    ).toHaveLength(2);
  });

  test('⚠⚠ 12c — `errors[]` is an array of independent entries and is deliberately NOT row-lenient', () => {
    // §3.4's ruling names `serving[]` and nothing else. Silently dropping a malformed
    // `errors[]` entry would hide the report of a failure behind the report of a failure, so
    // the snapshot is refused exactly as it was before.
    expect(parseSnapshot(withField('errors', [{ source: 'ufw', message: 'x' }, { source: 'nope' }]))).toBeNull();
    expect(parseSnapshot(withField('standing', ['ufw_enforcing', 7]))).toBeNull();
  });
});

describe('⚠⚠ 12c — §3.4’s SECOND ruling: `serving[]` refuses the ROW, not the snapshot', () => {
  /** Three rows: a good one, a broken one, and a good one. */
  const threeRows = (broken: unknown): unknown => {
    const rows = body(servingPopulated)['serving'] as Record<string, unknown>[];
    const third = { ...(rows[0] as Record<string, unknown>), instance: 'split', port: 8082, gpus: [0, 1] };
    return { ...body(servingPopulated), serving: [rows[0], broken, third] };
  };

  /** A row that is otherwise valid, broken in exactly the named fields. */
  const brokenRow = (over: Record<string, unknown>): Record<string, unknown> => ({
    ...(body(servingPopulated)['serving'] as Record<string, unknown>[])[1],
    ...over,
  });

  test('⚠⚠ ONE bad row between TWO good ones: the two render, the one is named, the page survives', () => {
    // *"Drop the offending row, render the rest, and file an `errors[]` entry naming it."*
    // Before this, `parseSnapshot` returned `null` for this body and §6.7 treated the poll as
    // FAILED — no GPU temperature, no fan speed, no SAFETY panel, because one instance's
    // `instance` was of the wrong type.
    //
    // ⚠ The good rows are deliberately UNLIKE each other — a numbered one and a NAMED one —
    // so a reader that survived by keeping "the first row" or "the numbered rows" is caught.
    const parsed = parseSnapshot(threeRows(brokenRow({ instance: 'x', port: 'not a port' })));
    expect(parsed).not.toBeNull();
    expect(parsed?.snapshot.serving?.map((row) => row.instance)).toEqual(['0', 'split']);
    // …and the rest of the machine is still on the page, which is the whole point.
    expect(parsed?.snapshot.host.cpuPct).not.toBeUndefined();
    expect(parsed?.snapshot.safety.ufwEnforcing).not.toBeUndefined();
    expect(parsed?.snapshot.cooling.fan5Rpm).not.toBeUndefined();
  });

  test('⚠⚠ the entry names WHICH row and WHY — the index it arrived at, and every bad field', () => {
    // "Which" is the INDEX in the array as sent, never the `instance`: the identity is one of
    // the things that may be the reason the row was refused, and a refusal that quotes an
    // unusable value tells the reader nothing they can look up.
    const parsed = parseSnapshot(threeRows(brokenRow({ port: 'not a port', ctx: 'lots' })));
    const refusals = parsed?.snapshot.errors.filter((e) => e.message.startsWith('serving[')) ?? [];
    expect(refusals).toHaveLength(1);
    expect(refusals[0]?.message).toBe('serving[1] was dropped: `port`, `ctx` did not validate');
    // ⚠ EVERY bad field, not the first one: a row refused for `port` alone and a row that is
    // wholesale the wrong shape are different diagnoses for the reader deciding what to do.
    expect(refusals[0]?.message).toContain('`ctx`');
  });

  test('⚠ a row that is not an object at all is named too, rather than crashing or being silent', () => {
    for (const notARow of [null, 7, 'llama-server@0', []] as const) {
      const parsed = parseSnapshot(threeRows(notARow));
      expect(parsed?.snapshot.serving).toHaveLength(2);
      expect(parsed?.snapshot.errors.at(-1)?.message).toBe('serving[1] was dropped: the row is not a JSON object');
    }
  });

  test('⚠⚠ a dropped row can NEVER leave the header saying `all healthy` (§9’s aggregate)', () => {
    // The ruling's first consequence, asserted through the function §9's dot is computed from
    // rather than through a comment. `failingSourceCount` counts distinct §3.7 sources with an
    // entry, and 12a's refusal repaints a `normal` reduction as NO BAND while any source is
    // unread — so filing the entry is what makes a dropped row impossible to miss.
    const clean = parseSnapshot(body(everythingZero));
    expect(failingSourceCount(clean?.snapshot ?? null)).toBe(0);
    const dropped = parseSnapshot({ ...body(everythingZero), serving: [{ instance: 'x', port: 'nope' }] });
    expect(dropped?.snapshot.serving).toEqual([]);
    expect(failingSourceCount(dropped?.snapshot ?? null)).toBe(1);
  });

  test('⚠ refusals are APPENDED, so `errors[]`’s existing order and its last-per-source are untouched', () => {
    // §4 pins `errors[]`'s order as the server's concatenation order and `events.ts` reads the
    // LAST message per source. A refusal prepended would re-order every existing entry.
    const rows = body(servingPopulated)['serving'] as Record<string, unknown>[];
    const parsed = parseSnapshot({
      ...body(servingPopulated),
      serving: [rows[0], { instance: 'x' }],
    });
    const messages = parsed?.snapshot.errors.map((e) => e.message) ?? [];
    expect(messages[0]).toBe('connect ECONNREFUSED 127.0.0.1:8081');
    expect(messages.at(-1)).toContain('serving[1] was dropped');
  });

  test('⚠ a refusal carries NO `instance` — the identity may be the very thing that was wrong', () => {
    const parsed = parseSnapshot({ ...body(everythingZero), serving: [{ instance: 'a b' }] });
    const refusal = parsed?.snapshot.errors.at(-1);
    expect(refusal?.message).toContain('`instance`');
    expect(Object.hasOwn(refusal as object, 'instance')).toBe(false);
  });

  test('⚠ `serving: null` and a `serving` that is not an array still refuse the SNAPSHOT', () => {
    // `null` is §3.1's "which instances exist is unknown" — a legal value, preserved. A string
    // or an object is the COLLECTION being wrong rather than a member of it, and there is no
    // row to drop, so nothing has been made lenient here.
    expect(parseSnapshot(withField('serving', null))?.snapshot.serving).toBeNull();
    expect(parseSnapshot(withField('serving', 'llama-server@0'))).toBeNull();
    expect(parseSnapshot(withField('serving', { 0: {} }))).toBeNull();
  });

  test('⚠ an EMPTY serving[] parses to an empty list with no refusal invented', () => {
    const parsed = parseSnapshot(withField('serving', []));
    expect(parsed?.snapshot.serving).toEqual([]);
    expect(parsed?.snapshot.errors.filter((e) => e.message.startsWith('serving['))).toEqual([]);
  });

  test.each([
    ['a number, the OLD contract’s spelling', 0, '0'],
    ['a named identity', 'split', 'split'],
    ['a two-digit number', 12, '12'],
  ])('⚠⚠ 12c — an `instance` that is %s is accepted', (_name, sent, expected) => {
    const rows = body(servingPopulated)['serving'] as Record<string, unknown>[];
    const row = { ...(rows[0] as Record<string, unknown>), instance: sent };
    expect(parseSnapshot({ ...body(servingPopulated), serving: [row] })?.snapshot.serving?.[0]?.instance).toBe(
      expected,
    );
  });

  test.each([
    ['a non-canonical numeral', '01'],
    ['an empty string', ''],
    ['a colon, which would spell a second condition id', 'a:b'],
    ['a space', 'a b'],
    ['an `@`, which would spell a foreign unit name', 'server@0'],
    ['a dot', '0.env'],
    ['a fraction', 1.5],
    ['a negative number', -1],
    ['null — the identity is never nullable', null],
    ['a boolean', true],
  ])('⚠ an `instance` that is %s refuses its row', (_name, sent) => {
    // ⚠ The grammar is `lib/units.ts`'s `isInstanceId`, the SAME predicate `parseInstanceId`
    // applies to a filename — so a server cannot hand a client an identity the client's own
    // discovery would have refused, and a `health:` condition id cannot collide.
    const rows = body(servingPopulated)['serving'] as Record<string, unknown>[];
    const row = { ...(rows[0] as Record<string, unknown>), instance: sent };
    const parsed = parseSnapshot({ ...body(servingPopulated), serving: [row, rows[1]] });
    expect(parsed?.snapshot.serving).toHaveLength(1);
    expect(parsed?.snapshot.errors.at(-1)?.message).toBe('serving[0] was dropped: `instance` did not validate');
  });
});

/**
 * ⚠⚠ **12c/TEST — the COMPATIBILITY SHIM, tested as one.**
 *
 * `instanceId` accepting a JSON number is not a convenience: the frozen `LIVE_BOX_SERVING_WIRE`
 * spells both identities as numbers, so without it the running container loses **every row of
 * every poll**. The handoff asks for the shim's own boundary, spelling by spelling, because the
 * two halves — "a number names the identity its canonical decimal spells" and "a string is
 * judged by the grammar" — have different failure modes and a table mixing them hides both.
 */
describe('⚠⚠ 12c/TEST — the JSON-number bridge, spelling by spelling', () => {
  const instanceOf = (sent: unknown): string | null | undefined => {
    const rows = body(servingPopulated)['serving'] as Record<string, unknown>[];
    const row = { ...(rows[0] as Record<string, unknown>), instance: sent };
    const parsed = parseSnapshot({ ...body(servingPopulated), serving: [row] });
    return parsed?.snapshot.serving?.[0]?.instance ?? null;
  };

  test.each([
    // ⚠ These four are ONE number in JSON. `JSON.parse('0.0')`, `JSON.parse('-0')` and
    // `JSON.parse('1e1')` are `0`, `-0` and `10` — there is no "0.0" to refuse, because the
    // spelling is gone before `parseSnapshot` ever sees it. The shim's rule is about the VALUE,
    // and the value's canonical decimal is the identity. A reader that tried to police the
    // spelling would be policing something it cannot observe.
    ['the number 0 — the old contract, and what the live box sends', 0, '0'],
    ['the string "0" — the new contract', '0', '0'],
    ['0.0, which JSON.parse has already made 0', 0.0, '0'],
    ['-0, whose canonical decimal is "0" and which is NOT < 0', -0, '0'],
    ['1e1, which JSON.parse has already made 10', 1e1, '10'],
    ['the string "split"', 'split', 'split'],
    // ⚠ `0x0` is a legal NAMED identity — `0x0.env` is a filename `parseInstanceId` accepts,
    // and it is not digits-only, so canonicality does not apply. It is in this table rather
    // than the refusals one precisely because `Number('0x0')` is **0**: a bridge written as
    // "coerce, then check" would have merged it INTO instance `0` and lost a row. Here it is
    // its own instance, sorts among the named ones, and `servingUnitName` misses on it loudly.
    ['the string "0x0", whose `Number()` is 0 but which is a NAME', '0x0', '0x0'],
  ])('⚠⚠ an `instance` sent as %s is read as the identity it names', (_name, sent, expected) => {
    expect(instanceOf(sent)).toBe(expected);
  });

  test.each([
    // ⚠ `"00"` and `" 0"` are the two that a `Number()` would have accepted and this must not:
    // `Number('00')` is 0 and `Number(' 0')` is 0, so a bridge written as "coerce, then check"
    // rather than "check the value, then spell it" admits both, and `'00'` then sits on the
    // panel beside `'0'` as an unrelated process with its own React key and condition id.
    ['"00" — a string, and digits-only strings must be CANONICAL', '00'],
    ['" 0" — a string with whitespace the grammar excludes', ' 0'],
    ['"+0" — a string the grammar excludes', '+0'],
    ['1e21, whose String() is "1e+21" and is no identity at all', 1e21],
    ['Number.MAX_SAFE_INTEGER + 1, which is not a SAFE integer', 9_007_199_254_740_992],
    // ⚠⚠ 12c/RECONCILE (`12c-A11` #1) — the three NEGATIVES, which were refused by nothing
    // that any test could see. `instanceId` carried `|| value < 0` beside `isSafeInteger`, and
    // the clause was **provably dead**: `String()` prefixes a `-`, so canonicality already
    // refuses every one of these. Reverting it left the whole suite green, which is the whole
    // complaint — the rule had two spellings and only one of them was checked. The guard is
    // gone and these three are the check.
    ['-1, whose String() is "-1" and which canonicality refuses', -1],
    ['-2, the same one step further out', -2],
    ['-1.5, neither an integer nor canonical', -1.5],
  ])('⚠ an `instance` sent as %s refuses its row', (_name, sent) => {
    expect(instanceOf(sent)).toBeNull();
  });

  test('⚠⚠ the two spellings of ONE numeric identity produce the SAME row, field for field', () => {
    // §3.4 fixes a numeric identity as its canonical decimal string, so `0` and `"0"` are two
    // spellings of one instance and must produce one page. Asserted as `toEqual` over the whole
    // parsed row rather than over `instance` alone: the claim is that nothing else about the
    // row moved either, which is what "the live box renders as it does today" means.
    const rows = body(servingPopulated)['serving'] as Record<string, unknown>[];
    const asNumber = parseSnapshot({
      ...body(servingPopulated),
      serving: [{ ...(rows[0] as Record<string, unknown>), instance: 0 }],
    });
    const asString = parseSnapshot({
      ...body(servingPopulated),
      serving: [{ ...(rows[0] as Record<string, unknown>), instance: '0' }],
    });
    expect(asNumber?.snapshot.serving).toEqual(asString?.snapshot.serving);
    // …and neither was dropped on the way, which a pair of `null`s would also satisfy.
    expect(asNumber?.snapshot.serving).toHaveLength(1);
    expect(asNumber?.snapshot.errors.filter((e) => e.message.startsWith('serving['))).toEqual([]);
  });

  test('⚠ the frozen LIVE BOX bytes still validate, and they are still NUMBERS in the fixture', () => {
    // The skew claim's only reachable direction: a client NEWER than its server. The other —
    // a client older than 12c meeting `"instance": "split"` — cannot be tested here, because
    // the code that would refuse it no longer exists in this tree; it is `integer()`'s
    // behaviour in a build that predates this file, and §4 closes the window on reload.
    // ⚠ The second assertion is the anti-vacuity term: if the fixture were ever "fixed" to
    // spell its identities as strings, the first assertion would still pass and would be
    // testing nothing at all.
    const live = JSON.parse(LIVE_BOX_SERVING_WIRE) as Record<string, unknown>[];
    expect(live.map((row) => row['instance'])).toEqual([0, 1]);
    const parsed = parseSnapshot({ ...body(everythingZero), serving: live });
    expect(parsed?.snapshot.serving?.map((row) => row.instance)).toEqual(['0', '1']);
    expect(parsed?.serving.read).toBe('all');
  });
});

/**
 * ⚠⚠ **12c/TEST — a dropped row must not be read as an instance that LEFT THE MACHINE.**
 *
 * `servingListOf`'s own doc gives the argument for why `gpus[]` is not row-lenient: *"§9 makes
 * a card's absence from a `gpus[]` that was read mean **retired** — the card has left the
 * machine — so silently dropping a malformed GPU row would mint that verdict from a validation
 * failure."* The same sentence is true of `serving[]` through `SERVING_ENUMERATION`, and filing
 * an `errors[]` entry does not answer it: the entry keeps §9's HEADER honest, which is a
 * different claim from what §9 does to the ROW.
 */
describe('⚠⚠ 12c/TEST — a refused row is NOT READ, which is not the same as NOT THERE', () => {
  const withBrokenRows = (howMany: number): Record<string, unknown> => {
    const rows = body(servingPopulated)['serving'] as Record<string, unknown>[];
    return {
      ...body(servingPopulated),
      serving: rows.map((row, i) => (i < howMany ? { ...row, port: 'nope' } : row)),
    };
  };

  test('⚠⚠ `WireSnapshot.serving` says whether the rows are ALL of them, and names how many were dropped', () => {
    // ⚠ The fact is carried on `WireSnapshot` rather than recovered from `errors[]`, because
    // recovering it means matching `serving[…] was dropped` in a message — the text-matching
    // this project forbids everywhere else — and `llama-env` is also the SERVER's source for
    // ordinary env problems, which must not suppress anything.
    expect(parseSnapshot(body(everythingZero))?.serving.read).toBe('all');
    // ⚠ `serving: null` is a third state, not a fourth spelling of complete: §3.1's *which
    // instances exist is unknown*. It must not read as `all`, or §9 retires on a collector
    // failure, and it must not read as `partial`, or nothing can ever retire again.
    expect(parseSnapshot(withField('serving', null))?.serving.read).toBe('none');
    // ⚠ An empty `serving[]` is READ and declares none. Retiring is the right answer there,
    // and an enumeration that could not tell the two apart would suppress it.
    expect(parseSnapshot(withField('serving', []))?.serving).toEqual({ read: 'all', rows: [] });
    expect(parseSnapshot(withBrokenRows(1))?.serving).toMatchObject({ read: 'partial', refused: 1 });
    expect(parseSnapshot(withBrokenRows(2))?.serving).toMatchObject({ read: 'partial', refused: 2 });
  });

  test('⚠⚠ the enumeration holds the SAME array as `snapshot.serving`, so the two cannot drift', () => {
    // ⚠ The one structural risk of carrying the rows beside the snapshot: two copies that
    // disagree. `parseSnapshot` builds both from one value, and this is the assertion that
    // says so — by IDENTITY, which a `toEqual` of two independently-built lists would pass.
    const parsed = parseSnapshot(body(servingPopulated))!;
    expect(parsed.serving.read).toBe('all');
    expect(parsed.serving.read === 'none' ? null : parsed.serving.rows).toBe(parsed.snapshot.serving);
    const refused = parseSnapshot(withBrokenRows(1))!;
    expect(refused.serving.read === 'none' ? null : refused.serving.rows).toBe(
      refused.snapshot.serving,
    );
  });

  test('⚠⚠ a refused row is filed under `llama-env`, and that is the source that reaches the SERVING panel', () => {
    // ⚠⚠ `12c-A4`: this decision — `wire.ts`'s `WIRE_REFUSAL_SOURCE`, argued at length in the
    // file and recorded as a spec silence — had NO test. Measured by the adversarial: setting
    // it to `'llama-models'`, `'dbus'` or `'ufw'` each left 3686 tests passing, and with
    // `'ufw'` the note explaining a vanished SERVING row renders under SAFETY instead.
    //
    // Both halves are asserted, because neither alone is the claim: the literal (which
    // `'llama-models'` would pass on panels alone) and the PROPERTY it was argued from —
    // *"it reaches exactly the SERVING panel, which is the panel a missing row is missing
    // from"* — which `12c-build.md` §6 Q4 states and nothing checked.
    const snapshot = parseSnapshot(withBrokenRows(1))!.snapshot;
    const refusal = snapshot.errors.filter((e) => e.message.startsWith('serving['));
    expect(refusal.map((e) => e.source)).toEqual(['llama-env']);
    // …and it arrives at SERVING and at no other panel. Asserted through `errorsForPanel`,
    // which is the join that actually renders, rather than through the source name a second
    // time — `'llama-models'` would pass the line above's shape and this one too, which is
    // why BOTH are here.
    const reaches = (['header', 'gpu', 'cpu', 'memory', 'cooling', 'serving', 'storage', 'safety'] as const)
      .filter((panel) =>
        errorsForPanel(snapshot, panel).some((e) => e.message.startsWith('serving[')),
      );
    expect(reaches).toEqual(['serving']);
    // ⚠ The entry carries NO `instance` — the identity may be the reason for the refusal — so
    // it renders under the rows rather than beside one.
    expect('instance' in (refusal[0] as object)).toBe(false);
  });

  test('⚠⚠ ONE refused row suppresses the WHOLE enumeration, because the client cannot say which', () => {
    // A row may have been refused FOR ITS `instance` — that is one of the seven fields — so
    // there is no identity to exclude and no way to narrow the suppression to the row. The
    // client knows only that it failed to read some of them.
    const one = parseSnapshot(withBrokenRows(1));
    expect(one?.snapshot.serving?.map((row) => row.instance)).toEqual(['1']);
    expect([...enumerationsRead(one!.snapshot, one!.serving)]).toEqual([GPU_ENUMERATION]);
    // …and with nothing refused the enumeration is read, which is the other half of the rule.
    const clean = parseSnapshot(body(servingPopulated));
    expect([...enumerationsRead(clean!.snapshot, clean!.serving)].sort()).toEqual([
      GPU_ENUMERATION,
      SERVING_ENUMERATION,
    ]);
  });

  test('⚠⚠ a refused row leaves its ALARM in the ledger instead of retiring it at `normal`', () => {
    // ⚠⚠ THE MEASUREMENT THIS TEST EXISTS FOR. Before the `servingRowsRefused` argument, this
    // sequence ended with `retired = [unit:llama-server@1.service/alarm, health:1/alarm, …]`:
    // §9 was told the enumeration had been read, both subjects were missing from it, and
    // `lib/conditions.ts`'s own table calls that *"retired — it has left the machine, and it
    // leaves the ledger, the dot and the count"*. `events.ts` logs a retirement at severity
    // `normal`. So a row refused for a bad `port` silently DELETED a live alarm.
    //
    // ⚠ Six polls, because the absence has to clear §6.4's ten-second debounce first — a
    // shorter sequence passes whatever the rule is, which is how this stayed invisible.
    const healthy = parseSnapshot(wireBodyOf(servingPopulated));
    let state = EMPTY_CONDITION_STATE;
    let at = 1_000;
    for (let i = 0; i < 4; i += 1) {
      state = observePoll(state, conditionsFrom(healthy!.snapshot), NOTHING_STANDING, at, {
        enumerationsRead: enumerationsRead(healthy!.snapshot, healthy!.serving),
      }).state;
      at += 5_000;
    }
    const refused = parseSnapshot(withBrokenRows(2));
    expect(refused?.snapshot.serving).toEqual([]);

    const retired: string[] = [];
    const stale: string[] = [];
    let displayed: readonly { id: string; stale: boolean }[] = [];
    for (let i = 0; i < 4; i += 1) {
      const poll = observePoll(state, conditionsFrom(refused!.snapshot), NOTHING_STANDING, at, {
        enumerationsRead: enumerationsRead(refused!.snapshot, refused!.serving),
      });
      retired.push(...poll.retired.map((c) => c.id));
      stale.push(...poll.wentStale.map((c) => c.id));
      displayed = poll.displayed;
      state = poll.state;
      at += 5_000;
    }

    // ⚠ Asserted on the ids, not on a count: "nothing retired" and "nothing was ever there"
    // are the same number and different facts, so the stale list is asserted too.
    expect(retired).toEqual([]);
    expect(stale.sort()).toEqual(['health:0', 'health:1', 'unit:llama-server@0.service', 'unit:llama-server@1.service']);
    // The alarm is still in the ledger, marked stale — it keeps its band and its place in the
    // count, which is exactly what a retirement would have taken away.
    const alarmRow = displayed.find((c) => c.id === 'health:1');
    expect(alarmRow?.stale).toBe(true);
    expect(displayed.filter((c) => c.id.startsWith('health:')).map((c) => c.id)).toEqual(['health:0', 'health:1']);
  });

  test('⚠ a genuinely EMPTY serving[] still retires, so the fix did not disable §9’s verdict', () => {
    // The other side of the boundary, and the reason `servingRowsRefused` is a count rather
    // than "is `serving` shorter than it used to be". A server that enumerated and found none
    // has ANSWERED; the instances really are gone, and their conditions must leave the ledger.
    const healthy = parseSnapshot(wireBodyOf(servingPopulated));
    let state = EMPTY_CONDITION_STATE;
    let at = 1_000;
    for (let i = 0; i < 4; i += 1) {
      state = observePoll(state, conditionsFrom(healthy!.snapshot), NOTHING_STANDING, at, {
        enumerationsRead: enumerationsRead(healthy!.snapshot, healthy!.serving),
      }).state;
      at += 5_000;
    }
    const none = parseSnapshot(withField('serving', []));
    const retired: string[] = [];
    for (let i = 0; i < 4; i += 1) {
      const poll = observePoll(state, conditionsFrom(none!.snapshot), NOTHING_STANDING, at, {
        enumerationsRead: enumerationsRead(none!.snapshot, none!.serving),
      });
      retired.push(...poll.retired.map((c) => c.id));
      state = poll.state;
      at += 5_000;
    }
    expect(retired.sort()).toEqual([
      'health:0',
      'health:1',
      'unit:llama-server@0.service',
      'unit:llama-server@1.service',
    ]);
  });
});

describe('⚠⚠ 12b — §3.4’s `gpus` is ADDITIVE, proven against the body the live box really sends', () => {
  /** The frozen bytes, spliced into an otherwise-valid snapshot. */
  const withLiveBoxServing = (): Record<string, unknown> => ({
    ...body(everythingZero),
    serving: JSON.parse(LIVE_BOX_SERVING_WIRE) as unknown,
  });

  test('⚠ the DEPLOYED server’s own serving[] validates — six keys, and `gpus` is not among them', () => {
    // Not a fixture written to match this change: `LIVE_BOX_SERVING_WIRE` is the PRE-CHANGE
    // collector's output, run on the box's real `0.env`/`1.env` and its real `/v1/models`
    // bodies (2026-09-17). If `gpus` were spelled `readonly number[] | null` — required, like
    // every other member of this contract — this exact body would be REFUSED, and the running
    // container would go dark on the first poll after a client-only deploy.
    const parsed = parseSnapshot(withLiveBoxServing());
    expect(parsed).not.toBeNull();
    const rows = parsed?.snapshot.serving ?? [];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['ctx', 'health', 'instance', 'model', 'port', 'unitState']);
    }
  });

  test('⚠⚠ 12b-RECONCILE — the FIXTURE’S OWN BYTES are the evidence, and this is what asserts them', () => {
    /*
     * ⚠ `LIVE_BOX_SERVING_WIRE`'s whole claim is that it was CAPTURED rather than written, and
     * `lib/fixtures.ts` states the proof in prose: *"that is why the context is 163840 … those
     * are the box's values on the day, not this repo's older 131072 fixtures."* Before this
     * test, `163840` occurred in exactly three places in the tree — that sentence and the
     * fixture twice. **No test asserted it** (12b-A6). Regenerating the fixture from a dev box
     * (`ctx: 131072`), renaming the model or moving the ports left all 3634 tests green, and
     * the one asset in this tree whose value is that it is evidence had nothing protecting the
     * evidence.
     *
     * ⚠ And the six-key guard beside it is about the PARSER'S OUTPUT — an object
     * `servingInstanceOf` builds itself — so it constrains `gpus` and nothing else. This one
     * reads the fixture's own parsed bytes, which is where a seventh key or a changed reading
     * would appear.
     */
    const rows = JSON.parse(LIVE_BOX_SERVING_WIRE) as Record<string, unknown>[];
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['ctx', 'health', 'instance', 'model', 'port', 'unitState']);
      // The box on 2026-09-17: `/etc/llama-server/<i>.env` says `CTX=163840` and
      // `ALIAS=qwen3.6-27b`, and `:8080/v1/models` answers with that same id. Every other
      // serving fixture in this tree carries 131072, which is what makes this number evidence.
      expect(row['ctx']).toBe(163840);
      expect(row['model']).toBe('qwen3.6-27b');
      expect(row['unitState']).toBeNull();
      expect(row['health']).toBe('ok');
    }
    expect(rows.map((row) => row['instance'])).toEqual([0, 1]);
    expect(rows.map((row) => row['port'])).toEqual([8080, 8081]);
  });

  test('⚠⚠ 12b-RECONCILE — a PRESENT `gpus` key whose value is `undefined` refuses the row, never reads as absent', () => {
    // ⚠ `optionalCardList` asks `Object.hasOwn`, not `source[key] === undefined`, and 12b's
    // adversarial reverted it with the whole suite green (`R2`). The two answers are opposite:
    // `hasOwn` says the row declared something unreadable — which is not one of §3.4's three
    // values, so the row is refused like a bad `port` — while `=== undefined` says the server
    // has never heard of the field and hands that snapshot the index-join fallback.
    // JSON cannot carry `undefined`, so this shape reaches `parseSnapshot` only from a
    // JavaScript caller — which is exactly what `app/api/telemetry`'s own tests and every
    // spread in this project are.
    const rows = JSON.parse(LIVE_BOX_SERVING_WIRE) as Record<string, unknown>[];
    const withPresentUndefined = rows.map((row) => ({ ...row, gpus: undefined }));
    expect(Object.hasOwn(withPresentUndefined[0] ?? {}, 'gpus')).toBe(true);
    // ⚠ 12c — the ROW is refused, not the snapshot, and the entry names `gpus` as the reason.
    const parsed = parseSnapshot({ ...body(everythingZero), serving: withPresentUndefined });
    expect(parsed?.snapshot.serving).toEqual([]);
    expect(parsed?.snapshot.errors.map((e) => e.message)).toEqual([
      'serving[0] was dropped: `gpus` did not validate',
      'serving[1] was dropped: `gpus` did not validate',
    ]);
    // …while the same rows with the key truly absent validate whole, which is the fixture above.
    expect(parseSnapshot({ ...body(everythingZero), serving: rows })?.snapshot.serving).toHaveLength(2);
  });

  test('⚠ the validated rows carry NO `gpus` key — absence survives validation, never becoming null', () => {
    // The one-character mistake this test exists for. `field(value,'gpus') ?? null` reads a
    // missing key as `null`, which §3.4 says is a FAILED READ — an em dash and an `errors[]`
    // entry — on a server that is behaving perfectly. `Object.hasOwn` is what `servedBy`
    // reads, so a present-but-undefined key would also send this snapshot down the
    // new-server path and lose the index-join fallback.
    const rows = parseSnapshot(withLiveBoxServing())?.snapshot.serving ?? [];
    for (const row of rows) {
      expect(Object.hasOwn(row, 'gpus')).toBe(false);
      expect(row.gpus).toBeUndefined();
    }
  });

  test.each([
    ['one card', [0], [0]],
    ['the other card', [1], [1]],
    ['both cards, split mode', [0, 1], [0, 1]],
    ['no card at all — CUDA_VISIBLE_DEVICES=', [], []],
  ])('⚠ a `gpus` of %s survives the wire exactly', (_name, sent, expected) => {
    const rows = body(servingPopulated)['serving'] as Record<string, unknown>[];
    const first = { ...(rows[0] as Record<string, unknown>), gpus: sent };
    const parsed = parseSnapshot({ ...body(servingPopulated), serving: [first, rows[1]] });
    expect(parsed?.snapshot.serving?.[0]?.gpus).toEqual(expected);
  });

  test('⚠ `gpus: null` is PRESERVED as null and is not the same outcome as an absent key', () => {
    // §3.4: "`null` and absent must NOT be collapsed." `null` is a unit that exists and could
    // not be read; absent is an older contract. This is the only test in the file that asserts
    // two different wire shapes produce two different — not merely non-crashing — results.
    const rows = body(servingPopulated)['serving'] as Record<string, unknown>[];
    const declaredNull = { ...(rows[0] as Record<string, unknown>), gpus: null };
    const parsed = parseSnapshot({ ...body(servingPopulated), serving: [declaredNull] });
    const row = parsed?.snapshot.serving?.[0];
    expect(row?.gpus).toBeNull();
    expect(Object.hasOwn(row ?? {}, 'gpus')).toBe(true);
  });

  test.each([
    ['a string', '0,1'],
    ['a number', 0],
    ['an object', { 0: true }],
    ['a member that is not a number', [0, '1']],
    ['a fractional member', [0.5]],
    ['a negative member', [-1]],
    ['a null member', [null]],
  ])('⚠ a `gpus` of %s refuses the ROW, and never drops a member from the list', (_name, sent) => {
    // Never silently dropping the member: a card missing from an otherwise plausible list
    // would render as "no instance serves this card", which is a claim rather than a gap.
    // `-1` and `0.5` are in the list because `integer()` alone accepts both and neither can
    // ever equal a `Gpu.index`.
    //
    // ⚠ 12c — what changed is the unit of refusal. The bad row goes, the GOOD row beside it
    // stays, and the entry says which one went and why.
    const rows = body(servingPopulated)['serving'] as Record<string, unknown>[];
    const bad = { ...(rows[0] as Record<string, unknown>), gpus: sent };
    const parsed = parseSnapshot({ ...body(servingPopulated), serving: [bad, rows[1]] });
    expect(parsed).not.toBeNull();
    expect(parsed?.snapshot.serving).toHaveLength(1);
    expect(parsed?.snapshot.serving?.[0]?.instance).toBe('1');
    expect(parsed?.snapshot.errors.at(-1)?.message).toBe('serving[0] was dropped: `gpus` did not validate');
  });
});
