/**
 * Canonical telemetry fixtures.
 *
 * These are the shared vocabulary for every test that has to answer "what does the UI do
 * with this snapshot": step 2's formatter tables, step 6's route tests, step 8's ring
 * buffer, step 9's render tests. They live in one module rather than being copy-pasted per
 * step, because the moment four copies of "the all-null snapshot" exist, invariant 1 is
 * being tested against four different definitions of null.
 *
 * That they *compile* is already half the test. A snapshot in which every reading failed
 * is a legal snapshot; a snapshot in which every reading is zero is a *different* legal
 * snapshot. If a field lost its `| null`, {@link nothingReadable} stops compiling.
 *
 * ⚠ Test data only. Nothing under `app/` imports this file, so none of it ships. It is
 * not a mock server and not a default: there is no "empty snapshot" the route may return
 * when a collector fails — a failed reading is `null` plus an `errors[]` entry (§4).
 */

import {
  bytesPerSecond,
  celsius,
  gib,
  isoTimestamp,
  mhz,
  mib,
  percent,
  port,
  pwm,
  rpm,
  seconds,
  throttleMask,
  tokens,
  watts,
} from './types';
import type { Cooling, CoolingChannels, ServingInstance, TelemetrySnapshot } from './types';

/**
 * Every reading failed, *because the probe could not be performed at all*: there is no
 * hwmon named `dell_smm`, so nothing is known about channel 5.
 *
 * Note `safety.pwm5Present` is `null`, not `false` (§3.7). `false` would assert that the
 * DKMS 5-fan module did not load — an alarm — and this snapshot has no evidence for that.
 * Compare {@link pwm5NodeAbsent}, which does.
 */
export const nothingReadable: TelemetrySnapshot = {
  ts: isoTimestamp('2026-09-06T14:02:11.482Z'),
  hostname: null,
  // ⚠ `[]`, not `null`. §4's `standing` is configuration, not a reading: a snapshot in which
  // every *reading* failed still knows what the operator declared standing, and an unset
  // `STANDING` is "nothing is standing" rather than "unknown".
  standing: [],
  gpus: null,
  host: {
    cpuPct: null,
    loadAvg: null,
    cpuTempC: null,
    memUsedGiB: null,
    memTotalGiB: null,
    swapUsedGiB: null,
    swapTotalGiB: null,
    uptimeSec: null,
    kernel: null,
    cpuModel: null,
    cores: null,
    threads: null,
  },
  cooling: {
    fan1Rpm: null,
    fan2Rpm: null,
    fan3Rpm: null,
    fan4Rpm: null,
    fan5Rpm: null,
    ch5Mode: null,
    ch5Pwm: null,
    serviceState: null,
  },
  serving: null,
  storage: {
    root: { usedGiB: null, totalGiB: null },
    home: { usedGiB: null, totalGiB: null },
    net: { rxBytesPerSec: null, txBytesPerSec: null, link: null },
  },
  safety: {
    ufwEnforcing: null,
    pwm5Present: null,
    dkmsForRunningKernel: null,
    fanServiceState: null,
  },
  errors: [{ source: 'dell-smm', message: 'no hwmon named dell_smm' }],
};

/** Everything read, and several readings are genuinely zero. A dead fan, an idle card. */
export const everythingZero: TelemetrySnapshot = {
  ts: isoTimestamp('2026-09-06T14:02:16.501Z'),
  hostname: 'ai-server',
  standing: [],
  gpus: [
    {
      index: 0,
      name: 'Tesla V100-PCIE-32GB',
      bus: '97:00.0',
      tempC: celsius(0),
      powerW: watts(0),
      powerCapW: watts(250),
      memUsedMiB: mib(0),
      memTotalMiB: mib(32768),
      utilPct: percent(0),
      smClockMHz: mhz(0),
      throttleReasons: throttleMask('0x0000000000000000'),
    },
  ],
  host: {
    cpuPct: percent(0),
    loadAvg: [0, 0, 0],
    cpuTempC: celsius(0),
    memUsedGiB: gib(0),
    memTotalGiB: gib(61),
    swapUsedGiB: gib(0),
    swapTotalGiB: gib(8),
    uptimeSec: seconds(0),
    kernel: '7.0.0-30-generic',
    cpuModel: 'Intel(R) Xeon(R) W-2135 CPU @ 3.70GHz',
    cores: 6,
    threads: 12,
  },
  cooling: {
    fan1Rpm: rpm(0),
    fan2Rpm: rpm(0),
    fan3Rpm: rpm(0),
    fan4Rpm: rpm(0),
    fan5Rpm: rpm(0),
    ch5Mode: 'manual',
    ch5Pwm: pwm(0),
    serviceState: 'active',
  },
  serving: [],
  storage: {
    root: { usedGiB: gib(0), totalGiB: gib(238.5) },
    home: { usedGiB: gib(0), totalGiB: gib(931.5) },
    net: { rxBytesPerSec: bytesPerSecond(0), txBytesPerSec: bytesPerSecond(0), link: 'up' },
  },
  safety: {
    ufwEnforcing: false,
    pwm5Present: true,
    dkmsForRunningKernel: true,
    fanServiceState: 'active',
  },
  errors: [],
};

