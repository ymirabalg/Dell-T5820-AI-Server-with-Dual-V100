/**
 * §3.6 — {@link parseUfwConf}, {@link dkmsPresentFrom} and {@link collectSafety}.
 *
 * ⚠ **This is the panel that earns the dashboard's existence, and the rule every test here
 * exists to defend is one sentence:**
 *
 * > A `false` on any of these checks is an alarm claiming something specific is broken. It
 * > must never be produced by a failed read.
 *
 * Both file-based checks are three-valued and §6.3 puts `null` in their *watch* column, so
 * `severityUfw` and `severityDkms` are total. The counter-example that made this a rule is
 * step 4's `pwm5Present`: an unmounted `/sys` becoming a banner claiming GPU fan control is
 * gone, on a box with two passively-cooled 250 W cards.
 */

import { describe, expect, test } from 'vitest';

import { severityDkms, severityUfw, severityUnitState } from '../severity';
import type { Safety } from '../types';
import { DEFAULT_PATHS } from './collect';
import { FAN_SERVICE_UNIT } from './dbus';
import type { DbusIo, DbusStream } from './dbus';
import type { CollectorIo } from './io';
import { SAFETY_TIMEOUT_MS, collectSafety } from './safety';
import { DKMS_SUBPATH, dkmsPresentFrom, parseUfwConf } from './safety-checks';
import {
  CAPTURED_DKMS_ENTRIES,
  CAPTURED_LIB_MODULES,
  CAPTURED_UFW_CONF,
  DKMS_ENTRIES_UNCOMPRESSED,
  DKMS_ENTRIES_WITHOUT_MODULE,
  UFW_CONF_COMMENTED,
  UFW_CONF_DISABLED,
  UFW_CONF_JUNK,
  UFW_CONF_EXPORTED_NO,
  UFW_CONF_NO_ENABLED,
  UFW_CONF_QUOTED_NO,
  UFW_CONF_SINGLE_QUOTED_NO,
  UFW_CONF_TRAILING_COMMENT_NO,
  UFW_CONF_TWICE,
} from './samples';

const RELEASE = '7.0.0-30-generic';
const DKMS_DIR = `${DEFAULT_PATHS.libModules}/${RELEASE}/${DKMS_SUBPATH}`;

const errno = (code: string, message: string): Error => Object.assign(new Error(message), { code });

/** Every command any fake `CollectorIo` in this file was asked to run. Must stay empty. */
const ran: string[] = [];

interface FakeIoOptions {
  readonly files?: Readonly<Record<string, string | Error>>;
  readonly dirs?: Readonly<Record<string, readonly string[] | Error>>;
  readonly release?: string | Error;
  readonly onRead?: (path: string) => void;
}

const fakeIo = (o: FakeIoOptions = {}): CollectorIo => ({
  readFile: (path) => {
    o.onRead?.(path);
    const found = o.files?.[path];
    if (found === undefined) return Promise.reject(errno('ENOENT', `ENOENT: no such file, open '${path}'`));
    if (found instanceof Error) return Promise.reject(found);
    return Promise.resolve(found);
  },
  readDir: (path) => {
    o.onRead?.(path);
    const found = o.dirs?.[path];
    if (found === undefined) return Promise.reject(errno('ENOENT', `ENOENT: no such directory, scandir '${path}'`));
    if (found instanceof Error) return Promise.reject(found);
    return Promise.resolve([...found]);
  },
  run: (command) => {
    ran.push(command);
    return Promise.reject(new Error('collectSafety must not run a command'));
  },
  unameRelease: () => {
    const release = o.release ?? RELEASE;
    if (release instanceof Error) throw release;
    return release;
  },
});

/** The box as it stands today: ufw on, DKMS built, fan service active. */
const healthyIo = (over: FakeIoOptions = {}): CollectorIo =>
  fakeIo({
    files: { [DEFAULT_PATHS.ufwConf]: CAPTURED_UFW_CONF, ...over.files },
    dirs: {
      [DEFAULT_PATHS.libModules]: CAPTURED_LIB_MODULES,
      [DKMS_DIR]: CAPTURED_DKMS_ENTRIES,
      ...over.dirs,
    },
    ...(over.release === undefined ? {} : { release: over.release }),
    ...(over.onRead === undefined ? {} : { onRead: over.onRead }),
  });

