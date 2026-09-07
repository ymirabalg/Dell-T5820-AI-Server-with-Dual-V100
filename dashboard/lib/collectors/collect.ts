/**
 * The thin IO wrappers: fetch bytes, hand them to a parser, catch failure.
 *
 * **No parsing happens in this file** and no function here is more than a `try`, a call
 * into `proc.ts` / `nvidia-smi.ts`, and the tagging of `problems` with their §3.7
 * {@link ErrorSource}. That division is the step's design constraint; anything clever
 * here is in the wrong file.
 *
 * Three rules hold throughout, and they are invariant 5 and §6.5 in code form:
 *
 * 1. **Nothing throws.** Every read is wrapped. A rejected promise becomes a `null`
 *    reading plus an `errors[]` entry — never a 500, never a partial object with a
 *    missing key.
 * 2. **A failure is scoped to its own source.** A failed `/proc/meminfo` does not blank
 *    the CPU panel. Eighteen `ErrorSource` names exist precisely so §6.5 can "match an
 *    error to the figure it explains".
 * 3. **`net-operstate` is not `proc-net-dev`.** §3.7: the link state comes from sysfs and
 *    the byte counters from `/proc`, so folding them together "would attribute a failed
 *    link read to the byte counters and point the UI at the wrong figure".
 */

import type { Environment } from '../auth/config';
import type { ErrorSource, Gpu, Host, Network, TelemetryError } from '../types';
// ⚠ `tag` and `reason` moved to `./errors` in step 4, unchanged, so that `cooling.ts` and
// `hwmon.ts` share one definition instead of carrying a second copy. Every call site here
// is untouched.
import { reason, tag } from './errors';
import { describeHwmonMiss, findHwmonNode } from './hwmon';
import { NVIDIA_SMI_ARGS, parseNvidiaSmiCsv } from './nvidia-smi';
import {
  parseCpuinfo,
  parseHostname,
  parseLoadavg,
  parseMeminfo,
  parseNetDev,
  parseOperstate,
  parsePackageTempC,
  parseProcStat,
  parseUptime,
} from './proc';
import type { CpuTimes, NetCounters } from './proc';
import { advanceDeltas } from './deltas';
import type { DeltaSample } from './deltas';
import { NVIDIA_SMI_TIMEOUT_MS, nodeIo } from './io';
import type { CollectorIo } from './io';
import { parseText } from './numbers';
import type { ParseResult } from './result';

/**
 * Everything §2.2 bind-mounts, in one place, so a step-11 mount typo is a one-line change
 * and a step-3 test can point the same code at a fixture directory.
 *
 * The `/proc` paths are the host's because the container runs `--pid host`; `/sys` is
 * mounted read-only; `/etc/hostname` is a single read-only file bind. **A collector that
 * reads a path the container will not have is a step-12 failure written in step 3.**
 */
export interface CollectorPaths {
  readonly procStat: string;
  readonly procMeminfo: string;
  readonly procLoadavg: string;
  readonly procUptime: string;
  readonly procNetDev: string;
  readonly procCpuinfo: string;
  readonly etcHostname: string;
  readonly hwmonRoot: string;
  readonly sysClassNet: string;
  readonly nvidiaSmi: string;
  // ------------------------------------------------------- step 5, §3.4/§3.5/§3.6
  /** §3.4's instance discovery root. Enumerated, never hard-coded to 0 and 1. */
  readonly etcLlamaServer: string;
  /** §3.6's ufw check. The file, not the directory — `ufw status` needs root, this does not. */
  readonly ufwConf: string;
  /** §3.6's DKMS check walks `<libModules>/<running kernel>/updates/dkms/`. */
  readonly libModules: string;
  /** §3.5's two `statvfs` targets, as §2.2 bind-mounts them. */
  readonly rootMount: string;
  readonly homeMount: string;
  /** §2.2's read-only system bus socket. §3.4's `unitState` and §3.6's fan service. */
  readonly dbusSystemSocket: string;
}

