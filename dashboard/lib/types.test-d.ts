import { describe, expectTypeOf, test } from 'vitest';

import type {
  BytesPerSecond,
  Celsius,
  Ch5Mode,
  Cooling,
  CoolingChannels,
  CoolingEcAuto,
  CoolingManual,
  CoolingUnavailable,
  ErrorSource,
  Filesystem,
  GiB,
  Gpu,
  HealthState,
  Host,
  IsoTimestamp,
  LinkState,
  LoadAverage,
  MHz,
  MiB,
  Network,
  Percent,
  Port,
  Pwm,
  Rpm,
  Safety,
  Seconds,
  ServingInstance,
  Severity,
  Storage,
  TelemetryError,
  TelemetrySnapshot,
  ThrottleMask,
  ThrottleReason,
  ThrottleReasonName,
  ThrottleTreatment,
  Tokens,
  UnitState,
  Watts,
} from './types';

/*
 * These tests run through the compiler, not the interpreter. `vitest.config.mts` enables
 * `typecheck` over `*.test-d.ts`, and `pnpm typecheck` covers the same files a second
 * time, so a type that gets loosened fails both.
 *
 * They are written to break loudly under `strict: false`. Two mechanisms do that:
 *
 *  - Every `@ts-expect-error` below expects an error that only exists with
 *    `strictNullChecks` on. Turn it off and the directive becomes unused, which is
 *    itself a compile error (TS2578).
 *  - The nullability census asserts the *exact* set of non-nullable keys on every type.
 *    With `strictNullChecks` off, `null` is assignable to everything, so every census
 *    collapses to `never` and the assertions for `Gpu`, `ServingInstance`, `Storage`,
 *    `CoolingManual`, `CoolingEcAuto`, `TelemetryError` and `TelemetrySnapshot` fail.
 */

// ---------------------------------------------------------------------------
// Assertion machinery
// ---------------------------------------------------------------------------

/**
 * Invariant-identity equality. Deliberately not `extends`: `never` is assignable to
 * everything and `any` is assignable in both directions, so an assignability-based check
 * would quietly pass for exactly the two types a loosened contract collapses into.
 */
type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/** Fails to compile unless `T` is exactly `true`. */
type Assert<T extends true> = T;

/** The keys of `T` whose type does NOT admit `null`. */
type NonNullableKeys<T> = { [K in keyof T]-?: null extends T[K] ? never : K }[keyof T];

/**
 * The keys of `T` whose type admits `undefined`.
 *
 * {@link NonNullableKeys} is structurally blind to this — `null extends (T | null |
 * undefined)` is `true`, so a field that admits `undefined` is silently excluded from the
 * census built to police it. `undefined` is the specific thing `JSON.stringify` drops, so
 * it gets a census of its own with its own failure message.
 */
type UndefinedKeys<T> = { [K in keyof T]-?: undefined extends T[K] ? K : never }[keyof T];

/**
 * The keys of `T` that are declared optional (`?:`). `{}` is the probe: it satisfies a
 * one-property type only when that property is optional.
 */
type OptionalKeys<T> = { [K in keyof T]-?: {} extends Pick<T, K> ? K : never }[keyof T];

/**
 * `true` when `Underlying` is NOT assignable to `Branded` — i.e. the brand is nominal.
 *
 * Without this, an assertion written as `Equals<Gpu['memUsedMiB'], MiB | null>` proves
 * nothing: delete the `Brand<>` wrapper and both sides of the comparison degrade in
 * lockstep, and every field written in terms of the alias silently accepts raw numbers.
 */
type IsNominal<Branded, Underlying> = Equals<Underlying extends Branded ? true : false, false>;

/*
 * Every assertion below lives INSIDE a `test()` callback, on purpose.
 *
 * ⚠ The reason is legibility and attribution, NOT visibility. A compile error at module
 * scope in a `*.test-d.ts` file DOES fail `pnpm test` — measured: the file is marked
 * failed and the run exits 1. What it does not do is show up in the counters, so the
 * summary still reads `Tests 34 passed (34)` / `Type Errors  no errors` on a red run.
 * Inside a `test()` body the failure names itself instead. Either way the authority is the
 * exit code of `pnpm verify`, never the printed summary.
 */