/** A bus that reports one state for every unit, or refuses to connect. */
const fakeDbus = (state: string | Error): DbusIo => ({
  uid: () => 1000,
  connect: (): Promise<DbusStream> => {
    if (state instanceof Error) return Promise.reject(state);
    // Reuse the real conversation by replaying a canned script keyed on write order.
    const queue: Uint8Array[] = [];
    let waiting: ((b: Uint8Array) => void) | null = null;
    const encoder = new TextEncoder();
    const le32 = (v: number): readonly number[] => [v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff];
    const pad = (out: number[], to: number): void => {
      while (out.length % to !== 0) out.push(0);
    };
    const putString = (out: number[], text: string): void => {
      pad(out, 4);
      const e = encoder.encode(text);
      out.push(...le32(e.length), ...e, 0);
    };
    const reply = (type: number, replySerial: number, signature: string, body: readonly number[]): Uint8Array => {
      const fields: number[] = [5, 1, 0x75, 0, ...le32(replySerial)];
      pad(fields, 8);
      const sig = encoder.encode(signature);
      fields.push(8, 1, 0x67, 0, sig.length, ...sig, 0);
      const out: number[] = [0x6c, type, 0, 1, ...le32(body.length), ...le32(7), ...le32(fields.length)];
      out.push(...fields);
      pad(out, 8);
      out.push(...body);
      return Uint8Array.from(out);
    };
    const emit = (chunk: Uint8Array): void => {
      const w = waiting;
      if (w !== null) {
        waiting = null;
        w(chunk);
      } else queue.push(chunk);
    };
    let serial = 0;
    let begun = false;
    return Promise.resolve({
      write: (written) => {
        if (!begun) {
          const text = new TextDecoder().decode(written);
          if (text.includes('AUTH')) emit(encoder.encode('OK abc\r\n'));
          else if (text.includes('BEGIN')) begun = true;
          return Promise.resolve();
        }
        serial += 1;
        const body: number[] = [];
        if (serial === 1) putString(body, ':1.9'); // Hello
        else if (serial === 2) putString(body, '/org/freedesktop/systemd1/unit/x'); // GetUnit
        else {
          body.push(1, 0x73, 0);
          putString(body, state);
        }
        emit(reply(2, serial, serial === 1 ? 's' : serial === 2 ? 'o' : 'v', body));
        return Promise.resolve();
      },
      next: () => {
        const queued = queue.shift();
        if (queued !== undefined) return Promise.resolve(queued);
        return new Promise<Uint8Array>((resolve) => {
          waiting = resolve;
        });
      },
      close: () => undefined,
    });
  },
});

