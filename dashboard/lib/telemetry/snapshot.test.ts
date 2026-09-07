import { describe, expect, test } from 'vitest';

import { ch5Manual, everythingZero, servingInstances } from '@/lib/fixtures';
import { isoTimestamp } from '@/lib/types';
import type { ErrorSource, IsoTimestamp, TelemetryError, UnitState } from '@/lib/types';
import type { DeltaSample } from '@/lib/collectors';

import {
  COOLING_SOURCES,
  GPU_SOURCES,
  HOST_SOURCES,
  NO_CHECKS,
  NO_HOST,
  NO_NETWORK,
  SAFETY_SOURCES,
  SERVING_SOURCES,
  STORAGE_SOURCES,
  sampleSnapshot,
} from './snapshot';
import type { SnapshotCollectors } from './snapshot';

/**
 * §4's assembly. Every collector here is a fake, because the thing under test is the
 * *composition* — which reading reaches which field, which collection's `errors` reach the
 * top level, and what happens when one collector fails.
 *
 * Two shapes of failure are covered and they are not the same:
 *
 * - a collector that **returns** a failed reading (`null` plus its own `errors[]`), which is
 *   the normal case on this machine and is already every collector's own tested behaviour;
 * - a collector that **throws**, which no collector does today and which PLAN nevertheless
 *   makes this step's green criterion: "one collector throwing still returns 200 + errors".
 */

const TS: IsoTimestamp = isoTimestamp('2026-09-06T14:02:11.482Z');
const NOW = 1_000_000;

const sample: DeltaSample = { atMs: NOW, cpu: { busy: 10n, total: 100n }, net: { rxBytes: 5n, txBytes: 7n } };

/**
 * Six collectors that all succeed, built from `lib/fixtures.ts` so the values are the
 * project's canonical ones rather than a seventh invented set.
 *
 * ⚠ `cooling.serviceState` is `null` here, exactly as `collectCooling` returns it (O9) —
 * so every assertion about the fan service below is about the value this file writes, not
 * about one the fake handed over.
 */
const healthyCollectors = (overrides: Partial<SnapshotCollectors> = {}): SnapshotCollectors => ({
  gpus: async () => ({ gpus: everythingZero.gpus, errors: [] }),
  host: async () => ({
    hostname: 'ai-server',
    host: everythingZero.host,
    net: everythingZero.storage.net,
    sample,
    errors: [],
  }),
  cooling: async () => ({
    cooling: { ...ch5Manual, serviceState: null },
    pwm5Present: true,
    errors: [],
  }),
  serving: async () => ({ serving: servingInstances, errors: [] }),
  storage: async () => ({
    filesystems: { root: everythingZero.storage.root, home: everythingZero.storage.home },
    errors: [],
  }),
  safety: async () => ({
    checks: {
      ufwEnforcing: true,
      dkmsForRunningKernel: true,
      fanServiceState: 'active',
    },
    errors: [],
  }),
  ...overrides,
});

const assemble = async (
  overrides: Partial<SnapshotCollectors> = {},
  previous: DeltaSample | null = null,
  standing: readonly string[] = [],
) => sampleSnapshot({ collectors: healthyCollectors(overrides), nowMs: NOW, ts: TS, previous, standing });

const sourcesOf = (errors: readonly TelemetryError[]): ErrorSource[] =>
  errors.map((entry) => entry.source);

const boom = (message: string) => async (): Promise<never> => {
  throw new Error(message);
};

// ---------------------------------------------------------------------------
// The shape on the wire
// ---------------------------------------------------------------------------

