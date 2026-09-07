/**
 * §3.2 and §3.5 — the `/proc`, `/etc/hostname` and `operstate` parsers.
 * **Pure: text in, typed values out.** No IO, no `/proc`, no root, no GPU.
 *
 * Every function here is total and returns `null` for anything it cannot read. The
 * traps each one is written against are named at the function, and all of them are
 * variations of one theme: the JavaScript conversion that turns "nothing" into a number
 * (see `numbers.ts`). §6.5: "Zero and unknown must never look alike."
 *
 * ⚠ **No message in this file names a path.** `CollectorPaths` is injectable and step 11
 * may bind-mount `/proc` somewhere else; a parser that writes `/proc/stat:` into a problem
 * would then attribute a failure to a file that was never read, and §6.5's whole purpose is
 * matching an error to the figure it explains. The **wrapper** prefixes the real path,
 * because it is the only layer that knows what it just read — see `readAndParse` in
 * `collect.ts`. Step 4's paths are *discovered* (`/sys/class/hwmon/hwmonN/...`), so there
 * the mismatch would be immediate rather than deferred.
 */

import { celsius, gib, seconds } from '../types';
import type { Celsius, GiB, LinkState, LoadAverage, Seconds } from '../types';
import {
  fields,
  lines,
  parseCounter,
  parseDecimalStrict,
  parseIntegerStrict,
  parseText,
} from './numbers';
import { clean } from './result';
import type { ParseResult } from './result';

// ---------------------------------------------------------------------------
// /proc/stat  —  §3.2 `cpuPct`
// ---------------------------------------------------------------------------

/**
 * One reading of the aggregate CPU time counters, in jiffies.
 *
 * `bigint` because these are C `unsigned long long`: a double would round them, and a
 * delta between two rounded counters is a fabricated rate. The *delta* converts back to
 * `number` exactly (see `deltas.ts`).
 */
export interface CpuTimes {
  /** Time spent doing anything other than idling. */
  readonly busy: bigint;
  /** All accounted time, busy and idle. */
  readonly total: bigint;
}

/**
 * The aggregate `cpu` line's fields, in kernel order.
 *
 * §3.2, verbatim and now explicit where it used to be silent: *"busy = `user+nice+system+
 * irq+softirq+steal`, idle = `idle+iowait`. `guest`/`guest_nice` are already counted inside
 * `user`/`nice` and must NOT be added again — double-counting them is the classic way this
 * figure stops agreeing with `top`."*
 *
 * That is exactly what the three lists below say, so this is a spec fact now rather than
 * the interpretation it was when the step was built. Two consequences worth keeping:
 *
 * - **`guest`/`guest_nice` are not in `CPU_FIELD_ORDER` at all**, so they are never even
 *   read, let alone summed. Excluding them from `CPU_BUSY_FIELDS` alone would not be
 *   enough if they were parsed into `values`, because `total` is `busy + idle`.
 * - **`iowait` is idle, not busy.** A CPU waiting on IO is not executing. This is what
 *   `top`, `htop` and `mpstat`'s `%idle` use, which is what makes §6.6's promise — "any
 *   figure on screen can be checked against the command that produced it" — true here.
 */
const CPU_IDLE_FIELDS = ['idle', 'iowait'] as const;
const CPU_BUSY_FIELDS = ['user', 'nice', 'system', 'irq', 'softirq', 'steal'] as const;
/** Position of each field after the leading `cpu` token. */
const CPU_FIELD_ORDER = [
  'user',
  'nice',
  'system',
  'idle',
  'iowait',
  'irq',
  'softirq',
  'steal',
] as const;

/**
 * Parse `/proc/stat`'s aggregate line.
 *
 * Three real properties of the file drive the implementation:
 *
 * - the aggregate line is `cpu` followed by **two** spaces, so splitting on runs of
 *   whitespace is required and `line.split(' ')` yields a phantom empty field;
 * - the twelve `cpuN` lines that follow start with the same three characters, so the
 *   match is on the whole first token and never on a prefix;
 * - the file continues for about 2 KB of `intr` counters, so the scan stops at the first
 *   match rather than reading to the end on every poll.
 *
 * Older kernels emit fewer than eight fields (`steal` arrived in 2.6.11). Anything
 * present is summed and anything absent is treated as absent, but **a field that is
 * present and does not parse fails the whole line**: a corrupt `system` column silently
 * dropped would understate busy time and show an idle machine under load.
 */