// ---------------------------------------------------------------------------
// 1. Nothing in the contract is optional, and nothing admits `undefined`
// ---------------------------------------------------------------------------

describe('the contract has no optional members', () => {
  /*
   * `field?: number` is not the same promise as `field: number | null`. An optional field
   * disappears from `JSON.stringify` output entirely, so the client cannot tell
   * "unreadable" from "this server never sent it". Absence is spelled `null`.
   */
  test('no member of any contract type is declared optional', () => {
    type NoOptionalProperties = [
      Assert<Equals<OptionalKeys<Gpu>, never>>,
      Assert<Equals<OptionalKeys<Host>, never>>,
      Assert<Equals<OptionalKeys<CoolingChannels>, never>>,
      Assert<Equals<OptionalKeys<CoolingManual>, never>>,
      Assert<Equals<OptionalKeys<CoolingEcAuto>, never>>,
      Assert<Equals<OptionalKeys<CoolingUnavailable>, never>>,
      Assert<Equals<OptionalKeys<ServingInstance>, never>>,
      Assert<Equals<OptionalKeys<Filesystem>, never>>,
      Assert<Equals<OptionalKeys<Network>, never>>,
      Assert<Equals<OptionalKeys<Storage>, never>>,
      Assert<Equals<OptionalKeys<Safety>, never>>,
      Assert<Equals<OptionalKeys<TelemetryError>, never>>,
      Assert<Equals<OptionalKeys<TelemetrySnapshot>, never>>,
      Assert<Equals<OptionalKeys<ThrottleReason>, never>>,
    ];
    expectTypeOf<NoOptionalProperties>().toBeArray();
  });

  /*
   * Property C. A *required* field typed `T | null | undefined` passes both the optional
   * census and the nullability census, and `JSON.stringify` then omits the key: the client
   * reads `undefined`, §6.6's `null → —` branch never runs, and the figure renders blank —
   * which is precisely what §6.6 forbids ("never `0`, never blank, never `N/A`").
   */
  test('no member of any contract type admits undefined', () => {
    type NoUndefinedProperties = [
      Assert<Equals<UndefinedKeys<Gpu>, never>>,
      Assert<Equals<UndefinedKeys<Host>, never>>,
      Assert<Equals<UndefinedKeys<CoolingChannels>, never>>,
      Assert<Equals<UndefinedKeys<CoolingManual>, never>>,
      Assert<Equals<UndefinedKeys<CoolingEcAuto>, never>>,
      Assert<Equals<UndefinedKeys<CoolingUnavailable>, never>>,
      Assert<Equals<UndefinedKeys<ServingInstance>, never>>,
      Assert<Equals<UndefinedKeys<Filesystem>, never>>,
      Assert<Equals<UndefinedKeys<Network>, never>>,
      Assert<Equals<UndefinedKeys<Storage>, never>>,
      Assert<Equals<UndefinedKeys<Safety>, never>>,
      Assert<Equals<UndefinedKeys<TelemetryError>, never>>,
      Assert<Equals<UndefinedKeys<TelemetrySnapshot>, never>>,
      Assert<Equals<UndefinedKeys<ThrottleReason>, never>>,
    ];
    expectTypeOf<NoUndefinedProperties>().toBeArray();
  });
});

// ---------------------------------------------------------------------------
// 2. The nullability census
// ---------------------------------------------------------------------------