describe('the assembled snapshot', () => {
  test('carries §4’s nine members and the readings the collectors produced', async () => {
    const { snapshot } = await assemble();

    expect(snapshot.ts).toBe(TS);
    expect(snapshot.hostname).toBe('ai-server');
    expect(snapshot.gpus).toBe(everythingZero.gpus);
    expect(snapshot.host).toBe(everythingZero.host);
    expect(snapshot.serving).toBe(servingInstances);
    expect(snapshot.storage.root).toBe(everythingZero.storage.root);
    expect(snapshot.storage.home).toBe(everythingZero.storage.home);
    expect(snapshot.storage.net).toBe(everythingZero.storage.net);
    expect(snapshot.safety.pwm5Present).toBe(true);
    expect(snapshot.errors).toEqual([]);
  });

  /*
   * ⚠ HANDOVER §3.2 and §6 item 2 — the key census over the **assembled** snapshot.
   *
   * `contract.test.ts` runs over `lib/fixtures.ts` values, which are written by hand and can
   * never carry a stray key. This runs over what the route actually builds. The mistake it
   * guards is measured, not hypothetical: step 5's review found that
   * `{ ...await collectStorage(), net }` **typechecks at exit 0** and ships the collector's
   * `errors` array inside `snapshot.storage`, because TypeScript's excess-property check
   * does not fire through a spread. The collections were re-nested under `filesystems` and
   * `checks` to make it a compile error; this is the runtime half, and it is the half that
   * still bites if someone reaches for a cast.
   *
   * ⚠ **Its depth is exactly two objects** — the top level plus `storage` and `safety`.
   * `host`, `cooling`, `gpus[]` and `serving[]` are passed through by reference and are not
   * censused here at all, and nothing below `storage.root` is either. The
   * `errors`-occurs-once test below is the depth-independent half; neither replaces the
   * other.
   */
  test('⚠ storage and safety carry no errors key of their own', async () => {
    const { snapshot } = await assemble();

    expect(Object.keys(snapshot.storage).sort()).toEqual(['home', 'net', 'root']);
    expect(Object.keys(snapshot.safety).sort()).toEqual([
      'dkmsForRunningKernel',
      'fanServiceState',
      'pwm5Present',
      'ufwEnforcing',
    ]);
    expect('errors' in snapshot.storage).toBe(false);
    expect('errors' in snapshot.safety).toBe(false);
    expect('filesystems' in snapshot.storage).toBe(false);
    expect('checks' in snapshot.safety).toBe(false);
  });

  /*
   * ⚠ The census above is **exactly two objects deep** — the top level, `storage` and
   * `safety` — and step 6's adversarial found two shapes that defeat it by sitting one level
   * lower. The live one is real: a `Filesystem` carrying `{ usedGiB, totalGiB, errors: [...] }`
   * is what a spread-built `filesystemFrom` would produce, and it ships the collector's
   * entries inside `snapshot.storage.root` while the top-level `errors[]` already carries
   * them. `snapshot.host`, `snapshot.cooling`, `snapshot.gpus[]` and `snapshot.serving[]` are
   * passed through by reference and are censused at no depth at all.
   *
   * A deeper or recursive key census was rejected: it would grow with every field of the
   * contract. This is the property that actually matters, stated once and depth-independent
   * — **the collectors' entries belong in exactly one place, and that place is the root.**
   * It runs over the serialised snapshot because that is what the client receives.
   */
  test('⚠ the key `errors` occurs exactly once in the whole snapshot, at the root', async () => {
    const { snapshot } = await assemble();
    const wire: unknown = JSON.parse(JSON.stringify(snapshot));

    const paths: string[] = [];
    const walk = (node: unknown, path: string): void => {
      if (node === null || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        node.forEach((item, i) => walk(item, `${path}[${i}]`));
        return;
      }
      for (const [key, value] of Object.entries(node)) {
        const here = path === '' ? key : `${path}.${key}`;
        if (key === 'errors') paths.push(here);
        walk(value, here);
      }
    };
    walk(wire, '');

    expect(paths).toEqual(['errors']);
  });

  test('⚠ the top-level key set is exactly §4’s, with nothing extra', async () => {
    const { snapshot } = await assemble();

    expect(Object.keys(snapshot).sort()).toEqual([
      'cooling',
      'errors',
      'gpus',
      'host',
      'hostname',
      'safety',
      'serving',
      'standing',
      'storage',
      'ts',
    ]);
  });

  /*
   * ⚠ §4's `standing` is the one field this file must **not** touch: "echoed verbatim and
   * never parsed server-side". A server that trimmed, filtered or deduplicated would turn
   * §6.4's "an id that matches no kind is reported as unknown" into silence — the mechanism
   * whose whole job is suppressing alarms, failing quietly. The entries below are, in order,
   * legal, malformed on a singleton kind, whitespace-padded, and a duplicate.
   */
  test('⚠ standing is echoed verbatim — not trimmed, not filtered, not deduplicated', async () => {
    const declared = ['ufw_enforcing', 'ufw_enforcing:yes', ' gpu_temp ', 'ufw_enforcing'];
    const { snapshot } = await assemble({}, null, declared);
    expect(snapshot.standing).toEqual(declared);
  });

  /*
   * ⚠ The census again, after `JSON.stringify` — which is what the route actually sends.
   *
   * `undefined` is the specific thing serialisation drops, so a key that is present in the
   * object and absent on the wire would pass the census above and still reach the client as
   * a missing field. The brands are compile-time fictions (HANDOVER §3.3) and must leave as
   * plain numbers and strings, which the round trip also demonstrates.
   */
  test('⚠ the snapshot survives JSON serialisation with every key intact', async () => {
    const { snapshot } = await assemble();
    const wire: unknown = JSON.parse(JSON.stringify(snapshot));

    expect(wire).toEqual(snapshot);
    expect(Object.keys(wire as object).sort()).toEqual([
      'cooling',
      'errors',
      'gpus',
      'host',
      'hostname',
      'safety',
      'serving',
      'standing',
      'storage',
      'ts',
    ]);
    // The census again, on the bytes rather than on the object — this is what a client sees.
    expect(Object.keys((wire as { storage: object }).storage).sort()).toEqual([
      'home',
      'net',
      'root',
    ]);
    expect(Object.keys((wire as { safety: object }).safety).sort()).toEqual([
      'dkmsForRunningKernel',
      'fanServiceState',
      'pwm5Present',
      'ufwEnforcing',
    ]);
  });

  /*
   * §3.4 and HANDOVER §6 item 7: `serving: null` is "could not enumerate instances" and
   * `[]` is "none configured". A route that coerced one into the other would make the
   * SERVING panel's sentence a lie on a box whose `/etc/llama-server` failed to mount.
   */
  test('serving: null survives assembly and is not coerced to an empty list', async () => {
    const { snapshot } = await assemble({ serving: async () => ({ serving: null, errors: [] }) });
    expect(snapshot.serving).toBeNull();
  });

  /*
   * §6.2 and HANDOVER §6 item 6: the order `discoverInstances` produced is the order the
   * panel renders, and `10.env` sorts after `1.env` rather than between `0` and `1`.
   */
  test('the instance order is passed through, not re-sorted', async () => {
    const ordered = [...servingInstances].reverse();
    const { snapshot } = await assemble({ serving: async () => ({ serving: ordered, errors: [] }) });
    expect(snapshot.serving?.map((row) => row.instance)).toEqual([1, 0]);
  });
});

