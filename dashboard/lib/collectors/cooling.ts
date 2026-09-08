/**
 * §3.3's IO wrapper: find the `dell_smm` hwmon node, read the five tachometers, run the
 * one three-valued `pwm5` probe.
 *
 * No parsing happens here — `dell-smm.ts` is pure and holds all of it. This file fetches
 * bytes, catches failure, prefixes paths, and bounds the clock. The same three rules as
 * `collect.ts`: nothing throws, a failure is scoped to its own `ErrorSource` (`dell-smm`
 * for everything in this file), and a failed reading is a partial result plus an
 * `errors[]` entry rather than a 500.
 *
 * ---
 *
 * ### ⚠ O17 — these reads are bounded HERE, because the seam does not bound them
 *
 * `CollectorIo` bounds `run` and explicitly does **not** bound `readFile`/`readDir`. For
 * `/proc` that is fine: procfs does not block. **These are not filesystem reads in any
 * meaningful sense — every one is an SMM BIOS call into the Dell EC**, on a board whose
 * `FAN_HDD` header once hung POST and whose EC runs a closed loop the OS cannot inspect.
 * §4 samples per request, so an unbounded read here hangs the telemetry route and every
 * browser polling it.
 *
 * Two mechanisms, and both matter:
 *
 * 1. **One deadline for the whole probe** ({@link DELL_SMM_TIMEOUT_MS}), enforced per read
 *    against the time remaining. Once it is spent, later reads are not attempted — the
 *    fields are `null` with an entry naming the timeout.
 * 2. **The reads are SEQUENTIAL**, unlike `collectHost`'s nine concurrent ones. Two
 *    independent reasons, either sufficient: `dell-smm-hwmon` serialises every SMM call
 *    behind one mutex, so concurrency buys nothing; and `fs.readFile` runs on libuv's
 *    thread pool, **four threads by default**, so eleven concurrent blocked SMM reads
 *    would starve every other `fs` and DNS operation in the process — including the ones
 *    the rest of the snapshot needs.
 *
 * ⚠ **The deadline itself lives in {@link module:lib/collectors/deadline}, not here.** It
 * carries the two properties this file must not re-derive: a **monotonic** clock, because a
 * backward NTP step against `Date.now()` turned this 2 s bound into a measured one-hour
 * bound; and a **validated budget**, because `setTimeout` clamps an out-of-range delay to
 * 1 ms, so `timeoutMs: Infinity` used to mean "time out immediately, every poll". Step 5
 * bounds D-Bus, two HTTP probes and `statvfs` and must call that module rather than copy
 * this one — which is why it was hoisted before step 5 rather than after.
 *
 * ⚠ **A bounded `readFile` is abandoned, not cancelled.** The seam takes no `AbortSignal`,
 * and an in-flight `fs.readFile` cannot be interrupted anyway: the thread-pool slot stays
 * occupied until the SMM call returns. The deadline bounds *the request*, which is what
 * §3.1 asks of `nvidia-smi` for the same reason. The late rejection is subscribed to and
 * therefore never becomes an unhandled rejection — `cooling.test.ts` asserts that.
 */

import type { Cooling, Safety, TelemetryError } from '../types';
import { DEFAULT_PATHS } from './collect';
import type { CollectorPaths } from './collect';
import {
  DELL_SMM_NAME,
  FAN_CHANNELS,
  NO_FANS,
  PWM5_FILE,
  classifyPwm5Read,
  coolingFrom,
  fanInputFile,
  parseDellSmmFans,
  pwm5PresentFrom,
} from './dell-smm';
import type { FanReadings, Pwm5Probe, Pwm5Read } from './dell-smm';
import { boundedReader, deadline } from './deadline';
import { errnoCodeOf, reason, tag } from './errors';
import { HWMON_NAME_FILE, describeHwmonMiss, findHwmonNode } from './hwmon';
import { nodeIo } from './io';
import type { CollectorIo } from './io';

/**
 * The whole `dell_smm` probe's budget, in milliseconds.
 *
 * ⚠ **The spec does not state one** — §3.1 bounds `nvidia-smi` at 4 s and says nothing
 * about hwmon. Reported as a gap; this number is chosen, not derived, and the reasoning is
 * recorded so a later step can replace it with a measured one:
 *
 * - The eleven reads take well under a millisecond each on a healthy box, so 2 s is more
 *   than three orders of magnitude of headroom.
 * - It sits under §6.7's 5 s default cadence and under §4's per-request sampling, so a
 *   wedged EC costs one late poll rather than a wedged route — even stacked behind
 *   `nvidia-smi`'s own 4 s, since the collectors run concurrently.
 * - It is *below* `NVIDIA_SMI_TIMEOUT_MS` deliberately: this is a sensor read, not a
 *   process spawn, and a `dell_smm` read that takes longer than a `nvidia-smi` invocation
 *   is already pathological.
 */