/** §2.2's mounts, as they exist inside the container. */
export const DEFAULT_PATHS: CollectorPaths = {
  procStat: '/proc/stat',
  procMeminfo: '/proc/meminfo',
  procLoadavg: '/proc/loadavg',
  procUptime: '/proc/uptime',
  procNetDev: '/proc/net/dev',
  procCpuinfo: '/proc/cpuinfo',
  etcHostname: '/etc/hostname',
  hwmonRoot: '/sys/class/hwmon',
  sysClassNet: '/sys/class/net',
  nvidiaSmi: 'nvidia-smi',
  etcLlamaServer: '/etc/llama-server',
  ufwConf: '/etc/ufw/ufw.conf',
  libModules: '/lib/modules',
  // ⚠ §2.2 mounts these two at `/host/root` and `/host/home`, NOT at `/` and `/home` —
  // `statvfs('/')` inside a container measures the container's own overlay, which is a
  // plausible-looking number about the wrong filesystem.
  //
  // ⚠ **They are the ONLY two paths that differ between the container and the host**, which
  // is why {@link pathsFrom} overrides these and nothing else. Everything above is mounted at
  // its own name (`-v /sys:/sys:ro`, `/etc/llama-server`, `/etc/ufw/ufw.conf`, `/lib/modules`,
  // the D-Bus socket) or comes through `--pid host` (`/proc`), so it is already correct
  // natively. Measured 2026-09-07: a native run read every collector correctly and failed on
  // exactly these two.
  rootMount: '/host/root',
  homeMount: '/host/home',
  dbusSystemSocket: '/run/dbus/system_bus_socket',
};

/** Override for {@link CollectorPaths.rootMount}. See {@link pathsFrom}. */
export const ROOT_MOUNT_KEY = 'ROOT_MOUNT';

/** Override for {@link CollectorPaths.homeMount}. See {@link pathsFrom}. */
export const HOME_MOUNT_KEY = 'HOME_MOUNT';

/**
 * {@link DEFAULT_PATHS}, with the two filesystem mounts overridable from the environment.
 *
 * ⚠ **This exists so the app can run OUTSIDE a container, and for nothing else.** §2.2 mounts
 * `/` and `/home` at `/host/root` and `/host/home`, so the defaults are correct in the
 * container and a native run reads `ENOENT` on both — which is what it did on 2026-09-07's
 * first deploy, correctly, with one `errors[]` entry per filesystem and a 200 (invariant 5).
 * A native run is a debugging arrangement, not §2.5's deployment, and this is what makes it
 * complete rather than two permanent em dashes.
 *
 * ⚠ **Setting these INSIDE the container is a way to measure the wrong filesystem.**
 * `statvfs('/')` there reports the container's own overlay: a plausible number about something
 * nobody asked about, which is this project's least favourite kind of wrong. The container
 * sets neither key and gets the defaults.
 *
 * Only these two are overridable, because only these two are remapped — see the ⚠ at
 * {@link DEFAULT_PATHS}. An empty or whitespace-only value is **not** an override: it is the
 * absence of the key spelled differently, exactly as `readStandingList` treats `STANDING`.
 */
export const pathsFrom = (env: Environment): CollectorPaths => ({
  ...DEFAULT_PATHS,
  rootMount: env[ROOT_MOUNT_KEY]?.trim() || DEFAULT_PATHS.rootMount,
  homeMount: env[HOME_MOUNT_KEY]?.trim() || DEFAULT_PATHS.homeMount,
});

/** §3.5 fixes the interface; the dashboard is not multi-host. */
export const DEFAULT_INTERFACE = 'eno1';

/**
 * Read a file and parse it. The whole shape of every wrapper below.
 *
 * On a failed read the parser is never called and `fallback` is the reading — which is
 * always the all-`null` value, because a file that could not be read is not evidence of
 * anything (§3.6's reasoning about `ufw.conf`, applied everywhere).
 */
const readAndParse = async <T>(
  io: CollectorIo,
  source: ErrorSource,
  path: string,
  parse: (text: string) => ParseResult<T>,
  fallback: T,
): Promise<{ value: T; errors: TelemetryError[] }> => {
  let text: string;
  try {
    text = await io.readFile(path);
  } catch (e) {
    return { value: fallback, errors: tag(source, [`${path}: ${reason(e)}`]) };
  }
  try {
    const parsed = parse(text);
    // ⚠ The path is prefixed HERE, not in the parser. `CollectorPaths` is injectable and
    // step 11 may mount `/proc` elsewhere; a parser that hard-coded `/proc/stat:` would
    // name a file that was never read. This layer is the only one that knows the truth.
    return {
      value: parsed.value,
      errors: tag(
        source,
        parsed.problems.map((problem) => `${path}: ${problem}`),
      ),
    };
  } catch (e) {
    // The parsers are pure and `proc.test.ts` asserts none of them throws on junk. This
    // catch is here anyway because invariant 5 is unconditional: a parser bug must surface
    // as one `errors[]` entry against one source, not as a 500 that loses the whole
    // snapshot — including the eight readings that succeeded.
    return { value: fallback, errors: tag(source, [`${path}: parser failed: ${reason(e)}`]) };
  }
};

