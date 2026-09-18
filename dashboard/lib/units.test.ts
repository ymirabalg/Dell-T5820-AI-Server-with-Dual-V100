/**
 * ⚠⚠ **12c — `lib/units.ts` stopped being two constants and became a contract**, so it gets
 * its own tests.
 *
 * Three rules live in that file now and each one is load-bearing in a different place:
 *
 * | rule | who depends on it |
 * |---|---|
 * | {@link isInstanceId} — the identity grammar | `parseInstanceId` (a filename) and `wire.ts` (a wire value), which must be ONE rule |
 * | {@link servingUnitName} — a MAPPING that can miss | §6.4's join key, `collectServing`'s D-Bus question, the SERVING row's label |
 * | {@link compareInstances} — the ORDER | §6.2's row order, and *first claimant wins* in §6.2's inverted join |
 *
 * ⚠ **The mapping is the one where every wrong answer is silent.** A unit name that does not
 * exist is not an error on the bus: systemd reports it `inactive`, which reads as a stopped
 * service. So the tests below assert `null` for an unmappable identity rather than asserting
 * that some string comes back.
 */

import { describe, expect, test } from 'vitest';

import {
  FAN_SERVICE_UNIT,
  INSTANCE_ID,
  NAMED_INSTANCES,
  compareInstances,
  isInstanceId,
  isNumericInstance,
  servingUnitLabel,
  servingUnitName,
} from './units';

describe('⚠⚠ 12c — the identity grammar, spelled ONCE for both sides of the wire', () => {
  test.each([
    ['0', true],
    ['1', true],
    ['10', true],
    ['split', true],
    ['SPLIT', true],
    ['llama-split', true],
    ['a_b', true],
    ['0-split', true],
    ['', false],
    ['01', false],
    ['007', false],
    ['1.0', false],
    ['1 ', false],
    ['a b', false],
    ['a:b', false],
    ['a@b', false],
    ['a/b', false],
    ['-1', false],
    ['_x', false],
    ['naïve', false],
  ])('isInstanceId(%j) is %j', (value, expected) => {
    expect(isInstanceId(value)).toBe(expected);
  });

  test('⚠ a digits-only identity is either CANONICAL or refused — never read as a name', () => {
    // The third outcome is the wrong one, and it is the one a two-line implementation reaches:
    // `INSTANCE_ID.test('01')` is true, so a grammar check alone admits `01` as a NAMED
    // instance. It would then sort behind `split` (`compareInstances` calls it a name), spell
    // no unit name at all, and sit on the panel beside `1` as an unrelated process.
    expect(INSTANCE_ID.test('01')).toBe(true);
    expect(isNumericInstance('01')).toBe(false);
    expect(isInstanceId('01')).toBe(false);
  });

  test('⚠ every character the grammar excludes is excluded for a NAMED reason', () => {
    // §6.4 builds `kind:subject`, so a `:` in an identity is a second spelling of another id.
    expect(isInstanceId('health:0')).toBe(false);
    // `llama-server@<i>.service` — an identity holding `@` or `.` can spell a foreign unit.
    expect(isInstanceId('server@0')).toBe(false);
    expect(isInstanceId('0.env')).toBe(false);
  });
});

describe('⚠⚠ 12c — `servingUnitName` is a MAPPING, and a miss must be null rather than a guess', () => {
  test('a numbered identity keeps §6.4’s template exactly', () => {
    expect(servingUnitName('0')).toBe('llama-server@0.service');
    expect(servingUnitName('1')).toBe('llama-server@1.service');
    expect(servingUnitName('12')).toBe('llama-server@12.service');
  });

  test('⚠⚠ `split` is `llama-split.service`, NOT `llama-server@split.service`', () => {
    // `SERVING-MODES.md` §2: "not templated, one instance." A template would answer a unit
    // name that exists nowhere, systemd would answer `inactive` about it without complaint,
    // and the SERVING row would show a stopped service for a process that is up.
    expect(servingUnitName('split')).toBe('llama-split.service');
    expect(servingUnitName('split')).not.toBe('llama-server@split.service');
  });

  test('⚠⚠ an identity the table does not know answers NULL — the miss the collector makes loud', () => {
    // `default.env` is a legal instance filename and there is no `llama-default.service`.
    // Returning a plausible name here is the silent wrong answer this function exists to
    // refuse; `collectServing` turns the `null` into one `errors[]` entry per poll.
    expect(servingUnitName('default')).toBeNull();
    expect(servingUnitName('spare')).toBeNull();
    // ⚠ Case matters, because systemd unit names are case-sensitive: `SPLIT` is not `split`.
    expect(servingUnitName('SPLIT')).toBeNull();
  });

  test('⚠ the LABEL is derived from the unit name, never spelled a second time', () => {
    // 12b's survey: "four operator-facing strings would NAME A UNIT THAT DOES NOT EXIST."
    expect(servingUnitLabel('0')).toBe('llama-server@0');
    expect(servingUnitLabel('split')).toBe('llama-split');
    // A miss renders the identity ALONE — not `llama-server@default`.
    expect(servingUnitLabel('default')).toBe('default');
    for (const id of ['0', '1', 'split']) {
      expect(`${servingUnitLabel(id)}.service`).toBe(servingUnitName(id));
    }
  });

  test('the fan service name is untouched by any of this', () => {
    expect(FAN_SERVICE_UNIT).toBe('gpu-fan-control.service');
  });
});