export const parseProcStat = (text: string): ParseResult<CpuTimes | null> => {
  for (const line of text.split(/\r?\n/)) {
    const parts = fields(line);
    if (parts[0] !== 'cpu') continue;

    const values = new Map<string, bigint>();
    for (const [i, name] of CPU_FIELD_ORDER.entries()) {
      const raw = parts[i + 1];
      if (raw === undefined) break;
      const n = parseCounter(raw);
      if (n === null) {
        return { value: null, problems: [`field \`${name}\` is not a counter`] };
      }
      values.set(name, n);
    }
    if (values.size < 4) {
      return {
        value: null,
        problems: [`aggregate line has ${values.size} usable fields, need 4`],
      };
    }

    const sum = (names: readonly string[]): bigint =>
      names.reduce((acc, n) => acc + (values.get(n) ?? 0n), 0n);
    const busy = sum(CPU_BUSY_FIELDS);
    const idle = sum(CPU_IDLE_FIELDS);
    return clean({ busy, total: busy + idle });
  }
  return { value: null, problems: ['no aggregate `cpu` line'] };
};

// ---------------------------------------------------------------------------
// /proc/meminfo  —  §3.2 RAM and swap
// ---------------------------------------------------------------------------

/** §3.2's four memory figures, in the GiB §6.6 renders them in. */
export interface MemInfo {
  readonly memUsedGiB: GiB | null;
  readonly memTotalGiB: GiB | null;
  readonly swapUsedGiB: GiB | null;
  readonly swapTotalGiB: GiB | null;
}

/** `MemTotal:       64197644 kB` → 64197644, or `null`. */
const meminfoKiB = (map: ReadonlyMap<string, string>, key: string): number | null => {
  const raw = map.get(key);
  if (raw === undefined) return null;
  const parts = fields(raw);
  // ⚠ The unit is required, not assumed. The kernel writes `kB` and means KiB; a value
  // in any other unit read as KiB is wrong by a factor of 1024 and still looks plausible.
  if (parts.length !== 2 || parts[1] !== 'kB') return null;
  return parseDecimalStrict(parts[0]);
};

const KIB_PER_GIB = 1024 * 1024;

/**
 * Parse `/proc/meminfo`. §3.2: `memUsed = MemTotal - MemAvailable`.
 *
 * ⚠ **There is no fallback to `MemTotal - MemFree`.** On this box that would report
 * ~56 GiB used against a real 5.6 — page cache counted as consumption — and it would look
 * entirely plausible on the meter. If `MemAvailable` is absent (pre-3.14 kernels), used is
 * `null` while total still reads; §6.5 renders that as `— / 61.2 GiB`, which says exactly
 * what is known.
 *
 * Swap follows the same shape from `SwapTotal`/`SwapFree`. §6.6 gives swap 2 dp precisely
 * so that this box's resting 22356 kB shows as `0.02 GiB` rather than rounding to `0.0`.
 */
export const parseMeminfo = (text: string): ParseResult<MemInfo> => {
  const map = new Map<string, string>();
  for (const line of lines(text)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    map.set(line.slice(0, colon).trim(), line.slice(colon + 1));
  }

  const problems: string[] = [];
  const read = (key: string): number | null => {
    const v = meminfoKiB(map, key);
    if (v === null) problems.push(`\`${key}\` missing or unreadable`);
    return v;
  };

  const memTotal = read('MemTotal');
  const memAvailable = read('MemAvailable');
  const swapTotal = read('SwapTotal');
  const swapFree = read('SwapFree');

  const toGiB = (kib: number | null): GiB | null => (kib === null ? null : gib(kib / KIB_PER_GIB));
  const diff = (total: number | null, remaining: number | null): GiB | null =>
    total === null || remaining === null ? null : gib((total - remaining) / KIB_PER_GIB);

  return {
    value: {
      memUsedGiB: diff(memTotal, memAvailable),
      memTotalGiB: toGiB(memTotal),
      swapUsedGiB: diff(swapTotal, swapFree),
      swapTotalGiB: toGiB(swapTotal),
    },
    problems,
  };
};