/**
 * `uname` release, guarded. `os.release()` does not throw, but this is the one reading
 * taken outside a `try` and invariant 5 does not have an exception for "cannot fail".
 */
const kernelRelease = (io: CollectorIo): string | null => {
  try {
    return parseText(io.unameRelease());
  } catch {
    return null;
  }
};

// ---------------------------------------------------------------------------
// §3.1 GPUs
// ---------------------------------------------------------------------------

/**
 * Arguments to {@link collectGpus}.
 *
 * ⚠ **An options object, not positional parameters, and every collector in this project
 * should match.** The three collectors here disagreed until step 3's reconciliation —
 * `collectHost` took an object, the other two were positional — and steps 4 and 5 would
 * each have copied whichever they read first, leaving step 6 calling four collectors two
 * ways. An options object is also the one shape that survives a new parameter, which this
 * signature needed the moment `nvidia-smi` gained a real deadline.
 */
export interface CollectGpusOptions {
  readonly io?: CollectorIo;
  readonly paths?: CollectorPaths;
  /** §3.1's 4 s bound. See {@link NVIDIA_SMI_TIMEOUT_MS}. */
  readonly timeoutMs?: number;
}

/** Arguments to {@link collectCpuTemp}. Same convention as every other collector. */
export interface CollectCpuTempOptions {
  readonly io?: CollectorIo;
  readonly paths?: CollectorPaths;
}

/** What {@link collectGpus} yields. `gpus` is `Gpu[] | null`, and `null` is not `[]`. */
export interface GpuCollection {
  readonly gpus: readonly Gpu[] | null;
  readonly errors: readonly TelemetryError[];
}

/**
 * Run `nvidia-smi` and parse §3.1's eleven columns.
 *
 * **`null` and `[]` are different answers and this function is where they diverge:**
 *
 * | outcome | result | why |
 * |---|---|---|
 * | the binary is absent, or the call failed / timed out | `gpus: null` + an error | the enumeration could not be performed |
 * | it ran, exit 0, and printed nothing | `gpus: []` | it ran and found nothing |
 * | it ran and printed rows | the rows that parsed, + an error per row that did not | §6.5 |
 *
 * §3.1: "`nvidia-smi` missing or returning nothing is not an error state to hide … This
 * box has a documented history of booting with no compute GPU at all." Both render as "no
 * GPUs enumerated"; the contract keeps them apart, and the `errors[]` entry is what tells
 * the two apart in the UI.
 *
 * ⚠ **The exit codes are measured, not guessed** (§3.1, driver 580.173.02): `0` ran; `2`
 * invalid query field; `6` no devices, printing `No devices were found`. `nvidia-smi -i 5`
 * reproduces exit 6 read-only on a box with two healthy cards, so the earlier "could not be
 * measured" note was wrong.
 *
 * **Every non-zero exit is `gpus: null`**, and exit 6 is deliberately not remapped to `[]`:
 * `[]` has nowhere to carry `No devices were found`, which is the single most useful string
 * the SAFETY panel could show, and §3.1 renders both cases identically anyway. What the
 * distinction buys is that `[]` — *the command succeeded and produced no parseable rows* —
 * always carries an `errors[]` entry and so is never silent.
 */
export const collectGpus = async ({
  io = nodeIo,
  paths = DEFAULT_PATHS,
  timeoutMs = NVIDIA_SMI_TIMEOUT_MS,
}: CollectGpusOptions = {}): Promise<GpuCollection> => {
  let stdout: string;
  try {
    stdout = await io.run(paths.nvidiaSmi, NVIDIA_SMI_ARGS, timeoutMs);
  } catch (e) {
    return { gpus: null, errors: tag('nvidia-smi', [reason(e)]) };
  }
  const parsed = parseNvidiaSmiCsv(stdout);
  // ⚠ §3.1: "`gpus: []` = the command succeeded and produced no parseable rows, and **always
  // carries an `errors[]` entry**, so it is never silent." The realistic `[]` — a driver
  // answering a different field list — already carries one problem per unparseable row. The
  // one branch that did not was **exit 0 with no output at all**, which produced `[]` and an
  // empty `errors[]`: silent, against a sentence that says never.
  //
  // Unreachable on this box, and filed anyway. Step 3's adversarial measured that
  // `nvidia-smi` exits **6** when it finds no devices, so a zero exit with nothing on stdout
  // is not a state the real binary produces — which makes it exactly the kind of impossible
  // reading this project files an entry for rather than renders as an ordinary empty result.
  // An entry mints no verdict and no severity; it can only ever say *why* a figure is blank.
  const problems =
    parsed.value.length === 0 && parsed.problems.length === 0
      ? ['nvidia-smi exited 0 and printed nothing — no rows to parse, and no reason given']
      : parsed.problems;
  return { gpus: parsed.value, errors: tag('nvidia-smi', problems) };
};