describe('⚠⚠ 12c — the ORDER, which is what *first claimant wins* means in §6.2’s join', () => {
  test('⚠ numbered instances sort by VALUE, so 10 follows 2', () => {
    expect(['10', '2', '0'].sort(compareInstances)).toEqual(['0', '2', '10']);
  });

  test('⚠ every numbered instance precedes every named one, however it spells itself', () => {
    // `abc` sorts before `split` and BOTH sort after `10` — a plain lexical order would put
    // `10` second and `abc` first, and a plain numeric one cannot compare `abc` at all.
    expect(['split', 'abc', '10', '0'].sort(compareInstances)).toEqual(['0', '10', 'abc', 'split']);
  });

  test('named instances sort by code point', () => {
    expect(['split', 'spare', 'Split'].sort(compareInstances)).toEqual(['Split', 'spare', 'split']);
  });

  test('⚠⚠ it is a TOTAL order on distinct identities — no two of them compare equal', () => {
    // The property `servedBy` rests on: with a total order, a SET of identities has exactly
    // one ordering, so the answer cannot depend on the order the rows arrived in. A
    // comparator that returned 0 for two different identities would make `Array.sort`
    // implementation-defined between them and hand the join a coin flip.
    const ids = ['0', '1', '2', '10', 'abc', 'spare', 'split', 'Split'];
    for (const a of ids) {
      for (const b of ids) {
        if (a === b) expect(compareInstances(a, b)).toBe(0);
        else expect(compareInstances(a, b)).not.toBe(0);
      }
    }
  });

  test('⚠ it is ANTISYMMETRIC — swapping the arguments flips the sign', () => {
    const ids = ['0', '10', 'abc', 'split'];
    for (const a of ids) {
      for (const b of ids) {
        // `+ 0` normalises `-0`, which `Object.is` distinguishes and nothing here means to.
        expect(Math.sign(compareInstances(a, b)) + 0).toBe(-Math.sign(compareInstances(b, a)) + 0);
      }
    }
  });

  test('⚠⚠ the sorted result is a function of the SET, not of the input order', () => {
    // Three different arrivals of the same identities. `readDir` promises no order, so an
    // order inherited from the listing would make which instance a GPU card names depend on
    // how the filesystem happened to answer that poll.
    const expected = ['0', '2', '10', 'abc', 'split'];
    expect(['split', '10', '0', 'abc', '2'].sort(compareInstances)).toEqual(expected);
    expect(['2', 'abc', 'split', '0', '10'].sort(compareInstances)).toEqual(expected);
    expect([...expected].reverse().sort(compareInstances)).toEqual(expected);
  });

  test('⚠⚠ it is TRANSITIVE, which totality and antisymmetry do not imply', () => {
    // `Array.prototype.sort` is only defined for a consistent comparator, and an intransitive
    // one produces an order that depends on which pairs the engine happens to compare — the
    // same non-determinism §1.4 exists to remove, arriving by a route the two properties
    // already tested cannot see.
    //
    // ⚠⚠ **`1x` is the identity that makes this test able to fail.** Drop the numbers-before-
    // names branch and fall through to one lexical comparison — the obvious simplification —
    // and `10 < 1x` (lexically), `1x < 2` (lexically), `2 < 10` (numerically): a **cycle**, on
    // three legal identities. Antisymmetry and totality both survive it, which is exactly why
    // they are not enough. A set of only round numbers and word-shaped names cannot produce
    // one, and that is the fixture this test would otherwise have had.
    const ids = ['0', '1', '2', '10', '1x', '01', '0-split', 'abc', 'split', 'Split'];
    for (const a of ids) {
      for (const b of ids) {
        for (const c of ids) {
          if (compareInstances(a, b) < 0 && compareInstances(b, c) < 0) {
            expect(compareInstances(a, c)).toBeLessThan(0);
          }
        }
      }
    }
  });

  test('⚠⚠ a numeric-LOOKING identity that is not canonical sorts as a NAME, by code point', () => {
    // `01` is refused by `isInstanceId` at both doors, so it cannot arrive from a filename or
    // from the wire — but `compareInstances` is a total order on strings and must still be
    // one. `isNumericInstance('01')` is false, so it is a name: after every number, and before
    // `split` because `'0' < 's'`. A comparator that asked `/^[0-9]+$/` instead would call it
    // numeric, `Number('01') - Number('1')` would be **0**, and two distinct identities would
    // compare EQUAL — which is exactly the totality this order is not allowed to lose.
    expect(['split', '01', '10', '2'].sort(compareInstances)).toEqual(['2', '10', '01', 'split']);
    expect(compareInstances('01', '1')).not.toBe(0);
    expect(compareInstances('01', 'split')).toBeLessThan(0);
  });

  test('⚠ every ORDERING of that set sorts to the same list — checked over all 24', () => {
    // The set-not-order property, with the identity that straddles the branch in it. The
    // existing case uses `0, 2, 10, abc, split`, all of which a lexical-then-numeric mix
    // happens to place correctly from some starting orders.
    const ids = ['2', '10', '01', 'split'];
    const expected = ['2', '10', '01', 'split'];
    const permute = (items: readonly string[]): string[][] =>
      items.length <= 1
        ? [[...items]]
        : items.flatMap((item, i) =>
            permute([...items.slice(0, i), ...items.slice(i + 1)]).map((rest) => [item, ...rest]),
          );
    const orders = permute(ids);
    expect(orders).toHaveLength(24);
    for (const order of orders) expect([...order].sort(compareInstances)).toEqual(expected);
  });
});

