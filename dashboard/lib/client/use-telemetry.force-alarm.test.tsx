// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import type { RuntimeEnv, TelemetryResponse } from './env';
import { FORCE_ALARM_PARAM } from './force-alarm';
import { useTelemetry } from './use-telemetry';

/**
 * ⚠ **10c1-A5/A6 — the escape hatch's WIRING, as opposed to the pure function it calls.**
 *
 * `force-alarm.ts` itself is thoroughly covered (`10c-FA1..6`); the six lines in
 * `use-telemetry.ts` that *call* it had zero test coverage and zero mutation coverage, and the
 * whole production-unreachability argument rests on one of their tokens.
 *
 * - **A5.** `force-alarm.ts`'s own doc rests unreachability on `process.env.NODE_ENV` being
 *   replaced by Next's build with the literal `"production"`. That is true of the tree as
 *   written — the parent verified it in a real `pnpm build` bundle — and it was defended by
 *   *nothing*. The adversarial replaced the token with the literal `'development'`, ran
 *   `pnpm build`, and grepped `location.search,"development"` out of the shipped chunk with
 *   `pnpm verify` and `regressions.py` both green. The production test below is what that
 *   edit now has to get past.
 * - **A6.** The one live trial of the hatch (`10c1-build.md` §3.1) ran on a Mac with no GPU,
 *   where `gpus` is `null` — so a correct hatch and a completely broken one produce the same
 *   output. Its *development* path had never been shown to work at all. The first test below
 *   is that demonstration, in plain jsdom.
 *
 * ⚠ **The correction inside the correction, recorded rather than quietly dropped.** The test
 * phase proposed demonstrating the gap by flipping `response.kind !== 'ok'` to `===`. That does
 * **not compile** — `TS2339: Property 'body' does not exist on type '{ kind: "unauthorized" } |
 * { kind: "error"; detail: string }'` — so the specific 401→fake-ok scenario it described can
 * never ship: the discriminated union defends the `kind` check on its own. The FINDING was
 * right and its stated justification was wrong, which is why the `kind` test at the bottom of
 * this file is deliberately **un-⚠-marked**: `tsc` already forbids every one-line wrong
 * implementation of it, so no mutation can distinguish correct from broken (ANCHOR §5's own
 * standard — "if the property has no plausible wrong implementation, drop the ⚠").
 *
 * ⚠ **Why `./runtime` and `./env` are both mocked.** `useTelemetry` "takes nothing" by design —
 * there is no seam to inject an env through — so the only way to observe the `fetchTelemetry`
 * it *builds* is to capture the object it hands the runtime's constructor. Mocking the runtime
 * also keeps the real poll loop out of this file, which `use-telemetry.test.tsx` records
 * costing 506 s and a heap OOM when a mutation made it spin.
 */

const captured = vi.hoisted(() => ({ env: null as RuntimeEnv | null }));
const upstream = vi.hoisted(() => ({
  response: { kind: 'ok', body: null } as TelemetryResponse,
}));

vi.mock('./runtime', () => ({
  TelemetryRuntime: class {
    constructor(env: unknown) {
      captured.env = env as RuntimeEnv;
    }
    readonly subscribe = (): (() => void) => (): void => undefined;
    readonly getState = (): null => null;
    start(): void {
      /* the real loop is runtime.test.ts's subject, never this file's */
    }
    stop(): void {
      /* ditto */
    }
  },
}));

vi.mock('./env', () => ({
  createBrowserEnv: (): RuntimeEnv => ({
    nowMs: () => 0,
    setTimer: () => 0,
    clearTimer: () => undefined,
    storage: null,
    isHidden: () => false,
    onVisibilityChange: () => () => undefined,
    fetchTelemetry: () => Promise.resolve(upstream.response),
    navigate: () => undefined,
  }),
}));

function Probe() {
  useTelemetry();
  return null;
}

let container: HTMLDivElement;

/** Mount the hook once and hand back the `fetchTelemetry` it wrapped — the unit under test. */
const wrappedFetch = (): (() => Promise<TelemetryResponse>) => {
  const root = createRoot(container);
  act(() => {
    root.render(<Probe />);
  });
  const env = captured.env;
  expect(env, 'useTelemetry did not construct a runtime').not.toBeNull();
  act(() => {
    root.unmount();
  });
  return () => (env as RuntimeEnv).fetchTelemetry();
};

/** A minimal `/api/telemetry` body — only the field the hatch reshapes matters here. */
const bodyWithGpu = (tempC: number): unknown => ({ gpus: [{ index: 0, tempC }] });

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  captured.env = null;
  upstream.response = { kind: 'ok', body: null };
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  container.remove();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('⚠ 10c1-A6 — the escape hatch actually works off production, which had never been shown', () => {
  test('⚠ with the query flag set and NODE_ENV not production, GPU 0’s temperature is forced into §6.3’s alarm band', () => {
    window.history.replaceState(null, '', `/?${FORCE_ALARM_PARAM}=1`);
    upstream.response = { kind: 'ok', body: bodyWithGpu(41) };
    const fetchTelemetry = wrappedFetch();
    return fetchTelemetry().then((response) => {
      expect(response.kind).toBe('ok');
      const body = (response as { readonly body: { readonly gpus: readonly { tempC: number }[] } }).body;
      expect(body.gpus[0]?.tempC).toBe(95);
    });
  });

  test('⚠ without the query flag the body is handed on UNCHANGED — the same reference, not a clone', () => {
    const body = bodyWithGpu(41);
    upstream.response = { kind: 'ok', body };
    const fetchTelemetry = wrappedFetch();
    return fetchTelemetry().then((response) => {
      expect((response as { readonly body: unknown }).body).toBe(body);
    });
  });
});

describe('⚠ 10c1-A5 — the production gate is a behaviour, not a token nobody watches', () => {
  test('⚠ in a production build the query flag does nothing, even when it is present', () => {
    // The exact edit the adversarial shipped into a real bundle: `process.env.NODE_ENV`
    // replaced by the literal `'development'` at this one call site. It survived `pnpm verify`,
    // `regressions.py` and `pnpm build`; `grep 'location.search,"[a-z]*"'` on the chunk was the
    // only thing that could see it. This test is that grep, made mechanical.
    vi.stubEnv('NODE_ENV', 'production');
    window.history.replaceState(null, '', `/?${FORCE_ALARM_PARAM}=1`);
    const body = bodyWithGpu(41);
    upstream.response = { kind: 'ok', body };
    const fetchTelemetry = wrappedFetch();
    return fetchTelemetry().then((response) => {
      expect((response as { readonly body: unknown }).body).toBe(body);
    });
  });
});

describe('a non-ok response passes through untouched', () => {
  // ⚠ Deliberately UNMARKED — see this file's module doc. `tsc` rejects every one-line wrong
  // implementation of this branch (the discriminated union has no `body` on the failure arms),
  // so no mutation can distinguish "correct" from "that check removed". Kept as a regression
  // fixture and as the record of what the adversarial's TS2339 actually proved.
  test('an unauthorized response keeps its kind and grows no body', () => {
    upstream.response = { kind: 'unauthorized' };
    const fetchTelemetry = wrappedFetch();
    return fetchTelemetry().then((response) => {
      expect(response.kind).toBe('unauthorized');
      expect(Object.hasOwn(response, 'body')).toBe(false);
    });
  });
});