describe('the nullability census', () => {
  /*
   * The exact set of fields allowed to be non-nullable, and nothing else. A reading that
   * forgets its `| null` fails here by name.
   */
  test('only identities and containers are non-nullable', () => {
    type NullabilityCensus = [
      // `index` is the row's identity, not a reading — §6.2 joins serving data onto the
      // GPU card by it. A row without an index is an `errors[]` entry, not a GPU.
      Assert<Equals<NonNullableKeys<Gpu>, 'index'>>,

      // Every host reading can fail independently. `cpuPct` in particular is `null` on the
      // first poll of a session, because it is a delta and needs two samples (§6.7).
      Assert<Equals<NonNullableKeys<Host>, never>>,

      // Fan RPMs and the fan service state are all readings.
      Assert<Equals<NonNullableKeys<CoolingChannels>, never>>,

      // The discriminant is always present, and manual control always carries its PWM
      // value — that is the whole point of §3.3's derivation.
      Assert<Equals<NonNullableKeys<CoolingManual>, 'ch5Mode' | 'ch5Pwm'>>,
      Assert<Equals<NonNullableKeys<CoolingEcAuto>, 'ch5Mode'>>,
      Assert<Equals<NonNullableKeys<CoolingUnavailable>, never>>,

      // `instance` is the identity, taken from the env filename. Everything read *about*
      // the instance can fail on its own — the normal case when a unit is down.
      Assert<Equals<NonNullableKeys<ServingInstance>, 'instance'>>,

      Assert<Equals<NonNullableKeys<Filesystem>, never>>,
      Assert<Equals<NonNullableKeys<Network>, never>>,

      // The containers are always present; their leaves are what go `null`. §6.5: one
      // failed sensor shows `—` while the rest of the panel renders.
      Assert<Equals<NonNullableKeys<Storage>, 'root' | 'home' | 'net'>>,
      Assert<Equals<NonNullableKeys<Safety>, never>>,

      // An error entry that could not say what failed would be useless.
      Assert<Equals<NonNullableKeys<TelemetryError>, 'source' | 'message'>>,

      // `hostname`, `gpus` and `serving` are the nullable members of the snapshot;
      // `ts`, the four containers, `errors` and `standing` are not. ⚠ `standing` is on this
      // side because §4 makes it **configuration, not a reading**: an unset `STANDING` is
      // `[]` — nothing is standing — where every `null` in this contract means *unknown*.
      Assert<
        Equals<
          NonNullableKeys<TelemetrySnapshot>,
          'ts' | 'standing' | 'host' | 'cooling' | 'storage' | 'safety' | 'errors'
        >
      >,
    ];
    expectTypeOf<NullabilityCensus>().toBeArray();
  });
});

// ---------------------------------------------------------------------------
// 3. Every brand is nominal (Property A)
// ---------------------------------------------------------------------------

describe('the brands are nominal, not aliases', () => {
  /*
   * This is the assertion the field census rests on. `expectTypeOf<Gpu['memUsedMiB']>()
   * .toEqualTypeOf<MiB | null>()` compares a field to an alias; if `MiB` quietly becomes
   * `number`, both sides degrade together and the comparison still passes while a raw
   * number — or a figure in GiB — assigns cleanly into a VRAM field.
   *
   * Measured consequence, from the step-1 adversarial phase: with `MiB` degraded to
   * `number`, `memUsedMiB: gib(12.1)` type-checks. §6.3 bands VRAM at 90/95 %, so a card
   * at 39 % renders as 0.04 % and the OOM warning never fires.
   */
  test('a raw primitive is not assignable to any branded unit', () => {
    type EveryBrandIsNominal = [
      Assert<IsNominal<Celsius, number>>,
      Assert<IsNominal<Watts, number>>,
      Assert<IsNominal<MiB, number>>,
      Assert<IsNominal<GiB, number>>,
      Assert<IsNominal<MHz, number>>,
      Assert<IsNominal<Rpm, number>>,
      Assert<IsNominal<Percent, number>>,
      Assert<IsNominal<BytesPerSecond, number>>,
      Assert<IsNominal<Seconds, number>>,
      Assert<IsNominal<Pwm, number>>,
      Assert<IsNominal<Port, number>>,
      Assert<IsNominal<Tokens, number>>,
      Assert<IsNominal<IsoTimestamp, string>>,
      Assert<IsNominal<ThrottleMask, string>>,
    ];
    expectTypeOf<EveryBrandIsNominal>().toBeArray();
  });

  test('the brands do not collapse into each other', () => {
    type BrandsAreDistinct = [
      Assert<Equals<Equals<MiB, GiB>, false>>,
      Assert<Equals<Equals<Celsius, Watts>, false>>,
      Assert<Equals<Equals<Rpm, Pwm>, false>>,
      Assert<Equals<Equals<IsoTimestamp, ThrottleMask>, false>>,
    ];
    expectTypeOf<BrandsAreDistinct>().toBeArray();
  });

  /* A branded number still behaves as a number, or the formatters could not use it. */
  test('a branded number is still a number', () => {
    declareRpm((r) => {
      expectTypeOf(r.toFixed(0)).toEqualTypeOf<string>();
      const n: number = r;
      void n;
    });
  });
});