// ---------------------------------------------------------------------------
// §3.2 coretemp
// ---------------------------------------------------------------------------

/** The hwmon `name` §3.2 requires for the CPU package sensor. */
export const CORETEMP_NAME = 'coretemp';

/**
 * Find the `coretemp` hwmon node **by its `name` file** and read `Package id 0`.
 *
 * ⚠ Located by name, never by a fixed `hwmonN` index — the same rule §3.3 states for
 * `dell_smm`, and for the same reason: the index is not stable across boots. On this box
 * today `coretemp` is `hwmon2`, sitting between two `nvme` nodes and `dell_smm`, and
 * nothing holds it there.
 *
 * The whole directory is read into a `filename → contents` record and handed to
 * {@link parsePackageTempC}, which is pure. Individual file reads that fail are skipped
 * rather than failing the node: a `temp3_input` that returns `EIO` has no bearing on
 * whether `temp1` is the package.
 *
 * ### ⚠ "I could not read it" is not "it is not there", and step 4 depends on the difference
 *
 * A node whose `name` will not read is skipped — it might be any node — but it is
 * **recorded**, and if the walk then finds no `coretemp` the message says so instead of
 * asserting absence. §2.2 runs the container non-root, so `EACCES` under `/sys` is the
 * plausible case, not a theoretical one.
 *
 * The value is `null` either way here, so in step 3 this only corrected §6.5's explanation.
 * **Step 4 is why it was worth correcting**: `dell_smm` is located by the same walk, and
 * there the outcome is O8's three-valued `pwm5Present` probe. A swallowed `EACCES` flips it
 * from `null` (*unknown*) to `false` (*the 5-fan module did not load*) — a sticky SAFETY
 * alarm claiming GPU fan control is gone, on a healthy box. That is §3.7's stated worst
 * inversion, on the panel that earns this dashboard's existence, and it is why step 4's
 * {@link findHwmonNode} returns the distinction as a **value**.
 *
 * ⚠ **The walk itself now lives in `hwmon.ts` and this function is its second caller.** It
 * was extracted in step 4 and adopted here in step 4's reconciliation; `describeHwmonMiss`
 * reproduces the three messages this function used to build **byte for byte**, so no
 * assertion in `collect.test.ts` changed. Two copies of a walk is how a third appears, and
 * step 5 has no hwmon node of its own to make the case for one.
 */
export const collectCpuTemp = async ({
  io = nodeIo,
  paths = DEFAULT_PATHS,
}: CollectCpuTempOptions = {}): Promise<{
  value: Host['cpuTempC'];
  errors: TelemetryError[];
}> => {
  const node = await findHwmonNode(io, paths.hwmonRoot, CORETEMP_NAME);
  if (!node.found) {
    return {
      value: null,
      errors: tag('coretemp', [describeHwmonMiss(node, paths.hwmonRoot, CORETEMP_NAME)]),
    };
  }
  const { dir } = node;

  let files: string[];
  try {
    files = await io.readDir(dir);
  } catch (e) {
    return { value: null, errors: tag('coretemp', [`${dir}: ${reason(e)}`]) };
  }

  const contents: Record<string, string> = {};
  for (const file of files) {
    if (!/^temp\d+_(label|input)$/.test(file)) continue;
    try {
      contents[file] = await io.readFile(`${dir}/${file}`);
    } catch {
      // Skipped, not fatal. If it was the package's own input, `parsePackageTempC`
      // reports "has no tempN_input" — which is the accurate message.
    }
  }
  const parsed = parsePackageTempC(contents);
  return {
    value: parsed.value,
    errors: tag(
      'coretemp',
      parsed.problems.map((problem) => `${dir}: ${problem}`),
    ),
  };
};

// ---------------------------------------------------------------------------
// §3.2 + §3.5 — the whole host side of one poll
// ---------------------------------------------------------------------------

/**
 * One poll's host readings, plus the counters the *next* poll needs to compute its deltas.
 *
 * `sample` is carried out rather than stored here on purpose: §4 fixes the server as
 * stateless per request, so where it lives between polls is step 6's decision.
 */
