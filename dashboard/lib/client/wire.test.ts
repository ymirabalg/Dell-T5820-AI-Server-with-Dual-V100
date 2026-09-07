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
  everythingZero,
  nothingReadable,
  pwm5NodeAbsent,
  pwm5Unreadable,
  servingPopulated,
} from '../fixtures';
import { wireBodyOf } from './fake-env';
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

  test('⚠ a HealthState outside ok/unhealthy/unreachable is refused', () => {
    const instances = body(servingPopulated)['serving'] as Record<string, unknown>[];
    const bad = instances.map((i) => ({ ...i, health: 'degraded' }));
    expect(parseSnapshot({ ...body(servingPopulated), serving: bad })).toBeNull();
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
  ])('⚠ %s is refused rather than rolled forward', (_name, ts) => {
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
});