// ---------------------------------------------------------------------------
// 4. Every field's exact type, pinned by name (Property B)
// ---------------------------------------------------------------------------

describe('the field census', () => {
  /*
   * Every member of every contract type, compared to its declared type with
   * invariant-identity equality. This is deliberately an independent restatement of
   * `lib/types.ts` — that duplication is what makes it a test rather than a tautology.
   *
   * It exists because the alternative measured in the adversarial phase is that the tests
   * protect whichever fields a fixture or a bespoke assertion happens to touch: widening
   * `Network['link']` or `ServingInstance['unitState']` to `string | null` passed the
   * whole suite at exit 0.
   *
   * ⚠ Adding a field to `lib/types.ts` means adding its line here. The nullability census
   * catches a new field only if it is non-nullable.
   */
  test('every GPU field', () => {
    type GpuFields = [
      Assert<Equals<Gpu['index'], number>>,
      Assert<Equals<Gpu['name'], string | null>>,
      Assert<Equals<Gpu['bus'], string | null>>,
      Assert<Equals<Gpu['tempC'], Celsius | null>>,
      Assert<Equals<Gpu['powerW'], Watts | null>>,
      Assert<Equals<Gpu['powerCapW'], Watts | null>>,
      Assert<Equals<Gpu['memUsedMiB'], MiB | null>>,
      Assert<Equals<Gpu['memTotalMiB'], MiB | null>>,
      Assert<Equals<Gpu['utilPct'], Percent | null>>,
      Assert<Equals<Gpu['smClockMHz'], MHz | null>>,
      Assert<Equals<Gpu['throttleReasons'], ThrottleMask | null>>,
      Assert<Equals<keyof Gpu, GpuKeys>>,
    ];
    expectTypeOf<GpuFields>().toBeArray();
  });

  test('every host field', () => {
    type HostFields = [
      Assert<Equals<Host['cpuPct'], Percent | null>>,
      Assert<Equals<Host['loadAvg'], LoadAverage | null>>,
      Assert<Equals<Host['cpuTempC'], Celsius | null>>,
      Assert<Equals<Host['memUsedGiB'], GiB | null>>,
      Assert<Equals<Host['memTotalGiB'], GiB | null>>,
      Assert<Equals<Host['swapUsedGiB'], GiB | null>>,
      Assert<Equals<Host['swapTotalGiB'], GiB | null>>,
      Assert<Equals<Host['uptimeSec'], Seconds | null>>,
      Assert<Equals<Host['kernel'], string | null>>,
      Assert<Equals<Host['cpuModel'], string | null>>,
      Assert<Equals<Host['cores'], number | null>>,
      Assert<Equals<Host['threads'], number | null>>,
      Assert<Equals<LoadAverage, readonly [number, number, number]>>,
    ];
    expectTypeOf<HostFields>().toBeArray();
  });

  test('every cooling field', () => {
    type CoolingFields = [
      Assert<Equals<CoolingChannels['fan1Rpm'], Rpm | null>>,
      Assert<Equals<CoolingChannels['fan2Rpm'], Rpm | null>>,
      Assert<Equals<CoolingChannels['fan3Rpm'], Rpm | null>>,
      Assert<Equals<CoolingChannels['fan4Rpm'], Rpm | null>>,
      Assert<Equals<CoolingChannels['fan5Rpm'], Rpm | null>>,
      Assert<Equals<CoolingChannels['serviceState'], UnitState | null>>,
      Assert<Equals<CoolingManual['ch5Mode'], 'manual'>>,
      Assert<Equals<CoolingManual['ch5Pwm'], Pwm>>,
      Assert<Equals<CoolingEcAuto['ch5Mode'], 'ec-auto'>>,
      Assert<Equals<CoolingEcAuto['ch5Pwm'], null>>,
      Assert<Equals<CoolingUnavailable['ch5Mode'], null>>,
      Assert<Equals<CoolingUnavailable['ch5Pwm'], null>>,
      // `pwmN_enable` and `fanN_target` are absent by design (invariant 4). Naming them
      // here would be a compile error, so their absence is asserted as a key census.
      Assert<Equals<keyof CoolingChannels, CoolingChannelKeys>>,
    ];
    expectTypeOf<CoolingFields>().toBeArray();
  });

  test('every serving field', () => {
    type ServingFields = [
      Assert<Equals<ServingInstance['instance'], number>>,
      Assert<Equals<ServingInstance['port'], Port | null>>,
      Assert<Equals<ServingInstance['unitState'], UnitState | null>>,
      Assert<Equals<ServingInstance['model'], string | null>>,
      Assert<Equals<ServingInstance['ctx'], Tokens | null>>,
      Assert<Equals<ServingInstance['health'], HealthState | null>>,
    ];
    expectTypeOf<ServingFields>().toBeArray();
  });

  test('every storage and network field', () => {
    type StorageFields = [
      Assert<Equals<Filesystem['usedGiB'], GiB | null>>,
      Assert<Equals<Filesystem['totalGiB'], GiB | null>>,
      Assert<Equals<Network['rxBytesPerSec'], BytesPerSecond | null>>,
      Assert<Equals<Network['txBytesPerSec'], BytesPerSecond | null>>,
      Assert<Equals<Network['link'], LinkState | null>>,
      Assert<Equals<Storage['root'], Filesystem>>,
      Assert<Equals<Storage['home'], Filesystem>>,
      Assert<Equals<Storage['net'], Network>>,
    ];
    expectTypeOf<StorageFields>().toBeArray();
  });

  /*
   * §3.7 fixes these four names on the wire, and fixes `fanServiceState` as the unit's
   * `ActiveState` string rather than a boolean: the SAFETY panel shows *which* state, and
   * a boolean would collapse `failed` and `inactive`.
   */
  test('every safety field, with §3.7 spelling', () => {
    type SafetyFields = [
      Assert<Equals<Safety['ufwEnforcing'], boolean | null>>,
      Assert<Equals<Safety['pwm5Present'], boolean | null>>,
      Assert<Equals<Safety['dkmsForRunningKernel'], boolean | null>>,
      Assert<Equals<Safety['fanServiceState'], UnitState | null>>,
      Assert<
        Equals<
          keyof Safety,
          'ufwEnforcing' | 'pwm5Present' | 'dkmsForRunningKernel' | 'fanServiceState'
        >
      >,
    ];
    expectTypeOf<SafetyFields>().toBeArray();
  });

  test('every snapshot and error field', () => {
    type SnapshotFields = [
      Assert<Equals<TelemetrySnapshot['ts'], IsoTimestamp>>,
      Assert<Equals<TelemetrySnapshot['hostname'], string | null>>,
      Assert<Equals<TelemetrySnapshot['gpus'], readonly Gpu[] | null>>,
      Assert<Equals<TelemetrySnapshot['host'], Host>>,
      Assert<Equals<TelemetrySnapshot['cooling'], Cooling>>,
      Assert<Equals<TelemetrySnapshot['serving'], readonly ServingInstance[] | null>>,
      Assert<Equals<TelemetrySnapshot['storage'], Storage>>,
      Assert<Equals<TelemetrySnapshot['safety'], Safety>>,
      Assert<Equals<TelemetrySnapshot['errors'], readonly TelemetryError[]>>,
      // Not a bare `string`: §6.5 matches an error to the figure it explains, which needs
      // a stable id.
      Assert<Equals<TelemetryError['source'], ErrorSource>>,
      Assert<Equals<TelemetryError['message'], string>>,
    ];
    expectTypeOf<SnapshotFields>().toBeArray();
  });

  test('every throttle-reason field', () => {
    type ThrottleFields = [
      Assert<Equals<ThrottleReason['bit'], number>>,
      Assert<Equals<ThrottleReason['code'], string>>,
      Assert<Equals<ThrottleReason['name'], ThrottleReasonName>>,
      Assert<Equals<ThrottleReason['treatment'], ThrottleTreatment>>,
    ];
    expectTypeOf<ThrottleFields>().toBeArray();
  });
});

