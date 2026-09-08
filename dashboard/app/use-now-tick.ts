'use client';

/**
 * §6.2's age indicator needs its OWN interval (D2/SCOPE §2.5b) — a wall clock this file ticks
 * on a plain `setInterval`, wholly independent of `useTelemetry`'s store.
 *
 * ⚠ **Why a store-driven tick is worse than none, restated from the handoff.** Under §6.2's
 * mode rule the store changes exactly once, at the `live → stale` crossing (`runtime.ts`'s
 * `applyMode` folds the mode into the SAME patch as everything else, so `RuntimeState` itself
 * does not change on every tick of the clock — only when a poll lands, succeeds, fails, or the
 * mode recomputation crosses a threshold). An age indicator that only re-rendered when the
 * store changed would therefore *look* correct in a fast-cadence fixture (frequent successful
 * polls keep re-rendering it anyway) and then freeze the instant real polling actually stops —
 * which is the one moment the age indicator exists to catch. This hook exists so the numbers
 * on screen keep moving for a reason that has nothing to do with whether the network is
 * behaving.
 *
 * This is the one other hook this project adds under `app/` (`use-telemetry.ts` is the
 * other), never under `components/` — `purity.test.ts` forbids every React hook there, by
 * shape, and the walk recurses into `components/panels/`. See `10a-build.md` §1 for the full
 * hook-boundary decision this follows.
 *
 * Deliberately dumb: no visibility pause, no backoff, no dependency on `RuntimeState` at all.
 * A hidden tab throttles `setInterval` on its own (browsers already do this), and the age
 * indicator reading a stale number while backgrounded is correct — it is telling the truth
 * about how old the data is, which does not stop being true just because nobody is looking.
 */

import { useEffect, useState } from 'react';

/** A wall clock in milliseconds, re-read every `intervalMs`. Never driven by any store. */
export function useNowTick(intervalMs: number): number {
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => {
      setNow(Date.now());
    }, intervalMs);
    return () => {
      clearInterval(id);
    };
  }, [intervalMs]);

  return now;
}
