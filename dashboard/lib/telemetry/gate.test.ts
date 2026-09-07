import { describe, expect, test } from 'vitest';

import { everythingZero } from '@/lib/fixtures';
import type { GpuCollection } from '@/lib/collectors';

import { OUTSTANDING_CALL, oneAtATime } from './gate';
import { NO_CHECKS, NO_HOST, NO_NETWORK } from './snapshot';
import type { SnapshotCollectors } from './snapshot';

/**
 * §4's outstanding-call rule, proved the way `cache.test.ts` proves O18: **by call count**.
 *
 * The damage this prevents is a second `nvidia-smi` and a second blocked thread-pool
 * worker, not a second snapshot object — so every test here counts calls to a collector
 * that has not returned, and none of them looks at a reading.
 */

/**
 * A GPU collector the test opens and closes by hand, counting how often it was entered.
 *
 * Typed as the real `collectGpus` so no cast is needed anywhere below — a cast would let a
 * signature change slip past this file, which is the reason `SnapshotCollectors` is written
 * with `typeof` in the first place.
 */
const deferredCollector = () => {
  const state = { calls: 0 };
  let open: ((collection: GpuCollection) => void) | null = null;
  let fail: ((e: Error) => void) | null = null;

  const call: SnapshotCollectors['gpus'] = () => {
    state.calls += 1;
    return new Promise<GpuCollection>((resolve, reject) => {
      open = resolve;
      fail = reject;
    });
  };

  return {
    state,
    call,
    resolve: (): void => open?.({ gpus: null, errors: [] }),
    reject: (e: Error): void => fail?.(e),
  };
};

/** Six collectors that answer immediately, each counting its own calls. */
const countingCollectors = () => {
  const calls = { gpus: 0, host: 0, cooling: 0, serving: 0, storage: 0, safety: 0 };
  const collectors: SnapshotCollectors = {
    gpus: async () => {
      calls.gpus += 1;
      return { gpus: null, errors: [] };
    },
    host: async ({ nowMs }) => {
      calls.host += 1;
      return {
        hostname: null,
        host: NO_HOST,
        net: NO_NETWORK,
        sample: { atMs: nowMs, cpu: null, net: null },
        errors: [],
      };
    },
    cooling: async () => {
      calls.cooling += 1;
      return { cooling: everythingZero.cooling, pwm5Present: null, errors: [] };
    },
    serving: async () => {
      calls.serving += 1;
      return { serving: null, errors: [] };
    },
    storage: async () => {
      calls.storage += 1;
      return {
        filesystems: { root: everythingZero.storage.root, home: everythingZero.storage.home },
        errors: [],
      };
    },
    safety: async () => {
      calls.safety += 1;
      return { checks: NO_CHECKS, errors: [] };
    },
  };
  return { calls, collectors };
};

