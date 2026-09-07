import { describe, expect, test, vi } from 'vitest';

import { everythingZero } from '@/lib/fixtures';

import { HOST_CEILING_MS, withHostCeiling } from './ceiling';
import { NO_CHECKS, NO_HOST, NO_NETWORK } from './snapshot';
import type { SnapshotCollectors } from './snapshot';

/**
 * §4's ceiling on `collectHost`, and the two things it must not do: fire on anybody else,
 * and outlive the call it bounded.
 */

const NEVER = new Promise<never>(() => {});

const collectorsWith = (host: SnapshotCollectors['host']): SnapshotCollectors => ({
  gpus: async () => ({ gpus: null, errors: [] }),
  host,
  cooling: async () => ({ cooling: everythingZero.cooling, pwm5Present: null, errors: [] }),
  serving: async () => ({ serving: null, errors: [] }),
  storage: async () => ({
    filesystems: { root: everythingZero.storage.root, home: everythingZero.storage.home },
    errors: [],
  }),
  safety: async () => ({ checks: NO_CHECKS, errors: [] }),
});

const answering: SnapshotCollectors['host'] = async ({ nowMs }) => ({
  hostname: 'ai-server',
  host: NO_HOST,
  net: NO_NETWORK,
  sample: { atMs: nowMs, cpu: null, net: null },
  errors: [],
});

describe('the collectHost ceiling (§4)', () => {
  /*
   * ⚠ The property the ceiling exists for. `collectHost` is the only collector with no
   * budget of its own, and its `/proc` reads run on libuv's thread pool — which, once four
   * operations are blocked, stops every subsequent read in the process. Without a ceiling
   * the sample never settles, the in-flight cache holds that promise forever, and
   * `GET /api/telemetry` is dead until the container restarts.
   */
  test('⚠ a host read that never returns settles at the ceiling instead of hanging', async () => {
    const bounded = withHostCeiling(
      collectorsWith((() => NEVER) as unknown as SnapshotCollectors['host']),
      20,
    );

    await expect(bounded.host({ nowMs: 0 })).rejects.toThrow(/timed out after 20 ms/);
  });

  /*
   * ⚠ §6.7: an abandoned reading's entry "names the budget rather than the subject". The
   * rejection reaches `snapshot.ts`'s `attempt` and becomes the message on all nine host
   * entries, so a message naming `/proc/stat` rather than the bound would claim a read was
   * attempted and failed.
   */
  test('⚠ the ceiling’s rejection names the budget, not a subject', async () => {
    const bounded = withHostCeiling(
      collectorsWith((() => NEVER) as unknown as SnapshotCollectors['host']),
      20,
    );

    await bounded.host({ nowMs: 0 }).then(
      () => expect.unreachable('the ceiling must reject'),
      (e: unknown) => {
        expect((e as Error).message).toBe('timed out after 20 ms');
      },
    );
  });

  /*
   * ⚠ §6.5 forbids a collector-wide bound that could blank a per-instance verdict, and
   * `collectServing` is the collector that has them — a ceiling over it is the forbidden
   * thing. The five are passed through **by identity**, which is stronger than "they still
   * answer": a re-wrapped collector could pass every behavioural test and still be
   * bounded by a number this file chose.
   */
  test('⚠ only collectHost is bounded — the other five are passed through untouched', () => {
    const original = collectorsWith(answering);
    const bounded = withHostCeiling(original, 20);

    expect(bounded.gpus).toBe(original.gpus);
    expect(bounded.cooling).toBe(original.cooling);
    expect(bounded.serving).toBe(original.serving);
    expect(bounded.storage).toBe(original.storage);
    expect(bounded.safety).toBe(original.safety);
    expect(bounded.host).not.toBe(original.host);
  });

  test('a host read that answers inside the ceiling passes its collection through', async () => {
    const bounded = withHostCeiling(collectorsWith(answering), 5000);
    const collection = await bounded.host({ nowMs: 4242 });

    expect(collection.hostname).toBe('ai-server');
    expect(collection.sample.atMs).toBe(4242);
  });

  /*
   * ⚠ §4 fixes the number as well as the mechanism: the ceiling is "equal to the poll's
   * blessed worst case", which §6.7 states is `collectServing`'s 2 s discovery + 4 s probe.
   * A tighter one would fire during thread-pool contention *caused by another collector*
   * and mint nine host failure verdicts from another subject's problem.
   */
  test('⚠ the shipped ceiling is §4’s 6 s, the poll’s blessed worst case', () => {
    expect(HOST_CEILING_MS).toBe(6000);
  });

  /*
   * ⚠ §4: "Sampling is per-request, not a background loop." A ceiling that left its timer
   * running would keep the event loop alive for six seconds after every poll — on a box
   * whose thermal margin is the thing being watched, and in a container that must do
   * nothing at all with no clients connected.
   *
   * Only the timer functions are faked, so `performance.now()` — which `deadline` uses for
   * its monotonic arithmetic — stays real.
   */
  test('⚠ the ceiling leaves no timer behind once the call has settled', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    try {
      const bounded = withHostCeiling(collectorsWith(answering), 5000);
      await bounded.host({ nowMs: 0 });
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
});
