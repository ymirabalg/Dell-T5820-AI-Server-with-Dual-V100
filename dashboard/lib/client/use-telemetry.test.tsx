// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { TelemetryRuntime } from './runtime';
import { useTelemetry } from './use-telemetry';

/**
 * D6, half two. `use-telemetry.ts`'s own doc: *"testing it needs a DOM, this project has
 * deliberately had none since step 7, and step 8 decided not to add jsdom for twelve lines
 * that contain no rule."* Step 10 needs the age indicator's own interval tested regardless
 * (`app/use-now-tick.test.tsx`), so the same devDependency now pays for this too — see
 * `10a-build.md`'s D6/invariant-6 section for what it costs and what was checked before
 * adding it.
 *
 * ⚠ **The real `window`, not a fake.** `use-telemetry.ts` calls `createBrowserEnv(window)`
 * unconditionally when `typeof window !== 'undefined'` — there is no seam to inject a fake
 * env through, by design (the hook "takes nothing"). So this file is the one place in the
 * project that DOES exercise `createBrowserEnv(window)` for real, which `env.ts`'s own doc
 * names as "the one expression no test in this project executes" — that was true before this
 * step.
 *
 * A real jsdom `window.fetch` is not required for what these tests assert: `env.ts`'s
 * `fetchTelemetry` wraps the call in `try/catch`, so a jsdom window with no `fetch` at all
 * turns the runtime's first poll into an ordinary failed poll rather than a thrown error —
 * exactly the "never rejects" contract `runtime.ts` already relies on.
 */

let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
});

afterEach(() => {
  container.remove();
  vi.restoreAllMocks();
});

function Probe() {
  useTelemetry();
  return null;
}

describe('⚠ the first assertion D6 asks for: unmounting calls stop()', () => {
  test('⚠ stop() is not called while mounted, and is called exactly once on unmount', () => {
    const stopSpy = vi.spyOn(TelemetryRuntime.prototype, 'stop');
    const root = createRoot(container);

    act(() => {
      root.render(<Probe />);
    });
    expect(stopSpy).not.toHaveBeenCalled();

    act(() => {
      root.unmount();
    });
    expect(stopSpy).toHaveBeenCalledTimes(1);
  });
});

describe('the runtime instance is stable — built once, not rebuilt on every render', () => {
  // ⚠ Deliberately UNMARKED, and the reason is a real finding rather than an oversight.
  // The property this asserts is real (`use-telemetry.ts`'s own doc: "a runtime rebuilt on
  // every render would restart polling on every render"), but the WRONG implementation that
  // would violate it — dropping the `held.current === null &&` guard so a fresh
  // `TelemetryRuntime` is constructed on every render — was tried as a mutation for this step's
  // harness and does not redden this test cleanly. It instead feeds `useSyncExternalStore` a
  // `getSnapshot` whose identity changes on every call, which trips React's own
  // tearing-detection retry loop: the harness measured this at **506 seconds and a `SIGABRT`
  // from a JS heap OOM**, not a normal test failure. That is worse than no mutation at all —
  // §10a-build.md's bar explicitly rules out a mutation that does not redden *deterministically
  // and quickly*, and a multi-minute OOM crash is neither. So this test stays, as a real
  // behavioural assertion and a regression guard, but the red-test ledger correctly expects no
  // mutation to cover it: the honest state is "this property is real, tested, and its actual
  // violation is caught by React itself rather than by this harness."
  test('start() runs exactly once across two renders of the same mounted component', () => {
    const startSpy = vi.spyOn(TelemetryRuntime.prototype, 'start');
    const root = createRoot(container);

    act(() => {
      root.render(<Probe />);
    });
    act(() => {
      // A second render of the SAME element type at the SAME root — React reconciles it as
      // an update to the existing component instance, not a fresh mount. If the runtime were
      // rebuilt per render (a `new TelemetryRuntime(...)` outside the `useRef` guard), the
      // effect's `[runtime]` dependency would change identity and `start()` would run again.
      root.render(<Probe />);
    });

    expect(startSpy).toHaveBeenCalledTimes(1);

    act(() => {
      root.unmount();
    });
  });
});