/** The exact key set of {@link Gpu}, restated so an added field fails the census. */
type GpuKeys =
  | 'index'
  | 'name'
  | 'bus'
  | 'tempC'
  | 'powerW'
  | 'powerCapW'
  | 'memUsedMiB'
  | 'memTotalMiB'
  | 'utilPct'
  | 'smClockMHz'
  | 'throttleReasons';

/** Invariant 4: the only fan telemetry in the contract is `fanN_input`. */
type CoolingChannelKeys =
  | 'fan1Rpm'
  | 'fan2Rpm'
  | 'fan3Rpm'
  | 'fan4Rpm'
  | 'fan5Rpm'
  | 'serviceState';

// ---------------------------------------------------------------------------
// 5. Closed vocabularies stay closed (§3.7)
// ---------------------------------------------------------------------------

describe('closed vocabularies', () => {
  /*
   * Widening any of these to `string` — the easy thing to do when a collector meets a
   * value it did not expect — fails here. The field census above is what makes that bite:
   * these assertions constrain the alias, and Property B constrains each field to the
   * alias.
   */
  test('the spec-fixed vocabularies are exactly these literals', () => {
    type ClosedVocabularies = [
      Assert<Equals<Severity, 'normal' | 'watch' | 'alarm'>>,
      Assert<
        Equals<
          UnitState,
          'active' | 'reloading' | 'inactive' | 'failed' | 'activating' | 'deactivating'
        >
      >,
      Assert<
        Equals<
          LinkState,
          'up' | 'down' | 'unknown' | 'dormant' | 'notpresent' | 'lowerlayerdown' | 'testing'
        >
      >,
      Assert<Equals<HealthState, 'ok' | 'unhealthy' | 'unreachable'>>,
      Assert<Equals<Cooling['ch5Mode'], 'manual' | 'ec-auto' | null>>,
      // The alias is derived from the union, so it cannot drift from it.
      Assert<Equals<Ch5Mode, Cooling['ch5Mode']>>,
      Assert<Equals<ThrottleTreatment, 'neutral' | 'alarm'>>,
      Assert<
        Equals<
          ThrottleReasonName,
          | 'gpu idle'
          | 'applications clocks setting'
          | 'sw power cap'
          | 'hw slowdown'
          | 'sw thermal slowdown'
          | 'hw thermal slowdown'
          | 'hw power brake slowdown'
          | 'display clock setting'
        >
      >,
      Assert<
        Equals<
          ErrorSource,
          | 'nvidia-smi'
          | 'coretemp'
          | 'proc-stat'
          | 'proc-meminfo'
          | 'proc-loadavg'
          | 'proc-uptime'
          | 'proc-net-dev'
          | 'net-operstate'
          | 'proc-cpuinfo'
          | 'hostname'
          | 'dell-smm'
          | 'dbus'
          | 'llama-env'
          | 'llama-health'
          | 'llama-models'
          | 'statvfs'
          | 'ufw'
          | 'dkms'
        >
      >,
    ];
    expectTypeOf<ClosedVocabularies>().toBeArray();
  });

  test('an unknown error source is not an error source', () => {
    // @ts-expect-error §3.7's set is closed; a new source is a spec change, not a string.
    const source: ErrorSource = 'sensors';
    void source;
  });

  test('an unknown unit state is not a unit state', () => {
    // @ts-expect-error D-Bus hands back a raw string; it has to be narrowed, not cast.
    const state: UnitState = 'active ';
    void state;
  });
});

