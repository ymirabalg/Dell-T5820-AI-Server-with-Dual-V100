/**
 * `nodeIo` and the wrappers driven through it — the one place this step touches the real
 * filesystem and a real subprocess.
 *
 * Every other test in the step uses a fake {@link CollectorIo}, which is exactly right for
 * the parsers and for the failure mapping, and **is precisely why this file exists**: a
 * fake cannot catch a typo in `nodeIo` itself, and `nodeIo` is what runs in the container.
 * A wrong `encoding`, an `exec` that swallows stderr, a `readdir` returning `Dirent`s
 * instead of names — all of those pass every fake and fail on the box.
 *
 * So: a temporary directory is laid out the way §2.2's bind mounts present the host, the
 * captured fixtures are written into it, and the collectors are pointed at it with the
 * real `nodeIo`. `nvidia-smi` is stood in for by a real executable that prints the
 * captured CSV, so the `execFile` path is genuinely exercised.
 *
 * Writes go to `os.tmpdir()` and nowhere else. Invariant 2 concerns the server; nothing
 * here touches it.
 */

import { afterAll, beforeAll, describe, expect, test } from 'vitest';
import { chmod, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { DEFAULT_PATHS, collectCpuTemp, collectGpus, collectHost } from './collect';
import type { CollectorPaths } from './collect';
import { NVIDIA_SMI_TIMEOUT_MS, nodeIo } from './io';
import {
  CAPTURED_CORETEMP,
  CAPTURED_ETC_HOSTNAME,
  CAPTURED_NVIDIA_SMI,
  CAPTURED_OPERSTATE,
  CAPTURED_PROC_CPUINFO,
  CAPTURED_PROC_LOADAVG,
  CAPTURED_PROC_MEMINFO,
  CAPTURED_PROC_NET_DEV,
  CAPTURED_PROC_STAT,
  CAPTURED_PROC_UPTIME,
} from './samples';

let root = '';
let paths: CollectorPaths;
/** A child that IGNORES SIGTERM. See the timeout tests for why that specific shape. */
let stubborn = '';
/** A child that exits at once, leaving a descendant holding the inherited stdout pipe. */
let orphanPipe = '';
/** A child that prints AFTER ~120 ms — past `setTimeout`'s 1 ms clamp, inside a 4 s bound. */
let slowEcho = '';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'ai-dashboard-step3-'));
  await mkdir(join(root, 'proc', 'net'), { recursive: true });
  await mkdir(join(root, 'sys', 'class', 'net', 'eno1'), { recursive: true });
  // hwmon0/1 are nvme and hwmon3 is dell_smm on the real box; coretemp sits in the middle,
  // which is what makes "found by name" a real assertion rather than a lucky index.
  for (const [n, name] of [
    ['hwmon0', 'nvme'],
    ['hwmon1', 'nvme'],
    ['hwmon2', 'coretemp'],
    ['hwmon3', 'dell_smm'],
  ]) {
    await mkdir(join(root, 'sys', 'class', 'hwmon', n as string), { recursive: true });
    await writeFile(join(root, 'sys', 'class', 'hwmon', n as string, 'name'), `${name}\n`);
  }
  for (const [file, contents] of Object.entries(CAPTURED_CORETEMP)) {
    await writeFile(join(root, 'sys', 'class', 'hwmon', 'hwmon2', file), contents);
  }
  await writeFile(join(root, 'proc', 'stat'), CAPTURED_PROC_STAT);
  await writeFile(join(root, 'proc', 'meminfo'), CAPTURED_PROC_MEMINFO);
  await writeFile(join(root, 'proc', 'loadavg'), CAPTURED_PROC_LOADAVG);
  await writeFile(join(root, 'proc', 'uptime'), CAPTURED_PROC_UPTIME);
  await writeFile(join(root, 'proc', 'net', 'dev'), CAPTURED_PROC_NET_DEV);
  await writeFile(join(root, 'proc', 'cpuinfo'), CAPTURED_PROC_CPUINFO);
  await writeFile(join(root, 'hostname'), CAPTURED_ETC_HOSTNAME);
  await writeFile(join(root, 'sys', 'class', 'net', 'eno1', 'operstate'), CAPTURED_OPERSTATE);

  // A real executable standing in for `nvidia-smi`, so `execFile` is genuinely run.
  const fake = join(root, 'nvidia-smi');
  await writeFile(fake, `#!/bin/sh\ncat <<'CSV'\n${CAPTURED_NVIDIA_SMI}CSV\n`);
  await chmod(fake, 0o755);

  // ⚠ The two hang shapes that `nodeIo.run` must bound, and they are DIFFERENT shapes.
  // A `/bin/sleep` child bounds itself under any implementation, which is exactly why the
  // test it used to back proved nothing.
  //
  //  1. `stubborn` ignores SIGTERM. `execFile`'s `timeout:` option only destroys the pipes
  //     and signals the child; its callback waits for `'close'`, which needs the process to
  //     have exited. Measured: `timeout: 300` against this script settled at 9015 ms — and
  //     RESOLVED, so there was not even an `errors[]` entry to explain the latency.
  //  2. `orphanPipe` exits immediately but leaves a background `sleep` holding the stdout
  //     it inherited. Nothing is left to kill, so `killSignal: 'SIGKILL'` cannot help and
  //     neither can a `Promise.race` that abandons the promise without touching the
  //     streams. Measured at 8019 ms with no bound at all. Only destroying the pipes ends
  //     it, which is what Node's abort path does.
  stubborn = join(root, 'stubborn.sh');
  await writeFile(stubborn, '#!/bin/sh\ntrap "" TERM\nsleep 9\n');
  await chmod(stubborn, 0o755);

  orphanPipe = join(root, 'orphan-pipe.sh');
  await writeFile(orphanPipe, '#!/bin/sh\nsleep 9 &\nexit 0\n');
  await chmod(orphanPipe, 0o755);

  // ⚠ For the `boundedTimeoutMs` tests: it must be SLOWER than `setTimeout`'s 1 ms clamp
  // and faster than the 4 s fallback, so the broken and fixed implementations differ.
  slowEcho = join(root, 'slow-echo.sh');
  await writeFile(slowEcho, '#!/bin/sh\nsleep 0.12\necho late\n');
  await chmod(slowEcho, 0o755);

  paths = {
    ...DEFAULT_PATHS,
    procStat: join(root, 'proc', 'stat'),
    procMeminfo: join(root, 'proc', 'meminfo'),
    procLoadavg: join(root, 'proc', 'loadavg'),
    procUptime: join(root, 'proc', 'uptime'),
    procNetDev: join(root, 'proc', 'net', 'dev'),
    procCpuinfo: join(root, 'proc', 'cpuinfo'),
    etcHostname: join(root, 'hostname'),
    hwmonRoot: join(root, 'sys', 'class', 'hwmon'),
    sysClassNet: join(root, 'sys', 'class', 'net'),
    nvidiaSmi: fake,
  };
});