export const DELL_SMM_TIMEOUT_MS = 2000;

/** Arguments to {@link collectCooling}. Same options-object convention as every collector. */
export interface CollectCoolingOptions {
  readonly io?: CollectorIo;
  readonly paths?: CollectorPaths;
  /** O17's bound on the whole probe. See {@link DELL_SMM_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
}

/**
 * What {@link collectCooling} yields.
 *
 * ⚠ **Two contract fields, from one probe, side by side** — that is the shape §3.7
 * demands. `pwm5Present` is `safety.pwm5Present`; `cooling.ch5Mode` is §3.3's. Step 6
 * assembles them with no adapter: the types are `Cooling` and `Safety['pwm5Present']`
 * exactly.
 *
 * ⚠ `cooling.serviceState` is **always `null` here**. Step 4 does not read D-Bus; step 6
 * must pass step 5's `ActiveState` through {@link withServiceState} before the snapshot
 * goes on the wire, and write the same value to `safety.fanServiceState` (O9).
 */
export interface CoolingCollection {
  readonly cooling: Cooling;
  readonly pwm5Present: Safety['pwm5Present'];
  readonly errors: readonly TelemetryError[];
}

/** Every exit from {@link collectCooling} goes through here, so the shape cannot diverge. */
const assemble = (
  probe: Pwm5Probe,
  fans: FanReadings,
  problems: readonly string[],
): CoolingCollection => ({
  // `serviceState: null` — step 4 does not read D-Bus. See `CoolingCollection`.
  cooling: coolingFrom(fans, probe, null),
  pwm5Present: pwm5PresentFrom(probe),
  errors: tag('dell-smm', problems),
});

/**
 * Collect §3.3's cooling readings and §3.6's `pwm5Present` in one pass.
 *
 * The order is forced by §3.7's probe table and is not an implementation detail:
 *
 * 1. **Locate `dell_smm` by `name`.** Failing here is `unlocated` — `pwm5Present: null`,
 *    *unknown*. It can never be the alarm, because we did not get far enough to look.
 * 2. **List the node's directory.** ⚠ This listing, not a speculative read, is the
 *    presence oracle. If the directory itself will not list (`EACCES` — §2.2 runs the
 *    container non-root), the answer is *unknown*: attempting `pwm5` anyway would get
 *    `EACCES` from the read and be misread as "the node exists", asserting a `true` we
 *    have no evidence for. ⚠ And the listing is checked against itself first — it must
 *    contain the `name` file we just read out of that same directory, or it is not a
 *    listing we can draw an absence from.
 * 3. **Read the `fanN_input` files that the listing showed.** A file that is not listed is
 *    `null` with no entry. On the stock 4-fan driver `fan5_input` and `pwm5` are missing
 *    **together** — the DKMS patch adds both — so `pwm5Present: false` explains the blank
 *    channel. ⚠ The two can only come apart on a driver that does not exist today, and in
 *    that combination channel 5 would render `—` with nothing in `errors[]` explaining it;
 *    steps 9/10 own how that renders (A9).
 * 4. **`pwm5` absent from the listing → `absent`.** §3.6's alarm: the DKMS 5-fan module
 *    did not load and GPU fan control is gone.
 * 5. **Read `pwm5`.** `ENODATA` is EC auto and healthy and carries **no** `errors[]`
 *    entry; a number in range is manual; anything else leaves the mode unknown while
 *    `pwm5Present` stays `true`.
 */
export const collectCooling = async ({
  io = nodeIo,
  paths = DEFAULT_PATHS,
  timeoutMs = DELL_SMM_TIMEOUT_MS,
}: CollectCoolingOptions = {}): Promise<CoolingCollection> => {
  const reader = boundedReader(io, deadline(timeoutMs, DELL_SMM_TIMEOUT_MS));
  const problems: string[] = [];

  const node = await findHwmonNode(reader, paths.hwmonRoot, DELL_SMM_NAME);
  if (!node.found) {
    // ⚠ All three misses are `pwm5Present: null`. §3.7 lists "`/sys` not mounted, no
    // `dell_smm` hwmon, `EACCES`" together as *unknown* — never the alarm.
    return assemble({ outcome: 'unlocated' }, NO_FANS, [
      describeHwmonMiss(node, paths.hwmonRoot, DELL_SMM_NAME),
    ]);
  }
  const { dir } = node;

  let entries: string[];
  try {
    entries = await reader.readDir(dir);
  } catch (e) {
    return assemble({ outcome: 'unlocated' }, NO_FANS, [`${dir}: ${reason(e)}`]);
  }
  const listed = new Set(entries);

  // ⚠ The oracle's sanity floor, and it is the only guard on the value §3.6 calls THE
  // alarm. "`pwm5` is not in the listing" is treated as positive evidence that the DKMS
  // module did not load, so the listing must first be shown to be a listing: we demonstrably
  // just read `${dir}/name` out of this directory, therefore `name` must be in it. A
  // listing that lost it is not evidence of anything — it is a filtered, synthetic or empty
  // answer — and §3.7's rule is that "I could not look" is *unknown*, never the alarm. This
  // is unreachable on a coherent filesystem; it costs one comparison and it stops any future
  // fake or hardened `/sys` from silently minting "GPU fan control is gone".
  if (!listed.has(HWMON_NAME_FILE)) {
    return assemble({ outcome: 'unlocated' }, NO_FANS, [
      `${dir}: listing has no \`${HWMON_NAME_FILE}\`, which was just read from it — ` +
        'the directory listing cannot be trusted to say whether `pwm5` exists',
    ]);
  }

  // Sequential on purpose — see the module doc. `for…of` with `await` is the point.
  const files: Record<string, string> = {};
  for (const channel of FAN_CHANNELS) {
    const file = fanInputFile(channel);
    if (!listed.has(file)) {
      // ⚠ §6.3, the `fan1`–`fan4` row: "An em dash on channels 1–4 **always** has an
      // `errors[]` entry behind it; one on channel 5 may not, because channel 5 has a
      // documented absent state and these do not." That asymmetry is the whole of this
      // branch. Channel 5 legitimately vanishes on the stock 4-fan driver and is explained
      // by `pwm5Present: false` a few lines below, so it stays silent. Channels 1–4 have no
      // such state: the driver exposes them unconditionally, so one going missing is news,
      // and without an entry it would render as a bare `—` that §6.5's one exception cannot
      // reach — the neighbour that would explain it reads `unavailable`, which O13 says is
      // not a severity.
      //
      // Unreachable on this board, and kept anyway: it costs one comparison, it can
      // fabricate nothing (an `errors[]` entry mints no verdict and no severity), and it is
      // the difference between §6.3's sentence being true and being true by luck.
      // ⚠ Channel 5's silence is excused by its **documented absent state**, and only while
      // that state actually holds. On the stock 4-fan driver `pwm5` is missing too, and
      // `pwm5Present: false` explains the em dash a few lines below. But if `pwm5` IS listed
      // and `fan5_input` is not, the module is loaded and the tach is simply gone — there is
      // no absent state to point at, the COOLING cell renders `unavailable` which O13 says is
      // **not a severity**, and §6.5's one exception therefore does not reach it. That is
      // S11/G5: an em dash with nothing behind it, on the panel this dashboard exists for.
      // Settled 2026-09-07 — the collector files the entry, so §6.5's rule stays one rule
      // rather than becoming "always, except here".
      if (channel !== 5 || listed.has(PWM5_FILE)) {
        problems.push(
          `${dir}: no \`${file}\` in the listing — channel ${channel} did not enumerate`,
        );
      }
      continue;
    }
    try {
      files[file] = await reader.readFile(`${dir}/${file}`);
    } catch (e) {
      problems.push(`${dir}/${file}: ${reason(e)}`);
    }
  }
  const fans = parseDellSmmFans(files);
  problems.push(...fans.problems.map((problem) => `${dir}: ${problem}`));

  if (!listed.has(PWM5_FILE)) {
    problems.push(
      `${dir}: no \`${PWM5_FILE}\` node — the DKMS 5-fan module did not load, ` +
        'so channel 5 is uncontrollable',
    );
    return assemble({ outcome: 'absent' }, fans.value, problems);
  }

  const path = `${dir}/${PWM5_FILE}`;
  let read: Pwm5Read;
  try {
    read = { kind: 'ok', text: await reader.readFile(path) };
  } catch (e) {
    // ⚠ The code, not the message (HANDOVER). `ENODATA` here is the healthy EC-auto
    // signal and every other code leaves the mode unknown; prose cannot carry that.
    read = { kind: 'failed', code: errnoCodeOf(e), message: reason(e) };
  }
  const probe = classifyPwm5Read(read);
  problems.push(...probe.problems.map((problem) => `${path}: ${problem}`));
  return assemble(probe.value, fans.value, problems);
};
