import { describe, expect, test } from 'vitest';

import { PASSWORD_HASH_KEY, SESSION_SECRET_KEY } from './config';
import { SESSION_COOKIE } from './cookie';
import { createRevocations } from './revocations';
import { mintSession } from './session';
import { liveSessionOf, productionAuthorizeDeps, verifySession } from './authorize';
import type { AuthorizeDeps } from './authorize';

/**
 * The **full** session verdict — signature, shape, §5's thirty days, and revocation — and the
 * §5 promise that no input reaches it as a throw.
 */

const SECRET = 'a-secret-of-at-least-thirty-two-characters';
const HASH = 'scrypt.15.8.1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const NOW = 1_757_000_000_000;

const request = (cookie: string | null) => ({
  headers: { get: (name: string): string | null => (name === 'cookie' ? cookie : null) },
});

const depsWith = (overrides: Partial<AuthorizeDeps> = {}): AuthorizeDeps => ({
  env: { [PASSWORD_HASH_KEY]: HASH, [SESSION_SECRET_KEY]: SECRET },
  revocations: createRevocations(),
  nowMs: () => NOW,
  ...overrides,
});

const withToken = (token: string) => request(`${SESSION_COOKIE}=${token}`);

describe('the full verdict', () => {
  test('a freshly minted cookie authorises', () => {
    const { token, session } = mintSession(SECRET, NOW);

    expect(liveSessionOf(withToken(token), depsWith())).toEqual(session);
    expect(verifySession(withToken(token), depsWith())).toBe(true);
  });

  /*
   * ⚠ The reason this function exists as well as `verifiedSessionOf`. A revoked cookie is
   * still a perfectly valid signature over a payload that has not expired — nothing about it
   * is detectable from the token alone, which is why the store has to be consulted.
   */
  test('⚠ a revoked session no longer authorises, though its signature is still valid', () => {
    const revocations = createRevocations();
    const { token, session } = mintSession(SECRET, NOW);
    const deps = depsWith({ revocations });

    expect(verifySession(withToken(token), deps)).toBe(true);
    revocations.revoke(session.sid, session.exp, NOW);
    expect(verifySession(withToken(token), deps)).toBe(false);
  });

  test('⚠ a cookie signed with a different secret does not authorise', () => {
    const { token } = mintSession('a-completely-different-thirty-two-char-key', NOW);
    expect(verifySession(withToken(token), depsWith())).toBe(false);
  });

  test('⚠ an expired cookie does not authorise', () => {
    const { token, session } = mintSession(SECRET, NOW);
    expect(verifySession(withToken(token), depsWith({ nowMs: () => session.exp }))).toBe(false);
  });

  /*
   * ⚠ Deny-by-default, in the shape that replaced step 6's `noSessionVerifierYet`. With no
   * `SESSION_SECRET` in the environment there is no key to verify against, and the honest
   * answer is that nothing is authorised — including a cookie that a correctly-configured
   * server would accept.
   *
   * The failure mode is a dashboard that will not open: loud, immediate, harmless. The other
   * direction is an unauthenticated telemetry endpoint on a LAN box.
   */
  test('⚠ an unconfigured server authorises nothing, cookie or no cookie', () => {
    const { token } = mintSession(SECRET, NOW);

    expect(verifySession(withToken(token), depsWith({ env: {} }))).toBe(false);
    expect(verifySession(withToken(token), depsWith({ env: { [PASSWORD_HASH_KEY]: HASH } }))).toBe(
      false,
    );
    expect(
      verifySession(withToken(token), depsWith({ env: { [SESSION_SECRET_KEY]: 'too-short' } })),
    ).toBe(false);
  });
});

describe('§5’s "any error raised while deciding is a 401"', () => {
  /*
   * ⚠ HANDOVER §3.2 rule 2: `lib/telemetry/handler.ts` catches, "**do not remove it**, and do
   * not rely on it either: an `authorize` that throws on ordinary input is still a bug, it
   * just is not a 500."
   *
   * Every input below is an ordinary way a bad session arrives — no cookie, a hand-edited
   * one, one truncated by something in the path — and each must be a plain `false`. This is
   * the assertion that says the 401 those requests get is a 401 for the *right* reason.
   */
  test.each([
    ['no cookie header', null],
    ['an unrelated cookie', 'theme=dark'],
    ['an empty value', `${SESSION_COOKIE}=`],
    ['junk', `${SESSION_COOKIE}=nonsense`],
    ['a truncated token', `${SESSION_COOKIE}=eyJ2IjoxfQ`],
    ['a token with three fields', `${SESSION_COOKIE}=a.b.c`],
    ['a lone percent sign', `${SESSION_COOKIE}=%`],
    ['characters outside base64url', `${SESSION_COOKIE}=!!!!.????`],
  ])('⚠ the verdict is a false, never a throw — %s', (_name, cookie) => {
    expect(() => verifySession(request(cookie), depsWith())).not.toThrow();
    expect(verifySession(request(cookie), depsWith())).toBe(false);
  });

  /*
   * ⚠ And the second lock, for the case that is *not* ordinary: a dependency that throws.
   * `verifySession` still answers `false` rather than propagating — which is the difference
   * between §5.2's "sign in again" and §6.7's failed-poll path, where the dot greys, the
   * traces freeze and the user is never told to sign in.
   */
  test('⚠ a throwing dependency denies rather than propagating', () => {
    const exploding = depsWith({
      revocations: {
        revoke: () => undefined,
        isRevoked: () => {
          throw new Error('store is broken');
        },
        size: 0,
      },
    });
    const { token } = mintSession(SECRET, NOW);

    expect(() => verifySession(withToken(token), exploding)).not.toThrow();
    expect(verifySession(withToken(token), exploding)).toBe(false);
  });

  test('⚠ a request whose header accessor throws denies rather than propagating', () => {
    const hostile = {
      headers: {
        get: (): string | null => {
          throw new Error('headers are broken');
        },
      },
    };

    expect(() => verifySession(hostile, depsWith())).not.toThrow();
    expect(verifySession(hostile, depsWith())).toBe(false);
  });
});

describe('the production wiring', () => {
  test('reads process.env and the process-wide revocation store', () => {
    expect(productionAuthorizeDeps.env).toBe(process.env);
    expect(typeof productionAuthorizeDeps.revocations.isRevoked).toBe('function');
  });

  /*
   * The clock is the wall clock, deliberately — a 30-day life is stored in a browser and must
   * survive restarts, which `performance.now()` cannot express. The rate limiter is the
   * opposite case and uses the monotonic one.
   */
  test('the session clock is the wall clock', () => {
    const before = Date.now();
    const seen = productionAuthorizeDeps.nowMs();

    expect(seen).toBeGreaterThanOrEqual(before);
    expect(seen).toBeLessThan(before + 5000);
  });
});