describe('one call at a time, per collector (§4)', () => {
  /*
   * ⚠ The rule itself. §4: "A poll that finds one outstanding does not issue a second."
   *
   * The failure it prevents is measured and this project's own: an abandoned `readFile`
   * keeps its thread-pool worker for as long as the underlying read is blocked, and four
   * blocked workers stop every subsequent read in the process. One more call per poll, for
   * as long as the container runs, is the unbounded half of that.
   */
  test('⚠ a second call while the first is outstanding is refused, not issued', async () => {
    const wedged = deferredCollector();
    const { collectors } = countingCollectors();
    const gated = oneAtATime({ ...collectors, gpus: wedged.call });

    const first = gated.gpus();
    await expect(gated.gpus()).rejects.toThrow(OUTSTANDING_CALL);
    await expect(gated.gpus()).rejects.toThrow(OUTSTANDING_CALL);

    expect(wedged.state.calls).toBe(1);
    wedged.resolve();
    await first;
  });

  /*
   * ⚠ §4: a skipped call "mints no verdict of failure". The rejection has to say that the
   * call was not made, because `snapshot.ts` turns it into that collector's own "could not
   * report" collection and the message is the only part a reader sees.
   */
  test('⚠ the refusal names the skipped call rather than claiming a reading failed', async () => {
    const wedged = deferredCollector();
    const { collectors } = countingCollectors();
    const gated = oneAtATime({ ...collectors, gpus: wedged.call });

    const first = gated.gpus();
    await expect(gated.gpus()).rejects.toThrow(/previous call has not returned/);

    wedged.resolve();
    await first;
  });

  /*
   * ⚠ The slot is released when the **underlying** call settles, which is what makes the
   * rule self-healing: §4's "it recovers on the first poll after the call returns". No
   * cool-down, no failure count, nothing to tune.
   */
  test('⚠ the slot is released when the underlying call settles, and the next poll is issued', async () => {
    const wedged = deferredCollector();
    const { collectors } = countingCollectors();
    const gated = oneAtATime({ ...collectors, gpus: wedged.call });

    const first = gated.gpus();
    await expect(gated.gpus()).rejects.toThrow(OUTSTANDING_CALL);

    wedged.resolve();
    await first;

    const second = gated.gpus();
    expect(wedged.state.calls).toBe(2);
    wedged.resolve();
    await second;
  });

  /*
   * ⚠ And released on a **rejection** too. A collector that fails once — the ordinary case
   * on this machine, where a partial snapshot is normal — must not be skipped for the life
   * of the process. A `finally`-less release is the plausible wrong version.
   */
  test('⚠ a call that rejects releases the slot, so one failure does not skip forever', async () => {
    const wedged = deferredCollector();
    const { collectors } = countingCollectors();
    const gated = oneAtATime({ ...collectors, gpus: wedged.call });

    const first = gated.gpus();
    wedged.reject(new Error('nvidia-smi exploded'));
    await expect(first).rejects.toThrow('nvidia-smi exploded');

    const second = gated.gpus();
    expect(wedged.state.calls).toBe(2);
    wedged.resolve();
    await second;
  });

  /*
   * ⚠ Per collector, never one slot for the set. §6.7: a bound is evidence about the
   * subject it applied to "and to nothing else" — a shared slot would blank five panels
   * because the sixth was wedged, which is HANDOVER §6 item 1's mistake wearing a different
   * hat.
   */
  test('⚠ each collector has its own slot, so a wedged one does not skip the other five', async () => {
    const wedged = deferredCollector();
    const { calls, collectors } = countingCollectors();
    const gated = oneAtATime({ ...collectors, gpus: wedged.call });

    const first = gated.gpus();
    await expect(gated.gpus()).rejects.toThrow(OUTSTANDING_CALL);

    await Promise.all([
      gated.host({ nowMs: 1000 }),
      gated.cooling(),
      gated.serving(),
      gated.storage(),
      gated.safety(),
    ]);

    expect(calls).toEqual({ gpus: 0, host: 1, cooling: 1, serving: 1, storage: 1, safety: 1 });
    wedged.resolve();
    await first;
  });

  /*
   * A collector that throws synchronously — a bug, not a reading — must not wedge its own
   * slot for the life of the process.
   */
  test('a synchronous throw releases the slot as well', async () => {
    const { collectors } = countingCollectors();
    let thrown = 0;
    const gated = oneAtATime({
      ...collectors,
      gpus: (() => {
        thrown += 1;
        throw new Error('bad options');
      }) as unknown as SnapshotCollectors['gpus'],
    });

    expect(() => gated.gpus()).toThrow('bad options');
    expect(() => gated.gpus()).toThrow('bad options');
    expect(thrown).toBe(2);
  });

  test('arguments and answers pass through untouched', async () => {
    const { calls, collectors } = countingCollectors();
    const gated = oneAtATime(collectors);
    const seen: number[] = [];

    const host = await oneAtATime({
      ...collectors,
      host: async (options) => {
        seen.push(options.nowMs);
        return collectors.host(options);
      },
    }).host({ nowMs: 4242 });

    expect(seen).toEqual([4242]);
    expect(host.host).toBe(NO_HOST);
    expect((await gated.storage()).filesystems.root).toBe(everythingZero.storage.root);
    expect(calls.storage).toBe(1);
  });
});
