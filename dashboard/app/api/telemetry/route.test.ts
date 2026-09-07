import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { everythingZero } from '@/lib/fixtures';

import { GET, dynamic } from './route';

/**
 * The Next route file. Four lines, and every one of them is a trap someone has already
 * fallen into somewhere.
 *
 * This is also the project's first `app/` module, so it is the first real exercise of the
 * `@/` alias outside `lib/` — the route imports `@/lib/telemetry/handler`, and if the alias
 * were wrong under Vitest this file would fail to resolve rather than fail an assertion.
 */

const request = (): Request => new Request('http://ai-server:8090/api/telemetry');

describe('GET /api/telemetry', () => {
  /*
   * ⚠ §4: "Sampling is per-request, not a background loop." The hazard is that `next build`
   * would run the collectors **on the build machine** and bake the result — a snapshot of a
   * developer's Mac, with `nvidia-smi` absent and `/proc/stat` unreadable, served to the
   * browser as this box's telemetry, looking like a dead server rather than a build-time
   * mistake.
   *
   * ⚠ **The export is not what prevents that today, and the test name used to claim it
   * was.** Measured in step 6's adversarial phase: with `export const dynamic = 'auto'` —
   * the default — `pnpm build` still prints `ƒ /api/telemetry  (Dynamic)`. Next 16's own
   * bundled docs say why (`01-app/01-getting-started/15-route-handlers.md:51`): *"Route
   * Handlers are **not cached by default**. … To cache a `GET` method, use a route config
   * option such as `export const dynamic = 'force-static'`."* So the build output observes
   * the framework default, not this constant.
   *
   * **Keep it anyway**, and the name now says only what is checked. It is explicit defence
   * against a future default and against Cache Components, under which the same docs say
   * `GET` route handlers *"can be prerendered when they don't access uncached or runtime
   * data"* — the exact hazard above. `dynamic` is documented in
   * `02-guides/caching-without-cache-components.md`, which opens *"This guide assumes you
   * are **not** using Cache Components"*, so in the one configuration where the hazard is
   * real this lever's status is **unverified**. Step 11 needs that answer before it ever
   * turns Cache Components on.
   */
  test('⚠ the route declares dynamic = force-dynamic', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  /*
   * ⚠ The production wiring, end to end: the shipped route consults step 7's real verifier,
   * which refuses a request carrying no session cookie — and, in this environment, would
   * refuse one carrying any cookie at all, because `SESSION_SECRET` is not set.
   *
   * It is deliberately the only test that calls the real `GET`, and it is safe precisely
   * because the answer is 401: nothing here spawns `nvidia-smi` or opens a socket.
   */
  test('⚠ the shipped route answers 401 to a request with no session cookie', async () => {
    const response = await GET(request());

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
  });

  /*
   * ⚠ Next calls a route handler as `GET(request, context)`, where `context` carries
   * `params`. `handleTelemetry`'s second parameter is its injected dependencies — so
   * `export const GET = handleTelemetry` would hand the route's context in as the session
   * check and the telemetry source. The wrapper is one line and the mistake is one
   * character shorter, which is exactly the kind of edit that gets made while tidying.
   *
   * ⚠ **The context passed here is shaped like `TelemetryHandlerDeps` on purpose, and that
   * is a correction from step 6's reconciliation.** The earlier version passed only
   * `{ params }` and asserted 401 — which stopped distinguishing the two implementations
   * the moment §5's "a check that cannot reach a verdict denies" landed: under the alias,
   * `deps.authorize` would be `undefined`, calling it would throw, and the new `try/catch`
   * would answer **401 for the wrong reason**. The harness caught it as a mutation that no
   * longer bit. A context that *would* authorise tells the two apart: the wrapper ignores
   * it and refuses; an alias would take it, authorise, and serve a snapshot.
   */
  test('⚠ GET ignores the context argument Next passes as its second parameter', async () => {
    const asNextCallsIt = GET as unknown as (
      request: Request,
      context: unknown,
    ) => Promise<Response>;

    const response = await asNextCallsIt(request(), {
      params: Promise.resolve({}),
      authorize: () => true,
      source: { snapshot: async () => everythingZero },
    });

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
  });

  /*
   * A `route.ts` may only export the names Next recognises, so the seams the tests need
   * cannot live here. Keeping the file to `dynamic` and `GET` is what makes that true, and
   * a stray export would be a build error rather than a test failure — which is a worse
   * place to find out.
   */
  test('the route file exports only what Next recognises', () => {
    const src = readFileSync(fileURLToPath(new URL('route.ts', import.meta.url)), 'utf8');
    const exported = [...src.matchAll(/^export (?:const|function|async function) (\w+)/gm)].map(
      (match) => match[1],
    );

    expect(exported.sort()).toEqual(['GET', 'dynamic']);
  });
});
