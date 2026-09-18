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

/**
 * A snapshot carrying {@link servingInstances}. §3.4 has no other runtime coverage.
 *
 * ⚠ **10b-S-G: the error now carries `instance: 1` structurally**, not merely a port number
 * a panel used to have to find inside the message. This is the exact fixture 10b's finding
 * F2 caught rendering beside the *healthy* instance 0 — `lib/collectors/serving.test.ts`
 * asserts {@link collectServing} produces this same `instance` field from a live probe
 * failure, so the fixture and the collector's real output cannot drift apart.
 */
export const servingPopulated: TelemetrySnapshot = {
  ...everythingZero,
  serving: servingInstances,
  errors: [{ source: 'llama-health', message: 'connect ECONNREFUSED 127.0.0.1:8081', instance: 1 }],
};

/**
 * ⚠⚠ 12b — **the `serving[]` the DEPLOYED server really sends, frozen as unparsed bytes.**
 *
 * This is not a fixture written by hand to match 12b's change; it is the output of the
 * collector **as it stood before that change**, run on 2026-09-17 against the live box's own
 * inputs — `/etc/llama-server/0.env` and `1.env` read over SSH, and the real `/v1/models`
 * bodies from 127.0.0.1:8080 and :8081 — then `JSON.stringify`d. That is why the context is
 * 163840 and the model is `qwen3.6-27b`: those are the box's values on the day, not this
 * repo's older 131072 fixtures.
 *
 * ⚠ **What it is evidence FOR**: §3.4's `gpus` is *additive*. Six keys per instance and no
 * `gpus` among them — so a client that knows about the field must still validate this body
 * and render it exactly as it renders today, because this is the body the running container
 * will keep sending until it is rebuilt. The alternative spelling (`gpus: readonly number[] |
 * null`, required) would refuse **every poll the live box makes**.
 *
 * ⚠ **A string, not an object literal.** It has to enter `parseSnapshot` as bytes nobody
 * checked; typing it would have TypeScript agree with the validator about a shape the
 * validator is the thing under test for.
 *
 * ⚠ `unitState` is `null` here and that is honest rather than a gap: the capture script had
 * no D-Bus socket to the box, so systemd was never asked. It changes nothing about the key
 * set, which is what this asset exists to pin.
 */
export const LIVE_BOX_SERVING_WIRE = `[
  {
    "instance": 0,
    "port": 8080,
    "unitState": null,
    "model": "qwen3.6-27b",
    "ctx": 163840,
    "health": "ok"
  },
  {
    "instance": 1,
    "port": 8081,
    "unitState": null,
    "model": "qwen3.6-27b",
    "ctx": 163840,
    "health": "ok"
  }
]`;

/**
 * ⚠⚠ 12b — the same two instances **declaring the cards they serve** (§3.4's `gpus`).
 *
 * This is the arrangement the box has always run and the only one the old join was ever
 * right about: one process per card, `CUDA_VISIBLE_DEVICES=%i`, so instance N lists card N.
 * Rendered, it must be **byte-identical** to {@link servingInstances} — which carries no
 * `gpus` at all — because §3.4's fallback says an older server in this arrangement gets the
 * same answer. A fixture pair that renders identically for two different reasons is the
 * point: one is a claim the wire makes, the other is a claim we used to make for it.
 */
export const servingPerGpu: readonly ServingInstance[] = [
  { ...(servingInstances[0] as ServingInstance), gpus: [0] },
  { ...(servingInstances[1] as ServingInstance), gpus: [1] },
];

/**
 * ⚠⚠ 12b-TEST — **the same two instances CROSS-PINNED: instance 0 serves card 1, instance 1
 * serves card 0.** The fixture where the instance number and the card number DISAGREE.
 *
 * ⚠ **This exists because the loop's own coincidence reappeared inside the tests written to
 * catch it.** `servingPerGpu` has instance N on card N — which is the truth about this box —
 * and on that fixture *every* wrong implementation of the join renders correctly: naming the
 * card from `gpus`, from the instance number, or from the row's position in `serving[]` all
 * produce `GPU 0` for instance 0. 12b's build found three of its own mutations
 * (`12b-SP3`/`SP4`/`SP5`) inert for exactly that reason and answered it with a fourth
 * mutation; the answer that generalises is a FIXTURE in which the two numbers cannot be
 * confused, used as the DEFAULT subject of every test whose subject is the join.
 *
 * Rendered: GPU 1 carries instance 0's model, GPU 0 carries instance 1's (which is `null`,
 * because that instance's unit is down — so the LABEL is what discriminates there, not the
 * value), and the SERVING rows read `:8080 · GPU 1` and `:8081 · GPU 0`.
 *
 * ⚠ It is a real state, not a contrivance: it is what a mis-`%i`'d template or a hand-edited
 * drop-in produces, and §6.2's whole complaint about the old join is that it *"prints the
 * wrong model on a card rather than failing visibly"* when it happens.
 */
export const servingCrossPinned: readonly ServingInstance[] = [
  { ...(servingInstances[0] as ServingInstance), gpus: [1] },
  { ...(servingInstances[1] as ServingInstance), gpus: [0] },
];

/**
 * ⚠⚠ 12b — **one process across both cards** (`SERVING-MODES.md` §4): a single instance whose
 * `gpus` is `[0, 1]`.
 *
 * One row on the SERVING panel and a *joint* line on both GPU cards. ⚠ The instance number is
 * deliberately **0**, so a panel that recovered the old join by accident would still print
 * "served by instance 0" on GPU 0 and would be caught only on GPU 1 — which is exactly the
 * card `serving-mode.sh`'s own caveat says the shipped dashboard gets wrong.
 */
export const servingSplit: readonly ServingInstance[] = [
  {
    instance: 0,
    port: port(8080),
    unitState: 'active',
    model: 'gemma-4-31b',
    ctx: tokens(262144),
    health: 'ok',
    gpus: [0, 1],
  },
];

/**
 * ⚠⚠ 12b — §3.4's `null`: the unit exists and its `CUDA_VISIBLE_DEVICES` could not be read.
 *
 * ⚠ **Not the same fixture as an older server**, and keeping them apart is the whole ruling:
 * this one carries the key holding `null` and an `errors[]` entry naming the unit, and it
 * renders an em dash. {@link servingInstances} omits the key and renders the index join
 * silently. Collapsing them would put an em dash on a perfectly healthy box.
 */
export const servingGpusUnreadable: readonly ServingInstance[] = [
  { ...(servingInstances[0] as ServingInstance), gpus: null },
];

/** A snapshot carrying {@link servingGpusUnreadable} and the `dbus` entry that explains it. */
export const servingGpusUnreadableSnapshot: TelemetrySnapshot = {
  ...everythingZero,
  serving: servingGpusUnreadable,
  errors: [
    {
      source: 'dbus',
      message: 'llama-server@0.service: Environment: org.freedesktop.DBus.Error.AccessDenied: no detail',
      instance: 0,
    },
  ],
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
  // ⚠ 12b — `null`, and the key is PRESENT. The bus did not answer, so the unit's own
  // `CUDA_VISIBLE_DEVICES` could not be read: §3.4's `null`, an em dash with the `dbus` entry
  // beside it — never the absent key, which would say "this server has never heard of the
  // field" about a server that has.
  gpus: null,
};
