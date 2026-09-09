'use client';

/**
 * §6.7's runtime, as a React hook — and **it is deliberately the thinnest thing in this
 * step**.
 *
 * Everything with a rule attached to it is in `runtime.ts`, behind the `RuntimeEnv` seam, so
 * that the cadence, the `ts` dedupe, the backoff, the visibility pause, the 10 s debounce and
 * the 401 hand-off are all tested in plain Node with a fake clock. What is left here is
 * wiring, and the three ways wiring goes wrong are each closed by a line below:
 *
 * 1. **A runtime rebuilt on every render** would restart polling on every render. The
 *    instance lives in a `useRef`, created once — React's own documented "avoid re-creating
 *    the ref contents" shape — and the effect is keyed on that instance.
 * 2. **An unstable `subscribe`/`getState`** would make `useSyncExternalStore` resubscribe
 *    every render. Both are arrow-function **class properties**, so their identity is the
 *    runtime's.
 * 3. **A timer surviving unmount** would poll a dead store, and on a route change would poll
 *    forever. The effect's cleanup is `runtime.stop()`, which clears the pending timer,
 *    removes the visibility listener, and invalidates any in-flight request's right to write.
 *
 * ⚠ **Server rendering.** A client component is still rendered on the server, where there is
 * no `window` — so the runtime is built only when one exists, and the hook's state is `null`
 * until the first client render. That is not a placeholder for missing data: it is *before
 * the first poll*, which is a real state the dashboard has for a moment on every load and
 * which §6.7's "first sample" rules already describe. It also keeps §3.2's requirement true
 * by construction — "`app/page.tsx` must stay free of telemetry" — because there is nothing
 * for a server render to put there.
 *
 * ⚠ This hook is the one thing in step 8 with no test, and the reason is written down rather
 * than glossed: testing it needs a DOM, this project has deliberately had none since step 7,
 * and step 8 decided not to add jsdom for twelve lines that contain no rule. The step notes
 * carry the argument and what would change it.
 */

import { useEffect, useRef, useSyncExternalStore } from 'react';

import { createBrowserEnv } from './env';
import { forceAlarmForTesting } from './force-alarm';
import { TelemetryRuntime } from './runtime';
import type { RuntimeState } from './runtime';

/** What the hook hands a panel: the state, and the four controls of §6.2. */
export interface TelemetryHandle {
  /** `null` on the server render, and before the runtime exists. */
  readonly state: RuntimeState | null;
  /** `null` on the server render. §6.2's controls hang off it. */
  readonly runtime: TelemetryRuntime | null;
}

const NO_SUBSCRIBE = (): (() => void) => () => undefined;
const NO_STATE = (): RuntimeState | null => null;

/**
 * Start §6.7's runtime for the life of a component.
 *
 * ⚠ **It takes nothing.** `STANDING` used to arrive here as an option; §4 now carries it on
 * the snapshot, so it is per-poll state and there is no configuration for a caller to get
 * wrong. An options object read once, outside the effect's deps, would have been the shape in
 * which a mid-session change silently did nothing.
 */
export function useTelemetry(): TelemetryHandle {
  const held = useRef<TelemetryRuntime | null>(null);
  if (held.current === null && typeof window !== 'undefined') {
    // ⚠ No cast. The real `Window` **satisfies** `BrowserWindow` structurally, and
    // `lib/client/wire.test-d.ts` asserts that at the type level — a hand-rolled seam whose
    // shape has drifted from the DOM's is the failure this whole approach risks, and a cast
    // here is precisely how it would be hidden.
    const browserEnv = createBrowserEnv(window);
    // ⚠ 10a-F4's alarm-forcing escape hatch (`force-alarm.ts`). Wraps ONLY `fetchTelemetry`,
    // reshaping the JSON body already received before `runtime.ts` ever validates it — every
    // later stage (validation, severity, the debounce, the banner) runs unmodified and for
    // real. `forceAlarmForTesting` is itself a no-op unless `NODE_ENV` is not `'production'`
    // AND the query string opts in; see that module's doc for the production-unreachability
    // argument and `10c1-build.md` for the verified build-output check.
    held.current = new TelemetryRuntime({
      ...browserEnv,
      fetchTelemetry: async () => {
        const response = await browserEnv.fetchTelemetry();
        if (response.kind !== 'ok') return response;
        return {
          kind: 'ok',
          body: forceAlarmForTesting(response.body, window.location.search, process.env.NODE_ENV),
        };
      },
    });
  }
  const runtime = held.current;

  const state = useSyncExternalStore<RuntimeState | null>(
    runtime === null ? NO_SUBSCRIBE : runtime.subscribe,
    runtime === null ? NO_STATE : runtime.getState,
    NO_STATE,
  );

  useEffect(() => {
    if (runtime === null) return undefined;
    runtime.start();
    return () => {
      runtime.stop();
    };
  }, [runtime]);

  return { state, runtime };
}
