import { NextRequest } from 'next/server';

import { afterEach, describe, expect, test, vi } from 'vitest';

import { PASSWORD_HASH_KEY, SESSION_SECRET_KEY } from '@/lib/auth/config';
import { SESSION_COOKIE } from '@/lib/auth/cookie';
// ⚠ From `login-view`, not from `proxy`: the two paths moved to the one module client code
// may import, so step 8 can route a 401 to `/login` without pulling `next/server` and
// `node:crypto` into the browser bundle. `login-view.test.ts` asserts nothing else spells
// them.
import { LOGIN_PATH, SESSION_PATH } from '@/lib/auth/login-view';
import { mintSession } from '@/lib/auth/session';

import { config, proxy } from './proxy';

/**
 * §5: "The login screen is the only route reachable unauthenticated."
 *
 * ⚠ This is `proxy.ts`, not `middleware.ts` — Next 16 renamed the convention
 * (`node_modules/next/dist/docs/01-app/01-getting-started/16-proxy.md`). A file at the old
 * name would simply never run, which is the quietest possible way to ship an open dashboard,
 * so the file's own existence under the right name is part of what these tests pin.
 */

const SECRET = 'a-secret-of-at-least-thirty-two-characters';
const HASH = 'scrypt.15.8.1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const configured = (): void => {
  vi.stubEnv(SESSION_SECRET_KEY, SECRET);
  vi.stubEnv(PASSWORD_HASH_KEY, HASH);
};

const request = (path: string, cookie?: string): NextRequest =>
  new NextRequest(`http://ai-server:8090${path}`, {
    headers: cookie === undefined ? {} : { cookie },
  });

const signedIn = (path: string): NextRequest =>
  request(path, `${SESSION_COOKIE}=${mintSession(SECRET, Date.now()).token}`);

/** `NextResponse.next()` is a 200 carrying Next's own continuation header. */
const isPassThrough = (response: Response): boolean =>
  response.status === 200 && response.headers.has('x-middleware-next');

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('the two paths that must work without a session', () => {
  /*
   * ⚠ If either of these were gated there would be no way to obtain a session at all: the
   * login screen would redirect to itself, or the form would post into a 401. This is the
   * bootstrap, and it has to hold with the environment unconfigured too.
   */
  test.each([
    ['the login screen', LOGIN_PATH],
    ['the session endpoint', SESSION_PATH],
  ])('⚠ it is reachable unauthenticated — %s', (_name, path) => {
    expect(isPassThrough(proxy(request(path)))).toBe(true);
  });

  test('⚠ they stay reachable when the server has no credentials configured', () => {
    expect(isPassThrough(proxy(request(LOGIN_PATH)))).toBe(true);
    expect(isPassThrough(proxy(request(SESSION_PATH)))).toBe(true);
  });
});

describe('a request with a valid session', () => {
  test('reaches the page it asked for', () => {
    configured();
    expect(isPassThrough(proxy(signedIn('/')))).toBe(true);
  });

  test('reaches the telemetry endpoint', () => {
    configured();
    expect(isPassThrough(proxy(signedIn('/api/telemetry')))).toBe(true);
  });
});

describe('a request without one', () => {
  /*
   * ⚠ §5: "every `/api/*` returns 401", and §5.2 routes a 401 to `/login`. A **redirect**
   * here instead would be far worse than it looks: `fetch` follows it, the client receives a
   * 200 carrying the login page's HTML, `response.ok` is true, and step 8's poller would try
   * to parse a document as a telemetry snapshot — landing on §6.7's failed-poll path with a
   * banner naming a server failure, and never telling the user to sign in.
   */
  test('⚠ an /api/* request is refused with 401 and no body, never redirected', async () => {
    configured();
    const response = proxy(request('/api/telemetry'));

    expect(response.status).toBe(401);
    expect(response.headers.get('location')).toBeNull();
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.text()).toBe('');
  });

  /*
   * ⚠ 302 rather than `NextResponse.redirect`'s 307 default. 307 preserves the method, so a
   * POST to a gated page would be re-POSTed at `/login`.
   */
  test('⚠ a page request is redirected to /login with 302', () => {
    configured();
    const response = proxy(request('/'));

    expect(response.status).toBe(302);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe(LOGIN_PATH);
  });

  /*
   * ⚠ §5.2's *Session expired* state means "arrived here from an expired session". A first
   * visit with no cookie at all is *Idle*; telling someone who has never signed in that their
   * session expired is a lie of exactly the kind §6.5 exists to prevent.
   */
  test('⚠ ?expired=1 is set only when a session cookie was actually present', () => {
    configured();
    const locationFor = (cookie?: string): URL =>
      new URL(proxy(request('/', cookie)).headers.get('location') ?? '');

    expect(locationFor().searchParams.get('expired')).toBeNull();
    expect(locationFor('theme=dark').searchParams.get('expired')).toBeNull();
    expect(locationFor(`${SESSION_COOKIE}=stale-and-unverifiable`).searchParams.get('expired')).toBe(
      '1',
    );
  });

  test.each([
    ['a cookie signed with another key', () => mintSession('another-thirty-two-character-key!', Date.now()).token],
    ['an expired cookie', () => mintSession(SECRET, Date.now() - 40 * 24 * 60 * 60 * 1000).token],
    ['junk', () => 'nonsense'],
    ['a truncated token', () => 'eyJ2IjoxfQ'],
    ['a lone percent sign', () => '%'],
  ])('⚠ the gate refuses it — %s', (_name, token) => {
    configured();
    expect(proxy(request('/', `${SESSION_COOKIE}=${token()}`)).status).toBe(302);
    expect(proxy(request('/api/telemetry', `${SESSION_COOKIE}=${token()}`)).status).toBe(401);
  });

  /*
   * ⚠ Deny-by-default at the gate. An unconfigured container serves nothing but the login
   * screen — loud, immediate, harmless — rather than everything.
   */
  test('⚠ an unconfigured server lets nothing through, valid cookie or not', () => {
    const token = mintSession(SECRET, Date.now()).token;

    expect(proxy(request('/', `${SESSION_COOKIE}=${token}`)).status).toBe(302);
    expect(proxy(request('/api/telemetry', `${SESSION_COOKIE}=${token}`)).status).toBe(401);
  });
});