// ---------------------------------------------------------------------------
// 6. Readings cannot be consumed without handling `null`
// ---------------------------------------------------------------------------

describe('a reading cannot be reached without confronting null', () => {
  test('a nullable temperature is not a temperature', () => {
    declareSnapshot((snapshot) => {
      // @ts-expect-error `cpuTempC` is `Celsius | null`. Handle the null first.
      const t: Celsius = snapshot.host.cpuTempC;
      void t;

      // The permitted form.
      const ok: Celsius | null = snapshot.host.cpuTempC;
      expectTypeOf(ok).toEqualTypeOf<Celsius | null>();
    });
  });

  test('a nullable RPM has no methods', () => {
    declareSnapshot((snapshot) => {
      // @ts-expect-error `fan5Rpm` is possibly `null` — the DKMS module may not be loaded.
      snapshot.cooling.fan5Rpm.toFixed(0);
    });
  });

  test('a nullable percentage cannot be compared to a threshold', () => {
    declareSnapshot((snapshot) => {
      // @ts-expect-error `utilPct` is possibly `null`, so `>` is not defined on it.
      const busy: boolean = snapshot.gpus?.[0]?.utilPct > 90;
      void busy;
    });
  });

  test('the GPU list is not an array until the null is handled', () => {
    declareSnapshot((snapshot) => {
      // @ts-expect-error `gpus` is `readonly Gpu[] | null` — `null` means nvidia-smi could
      // not be run at all, which is not the same as an empty list of cards.
      const n: number = snapshot.gpus.length;
      void n;

      // The idiom every consumer uses instead. §3.1 renders both facts the same way; the
      // contract and `errors[]` are where they stay distinct.
      for (const gpu of snapshot.gpus ?? []) {
        expectTypeOf(gpu).toEqualTypeOf<Gpu>();
      }
    });
  });

  test('a nullable disk figure cannot go straight into arithmetic', () => {
    declareSnapshot((snapshot) => {
      // @ts-expect-error both operands are possibly `null`.
      const freeGiB: number = snapshot.storage.root.totalGiB - snapshot.storage.root.usedGiB;
      void freeGiB;
    });
  });

  test('a nullable boolean is not a boolean', () => {
    declareSnapshot((snapshot) => {
      // @ts-expect-error `ufwEnforcing` is `boolean | null`; `null` means the check could
      // not be performed, which is not evidence either way.
      const enforcing: boolean = snapshot.safety.ufwEnforcing;
      void enforcing;
    });
  });

  /*
   * §3.7: `pwm5Present` is three-valued and `null` is *unknown*, never the alarm. A
   * truthiness test collapses `false` and `null` into one branch, which is how an
   * unmounted `/sys` becomes a banner claiming GPU fan control is gone.
   */
  test('the pwm5 check has three outcomes, not two', () => {
    declareSnapshot((snapshot) => {
      // @ts-expect-error `null` is not `false`; the alarm is specifically `false`.
      const missing: false = snapshot.safety.pwm5Present;
      void missing;

      const alarm: boolean = snapshot.safety.pwm5Present === false;
      const unknown: boolean = snapshot.safety.pwm5Present === null;
      void alarm;
      void unknown;
    });
  });
});