// ---------------------------------------------------------------------------
// O9 — one D-Bus read, two panels
// ---------------------------------------------------------------------------

describe('the fan service state (O9)', () => {
  /*
   * ⚠ `cooling.serviceState` and `safety.fanServiceState` are the same `ActiveState` of
   * `gpu-fan-control.service`, read once by `collectSafety` and rendered in two panels.
   * `collectCooling` never reads D-Bus and always returns `serviceState: null`; this file
   * is the only place the hole is filled, through `withServiceState`.
   *
   * Every member of §3.7's vocabulary plus `null`, because a switch that handled five of
   * six would be invisible to a single-value test.
   */
  test('⚠ both panels show the one reading, for every UnitState and for null', async () => {
    const states: readonly (UnitState | null)[] = [
      'active',
      'reloading',
      'inactive',
      'failed',
      'activating',
      'deactivating',
      null,
    ];

    for (const state of states) {
      const { snapshot } = await assemble({
        safety: async () => ({
          checks: { ufwEnforcing: null, dkmsForRunningKernel: null, fanServiceState: state },
          errors: [],
        }),
      });
      expect(snapshot.safety.fanServiceState, `safety for ${String(state)}`).toBe(state);
      expect(snapshot.cooling.serviceState, `cooling for ${String(state)}`).toBe(state);
    }
  });

  /*
   * The other half of O9: the reading must come from `collectSafety`, not from whatever
   * `collectCooling` happened to carry. A collector that (wrongly) reported a state of its
   * own must not reach the panel.
   */
  test('a serviceState carried by collectCooling is overwritten by the safety reading', async () => {
    const { snapshot } = await assemble({
      cooling: async () => ({
        cooling: { ...ch5Manual, serviceState: 'active' },
        pwm5Present: true,
        errors: [],
      }),
      safety: async () => ({
        checks: { ufwEnforcing: null, dkmsForRunningKernel: null, fanServiceState: 'failed' },
        errors: [],
      }),
    });

    expect(snapshot.cooling.serviceState).toBe('failed');
    expect(snapshot.safety.fanServiceState).toBe('failed');
  });

  /*
   * ⚠ §3.7's one-directional rule, at the assembly seam: `pwm5Present` comes from
   * `collectCooling`'s single three-valued probe and from nowhere else. `collectSafety`
   * cannot produce it — `SafetyChecks` is `Omit<Safety, 'pwm5Present'>` — and the spread
   * below is where the two halves meet.
   */
  test('⚠ pwm5Present comes from the cooling probe, not from the safety collector', async () => {
    for (const present of [true, false, null]) {
      const { snapshot } = await assemble({
        cooling: async () => ({
          cooling: { ...ch5Manual, serviceState: null },
          pwm5Present: present,
          errors: [],
        }),
      });
      expect(snapshot.safety.pwm5Present, `pwm5Present ${String(present)}`).toBe(present);
    }

    // …and the safety collector cannot move it. `SafetyChecks` is
    // `Omit<Safety, 'pwm5Present'>`, so this is structurally impossible — which is exactly
    // why it is worth one assertion rather than a comment: vary everything the safety
    // collector *can* say and the value stays where the probe put it.
    const { snapshot: withFailedSafety } = await assemble({
      safety: async () => ({
        checks: { ufwEnforcing: false, dkmsForRunningKernel: false, fanServiceState: 'failed' },
        errors: [{ source: 'ufw', message: 'the firewall is off' }],
      }),
    });
    expect(withFailedSafety.safety.pwm5Present).toBe(true);
  });

  /*
   * `withServiceState` must preserve the variant it was handed. `ch5EcAuto` and
   * `ch5Manual` narrow differently, and a spread that widened the union would let
   * `{ ch5Mode: 'ec-auto', ch5Pwm: 255 }` exist.
   */
  test('the channel-5 mode and duty survive the service-state write', async () => {
    const { snapshot } = await assemble();
    expect(snapshot.cooling.ch5Mode).toBe('manual');
    expect(snapshot.cooling.ch5Pwm).toBe(ch5Manual.ch5Pwm);
    expect(snapshot.cooling.fan5Rpm).toBe(ch5Manual.fan5Rpm);
  });
});