/**
 * ⚠⚠ **12c/RECONCILE — the two claims this module makes about itself that were NOT true.**
 *
 * `12c-A8`: *"Two different identities never compare equal … a set of identities has exactly
 * one ordering under this comparator, independent of the order they arrived in."* Measured
 * false — `Number('9007199254740993') - Number('9007199254740992')` is **0**, and a 400-digit
 * pair gives **NaN**, which leaves `Array.prototype.sort` implementation-defined. A tie sends
 * `servedBy` to array position, so the same rows in two orders put different models on a card.
 *
 * `12c-A11` #2: the `endsWith('.service')` guard in {@link servingUnitLabel} was **provably
 * dead** and reverting it left the suite green. It is gone; the invariant it pretended to
 * check is asserted here instead, over the mapping's own table.
 */
describe('⚠⚠ 12c/RECONCILE — the comparator is total for every identity the GRAMMAR admits', () => {
  const big = '9007199254740993'; // 2^53 + 1 — distinct from 2^53 as a string, equal as a double
  const bigger = '9007199254740992';

  test('⚠⚠ two identities past `Number.MAX_SAFE_INTEGER` do NOT compare equal', () => {
    // ⚠ Reachable: `isInstanceId` admits a canonical decimal of ANY length and `parseInstanceId`
    // admits the same filename, so `9007199254740993.env` is a legal instance on both sides of
    // the wire. Under `Number(a) - Number(b)` this returned 0 — two distinct subjects tying, so
    // the join fell back to the order the rows happened to arrive in.
    expect(isInstanceId(big)).toBe(true);
    expect(isInstanceId(bigger)).toBe(true);
    expect(compareInstances(big, bigger)).toBeGreaterThan(0);
    expect(compareInstances(bigger, big)).toBeLessThan(0);
  });

  test('⚠⚠ a 400-digit identity compares FINITELY — no NaN, which `Array.sort` would honour silently', () => {
    const huge = '1'.repeat(400);
    const huger = '2'.repeat(400);
    expect(Number.isNaN(compareInstances(huge, huger))).toBe(false);
    expect(compareInstances(huge, huger)).toBeLessThan(0);
    // …and a longer canonical decimal is always the larger number, which is the whole rule.
    expect(compareInstances('9', '10')).toBeLessThan(0);
    expect(compareInstances('1'.repeat(30), '9')).toBeGreaterThan(0);
  });

  test('⚠ ties happen for EQUAL identities and for nothing else, over a set that straddles every branch', () => {
    // The property `servedBy`'s claimant reduce rests on, asserted as itself: `compare(a,b) === 0`
    // iff `a === b`. A `Number()` comparator fails it twice over — at the precision ceiling and
    // at `Infinity - Infinity`.
    const ids = ['0', '1', '9', '10', '01', big, bigger, '1'.repeat(30), 'split', 'spare', 'a'];
    for (const a of ids) {
      for (const b of ids) {
        expect(compareInstances(a, b) === 0).toBe(a === b);
        if (a !== b) expect(Math.sign(compareInstances(a, b))).toBe(-Math.sign(compareInstances(b, a)));
      }
    }
  });

  test('⚠⚠ every unit name this mapping can produce ends in `.service`, which is what the LABEL strips', () => {
    // ⚠ `servingUnitLabel` slices a fixed six characters off the end. The ternary that used to
    // guard that was unreachable — every value the numeric template and `NAMED_UNITS` produce
    // ends in `.service` — so reverting it changed nothing and it protected nothing. The
    // invariant is real and now checked over the TABLE's own keys rather than a list retyped
    // here, so a `llama-split.socket` added later is a red test instead of the label `llama-spl`.
    expect(NAMED_INSTANCES.length).toBeGreaterThan(0);
    for (const instance of [...NAMED_INSTANCES, '0', '7', '10']) {
      const unit = servingUnitName(instance);
      expect(unit).not.toBeNull();
      expect((unit as string).endsWith('.service')).toBe(true);
      expect(servingUnitLabel(instance)).toBe((unit as string).slice(0, -'.service'.length));
      // …and the label is never the empty string or a fragment of the suffix.
      expect(servingUnitLabel(instance).length).toBeGreaterThan(3);
    }
  });
});
