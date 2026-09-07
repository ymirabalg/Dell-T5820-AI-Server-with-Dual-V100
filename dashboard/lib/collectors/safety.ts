/**
 * §3.6's IO wrapper — three of the four checks on "the things on this box that fail
 * silently". The fourth, `pwm5Present`, is step 4's and comes out of `collectCooling`'s
 * single three-valued probe (§3.7).
 *
 * | field | source | this file |
 * |---|---|---|
 * | `ufwEnforcing` | `/etc/ufw/ufw.conf` | `ufw` |
 * | `dkmsForRunningKernel` | `/lib/modules/<release>/updates/dkms/` | `dkms` |
 * | `fanServiceState` | D-Bus `ActiveState` | `dbus` |
 * | `pwm5Present` | `dell_smm` hwmon | **not here** — `collectCooling` |
 *
 * ### ⚠ The rule this whole file exists to obey
 *
 * > **A `false` on any of these is an alarm claiming something specific is broken. It must
 * > never be produced by a failed read.**
 *
 * §6.3 puts `null` in the *watch* column of both three-valued rows, so `severityUfw` and
 * `severityDkms` are total and an unknown check is a visible "could not check". `false` is
 * reserved for the case where the check ran and answered. This is the same shape as step
 * 4's `pwm5Present`, whose inversion — an unmounted `/sys` becoming a banner claiming GPU
 * fan control is gone — took a full adversarial pass to find.
 */

import type { Safety, TelemetryError } from '../types';
import { DEFAULT_PATHS } from './collect';
import type { CollectorPaths } from './collect';
import { FAN_SERVICE_UNIT, collectUnitStates, nodeDbus } from './dbus';
import type { DbusIo } from './dbus';
import { deadline } from './deadline';
import type { Within } from './deadline';
import { errnoCodeOf, reason, tag } from './errors';
import { nodeIo } from './io';
import type { CollectorIo } from './io';
import { parseText } from './numbers';
import { DKMS_SUBPATH, dkmsPresentFrom, parseUfwConf } from './safety-checks';

/**
 * The budget for the two file-based checks.
 *
 * ⚠ Chosen, not specified — reported as a gap. Both are ordinary reads of an ordinary
 * filesystem, so 2 s is enormous; it exists because §2.2 bind-mounts them from the host and
 * a mount that has gone away can block rather than fail. Matches the other collectors'.
 */
export const SAFETY_TIMEOUT_MS = 2000;

/** `ENOENT` — the code that means "definitively not there", as opposed to "I could not look". */
const ENOENT = 'ENOENT';

/** Arguments to {@link collectSafety}. Options object, like every collector. */
export interface CollectSafetyOptions {
  readonly io?: CollectorIo;
  readonly dbus?: DbusIo;
  readonly paths?: CollectorPaths;
  readonly timeoutMs?: number;
}

/**
 * The three §3.6 checks this collector owns — **exactly `Safety` minus the `pwm5Present`
 * step 4 owns.**
 *
 * Derived with `Omit` rather than written out, so a contract that gains a safety check is a
 * compile error here rather than a silently missing key at the route.
 */
export type SafetyChecks = Omit<Safety, 'pwm5Present'>;

/**
 * What {@link collectSafety} yields.
 *
 * ⚠ **The checks are NESTED under `checks`, for the reason `StorageCollection` nests under
 * `filesystems`:** flat, the natural assembly was `{ ...await collectSafety(), pwm5Present }`
 * — which **typechecks at exit 0** and ships the collector's `errors` array into
 * `snapshot.safety`, because TypeScript's excess-property check does not fire through a
 * spread. Step 6 writes:
 *
 * ```ts
 * const { checks, errors } = await collectSafety();
 * const safety: Safety = { ...checks, pwm5Present };
 * ```
 *
 * ⚠ `fanServiceState` is a **state string, not a boolean** (§3.7): the SAFETY panel shows
 * *which* state, and a boolean would collapse `failed` and `inactive`. O9 makes this the
 * same reading as `cooling.serviceState`, and step 6 writes it to both through
 * `withServiceState`.
 */
export interface SafetyCollection {
  readonly checks: SafetyChecks;
  readonly errors: readonly TelemetryError[];
}

/** §3.6's ufw check. A read that fails is `null` — *watch* — and never `false`. */
const checkUfw = async (
  io: CollectorIo,
  within: Within,
  path: string,
): Promise<{ value: boolean | null; errors: TelemetryError[] }> => {
  let text: string;
  try {
    text = await within(() => io.readFile(path));
  } catch (e) {
    // ⚠ Even `ENOENT`. A missing `ufw.conf` is not evidence that ufw is off — it is
    // evidence that §2.2's bind mount is not there. §3.6 states it: "A missing
    // `/etc/ufw/ufw.conf` is not evidence that ufw is enforcing, and it is not evidence
    // that it is not; it is an `errors[]` entry and a `null`."
    return { value: null, errors: tag('ufw', [`${path}: ${reason(e)}`]) };
  }
  const parsed = parseUfwConf(text);
  return { value: parsed.value, errors: tag('ufw', parsed.problems.map((p) => `${path}: ${p}`)) };
};