// ---------------------------------------------------------------------------
// /proc/loadavg  —  §3.2
// ---------------------------------------------------------------------------

/**
 * Parse `/proc/loadavg`'s first three fields.
 *
 * Nullable as a whole rather than per-element, per `lib/types.ts`: all three come from one
 * line of one file in a single read, there is no state of the machine in which the
 * 5-minute average is readable and the 1-minute average is not, and §6.6 has no rendering
 * for a half-parsed load average.
 */
export const parseLoadavg = (text: string): ParseResult<LoadAverage | null> => {
  const parts = fields(text.split(/\r?\n/)[0] ?? '');
  const one = parseDecimalStrict(parts[0]);
  const five = parseDecimalStrict(parts[1]);
  const fifteen = parseDecimalStrict(parts[2]);
  if (one === null || five === null || fifteen === null) {
    return { value: null, problems: ['could not read all three averages'] };
  }
  return clean([one, five, fifteen] as LoadAverage);
};

// ---------------------------------------------------------------------------
// /proc/uptime  —  §3.2
// ---------------------------------------------------------------------------

/**
 * Parse `/proc/uptime`'s first field. The second is aggregate idle time across all CPUs
 * and is not used.
 *
 * **Floored, not rounded.** `Seconds` is documented as whole seconds and §3.2 renders it
 * as `up 22:36`; a machine 59.7 s old is `up <1 min`, not `up 1 min`. A negative value —
 * which the kernel cannot produce, but a corrupt read can — is rejected rather than
 * floored further away from zero.
 */
export const parseUptime = (text: string): ParseResult<Seconds | null> => {
  const raw = fields(text.split(/\r?\n/)[0] ?? '')[0];
  const n = parseDecimalStrict(raw);
  if (n === null || n < 0) {
    return { value: null, problems: ['first field is not a number of seconds'] };
  }
  return clean(seconds(Math.floor(n)));
};

// ---------------------------------------------------------------------------
// /proc/net/dev  —  §3.5
// ---------------------------------------------------------------------------

/** One reading of an interface's byte counters. `bigint` for the same reason as {@link CpuTimes}. */
export interface NetCounters {
  readonly rxBytes: bigint;
  readonly txBytes: bigint;
}

/** Offsets of the two byte columns among the sixteen that follow the colon. */
const NET_RX_BYTES = 0;
const NET_TX_BYTES = 8;
const NET_COLUMNS = 16;

/**
 * Parse one interface's counters out of `/proc/net/dev`.
 *
 * ⚠ **Split on the first colon, never on whitespace.** The kernel right-aligns the
 * interface name in a fixed-width column and terminates it with `:`, so a short name has
 * a space after the colon (`  eno1: 65734369014`) and a long one does not
 * (`enp0s31f6:65734369014`). A whitespace split reads the second form's interface as
 * `enp0s31f6:65734369014` and its rx bytes as the *packet* count — a wrong number that
 * looks entirely reasonable. `PROC_NET_DEV_JAMMED` in `fixtures.ts` is that case.
 *
 * Sixteen columns follow: eight receive then eight transmit. rx bytes is the first of
 * each group.
 */
export const parseNetDev = (text: string, iface: string): ParseResult<NetCounters | null> => {
  for (const line of lines(text)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    if (line.slice(0, colon).trim() !== iface) continue;

    const cols = fields(line.slice(colon + 1));
    if (cols.length !== NET_COLUMNS) {
      return {
        value: null,
        problems: [`\`${iface}\` has ${cols.length} columns, need ${NET_COLUMNS}`],
      };
    }
    const rxBytes = parseCounter(cols[NET_RX_BYTES]);
    const txBytes = parseCounter(cols[NET_TX_BYTES]);
    if (rxBytes === null || txBytes === null) {
      return { value: null, problems: [`\`${iface}\` byte counters unreadable`] };
    }
    return clean({ rxBytes, txBytes });
  }
  return { value: null, problems: [`interface \`${iface}\` not present`] };
};