/**
 * The five fan channels as the live box reports them under load, shared by the channel-5
 * fixtures below so that the only thing differing between them is the `pwm5` probe.
 */
const engagedChannels: CoolingChannels = {
  fan1Rpm: rpm(1005),
  fan2Rpm: rpm(720),
  fan3Rpm: rpm(740),
  fan4Rpm: rpm(1111),
  fan5Rpm: rpm(4308),
  serviceState: 'active',
};

/** The same four channels, on a box where the 5-fan module never loaded. */
const fourChannels: CoolingChannels = {
  ...engagedChannels,
  fan5Rpm: null,
};

/**
 * Channel 5 under manual control at HIGH — the commissioned configuration (§3.3).
 * `pwm5` returned 255, and that successful numeric read is what makes the mode manual.
 */
export const ch5Manual: Cooling = { ...engagedChannels, ch5Mode: 'manual', ch5Pwm: pwm(255) };

/**
 * Channel 5 in EC automatic control — `pwm5` returned `ENODATA`, which is **healthy**
 * (invariant 3, §3.7). `fan5` is being read perfectly well at the EC's ~2210 RPM; only the
 * duty cycle is unknowable.
 */
export const ch5EcAuto: Cooling = {
  ...engagedChannels,
  fan5Rpm: rpm(2210),
  ch5Mode: 'ec-auto',
  ch5Pwm: null,
};

/*
 * The three `pwm5Present` values, all of which carry `ch5Mode: null`.
 *
 * This trio is §3.7's rule by example, and it is more durable than any comment: the
 * one-directional implication `ch5Mode !== null ⟹ pwm5Present === true` is consistent with
 * all three, while the biconditional step 1 originally documented is falsified by two of
 * them. `lib/contract.test.ts` asserts they are distinct.
 */

/**
 * `pwm5Present: false` — **the alarm.** The `dell_smm` hwmon was read and answered; there
 * is no `pwm5` node, so the DKMS 5-fan module did not load and GPU fan control is gone.
 * fan1–fan4 survive (§9), which is what makes this distinguishable from a dead driver.
 */
export const pwm5NodeAbsent: TelemetrySnapshot = {
  ...everythingZero,
  cooling: { ...fourChannels, ch5Mode: null, ch5Pwm: null },
  safety: { ...everythingZero.safety, pwm5Present: false, dkmsForRunningKernel: false },
  errors: [{ source: 'dell-smm', message: 'no pwm5 on hwmon dell_smm' }],
};

/**
 * `pwm5Present: true` with `ch5Mode: null` — the case the biconditional could not express.
 * The node exists, so the module loaded and the safety check passes; reading it failed
 * with something other than `ENODATA` (`EACCES` from a `/sys` mount the container user
 * cannot traverse, `EIO` from the SMM call), so the mode is unknown.
 */
export const pwm5Unreadable: TelemetrySnapshot = {
  ...everythingZero,
  cooling: { ...engagedChannels, ch5Mode: null, ch5Pwm: null },
  safety: { ...everythingZero.safety, pwm5Present: true },
  errors: [{ source: 'dell-smm', message: 'pwm5: EACCES' }],
};

/**
 * Two discovered instances (§3.4): one serving normally, one whose unit is down.
 *
 * The down instance is the point. Its env file parsed — `instance`, `port` and `ctx` are
 * known — while everything that required talking to the process is `null`, which is the
 * normal shape of a stopped `llama-server@N` and the reason those fields are nullable
 * independently of each other.
 */
export const servingInstances: readonly ServingInstance[] = [
  {
    instance: 0,
    port: port(8080),
    unitState: 'active',
    model: 'qwen3.6-27b',
    ctx: tokens(131072),
    health: 'ok',
  },
  {
    instance: 1,
    port: port(8081),
    unitState: 'failed',
    model: null,
    ctx: tokens(131072),
    health: 'unreachable',
  },
];

/** A snapshot carrying {@link servingInstances}. §3.4 has no other runtime coverage. */
export const servingPopulated: TelemetrySnapshot = {
  ...everythingZero,
  serving: servingInstances,
  errors: [{ source: 'llama-health', message: 'connect ECONNREFUSED 127.0.0.1:8081' }],
};

/**
 * An instance discovered from its env filename and nothing more — `/etc/llama-server/`
 * was listed, but the file itself could not be read and D-Bus did not answer.
 *
 * Every member of {@link ServingInstance} except the identity is `null` here, which is
 * what makes it the fixture that proves §3.4's nullability across the wire.
 */
export const servingIdentityOnly: ServingInstance = {
  instance: 2,
  port: null,
  unitState: null,
  model: null,
  ctx: null,
  health: null,
};