/**
 * §3.6's DKMS check, in three steps — and the steps are the check.
 *
 * The naive version is one `readDir` of `<libModules>/<release>/updates/dkms` with
 * `ENOENT → false`. That is wrong in exactly the way §3.7's `pwm5Present` is wrong: if step
 * 11's `-v /lib/modules:/lib/modules:ro` is missing or misspelled, *every* path under it is
 * `ENOENT`, and the dashboard would raise §6.3's alarm — "next boot loses `pwm5`" — from a
 * mount typo.
 *
 * So the mount is proved first, exactly as step 4 proves the hwmon listing against itself:
 *
 * 1. **`<libModules>` must list.** It cannot → `null`. Nothing has been established.
 * 2. **The running kernel's release must be a NAME in that listing.** It is not → `null`.
 *    The documented DKMS failure leaves `/lib/modules/<kver>/` fully populated by the
 *    distribution and merely lacking `updates/dkms`; an *absent kernel tree* is not that
 *    failure, it is evidence the check is looking in the wrong place.
 *    ⚠ **This proves a name in the parent listing, not a populated tree** — an empty
 *    `<libModules>/<release>/` stub would pass it and then yield the alarm at step 3. That
 *    is deliberate and the docstring says so rather than the code growing a `readDir` for
 *    it: for a *running* kernel the distribution always populates the tree, and the
 *    mount-typo case this check exists for already fails at step 1 with an empty or
 *    unreadable `/lib/modules`. HANDOVER §5.1's second half — the two sides are not
 *    distinguishable at a panel in any reachable state, so the extra read would buy
 *    bookkeeping and one more failure mode.
 * 3. **Only then** is `updates/dkms` interrogated. `ENOENT` there is the real alarm —
 *    `dkms install -k <NEW-KVER>` never ran for this kernel — and any other error
 *    (`EACCES`, `EIO`) is `null`, because it says nothing about the module.
 *
 * `errnoCodeOf` is what separates step 3 from a plain catch. ⚠ On `error.code`, by exact
 * equality — never on the message, which is localised prose around a path.
 */
const checkDkms = async (
  io: CollectorIo,
  within: Within,
  libModules: string,
): Promise<{ value: boolean | null; errors: TelemetryError[] }> => {
  let release: string | null;
  try {
    release = parseText(io.unameRelease());
  } catch (e) {
    return { value: null, errors: tag('dkms', [`cannot determine the running kernel: ${reason(e)}`]) };
  }
  if (release === null) {
    return { value: null, errors: tag('dkms', ['the running kernel release is empty']) };
  }

  let kernels: string[];
  try {
    kernels = await within(() => io.readDir(libModules));
  } catch (e) {
    return { value: null, errors: tag('dkms', [`${libModules}: ${reason(e)}`]) };
  }
  if (!kernels.includes(release)) {
    return {
      value: null,
      errors: tag('dkms', [
        `${libModules}: no directory for the running kernel \`${release}\` — ` +
          'the module tree is not mounted where it was expected, so the check could not be run',
      ]),
    };
  }

  const dir = `${libModules}/${release}/${DKMS_SUBPATH}`;
  try {
    const entries = await within(() => io.readDir(dir));
    const present = dkmsPresentFrom(entries);
    return {
      value: present,
      errors: present
        ? []
        : // §3.6's alarm carries its explanation, on the same terms as `pwm5Present: false`.
          tag('dkms', [`${dir}: no \`dell-smm-hwmon.ko*\` — the next boot loses \`pwm5\``]),
    };
  } catch (e) {
    if (errnoCodeOf(e) === ENOENT) {
      return {
        value: false,
        errors: tag('dkms', [
          `${dir}: does not exist — DKMS has not built the 5-fan module for \`${release}\`, ` +
            'so the next boot loses `pwm5`',
        ]),
      };
    }
    return { value: null, errors: tag('dkms', [`${dir}: ${reason(e)}`]) };
  }
};

/**
 * Collect §3.6's three non-hwmon checks.
 *
 * All three run concurrently: they share nothing, and the two file reads plus one socket
 * conversation are independent failures. The files share one {@link deadline}; the D-Bus
 * conversation opens its own inside {@link collectUnitStates}, so the collector's wall
 * clock is one budget rather than the sum of two.
 *
 * ⚠ **This is the only place `gpu-fan-control.service` is read** (O9). `collectServing`
 * opens a connection of its own and deliberately does not ask about it, so
 * `cooling.serviceState` and `safety.fanServiceState` cannot come from two different reads
 * and disagree — `lib/contract.test.ts` asserts they agree across every fixture.
 */
export const collectSafety = async ({
  io = nodeIo,
  dbus = nodeDbus,
  paths = DEFAULT_PATHS,
  timeoutMs = SAFETY_TIMEOUT_MS,
}: CollectSafetyOptions = {}): Promise<SafetyCollection> => {
  const within = deadline(timeoutMs, SAFETY_TIMEOUT_MS);
  const [ufw, dkms, units] = await Promise.all([
    checkUfw(io, within, paths.ufwConf),
    checkDkms(io, within, paths.libModules),
    collectUnitStates({ dbus, paths, units: [FAN_SERVICE_UNIT], timeoutMs }),
  ]);
  return {
    checks: {
      ufwEnforcing: ufw.value,
      dkmsForRunningKernel: dkms.value,
      fanServiceState: units.states.get(FAN_SERVICE_UNIT) ?? null,
    },
    errors: [...ufw.errors, ...dkms.errors, ...units.errors],
  };
};