describe('the matcher and the module’s shape', () => {
  /*
   * ⚠ Without a matcher the proxy runs on every request including `_next/static`, so the gate
   * would 302 the stylesheet the login screen needs and the page would render unstyled — a
   * failure that looks like a CSS bug rather than an auth one. Next reads this at build time
   * and silently ignores anything it cannot statically analyse, so it must be a literal.
   */
  test('⚠ the matcher excludes Next’s own static assets', () => {
    expect(config.matcher).toHaveLength(1);
    const pattern = new RegExp(`^${config.matcher[0] ?? ''}$`);

    expect(pattern.test('/_next/static/chunks/main.js')).toBe(false);
    expect(pattern.test('/_next/image')).toBe(false);
    expect(pattern.test('/favicon.ico')).toBe(false);
    expect(pattern.test('/')).toBe(true);
    expect(pattern.test('/api/telemetry')).toBe(true);
    expect(pattern.test('/login')).toBe(true);
  });

  /*
   * ⚠ HANDOVER §6 item 8: "middleware must not import `handler.ts`." That module builds the
   * process's single `TelemetrySource` at load, and loading it in a second runtime would mean
   * a second 2 s cache and a second set of carried counters — two sets of collectors sampling
   * one box, with the cache no longer doing the one job §4 gives it.
   *
   * Also asserted: the proxy does not reach the revocation store. It cannot honestly — Next's
   * own docs say a proxy must not rely on shared modules or globals — and a future edit that
   * "fixes" the asymmetry by importing it would be relying on exactly that.
   */
  test('⚠ the proxy imports neither the telemetry handler nor the revocation store', async () => {
    const { readFileSync } = await import('node:fs');
    const source = readFileSync(new URL('proxy.ts', import.meta.url), 'utf8');

    // ⚠ Over the import specifiers, not over the text: this module explains both rules in
    // prose, and a scanner that read a doc comment as an import would fail on the file that
    // documents why the import is forbidden.
    const specifiers = [...source.matchAll(/^import[\s\S]*?from '([^']+)';/gm)].map(
      (match) => match[1] ?? '',
    );

    expect(specifiers.length).toBeGreaterThan(0);
    expect(specifiers.filter((s) => s.includes('telemetry'))).toEqual([]);
    expect(specifiers.filter((s) => s.includes('revocations'))).toEqual([]);
  });

  /*
   * The convention's *name*. Next 16 renamed `middleware.ts` to `proxy.ts`; a file left at the
   * old name is not an error, it simply never runs — every route open, nothing in any log, and
   * a test suite that still passes because it imported the module directly. Both halves are
   * asserted: the new name exists, and the old one does not sit beside it.
   *
   * ⚠ **Deliberately not ⚠-marked**, and the reason is the ledger's own rule. Step 7's harness
   * mutates the *contents* of a file; this property is about the *tree* — which files exist —
   * so there is no mutation that can redden it, and HANDOVER §5.2 says to drop the mark rather
   * than the standard. It is recorded in the harness docstring as a property with no mutation.
   */
  test('the gate is at proxy.ts, and there is no stale middleware.ts beside it', async () => {
    const { existsSync } = await import('node:fs');

    expect(existsSync(new URL('proxy.ts', import.meta.url))).toBe(true);
    expect(existsSync(new URL('middleware.ts', import.meta.url))).toBe(false);
    expect(existsSync(new URL('src/proxy.ts', import.meta.url))).toBe(false);
  });
});