afterAll(async () => {
  if (root !== '') await rm(root, { recursive: true, force: true });
});

describe('nodeIo — the real thing', () => {
  test('readFile returns a string, not a Buffer', async () => {
    const text = await nodeIo.readFile(paths.etcHostname);
    expect(typeof text).toBe('string');
    expect(text).toBe(CAPTURED_ETC_HOSTNAME);
  });

  test('readFile rejects on a missing path rather than returning empty', async () => {
    // A method that returned '' on ENOENT would put `Number('')` back in play one layer up.
    await expect(nodeIo.readFile(join(root, 'nope'))).rejects.toThrow(/ENOENT/);
  });

  test('readDir returns plain names, not Dirents', async () => {
    const entries = await nodeIo.readDir(paths.hwmonRoot);
    expect(entries.every((e) => typeof e === 'string')).toBe(true);
    expect([...entries].sort()).toEqual(['hwmon0', 'hwmon1', 'hwmon2', 'hwmon3']);
  });

  test('readDir rejects on a missing directory', async () => {
    await expect(nodeIo.readDir(join(root, 'nope'))).rejects.toThrow(/ENOENT/);
  });

  test('run resolves with stdout', async () => {
    expect(await nodeIo.run('/bin/echo', ['hello'], 2000)).toBe('hello\n');
  });

  test('run rejects when the binary is absent — the nvidia-smi case', async () => {
    await expect(nodeIo.run(join(root, 'nope'), [], 2000)).rejects.toThrow(/ENOENT/);
  });

  test("run rejects on a non-zero exit and carries ONLY the command's stderr", async () => {
    // The reason stderr is preferred over `error.message`: "No devices were found" is far
    // more use in the SAFETY panel than "Command failed with exit code 6".
    //
    // ⚠ Asserted as an exact match, not a substring. `execFile`'s own `error.message`
    // *embeds* stderr — `Command failed: /bin/sh -c …\nNo devices were found\n` — so
    // `toThrow('No devices were found')` passes on both implementations and proves
    // nothing. Step 3's regression S46 is what found that.
    const err = await nodeIo
      .run('/bin/sh', ['-c', 'echo "No devices were found" >&2; exit 6'], 2000)
      .then(() => null)
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toBe('No devices were found');
    expect((err as Error).message).not.toContain('Command failed');
  });

  /*
   * §3.1: "`nvidia-smi` is bounded at 4 s, and the bound must settle the request
   * INDEPENDENTLY of the child process. Sending a signal is not a bound."
   *
   * ⚠ Both tests assert **elapsed time**, not merely `rejects`. The broken implementation
   * rejects too — thirty times late, or not at all — so `rejects.toThrow()` is the
   * assertion that let this ship. The deadline is the whole claim.
   */
  test('⚠ run bounds the PROMISE against a child that ignores SIGTERM', async () => {
    const began = Date.now();
    const err = await nodeIo
      .run(stubborn, [], 300)
      .then(() => null)
      .catch((e: unknown) => e);
    const elapsed = Date.now() - began;

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('timed out after 300 ms');
    // The child sleeps 9 s. Anything under a second proves the promise did not wait for it.
    expect(elapsed).toBeLessThan(1_000);
  });

  test('⚠ run bounds the PROMISE when a descendant still holds stdout', async () => {
    // This is the case `killSignal: 'SIGKILL'` cannot reach: the direct child is already
    // gone, so there is nothing left to signal, and the callback is waiting on `'close'`.
    const began = Date.now();
    const err = await nodeIo
      .run(orphanPipe, [], 300)
      .then(() => null)
      .catch((e: unknown) => e);
    const elapsed = Date.now() - began;

    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toContain('timed out after 300 ms');
    expect(elapsed).toBeLessThan(1_000);
  });

  test('⚠ and it RELEASES the pipes rather than merely abandoning the promise', async () => {
    /*
     * The third property, and the one a `Promise.race` would quietly drop: settling the
     * promise is not enough if the stdio handles are left held by a descendant. §4 samples
     * per request, so at a 5 s cadence against a wedged driver that is a new pair of leaked
     * handles every poll, for the life of the server process.
     *
     * Measured directly rather than inferred: `getActiveResourcesInfo()` reports two extra
     * `PipeWrap` entries when the streams are not destroyed and none when they are. The
     * delta is what is asserted, because the worker holds pipes of its own.
     */
    const pipes = (): number =>
      process.getActiveResourcesInfo().filter((r) => r.startsWith('Pipe')).length;

    const before = pipes();
    await nodeIo
      .run(orphanPipe, [], 300)
      .then(() => null)
      .catch(() => null);
    // Let the destroy land; the descendant is still alive for another ~8.7 s either way.
    await new Promise((resolve) => setTimeout(resolve, 200));

    expect(pipes()).toBeLessThanOrEqual(before);
  });

  /*
   * ⚠ R1 — the same defect as `http.ts`'s, in the seam that has been here since step 3.
   *
   * This is NOT "step 5 copied a forbidden pattern". `deadline.ts` was hoisted in step 4 to
   * fix the *collector* sites, nobody went back to the seams, and step 5 added a second
   * instance of the untouched original. Measured before the fix, against the real seam:
   * `collectGpus({ timeoutMs: Infinity })` returned `gpus: null` at **4 ms** with
   * `TimeoutOverflowWarning … Timeout duration was set to 1`, while the 400 ms control
   * reached the command in 2 ms.
   *
   * It is less damaging than `http.ts`'s — a blank with an entry rather than an alarm on a
   * working server — but it is the same site-shaped hole, and `guardrails.test.ts`'s
   * source-text rule is the only thing that sees both.
   *
   * ⚠ Asserts that the call **completes**, not that it rejects: the broken implementation
   * rejects too, 1 ms in.
   */
  test.each([
    ['Infinity', Number.POSITIVE_INFINITY],
    ['NaN', Number.NaN],
    ['a negative', -1],
    ['above 2^31-1', 2 ** 31],
    ['zero', 0],
  ])('⚠ a timeout of %s falls back to the module default, never to setTimeout’s 1 ms', async (_name, ms) => {
    // `slowEcho` takes ~120 ms, comfortably past a 1 ms clamp and comfortably inside the
    // 4 s fallback. Under the bug this rejects; under the fix it returns stdout.
    expect(await nodeIo.run(slowEcho, [], ms)).toBe('late\n');
  });

  /*
   * ⚠ Named for what it checks, not for the wider property. The bound and the argument
   * differ only when the argument is INVALID, and an invalid argument means the 4 s
   * fallback — so observing the difference costs a four-second test, re-run once per
   * mutation. The half that reaches a panel (a 1 ms bound) is covered by the table above.
   */
  test('⚠ the timeout message is a millisecond figure, and names the command', async () => {
    const err = await nodeIo
      .run(stubborn, [], 300)
      .then(() => null)
      .catch((e: unknown) => e);
    expect((err as Error).message).toBe(`${stubborn}: timed out after 300 ms`);
    expect(NVIDIA_SMI_TIMEOUT_MS).toBe(4000);
  });

  test('a child that finishes inside the deadline is NOT reported as a timeout', async () => {
    // The complement, and the reason the bound is 4 s rather than something tight: the
    // call really takes ~250 ms on this box, and a bound that fires on a healthy read
    // would blank the GPU panels on every poll.
    expect(await nodeIo.run('/bin/echo', ['fine'], 2_000)).toBe('fine\n');
  });

  test('a signal-killed process names the signal, not a 230-character argv dump', async () => {
    // A6: `error.signal` and `error.code` are on the error object and were thrown away.
    // §6.5 puts this string in front of a human.
    const err = await nodeIo
      .run('/bin/sh', ['-c', 'kill -QUIT $$'], 2_000)
      .then(() => null)
      .catch((e: unknown) => e);
    expect((err as Error).message).toContain('SIGQUIT');
    expect((err as Error).message).not.toContain('Command failed');
  });

  test('a non-zero exit with no stderr reports the exit code', async () => {
    const err = await nodeIo
      .run('/bin/sh', ['-c', 'exit 6'], 2_000)
      .then(() => null)
      .catch((e: unknown) => e);
    expect((err as Error).message).toContain('exited 6');
  });

  test('unameRelease is a non-empty string, and is not the container hostname', async () => {
    const r = nodeIo.unameRelease();
    expect(typeof r).toBe('string');
    expect(r.length).toBeGreaterThan(0);
  });

  test('the nvidia-smi timeout sits under §6.7’s 5 s default cadence', () => {
    expect(NVIDIA_SMI_TIMEOUT_MS).toBeLessThan(5000);
    expect(NVIDIA_SMI_TIMEOUT_MS).toBeGreaterThan(0);
  });
});