// ---------------------------------------------------------------------------
// 7. Units are not interchangeable
// ---------------------------------------------------------------------------

describe('branded units', () => {
  test('a raw number is not a reading', () => {
    // @ts-expect-error 66 is a number, not a temperature. Mint it with `celsius()`.
    const t: Celsius = 66;
    void t;
  });

  test('memory units do not cross', () => {
    declareSnapshot((snapshot) => {
      // @ts-expect-error VRAM is MiB and host RAM is GiB (§6.6, decision 20).
      const wrong: GiB | null = snapshot.gpus?.[0]?.memUsedMiB ?? null;
      void wrong;
    });
  });

  test('a fan speed is not a temperature', () => {
    declareRpm((r) => {
      // @ts-expect-error RPM is not °C.
      const t: Celsius = r;
      void t;
    });
  });
});

// ---------------------------------------------------------------------------
// 8. Channel 5's mode is a discriminated union (§3.3)
// ---------------------------------------------------------------------------

describe('channel 5 mode', () => {
  test('manual narrows to a non-null PWM', () => {
    declareCooling((cooling) => {
      if (cooling.ch5Mode === 'manual') {
        expectTypeOf(cooling.ch5Pwm).toEqualTypeOf<Pwm>();
        // Reaching the value needs no null check, because a successful numeric `pwm5`
        // read is what *made* the mode manual.
        expectTypeOf(cooling.ch5Pwm.toFixed(0)).toEqualTypeOf<string>();
      }
    });
  });

  test('EC auto has no PWM value at all — and that is healthy, not an error', () => {
    declareEcAuto((cooling) => {
      expectTypeOf(cooling.ch5Pwm).toEqualTypeOf<null>();
      // @ts-expect-error there is no duty cycle to read while the EC owns the channel.
      const p: Pwm = cooling.ch5Pwm;
      void p;
    });
  });

  test('an unavailable channel cannot claim a mode', () => {
    declareUnavailable((cooling) => {
      expectTypeOf(cooling.ch5Mode).toEqualTypeOf<null>();
      expectTypeOf(cooling.ch5Pwm).toEqualTypeOf<null>();
      // fan1–fan4 survive a DKMS failure (§9); only channel 5 disappears.
      expectTypeOf(cooling.fan1Rpm).toEqualTypeOf<Rpm | null>();
    });
  });

  test('the three variants are exhaustive', () => {
    // No `default:`. Adding a fourth variant makes this stop returning `string`.
    const label = (cooling: Cooling): string => {
      switch (cooling.ch5Mode) {
        case 'manual':
          return `HIGH pwm ${cooling.ch5Pwm}`;
        case 'ec-auto':
          return 'EC auto';
        case null:
          return 'unavailable';
      }
    };
    declareCooling((cooling) => {
      expectTypeOf(label(cooling)).toEqualTypeOf<string>();
    });
  });

  test('EC auto cannot also report a duty cycle', () => {
    declareChannels((channels) => {
      // @ts-expect-error the EC owns the channel; there is no PWM value to report.
      const impossible: Cooling = { ...channels, ch5Mode: 'ec-auto', ch5Pwm: 255 as Pwm };
      void impossible;
    });
  });

  test('a channel with no pwm5 node cannot be under manual control', () => {
    declareChannels((channels) => {
      // @ts-expect-error the DKMS module is not loaded, so nothing can have written a duty.
      const impossible: Cooling = { ...channels, ch5Mode: null, ch5Pwm: 128 as Pwm };
      void impossible;
    });
  });

  test('manual control cannot report an absent duty cycle', () => {
    declareChannels((channels) => {
      // @ts-expect-error a numeric `pwm5` read is what makes the mode manual.
      const impossible: Cooling = { ...channels, ch5Mode: 'manual', ch5Pwm: null };
      void impossible;
    });
  });
});