// ---------------------------------------------------------------------------
// /proc/cpuinfo  —  §3.2
// ---------------------------------------------------------------------------

/** §3.2's three `/proc/cpuinfo` fields. */
export interface CpuInfo {
  readonly cpuModel: string | null;
  readonly cores: number | null;
  readonly threads: number | null;
}

/**
 * Parse `/proc/cpuinfo`.
 *
 * - `cpuModel` — the **first** `model name`, carried raw. §3.2 trims it to `Xeon W-2135`
 *   *for display*, which makes the trim `lib/format.ts`'s job (`formatCpuModel`): a
 *   snapshot that has already discarded the text cannot be un-trimmed.
 * - `threads` — the count of `processor` lines. 12 here.
 * - `cores` — the count of **distinct `physical id` + `core id` pairs**, exactly as §3.2
 *   specifies. 6 here, because hyperthreading gives two `processor` blocks per pair.
 *
 * ⚠ `cores` is **not** read from the `cpu cores` field, which reports cores *per socket*
 * and would be wrong on any multi-socket machine; and it is `null`, not a guess, on a
 * `/proc/cpuinfo` that carries no topology at all (`PROC_CPUINFO_NO_TOPOLOGY`). Zero
 * `processor` lines is likewise `null` — a file that lists no CPUs was not read, since a
 * machine running this code has at least one.
 */
export const parseCpuinfo = (text: string): ParseResult<CpuInfo> => {
  let cpuModel: string | null = null;
  let threads = 0;
  const pairs = new Set<string>();
  let physicalId: string | null = null;
  let coreId: string | null = null;

  const flush = (): void => {
    if (physicalId !== null && coreId !== null) pairs.add(`${physicalId}/${coreId}`);
    physicalId = null;
    coreId = null;
  };

  for (const line of text.split(/\r?\n/)) {
    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const key = line.slice(0, colon).trim();
    const raw = line.slice(colon + 1);

    switch (key) {
      case 'processor':
        // A new block starts here, so close the previous one first.
        flush();
        if (parseIntegerStrict(raw) !== null) threads += 1;
        break;
      case 'model name':
        cpuModel ??= parseText(raw);
        break;
      case 'physical id':
        physicalId = parseText(raw);
        break;
      case 'core id':
        coreId = parseText(raw);
        break;
      default:
        break;
    }
  }
  flush();

  const problems: string[] = [];
  if (cpuModel === null) problems.push('no `model name`');
  if (threads === 0) problems.push('no `processor` entries');
  if (pairs.size === 0) problems.push('no `physical id`/`core id` topology');

  return {
    value: {
      cpuModel,
      cores: pairs.size === 0 ? null : pairs.size,
      threads: threads === 0 ? null : threads,
    },
    problems,
  };
};

// ---------------------------------------------------------------------------
// /etc/hostname, kernel release, operstate
// ---------------------------------------------------------------------------

/**
 * Parse `/etc/hostname` — the first line, trimmed.
 *
 * ⚠ §3.2: this file, **never `os.hostname()`**. `--network host` shares the *network*
 * namespace, but the hostname lives in the **UTS** namespace, so `os.hostname()` returns
 * the container's own id and §6.2's header would show a random hex string with no error
 * to explain it.
 *
 * An empty file is `null`, not `''`. §6.6 renders `null` as `—`; an empty string renders
 * as a blank cell, which §6.6 forbids as firmly as it forbids `0`.
 */
export const parseHostname = (text: string): ParseResult<string | null> => {
  const name = parseText(text.split(/\r?\n/)[0]);
  return name === null ? { value: null, problems: ['empty'] } : clean(name);
};