describe('parseUfwConf — §3.6’s firewall check', () => {
  test('the live file today reads `yes`', () => {
    expect(parseUfwConf(CAPTURED_UFW_CONF)).toEqual({ value: true, problems: [] });
    expect(severityUfw(true)).toBe('normal');
  });

  test('the same file as it read before 2026-09-06 is `false` — §6.3’s alarm', () => {
    expect(parseUfwConf(UFW_CONF_DISABLED)).toEqual({ value: false, problems: [] });
    expect(severityUfw(false)).toBe('alarm');
  });

  test('⚠ absent is NOT disabled — no `ENABLED=` line is null, which §6.3 bands watch', () => {
    // §3.6 states it: a missing config "is not evidence that ufw is enforcing, and it is
    // not evidence that it is not". `false` here would be an alarm invented from silence.
    const parsed = parseUfwConf(UFW_CONF_NO_ENABLED);
    expect(parsed.value).toBeNull();
    expect(parsed.problems).toHaveLength(1);
    expect(severityUfw(parsed.value)).toBe('watch');
  });

  test('⚠ an unrecognised value is null, never the `false` alarm', () => {
    expect(parseUfwConf(UFW_CONF_JUNK).value).toBeNull();
    expect(parseUfwConf(UFW_CONF_JUNK).problems[0]).toContain('maybe');
  });

  test('a commented-out assignment is not an assignment', () => {
    expect(parseUfwConf(UFW_CONF_COMMENTED).value).toBeNull();
  });

  test('the LAST assignment wins, matching `serve-llm.sh`’s own `… | tail -1` check', () => {
    expect(parseUfwConf(UFW_CONF_TWICE).value).toBe(false);
  });

  test('case is not significant, but framing is not guessed at', () => {
    expect(parseUfwConf('ENABLED=YES\n').value).toBe(true);
    expect(parseUfwConf('ENABLED=No\n').value).toBe(false);
    // Quoted: unrecognised rather than assumed. Conservative — `null`, not the alarm.
    expect(parseUfwConf('ENABLED="yes"\n').value).toBeNull();
  });

  /*
   * ⚠ The grammar's limit, stated as a fixtured fact rather than left in a doc comment.
   *
   * All four forms below are things a shell would source and `ufw` would honour, and this
   * parser reads every one of them as `null`. The finding that produced this test was not
   * "add quote stripping": it was that `parseUfwConf`'s own doc **claimed** the shell
   * reading (*"`ufw` sources this file as shell"*) while implementing a stricter subset —
   * the same "names a property it does not check" defect, in comment form.
   *
   * The behaviour is kept and the doc narrowed, for two reasons. The direction is safe:
   * every miss lands on *watch*, never on a false alarm, and §6.3's `null` column exists to
   * say "could not check". And `llama.ts`'s lenient `KEY=VALUE` grammar is systemd's
   * `EnvironmentFile`, which has neither `export` nor trailing comments — **two different
   * languages, and a shared parser would be wrong for one of them.**
   */
  test.each([
    ['double-quoted', UFW_CONF_QUOTED_NO],
    ['single-quoted', UFW_CONF_SINGLE_QUOTED_NO],
    ['a trailing comment', UFW_CONF_TRAILING_COMMENT_NO],
    ['an `export` prefix', UFW_CONF_EXPORTED_NO],
  ])('⚠ a `no` spelled in a form `ufw` itself never writes is unknown, not the alarm — %s', (_name, text) => {
    const parsed = parseUfwConf(text);
    expect(parsed.value).toBeNull();
    expect(parsed.value).not.toBe(false);
    expect(severityUfw(parsed.value)).toBe('watch');
    expect(parsed.problems).toHaveLength(1);
  });

  test('an empty file is null with a problem, and does not throw', () => {
    expect(parseUfwConf('').value).toBeNull();
    expect(parseUfwConf('   \n\n').value).toBeNull();
  });

  test('⚠ `ENABLED_FOO=yes` is a different key and must not be read as this one', () => {
    const parsed = parseUfwConf('ENABLED_FOO=yes\n');
    expect(parsed.value).toBeNull();
    // ⚠ The message matters as much as the value: a prefix match would find this line,
    // report `ENABLED=_FOO=yes` as unrecognised, and hide that there is no assignment.
    expect(parsed.problems).toEqual(['no `ENABLED=` assignment']);
  });
});

describe('dkmsPresentFrom', () => {
  test('the live listing contains the patched module', () => {
    expect(dkmsPresentFrom(CAPTURED_DKMS_ENTRIES)).toBe(true);
  });

  test('⚠ the same directory after a kernel upgrade with no `dkms install -k` is false', () => {
    // The NVIDIA modules are still there, which is what distinguishes this from a missing
    // mount: DKMS built *something* for this kernel, just not the one that gives `pwm5`.
    expect(dkmsPresentFrom(DKMS_ENTRIES_WITHOUT_MODULE)).toBe(false);
    expect(severityDkms(false)).toBe('alarm');
  });

  test('an uncompressed module counts — the check is a prefix, per §3.6’s `.ko*`', () => {
    expect(dkmsPresentFrom(DKMS_ENTRIES_UNCOMPRESSED)).toBe(true);
  });

  test('an empty listing is false, and a near-miss name does not count', () => {
    expect(dkmsPresentFrom([])).toBe(false);
    expect(dkmsPresentFrom(['dell-smm.ko.zst', 'dell_smm_hwmon.ko'])).toBe(false);
  });
});