// ---------------------------------------------------------------------------
// 9. `null` and `0` are different values, and `null` and `[]` are different facts
// ---------------------------------------------------------------------------

describe('absent is not zero', () => {
  test('zero is a legal reading', () => {
    // A fan genuinely reading 0 RPM is a dead fan on a box with two passive 250 W cards.
    // The contract must be able to say so, distinctly from saying nothing.
    expectTypeOf<Rpm | null>().extract<null>().toEqualTypeOf<null>();
    expectTypeOf<Rpm | null>().exclude<null>().toEqualTypeOf<Rpm>();
  });

  test('an empty GPU list is not a missing GPU list', () => {
    expectTypeOf<TelemetrySnapshot['gpus']>().toEqualTypeOf<readonly Gpu[] | null>();
    expectTypeOf<TelemetrySnapshot['serving']>().toEqualTypeOf<
      readonly ServingInstance[] | null
    >();
  });

  test('errors are always a list, never absent', () => {
    expectTypeOf<TelemetrySnapshot['errors']>().toEqualTypeOf<readonly TelemetryError[]>();
  });
});

// ---------------------------------------------------------------------------
// Helpers
//
// `declare const` at module scope trips `noUnusedLocals` once the value is only used
// inside a `@ts-expect-error` line, so the sample values are handed to the assertions
// through these instead.
// ---------------------------------------------------------------------------

declare function declareSnapshot(fn: (snapshot: TelemetrySnapshot) => void): void;
declare function declareCooling(fn: (cooling: Cooling) => void): void;
declare function declareEcAuto(fn: (cooling: CoolingEcAuto) => void): void;
declare function declareUnavailable(fn: (cooling: CoolingUnavailable) => void): void;
declare function declareRpm(fn: (value: Rpm) => void): void;
declare function declareChannels(fn: (channels: CoolingChannels) => void): void;