/**
 * Parse `/proc/version`'s kernel release — the third token of
 * `Linux version 7.0.0-30-generic (buildd@…)`.
 *
 * Kept for completeness and tested against the captured file; the host collector reads the
 * release from `uname` instead, which §3.2 equally permits. See `io.ts` for why.
 */
export const parseKernelRelease = (text: string): ParseResult<string | null> => {
  const match = /^Linux version (\S+)/.exec(text.trim());
  const release = parseText(match?.[1]);
  return release === null
    ? { value: null, problems: ['no kernel release'] }
    : clean(release);
};

/** §3.7's seven `operstate` values. A value outside the set is not a link state. */
const LINK_STATES: readonly LinkState[] = [
  'up',
  'down',
  'unknown',
  'dormant',
  'notpresent',
  'lowerlayerdown',
  'testing',
];

/**
 * Parse `/sys/class/net/<iface>/operstate` into §3.7's closed {@link LinkState}.
 *
 * A value outside the seven is `null` plus a problem, never passed through: §3.7 is
 * explicit that "a field typed as a bare `string` where this section names a vocabulary is
 * a defect, because the UI switches on these values and an unmatched one falls through
 * silently". `severityLink` would give an unknown string no band, and §6.3's `eno1` row
 * would show an uncoloured cell rather than an error.
 */
export const parseOperstate = (text: string): ParseResult<LinkState | null> => {
  const raw = parseText(text.split(/\r?\n/)[0]);
  const found = LINK_STATES.find((s) => s === raw);
  return found === undefined
    ? { value: null, problems: [`\`${raw ?? ''}\` is not one of §3.7's seven values`] }
    : clean(found);
};

// ---------------------------------------------------------------------------
// coretemp  —  §3.2
// ---------------------------------------------------------------------------

/** §3.2's CPU sensor label. Found by label, never by index — see {@link parsePackageTempC}. */
export const PACKAGE_LABEL = 'Package id 0';

/** hwmon divides its millidegree readings by this to reach °C. */
const MILLI = 1000;

/**
 * Pick the CPU package temperature out of a `coretemp` hwmon node's files.
 *
 * The argument is the directory's contents keyed by filename — `temp1_label` →
 * `'Package id 0\n'`, `temp1_input` → `'31000\n'` — which is exactly what the IO wrapper
 * can produce and exactly what a test can hand over without a `/sys`.
 *
 * ⚠ **Found by label, not by index.** `temp1` happens to be the package on this board and
 * `temp2`–`temp7` are the six cores, but nothing in sysfs promises that ordering, and the
 * same reasoning §3.3 applies to locating `dell_smm` by `name` applies here.
 *
 * ⚠ **Not `dell_smm`'s `temp1`** (§3.2): measured 2026-08-18 it swung 43–54 °C during pure
 * idle while the package held 35–37 °C. If `coretemp` is absent this is `null` and an
 * `errors[]` entry — never a substituted reading from another sensor.
 *
 * The value is carried at full precision. §6.6 renders CPU temperature as an integer, and
 * rounding here would be a collector discarding data the formatter is able to discard
 * itself.
 */
export const parsePackageTempC = (
  files: Readonly<Record<string, string>>,
): ParseResult<Celsius | null> => {
  for (const [name, contents] of Object.entries(files)) {
    const match = /^(temp\d+)_label$/.exec(name);
    if (match === null) continue;
    if (parseText(contents) !== PACKAGE_LABEL) continue;

    const inputName = `${match[1]}_input`;
    const raw = files[inputName];
    if (raw === undefined) {
      return { value: null, problems: [`\`${PACKAGE_LABEL}\` has no \`${inputName}\``] };
    }
    // ⚠ HANDOVER O6's trap in its CPU form: `Number('')` is `0`, and `0 °C` on a Xeon is
    // both perfectly formattable and completely false.
    const milli = parseDecimalStrict(raw);
    if (milli === null) {
      return { value: null, problems: [`\`${inputName}\` is not a reading`] };
    }
    return clean(celsius(milli / MILLI));
  }
  return { value: null, problems: [`no sensor labelled \`${PACKAGE_LABEL}\``] };
};
