import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, test } from 'vitest';

import { SESSION_COOKIE } from '@/lib/auth/cookie';
import { mintSession } from '@/lib/auth/session';

import { DELETE, POST, dynamic } from './route';

/**
 * The Next route file for §5's login and logout. Three lines, and each one is a trap this
 * project has already fallen into once.
 */

const post = (body: unknown): Request =>
  new Request('http://ai-server:8090/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST · DELETE /api/session', () => {
  test('⚠ the route declares dynamic = force-dynamic', () => {
    expect(dynamic).toBe('force-dynamic');
  });

  /*
   * ⚠ Next calls a route handler as `POST(request, context)`, where `context` carries
   * `params`. Both handlers' second parameter is their injected dependencies — so
   * `export const POST = handleSessionPost` would hand the route's context in as the rate
   * limiter, the clocks and the credential source, and every login would throw on it. Step 6
   * measured this exact mistake on `GET /api/telemetry` (mutation `N2`), where it was
   * invisible because the wrong shape still produced a 401.
   *
   * The context passed here is shaped like the real deps and **would** authorise, so the two
   * implementations are told apart by their answers rather than by both refusing.
   */
  test('⚠ POST ignores the context argument Next passes as its second parameter', async () => {
    const asNextCallsIt = POST as unknown as (
      request: Request,
      context: unknown,
    ) => Promise<Response>;

    const response = await asNextCallsIt(post({ password: 'anything' }), {
      params: Promise.resolve({}),
      env: { PASSWORD_HASH: 'x', SESSION_SECRET: 'a'.repeat(40) },
      limiter: { attempt: () => ({ allowed: true as const }), clear: () => undefined, size: 0 },
      revocations: { revoke: () => undefined, isRevoked: () => false, size: 0 },
      monotonicMs: () => 0,
      nowMs: () => 0,
      verify: async () => true,
    });

    // The real production deps have no `PASSWORD_HASH` in this environment, so the honest
    // answer is 401. An alias would have taken the context above and answered 302.
    expect(response.status).toBe(401);
  });

  /*
   * ⚠ This test asserted only `status === 204` until step 7's reconciliation, and that stopped
   * telling the two implementations apart the moment `handleSessionDelete` wrapped its verdict
   * in a `try`/`catch` (finding F6): the aliased form threw on the context, the catch swallowed
   * it, and **both** answered 204. The harness caught it as a `DID NOT BITE` on `N2` — the same
   * shape step 6 hit on `GET /api/telemetry`, where the wrong wiring also produced the right
   * status. HANDOVER's rule applied: the fix is a stronger test, not a different mutation.
   *
   * So the context below is shaped like real deps and **would** revoke, and the distinguishing
   * assertion is that nothing was written to it: the shipped handler used the production deps,
   * which have no `SESSION_SECRET` in this environment, so the cookie does not verify and
   * nothing is revoked. An alias would have verified it against the secret in the context and
   * pushed a `sid` into the store below.
   */
  test('⚠ DELETE ignores the context argument too', () => {
    const secret = 'a-secret-of-at-least-thirty-two-characters';
    const revoked: string[] = [];
    const { token } = mintSession(secret, Date.now());
    const asNextCallsIt = DELETE as unknown as (request: Request, context: unknown) => Response;

    const response = asNextCallsIt(
      new Request('http://ai-server:8090/api/session', {
        method: 'DELETE',
        headers: { cookie: `${SESSION_COOKIE}=${token}` },
      }),
      {
        params: Promise.resolve({}),
        env: { PASSWORD_HASH: 'x', SESSION_SECRET: secret },
        revocations: {
          revoke: (sid: string) => {
            revoked.push(sid);
          },
          isRevoked: () => false,
          size: 0,
        },
        nowMs: () => Date.now(),
      },
    );

    expect(response.status).toBe(204);
    expect(revoked).toEqual([]);
  });

  /*
   * ⚠ The production wiring: with no credentials in this environment, the shipped route
   * refuses every login. That is deny-by-default reaching the route rather than stopping at
   * the module that implements it.
   */
  test('⚠ the shipped route refuses a login on an unconfigured server', async () => {
    const response = await POST(post({ password: 'anything' }));

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  /*
   * A `route.ts` may only export the names Next recognises, so the seams the tests need
   * cannot live here. A stray export is a build error rather than a test failure, which is a
   * worse place to find out.
   */
  test('the route file exports only what Next recognises', () => {
    const src = readFileSync(fileURLToPath(new URL('route.ts', import.meta.url)), 'utf8');
    const exported = [...src.matchAll(/^export (?:const|function|async function) (\w+)/gm)].map(
      (match) => match[1],
    );

    expect(exported.sort()).toEqual(['DELETE', 'POST', 'dynamic']);
  });

  /*
   * ⚠ §5 defines exactly two operations on this resource. A `GET /api/session` that reported
   * whether a session was live would be a new, unspecified contract *and* an oracle an
   * unauthenticated caller could use — the same reason §5 gives for the 401 carrying no body.
   */
  test('⚠ there is no GET on this route', async () => {
    const module: Record<string, unknown> = await import('./route');
    expect(Object.keys(module).sort()).toEqual(['DELETE', 'POST', 'dynamic']);
  });
});