export interface HostCollection {
  readonly hostname: string | null;
  readonly host: Host;
  readonly net: Network;
  readonly errors: readonly TelemetryError[];
  /** Hand this back as `previous` on the next poll. */
  readonly sample: DeltaSample;
}

/** Arguments to {@link collectHost}. All optional except the clock, which tests must own. */
export interface CollectHostOptions {
  readonly io?: CollectorIo;
  readonly paths?: CollectorPaths;
  readonly iface?: string;
  /** `null` on the first poll of a session — see §6.7 and `deltas.ts`. */
  readonly previous?: DeltaSample | null;
  /**
   * ⚠ **MONOTONIC** — `performance.now()` at the top of the poll, before any read is
   * issued. Injected so the rate maths is testable, and never `Date.now()`: it is written
   * straight into {@link DeltaSample.atMs}, which the next poll subtracts from. See that
   * field's own note.
   */
  readonly nowMs: number;
}

/**
 * Collect every §3.2 host field and §3.5's network figures for one poll.
 *
 * The reads are issued concurrently — they are eight independent files and one directory
 * walk, and a serial chain would make the slowest one everybody's latency. Each still
 * fails on its own; `Promise.all` over already-caught wrappers cannot reject.
 *
 * `cpuPct`, `rxBytesPerSec` and `txBytesPerSec` come from {@link advanceDeltas} and are
 * `null` whenever `previous` is `null` — §6.7's first sample, rendered `—` and never `0`.
 */
export const collectHost = async ({
  io = nodeIo,
  paths = DEFAULT_PATHS,
  iface = DEFAULT_INTERFACE,
  previous = null,
  nowMs,
}: CollectHostOptions): Promise<HostCollection> => {
  const [stat, meminfo, loadavg, uptime, netdev, cpuinfo, hostname, operstate, cpuTemp] =
    await Promise.all([
      readAndParse<CpuTimes | null>(io, 'proc-stat', paths.procStat, parseProcStat, null),
      readAndParse(io, 'proc-meminfo', paths.procMeminfo, parseMeminfo, {
        memUsedGiB: null,
        memTotalGiB: null,
        swapUsedGiB: null,
        swapTotalGiB: null,
      }),
      readAndParse(io, 'proc-loadavg', paths.procLoadavg, parseLoadavg, null),
      readAndParse(io, 'proc-uptime', paths.procUptime, parseUptime, null),
      readAndParse<NetCounters | null>(
        io,
        'proc-net-dev',
        paths.procNetDev,
        (text) => parseNetDev(text, iface),
        null,
      ),
      readAndParse(io, 'proc-cpuinfo', paths.procCpuinfo, parseCpuinfo, {
        cpuModel: null,
        cores: null,
        threads: null,
      }),
      readAndParse(io, 'hostname', paths.etcHostname, parseHostname, null),
      // ⚠ `net-operstate`, NOT `proc-net-dev` (§3.7). Different file, different source.
      readAndParse(
        io,
        'net-operstate',
        `${paths.sysClassNet}/${iface}/operstate`,
        parseOperstate,
        null,
      ),
      collectCpuTemp({ io, paths }),
    ]);

  const sample: DeltaSample = { atMs: nowMs, cpu: stat.value, net: netdev.value };
  const deltas = advanceDeltas(previous, sample);

  return {
    hostname: hostname.value,
    host: {
      cpuPct: deltas.cpuPct,
      loadAvg: loadavg.value,
      cpuTempC: cpuTemp.value,
      memUsedGiB: meminfo.value.memUsedGiB,
      memTotalGiB: meminfo.value.memTotalGiB,
      swapUsedGiB: meminfo.value.swapUsedGiB,
      swapTotalGiB: meminfo.value.swapTotalGiB,
      uptimeSec: uptime.value,
      kernel: kernelRelease(io),
      cpuModel: cpuinfo.value.cpuModel,
      cores: cpuinfo.value.cores,
      threads: cpuinfo.value.threads,
    },
    net: {
      rxBytesPerSec: deltas.rxBytesPerSec,
      txBytesPerSec: deltas.txBytesPerSec,
      link: operstate.value,
    },
    errors: [
      ...stat.errors,
      ...meminfo.errors,
      ...loadavg.errors,
      ...uptime.errors,
      ...netdev.errors,
      ...cpuinfo.errors,
      ...hostname.errors,
      ...operstate.errors,
      ...cpuTemp.errors,
    ],
    sample,
  };
};