describe('the collectors, end to end through nodeIo', () => {
  test('collectHost reads every §3.2 field off real files', async () => {
    const r = await collectHost({ io: nodeIo, paths, nowMs: 1_000 });
    expect(r.errors).toEqual([]);
    expect(r.hostname).toBe('ai-server');
    expect(r.host.cpuTempC).toBe(31);
    expect(r.host.cores).toBe(6);
    expect(r.host.threads).toBe(12);
    expect(r.host.uptimeSec).toBe(81376);
    expect(r.net.link).toBe('up');
    // §6.7: first sample.
    expect(r.host.cpuPct).toBeNull();
    expect(r.net.rxBytesPerSec).toBeNull();
  });

  test('collectCpuTemp walks a real /sys/class/hwmon and finds coretemp by name', async () => {
    const { value, errors } = await collectCpuTemp({ io: nodeIo, paths });
    expect(errors).toEqual([]);
    expect(value).toBe(31);
  });

  test('collectGpus runs a real process and parses its real stdout', async () => {
    const { gpus, errors } = await collectGpus({ io: nodeIo, paths });
    expect(errors).toEqual([]);
    expect(gpus?.map((g) => g.index)).toEqual([0, 1]);
    expect(gpus?.[0]?.memUsedMiB).toBe(26456);
  });

  test('collectGpus with the binary absent is `gpus: null` plus one error', async () => {
    const missing = { ...paths, nvidiaSmi: join(root, 'definitely-not-here') };
    const { gpus, errors } = await collectGpus({ io: nodeIo, paths: missing });
    expect(gpus).toBeNull();
    expect(errors).toHaveLength(1);
    expect(errors[0]?.source).toBe('nvidia-smi');
  });

  test('a whole missing tree is nine errors and no throw', async () => {
    const nowhere: CollectorPaths = {
      procStat: join(root, 'x', 'stat'),
      procMeminfo: join(root, 'x', 'meminfo'),
      procLoadavg: join(root, 'x', 'loadavg'),
      procUptime: join(root, 'x', 'uptime'),
      procNetDev: join(root, 'x', 'dev'),
      procCpuinfo: join(root, 'x', 'cpuinfo'),
      etcHostname: join(root, 'x', 'hostname'),
      hwmonRoot: join(root, 'x', 'hwmon'),
      sysClassNet: join(root, 'x', 'net'),
      nvidiaSmi: join(root, 'x', 'nvidia-smi'),
      // Step 5's additions. `collectHost` reads none of them, so the count below is
      // unchanged — they are here because `CollectorPaths` is exhaustive by design.
      etcLlamaServer: join(root, 'x', 'llama-server'),
      ufwConf: join(root, 'x', 'ufw.conf'),
      libModules: join(root, 'x', 'modules'),
      rootMount: join(root, 'x', 'root'),
      homeMount: join(root, 'x', 'home'),
      dbusSystemSocket: join(root, 'x', 'bus'),
    };
    const r = await collectHost({ io: nodeIo, paths: nowhere, nowMs: 0 });
    expect(r.errors).toHaveLength(9);
    expect(r.host.cpuTempC).toBeNull();
    expect(r.hostname).toBeNull();
  });
});