describe('collectSafety', () => {
  test('the live box: ufw on, DKMS built, fan service active', async () => {
    const result = await collectSafety({ io: healthyIo(), dbus: fakeDbus('active') });
    expect(result).toEqual({
      checks: { ufwEnforcing: true, dkmsForRunningKernel: true, fanServiceState: 'active' },
      errors: [],
    });
  });

  test('⚠ the fan service state is a STRING, so `failed` and `inactive` stay distinct', async () => {
    // §3.7: "not a boolean — the SAFETY panel shows which state, and a boolean would
    // collapse `failed` and `inactive`". Both are alarms; they need different fixes.
    const failed = await collectSafety({ io: healthyIo(), dbus: fakeDbus('failed') });
    const inactive = await collectSafety({ io: healthyIo(), dbus: fakeDbus('inactive') });
    expect(failed.checks.fanServiceState).toBe('failed');
    expect(inactive.checks.fanServiceState).toBe('inactive');
    expect(failed.checks.fanServiceState).not.toBe(inactive.checks.fanServiceState);
    expect(severityUnitState(failed.checks.fanServiceState)).toBe('alarm');
    expect(severityUnitState(inactive.checks.fanServiceState)).toBe('alarm');
  });

  test('⚠ an unreadable ufw.conf is null and watch, never the false alarm', async () => {
    const result = await collectSafety({
      io: healthyIo({ files: { [DEFAULT_PATHS.ufwConf]: errno('EACCES', 'EACCES: permission denied') } }),
      dbus: fakeDbus('active'),
    });
    expect(result.checks.ufwEnforcing).toBeNull();
    expect(severityUfw(result.checks.ufwEnforcing)).toBe('watch');
    expect(result.errors.filter((e) => e.source === 'ufw')).toHaveLength(1);
  });

  test('⚠ a MISSING ufw.conf is null too — a bind mount that is not there is not a firewall verdict', async () => {
    // The one that would be easiest to get wrong: ENOENT looks like "there is no firewall".
    // It is not; it is "§2.2's `-v /etc/ufw/ufw.conf:...:ro` is not there".
    const result = await collectSafety({ io: fakeIo({ dirs: {} }), dbus: fakeDbus('active') });
    expect(result.checks.ufwEnforcing).toBeNull();
    expect(severityUfw(result.checks.ufwEnforcing)).not.toBe('alarm');
  });

  describe('the DKMS check is three steps, and the steps are the check', () => {
    test('⚠ an unlistable `/lib/modules` is null — a mount typo must not raise §6.3’s alarm', async () => {
      // The naive check is one readDir with ENOENT → false. If step 11's
      // `-v /lib/modules:/lib/modules:ro` is missing, EVERY path under it is ENOENT, and
      // the dashboard would alarm "next boot loses pwm5" because of a mount typo.
      const result = await collectSafety({
        io: healthyIo({ dirs: { [DEFAULT_PATHS.libModules]: errno('ENOENT', 'ENOENT: scandir') } }),
        dbus: fakeDbus('active'),
      });
      expect(result.checks.dkmsForRunningKernel).toBeNull();
      expect(severityDkms(result.checks.dkmsForRunningKernel)).toBe('watch');
      expect(result.errors.filter((e) => e.source === 'dkms')).toHaveLength(1);
    });

    test('⚠ a `/lib/modules` without the running kernel is null, not the alarm', async () => {
      // The documented DKMS failure leaves `/lib/modules/<kver>/` fully populated by the
      // distribution and merely lacking `updates/dkms`. An absent kernel tree is evidence
      // the check is looking in the wrong place.
      const result = await collectSafety({
        io: healthyIo({ dirs: { [DEFAULT_PATHS.libModules]: ['7.0.0-14-generic', '7.0.0-29-generic'] } }),
        dbus: fakeDbus('active'),
      });
      expect(result.checks.dkmsForRunningKernel).toBeNull();
      expect(result.errors.some((e) => e.message.includes(RELEASE))).toBe(true);
    });

    test('⚠ `updates/dkms` missing IS the alarm — DKMS never built for this kernel', async () => {
      // The other side of the boundary above: the tree is proved mounted and the kernel
      // directory is proved present, so ENOENT here is a real answer.
      const dirs: Record<string, readonly string[] | Error> = {
        [DEFAULT_PATHS.libModules]: CAPTURED_LIB_MODULES,
        [DKMS_DIR]: errno('ENOENT', `ENOENT: scandir '${DKMS_DIR}'`),
      };
      const result = await collectSafety({ io: healthyIo({ dirs }), dbus: fakeDbus('active') });
      expect(result.checks.dkmsForRunningKernel).toBe(false);
      expect(severityDkms(false)).toBe('alarm');
      // §3.6's alarm carries its explanation, on the same terms as `pwm5Present: false`.
      expect(result.errors.filter((e) => e.source === 'dkms')).toHaveLength(1);
      expect(result.errors.find((e) => e.source === 'dkms')?.message).toContain('pwm5');
    });

    test('⚠ EACCES on `updates/dkms` is null, NOT false — the errno is what separates them', async () => {
      // `errnoCodeOf` on `error.code`, by exact equality. Never on the message, which is
      // localised prose around a path.
      const dirs: Record<string, readonly string[] | Error> = {
        [DEFAULT_PATHS.libModules]: CAPTURED_LIB_MODULES,
        [DKMS_DIR]: errno('EACCES', 'EACCES: permission denied'),
      };
      const result = await collectSafety({ io: healthyIo({ dirs }), dbus: fakeDbus('active') });
      expect(result.checks.dkmsForRunningKernel).toBeNull();
      expect(severityDkms(result.checks.dkmsForRunningKernel)).toBe('watch');
    });

    test('a listing without the module is false, with the directory named', async () => {
      const dirs: Record<string, readonly string[]> = {
        [DEFAULT_PATHS.libModules]: CAPTURED_LIB_MODULES,
        [DKMS_DIR]: DKMS_ENTRIES_WITHOUT_MODULE,
      };
      const result = await collectSafety({ io: healthyIo({ dirs }), dbus: fakeDbus('active') });
      expect(result.checks.dkmsForRunningKernel).toBe(false);
      expect(result.errors.find((e) => e.source === 'dkms')?.message).toContain(DKMS_DIR);
    });

    test('an unknown running kernel is null with an entry', async () => {
      const empty = await collectSafety({ io: healthyIo({ release: '' }), dbus: fakeDbus('active') });
      expect(empty.checks.dkmsForRunningKernel).toBeNull();
      const threw = await collectSafety({
        io: healthyIo({ release: new Error('uname failed') }),
        dbus: fakeDbus('active'),
      });
      expect(threw.checks.dkmsForRunningKernel).toBeNull();
      expect(threw.errors.filter((e) => e.source === 'dkms')).toHaveLength(1);
    });

    test('the check follows the RUNNING kernel, not the newest installed one', async () => {
      // The 2026-09-04 reboot landed on 7.0.0-30 while everything was built for 7.0.0-29.
      // A check that looked at the newest directory would have reported it green.
      const dirs: Record<string, readonly string[]> = {
        [DEFAULT_PATHS.libModules]: CAPTURED_LIB_MODULES,
        [`${DEFAULT_PATHS.libModules}/7.0.0-29-generic/${DKMS_SUBPATH}`]: CAPTURED_DKMS_ENTRIES,
        [`${DEFAULT_PATHS.libModules}/7.0.0-30-generic/${DKMS_SUBPATH}`]: DKMS_ENTRIES_WITHOUT_MODULE,
      };
      const result = await collectSafety({
        io: healthyIo({ dirs }),
        dbus: fakeDbus('active'),
        // The running kernel is 7.0.0-30; 7.0.0-29 still has the module.
      });
      expect(result.checks.dkmsForRunningKernel).toBe(false);
    });
  });

  test('⚠ an unreachable bus leaves the two file checks intact', async () => {
    // §6.5: a failure is scoped to the figure it explains. A dead bus must not blank the
    // firewall row, which was read from a file that answered perfectly well.
    const result = await collectSafety({
      io: healthyIo(),
      dbus: fakeDbus(errno('ENOENT', 'connect ENOENT /run/dbus/system_bus_socket')),
    });
    expect(result.checks.ufwEnforcing).toBe(true);
    expect(result.checks.dkmsForRunningKernel).toBe(true);
    expect(result.checks.fanServiceState).toBeNull();
    expect(result.errors.filter((e) => e.source === 'dbus')).toHaveLength(1);
  });

  test('⚠ exactly one unit is asked about, and it is `gpu-fan-control.service` (O9)', async () => {
    // O9 makes `cooling.serviceState` and `safety.fanServiceState` ONE read rendered in
    // two panels. `collectServing` opens its own connection and deliberately does not ask
    // about this unit; asking in both places is how two panels come to disagree.
    const asked: string[] = [];
    const spy: DbusIo = {
      uid: () => 1000,
      connect: async (path, timeoutMs) => {
        const stream = await fakeDbus('active').connect(path, timeoutMs);
        return {
          ...stream,
          write: (written) => {
            const text = new TextDecoder().decode(written);
            if (text.includes('.service')) {
              asked.push(text.slice(text.indexOf('gpu-fan')).replace(/\0.*$/, ''));
            }
            return stream.write(written);
          },
        };
      },
    };
    await collectSafety({ io: healthyIo(), dbus: spy });
    // The literal, not the constant — a constant compared with itself proves nothing.
    expect(asked).toEqual(['gpu-fan-control.service']);
    expect(asked).toEqual([FAN_SERVICE_UNIT]);
    expect(asked).toHaveLength(1);
  });

  test('nothing readable at all is three nulls and three entries, not a throw', async () => {
    const nothing = fakeIo({});
    const result = await collectSafety({
      io: nothing,
      dbus: fakeDbus(new Error('no bus')),
    });
    expect(result.checks.ufwEnforcing).toBeNull();
    expect(result.checks.dkmsForRunningKernel).toBeNull();
    expect(result.checks.fanServiceState).toBeNull();
    expect(result.errors.map((e) => e.source).sort()).toEqual(['dbus', 'dkms', 'ufw']);
  });

  test('⚠ collectSafety never runs a command — §2.2 forbids shelling out', async () => {
    // `ufw status` needs root and `systemctl` needs a systemd binary `node:24-slim` does
    // not have; §2.2 names both exclusions. ⚠ Asserted on a RECORD of what was run, not on
    // the absence of errors — "no errors" is a weaker claim than this test's own name.
    ran.length = 0;
    const result = await collectSafety({ io: healthyIo(), dbus: fakeDbus('active') });
    expect(ran).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  test('a wedged filesystem is bounded rather than hanging the route', async () => {
    const wedged: CollectorIo = {
      readFile: () => new Promise<string>(() => undefined),
      readDir: () => new Promise<string[]>(() => undefined),
      run: () => Promise.reject(new Error('no')),
      unameRelease: () => RELEASE,
    };
    const started = performance.now();
    const result = await collectSafety({ io: wedged, dbus: fakeDbus('active'), timeoutMs: 40 });
    expect(performance.now() - started).toBeLessThan(2000);
    expect(result.checks.ufwEnforcing).toBeNull();
    expect(result.checks.dkmsForRunningKernel).toBeNull();
    expect(SAFETY_TIMEOUT_MS).toBeGreaterThan(40);
  });

  /*
   * ⚠ R2's other half — see `storage.test.ts` for the full argument. `{ ...await
   * collectSafety(), pwm5Present }` typechecked at exit 0 and shipped `errors` inside
   * `snapshot.safety`. The `@ts-expect-error` below fails in **both** directions: if the
   * collection ever becomes spreadable into a `Safety` again, and — because an unused
   * directive is itself a compile error — if `checks` is flattened back.
   */
  test('⚠ the whole collection cannot be spread into a Safety — errors would ride along', async () => {
    const collection = await collectSafety({ io: healthyIo(), dbus: fakeDbus('active') });
    const pwm5Present: Safety['pwm5Present'] = true; // step 4's, from `collectCooling`

    // @ts-expect-error — the three checks live under `checks`; spreading the collection
    // carries `errors` and satisfies nothing.
    const leaked: Safety = { ...collection, pwm5Present };
    expect(leaked).toBeDefined();

    const safety: Safety = { ...collection.checks, pwm5Present };
    expect(Object.keys(safety).sort()).toEqual([
      'dkmsForRunningKernel',
      'fanServiceState',
      'pwm5Present',
      'ufwEnforcing',
    ]);
    expect(safety).not.toHaveProperty('errors');
  });
});