// ---------------------------------------------------------------------------
// errors[]
// ---------------------------------------------------------------------------

describe('the top-level errors list', () => {
  /*
   * ⚠ Every collection's entries reach the wire. §4: "`errors` is part of the contract, not
   * an afterthought … the UI must be able to say *which* reading failed rather than
   * rendering a plausible-looking zero." A collector whose entries were dropped would blank
   * figures with no explanation beside them, which §6.5 forbids.
   */
  test('⚠ entries from all six collectors reach the snapshot, in field order', async () => {
    const one = (source: ErrorSource): TelemetryError[] => [{ source, message: `from ${source}` }];
    const { snapshot } = await assemble({
      gpus: async () => ({ gpus: null, errors: one('nvidia-smi') }),
      host: async () => ({
        hostname: null,
        host: NO_HOST,
        net: NO_NETWORK,
        sample,
        errors: one('proc-stat'),
      }),
      cooling: async () => ({
        cooling: { ...ch5Manual, serviceState: null },
        pwm5Present: null,
        errors: one('dell-smm'),
      }),
      serving: async () => ({ serving: null, errors: one('llama-health') }),
      storage: async () => ({
        filesystems: { root: everythingZero.storage.root, home: everythingZero.storage.home },
        errors: one('statvfs'),
      }),
      safety: async () => ({ checks: NO_CHECKS, errors: one('ufw') }),
    });

    expect(sourcesOf(snapshot.errors)).toEqual([
      'nvidia-smi',
      'proc-stat',
      'dell-smm',
      'llama-health',
      'statvfs',
      'ufw',
    ]);
    expect(snapshot.errors.map((e) => e.message)).toEqual([
      'from nvidia-smi',
      'from proc-stat',
      'from dell-smm',
      'from llama-health',
      'from statvfs',
      'from ufw',
    ]);
  });

  /*
   * ⚠ **The order above is not decoration, and this is the fixture that shows why.**
   * Every source in that test is filed by exactly one collector, so nothing there depends
   * on the six blocks being concatenated in any particular order. **`dbus` is different:
   * it is filed by two collectors** — `collectSafety` for `gpu-fan-control.service` and
   * `collectServing` for the llama units — so when both fail, which `dbus` entry is *last*
   * is decided by this concatenation and nowhere else.
   *
   * That matters off this file: §6.7's client rule (`lib/client/events.ts`, S11) shows the
   * **last** message per source in the event log. Without this fixture, "last wins" was a
   * client-side choice resting on a server-side order nothing exercised — the two halves
   * were each tested and the seam between them was not.
   *
   * Safety is last on purpose: `gpu-fan-control.service` is the reading this dashboard
   * exists for, so a bus that is answering for one unit and not another is better described
   * by the safety-critical one. `snapshot.ts` states the reason at the concatenation.
   */
  test('⚠ dbus is filed by two collectors, and safety’s entry is the one that lands last', async () => {
    const { snapshot } = await assemble({
      serving: async () => ({
        serving: null,
        errors: [{ source: 'dbus', message: 'llama-server@1.service: NoSuchUnit' }],
      }),
      safety: async () => ({
        checks: NO_CHECKS,
        errors: [{ source: 'dbus', message: 'gpu-fan-control.service: NoSuchUnit' }],
      }),
    });

    const dbus = snapshot.errors.filter((e) => e.source === 'dbus');
    expect(dbus).toHaveLength(2);
    expect(dbus[0]?.message).toContain('llama-server@1.service');
    expect(dbus[1]?.message).toContain('gpu-fan-control.service');
    // …and that is what `events.ts` reads as the source's current verdict.
    expect(dbus.at(-1)?.message).toContain('gpu-fan-control.service');
  });

  test('a snapshot with nothing wrong carries an empty list, never null', async () => {
    const { snapshot } = await assemble();
    expect(snapshot.errors).toEqual([]);
    expect(Array.isArray(snapshot.errors)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Invariant 5 — a collector that throws
// ---------------------------------------------------------------------------

describe('a collector that throws', () => {
  /*
   * ⚠ PLAN's green criterion for this step, and invariant 5: "one collector throwing still
   * returns 200 + errors". Without the per-collector guard a single rejection inside
   * `Promise.all` loses the whole snapshot — including the five collections that
   * succeeded — on a dashboard whose entire purpose is to keep rendering while parts of the
   * box are unreadable.
   */
  test('⚠ a throwing collector yields a partial snapshot rather than a rejection', async () => {
    const { snapshot } = await assemble({ gpus: boom('nvidia-smi exploded') });

    expect(snapshot.gpus).toBeNull();
    expect(sourcesOf(snapshot.errors)).toEqual(['nvidia-smi']);
    expect(snapshot.errors[0]?.message).toContain('nvidia-smi exploded');
    expect(snapshot.errors[0]?.message).toContain('collectGpus');
    // Everything else is untouched — the failure is scoped to its own collector.
    expect(snapshot.host).toBe(everythingZero.host);
    expect(snapshot.serving).toBe(servingInstances);
    expect(snapshot.safety.ufwEnforcing).toBe(true);
  });

  /*
   * ⚠ §6.5: an error must be matchable to *the figure it explains*. `collectHost` blanks
   * nine figures across three panels, so a crash inside it files nine entries — one per
   * §3.7 source it owns. A single `proc-stat` entry would leave the RAM, load, uptime,
   * CPU-model, hostname, link and CPU-temperature blanks unexplained.
   */
  test('⚠ a throwing host collector files an entry for each of its nine sources', async () => {
    const { snapshot } = await assemble({ host: boom('procfs is gone') });

    // ⚠ Against a LITERAL list, not against `HOST_SOURCES` alone. Comparing the
    // implementation with itself pins the *count* and nothing else: step 6's adversarial
    // swapped `coretemp` for `dell-smm` — both valid §3.7 members — and 60 of 60 tests
    // stayed green. That breaks §6.5 in both directions at once, on one poll: `cpuTempC`
    // renders `—` with no entry behind it, while a `dell-smm` entry appears beside a
    // COOLING panel that read all five channels perfectly. The two sibling tests below
    // already did it this way.
    expect(sourcesOf(snapshot.errors)).toEqual([
      'proc-stat',
      'proc-meminfo',
      'proc-loadavg',
      'proc-uptime',
      'proc-net-dev',
      'net-operstate',
      'proc-cpuinfo',
      'hostname',
      'coretemp',
    ]);
    expect(HOST_SOURCES).toEqual(sourcesOf(snapshot.errors));
    expect(new Set(HOST_SOURCES).size).toBe(9);
    expect(snapshot.host).toEqual(NO_HOST);
    expect(snapshot.hostname).toBeNull();
    expect(snapshot.storage.net).toEqual(NO_NETWORK);
    for (const entry of snapshot.errors) {
      expect(entry.message).toContain('procfs is gone');
    }
  });

  /*
   * ⚠ O16's half of the same event. A crashed host collector must hand back a sample whose
   * counters are `null`, so the retention in `source.ts` keeps the last good ones. A
   * fallback that invented zeroes would make the next poll's `cpuPct` and rates fiction.
   */
  test('⚠ a throwing host collector returns null counters, not invented zeroes', async () => {
    const { sample: returned } = await assemble({ host: boom('procfs is gone') });

    expect(returned.cpu).toBeNull();
    expect(returned.net).toBeNull();
    expect(returned.atMs).toBe(NOW);
  });

  /*
   * ⚠ §3.7's stated worst inversion: `pwm5Present: false` is the SAFETY **alarm** claiming
   * the DKMS 5-fan module did not load and GPU fan control is gone. A collector that
   * crashed learned nothing, so the answer is `null` — *unknown, not alarm*.
   */
  test('⚠ a throwing cooling collector leaves pwm5Present unknown, never the alarm', async () => {
    const { snapshot } = await assemble({ cooling: boom('EACCES on /sys') });

    expect(snapshot.safety.pwm5Present).toBeNull();
    expect(snapshot.cooling.ch5Mode).toBeNull();
    expect(snapshot.cooling.ch5Pwm).toBeNull();
    expect(snapshot.cooling.fan5Rpm).toBeNull();
    expect(sourcesOf(snapshot.errors)).toEqual([...COOLING_SOURCES]);
  });

  /*
   * ⚠ §3.6's rule, at the assembly seam: "a `false` on any of these is an alarm claiming
   * something specific is broken. It must never be produced by a failed read." Three checks
   * blanked, three entries, none of them `false`.
   */
  test('⚠ a throwing safety collector reports unknown for all three checks', async () => {
    const { snapshot } = await assemble({ safety: boom('the bus went away') });

    expect(snapshot.safety.ufwEnforcing).toBeNull();
    expect(snapshot.safety.dkmsForRunningKernel).toBeNull();
    expect(snapshot.safety.fanServiceState).toBeNull();
    expect(snapshot.cooling.serviceState).toBeNull();
    expect(sourcesOf(snapshot.errors)).toEqual([...SAFETY_SOURCES]);
    expect(SAFETY_SOURCES).toEqual(['ufw', 'dkms', 'dbus']);
  });

  test('a throwing serving collector yields null instances and one llama-env entry', async () => {
    const { snapshot } = await assemble({ serving: boom('discovery died') });

    expect(snapshot.serving).toBeNull();
    expect(sourcesOf(snapshot.errors)).toEqual([...SERVING_SOURCES]);
    expect(SERVING_SOURCES).toEqual(['llama-env']);
  });

  test('a throwing storage collector blanks both mounts with one statvfs entry', async () => {
    const { snapshot } = await assemble({ storage: boom('the mount is gone') });

    expect(snapshot.storage.root).toEqual({ usedGiB: null, totalGiB: null });
    expect(snapshot.storage.home).toEqual({ usedGiB: null, totalGiB: null });
    expect(snapshot.storage.net).toBe(everythingZero.storage.net);
    expect(sourcesOf(snapshot.errors)).toEqual([...STORAGE_SOURCES]);
  });

  test('all six throwing at once is still a snapshot, with every source accounted for', async () => {
    const { snapshot } = await assemble({
      gpus: boom('a'),
      host: boom('b'),
      cooling: boom('c'),
      serving: boom('d'),
      storage: boom('e'),
      safety: boom('f'),
    });

    expect(sourcesOf(snapshot.errors)).toEqual([
      ...GPU_SOURCES,
      ...HOST_SOURCES,
      ...COOLING_SOURCES,
      ...SERVING_SOURCES,
      ...STORAGE_SOURCES,
      ...SAFETY_SOURCES,
    ]);
    expect(snapshot.errors).toHaveLength(16);
    expect(snapshot.ts).toBe(TS);
    expect(snapshot.gpus).toBeNull();
    expect(snapshot.serving).toBeNull();
    expect(snapshot.host).toEqual(NO_HOST);
    expect(snapshot.safety).toEqual({ ...NO_CHECKS, pwm5Present: null });
  });

  /*
   * A rejection that is not an `Error` still produces a readable entry. `reason()` is the
   * project's one description function; a second one written here would be the mistake
   * HANDOVER §7 lists second in its do-not-copy table.
   */
  test('a non-Error rejection is described rather than printed as [object Object]', async () => {
    const { snapshot } = await assemble({
      gpus: async () => {
        throw 'a bare string';
      },
    });

    expect(snapshot.errors[0]?.message).toContain('a bare string');
  });
});

// ---------------------------------------------------------------------------
// previous / sample
// ---------------------------------------------------------------------------

describe('the delta counters', () => {
  test('previous is handed to collectHost and its sample is handed back', async () => {
    const previous: DeltaSample = { atMs: 1, cpu: null, net: null };
    let seen: DeltaSample | null | undefined;

    const { sample: returned } = await sampleSnapshot({
      standing: [],
      collectors: healthyCollectors({
        host: async ({ previous: given, nowMs }) => {
          seen = given ?? null;
          expect(nowMs).toBe(NOW);
          return {
            hostname: null,
            host: NO_HOST,
            net: NO_NETWORK,
            sample,
            errors: [],
          };
        },
      }),
      nowMs: NOW,
      ts: TS,
      previous,
    });

    expect(seen).toBe(previous);
    expect(returned).toBe(sample);
  });
});

// ---------------------------------------------------------------------------
// The structural guard — moved, not dropped
// ---------------------------------------------------------------------------
//
// ⚠ `⚠ the assembler shares no budget across collectors` now lives in
// `lib/guardrails.test.ts`, renamed from *"the assembler imports no bound"*.
//
// Two reasons, both from step 6's review. **It was defeated by a deeper import specifier**
// — `import { deadline } from '@/lib/collectors/deadline'` was 60 of 60 green under the
// mistake the guard exists to catch — and the fix bans `@/lib/collectors/` by *path
// prefix*, over comment-blanked source, which needs `codeOnly()` and the tree walker that
// already live in `guardrails.test.ts`. And the old name over-claimed: after §4's ceiling
// landed, a bound legitimately exists one module away in `ceiling.ts`, so "imports no
// bound" is no longer the property. The property is that **no budget is shared across
// collectors**.
//
// The same move applies to `⚠ nothing in the telemetry route schedules a timer`, which was
// a substring scan over a hard-coded five-file list and is now a tree walk over
// `lib/collectors/`, `lib/telemetry/` and `app/api/` — plus the behavioural tests in
// `source.test.ts`, because `setInterval` is a global and no text rule over a global can be
// sound.
