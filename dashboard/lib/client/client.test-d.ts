import { describe, expectTypeOf, test } from 'vitest';

import type { BrowserWindow, RuntimeEnv } from './env';
import type { PrefStorage } from './prefs';
import type { RuntimeState } from './runtime';
import type { ServingEnumeration, WireSnapshot } from './wire';
import { parseSnapshot } from './wire';
import type { ServingInstance, TelemetrySnapshot } from '../types';

/*
 * Type-level tests, run by the compiler. `lib/types.test-d.ts` explains the mechanism; the
 * three properties below are step 8's, and each of them is a place where the *runtime* tests
 * cannot see the mistake.
 */

describe('⚠ the seam has to be the shape of the thing it stands in for', () => {
  /*
   * ⚠ The whole no-jsdom argument rests on this. `RuntimeEnv` is driven by a fake in every
   * test, so a `BrowserWindow` that had drifted from the real DOM — a renamed method, a
   * changed return type, a listener signature that no longer matches — would leave a green
   * suite over a runtime that cannot start in a browser. `use-telemetry.ts` passes the real
   * `window` with **no cast**, so this assertion is what that line rests on.
   */
  test('⚠ the real Window satisfies BrowserWindow, with no cast anywhere', () => {
    expectTypeOf<Window & typeof globalThis>().toExtend<BrowserWindow>();
  });

  test('⚠ the real Storage satisfies PrefStorage', () => {
    expectTypeOf<Storage>().toExtend<PrefStorage>();
  });

  test('every member of RuntimeEnv is reachable from a browser window', () => {
    expectTypeOf<RuntimeEnv['nowMs']>().toEqualTypeOf<() => number>();
    expectTypeOf<RuntimeEnv['storage']>().toEqualTypeOf<PrefStorage | null>();
  });
});

describe('⚠ O10: the validator narrows, it does not assert', () => {
  /*
   * ⚠ `parseSnapshot` takes `unknown`. If it were ever "simplified" to take a
   * `TelemetrySnapshot`, every call site would start casting to satisfy it and the whole
   * point would be gone — the compiler would be back to believing bytes nobody checked.
   */
  test('⚠ parseSnapshot accepts unknown and answers a snapshot or null', () => {
    expectTypeOf(parseSnapshot).parameter(0).toEqualTypeOf<unknown>();
    expectTypeOf(parseSnapshot).returns.toEqualTypeOf<WireSnapshot | null>();
  });

  test('⚠ the validated serving list is still `T[] | null`, never widened to `T[]`', () => {
    expectTypeOf<WireSnapshot['snapshot']['serving']>().toEqualTypeOf<
      readonly ServingInstance[] | null
    >();
    expectTypeOf<WireSnapshot['snapshot']>().toEqualTypeOf<TelemetrySnapshot>();
  });

  test('⚠⚠ 12d/RECONCILE — a PARTIAL read cannot be written with an EMPTY `refused`', () => {
    // ⚠⚠ The value this forbids is not hypothetical — it was forged and measured (12d
    // adversarial, finding 7): `{ read: 'partial', rows: [], refused: [] }` makes
    // `enumerationsRead` report *serving was read, nothing held back* — the permissive answer,
    // which retires — while `servedBy` on the same value answers `incomplete`. One value, two
    // contradictory readings, and the ledger takes the dangerous one. `servingEnumeration` is
    // the only producer and cannot make it; this is what stops a hand-written one compiling.
    // @ts-expect-error — `refused` is a NON-EMPTY tuple: a partial read is a read that
    // refused at least one row, and *partial with nothing refused* is `read: 'all'`.
    const forged: ServingEnumeration = { read: 'partial', rows: [], refused: [] };
    void forged;
    // …and the twin, so this is not "`partial` never type-checks": one refusal is enough, and
    // an ANONYMOUS one is still a refusal.
    const named: ServingEnumeration = { read: 'partial', rows: [], refused: ['0'] };
    const anonymous: ServingEnumeration = { read: 'partial', rows: [], refused: [null] };
    void named;
    void anonymous;
  });

  test('a validated snapshot is not assignable from an unchecked object', () => {
    // @ts-expect-error — `unknown` is not a snapshot, which is the entire premise of O10.
    const bad: TelemetrySnapshot = JSON.parse('{}') as unknown;
    void bad;
  });
});

describe('the runtime state is read-only to its consumers', () => {
  test('⚠ a panel cannot write to the ring, the events or the conditions', () => {
    // @ts-expect-error — `readonly`.
    const write = (state: RuntimeState): void => { state.ring = state.ring; };
    void write;
  });
});
