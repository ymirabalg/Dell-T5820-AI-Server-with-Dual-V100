import { describe, expect, test } from 'vitest';

import { PASSWORD_HASH_KEY, SESSION_SECRET_KEY } from './config';
import { SESSION_COOKIE, SESSION_MAX_AGE_SECONDS } from './cookie';
import {
  MAX_BODY_BYTES,
  REQUIRED_CONTENT_TYPE,
  handleSessionDelete,
  handleSessionPost,
  productionSessionDeps,
} from './handler';
import type { SessionHandlerDeps } from './handler';
import { LOCKOUT_MS, MAX_ATTEMPTS, createRateLimiter } from './rate-limit';
import { createRevocations } from './revocations';
import { hashPassword, verifyPassword } from './scrypt';
import { mintSession, verifySessionToken } from './session';
import { createRevocations as freshRevocations } from './revocations';
import { verifySession } from './authorize';

/**
 * `POST /api/session` and `DELETE /api/session` (§5), end to end against injected clocks, an
 * injected limiter and an injected verifier — so the cases here are about §5's contract and
 * not about scrypt, which `scrypt.test.ts` covers at its own cost.
 */

const SECRET = 'a-secret-of-at-least-thirty-two-characters';
const HASH = 'scrypt.15.8.1.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const RIGHT = 'the right password';
const NOW = 1_757_000_000_000;

interface Harness {
  readonly deps: SessionHandlerDeps;
  readonly verifications: string[];
  advance(ms: number): void;
}

const harness = (overrides: Partial<SessionHandlerDeps> = {}): Harness => {
  const verifications: string[] = [];
  let monotonic = 0;

  const deps: SessionHandlerDeps = {
    env: { [PASSWORD_HASH_KEY]: HASH, [SESSION_SECRET_KEY]: SECRET },
    limiter: createRateLimiter(),
    revocations: createRevocations(),
    monotonicMs: () => monotonic,
    nowMs: () => NOW,
    verify: async (password) => {
      verifications.push(password);
      return password === RIGHT;
    },
    ...overrides,
  };

  return {
    deps,
    verifications,
    advance(ms: number): void {
      monotonic += ms;
    },
  };
};

const login = (password: unknown, headers: Record<string, string> = {}): Request =>
  new Request('http://ai-server:8090/api/session', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '192.168.4.20', ...headers },
    body: JSON.stringify({ password }),
  });

/**
 * A `POST` whose body is written by hand.
 *
 * ⚠ It carries `content-type: application/json` by default. §5 requires the header and the
 * handler refuses without it, so a fixture that omitted it would make every case below pass
 * for the same single reason — the exact "red for the wrong reason" the ledger cannot catch.
 * The cases that are *about* the header pass their own.
 */
const raw = (body: string | null, headers: Record<string, string> = {}): Request =>
  new Request('http://ai-server:8090/api/session', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': '192.168.4.20',
      ...headers,
    },
    ...(body === null ? {} : { body }),
  });

const cookieOf = (response: Response): string => response.headers.get('set-cookie') ?? '';

const tokenOf = (response: Response): string => {
  const match = /aid_session=([^;]*)/.exec(cookieOf(response));
  return match?.[1] ?? '';
};

describe('POST /api/session — success', () => {
  /*
   * ⚠ §5.2: "**On success:** 302 to `/`." §5: "sets an httpOnly, SameSite=Strict, 30-day
   * session cookie signed with a server secret."
   */
  test('⚠ the right password answers 302 to / with the session cookie', async () => {
    const { deps } = harness();
    const response = await handleSessionPost(login(RIGHT), deps);

    expect(response.status).toBe(302);
    expect(response.headers.get('location')).toBe('/');
    expect(cookieOf(response)).toContain('HttpOnly');
    expect(cookieOf(response)).toContain('SameSite=Strict');
    expect(cookieOf(response)).toContain(`Max-Age=${SESSION_MAX_AGE_SECONDS}`);
    expect(await response.text()).toBe('');
  });

  test('⚠ the cookie it sets is a token this server will accept back', async () => {
    const { deps } = harness();
    const response = await handleSessionPost(login(RIGHT), deps);
    const session = verifySessionToken(tokenOf(response), SECRET, NOW);

    expect(session).not.toBeNull();
    expect(session?.iat).toBe(NOW);
    expect(session?.exp).toBe(NOW + SESSION_MAX_AGE_SECONDS * 1000);
  });

  /*
   * ⚠ A correct password is not a guess. Without this, a user who mistyped four times and
   * then got it right would spend the rest of the minute one attempt from a lockout.
   */
  test('⚠ a successful login forgets the source’s previous attempts', async () => {
    const { deps } = harness();

    for (let i = 0; i < MAX_ATTEMPTS - 1; i += 1) await handleSessionPost(login('wrong'), deps);
    expect((await handleSessionPost(login(RIGHT), deps)).status).toBe(302);

    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await handleSessionPost(login('wrong'), deps)).status, `attempt ${i}`).toBe(401);
    }
  });

  test('every response forbids caching, including the one carrying Set-Cookie', async () => {
    const { deps } = harness();

    for (const request of [login(RIGHT), login('wrong')]) {
      expect((await handleSessionPost(request, deps)).headers.get('cache-control')).toBe('no-store');
    }
  });
});

describe('POST /api/session — refusal', () => {
  /*
   * ⚠ §5.2's screen has five states and no sixth, so there is no 400 here. A body that is
   * absent, not JSON, JSON without a password, or a wrong password all answer **401 with no
   * body** — truthfully, since none of them supplied a password this server recognises, and
   * safely, since a distinct status would tell an unauthenticated caller which of its guesses
   * was better formed.
   */
  test.each([
    ['the wrong password', () => login('wrong')],
    ['an empty password', () => login('')],
    ['a non-string password', () => login(42)],
    ['no body at all', () => raw(null)],
    ['a body that is not JSON', () => raw('password=hunter2')],
    ['JSON that is not an object', () => raw('"hunter2"')],
    ['JSON with no password field', () => raw('{"user":"root"}')],
    ['a JSON null', () => raw('null')],
  ])('⚠ the login is refused with 401 and no body — %s', async (_name, build) => {
    const { deps } = harness();
    const response = await handleSessionPost(build(), deps);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(response.headers.get('set-cookie')).toBeNull();
  });

  /*
   * ⚠ Deny-by-default at the login endpoint too. An unconfigured container must not be
   * loggable-into; §5.1 has the install script write both keys.
   */
  test.each([
    ['nothing configured', {}],
    ['no session secret', { [PASSWORD_HASH_KEY]: HASH }],
    ['no password hash', { [SESSION_SECRET_KEY]: SECRET }],
  ])('⚠ even the right password is refused — %s', async (_name, env) => {
    const { deps } = harness({ env });
    expect((await handleSessionPost(login(RIGHT), deps)).status).toBe(401);
  });

  /*
   * ⚠ §5: "any error raised while deciding" is a denial. The verifier is a seam, so the rule
   * has to hold at the seam and not only inside `verifyPassword`.
   */
  test('⚠ a verifier that throws is a 401, never a 500', async () => {
    const { deps } = harness({
      verify: () => {
        throw new Error('scrypt exploded');
      },
    });
    const response = await handleSessionPost(login(RIGHT), deps);

    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
  });

  test('⚠ a verifier that rejects is a 401, never a 500', async () => {
    const { deps } = harness({ verify: async () => Promise.reject(new Error('boom')) });
    expect((await handleSessionPost(login(RIGHT), deps)).status).toBe(401);
  });

  /*
   * ⚠ Fixture symmetry over the body cap (HANDOVER §5.1). A password is a handful of bytes;
   * the cap stops a scripted caller from making this process hold a megabyte per attempt. One
   * case each side, and the accepted side must still reach the verifier — a cap that refused
   * everything would pass a one-sided test.
   */
  test('⚠ a body at the cap is verified and one past it is refused', async () => {
    const fits = 'p'.repeat(MAX_BODY_BYTES - '{"password":""}'.length);
    const { deps, verifications } = harness();

    expect((await handleSessionPost(login(fits), deps)).status).toBe(401);
    expect(verifications).toEqual([fits]);

    expect((await handleSessionPost(login(`${fits}xx`), deps)).status).toBe(401);
    expect(verifications).toEqual([fits]); // the oversized body never reached the KDF
  });

  /*
   * ⚠ The cap is **bytes**, on both sides of the comparison. It used to be compared against
   * `content-length` in bytes and then against `text.length` in UTF-16 code units, so a body
   * of multi-byte characters was measured in one unit and bounded in another: 2 048 two-byte
   * characters is 4 KiB of JSON and passed a 4 096 "byte" cap by counting to 2 048. The
   * password below is one code unit per two bytes and sits just past the cap.
   */
  test('⚠ the body cap counts bytes, not UTF-16 code units', async () => {
    const { deps, verifications } = harness();
    // 'é' is one code unit and two UTF-8 bytes. Enough of them to pass a code-unit cap and
    // fail a byte cap.
    const password = 'é'.repeat(MAX_BODY_BYTES / 2);

    expect(JSON.stringify({ password }).length).toBeLessThan(MAX_BODY_BYTES);
    expect(Buffer.byteLength(JSON.stringify({ password }), 'utf8')).toBeGreaterThan(
      MAX_BODY_BYTES,
    );

    expect((await handleSessionPost(login(password), deps)).status).toBe(401);
    expect(verifications).toEqual([]);
  });

  test('⚠ an oversized declared content-length is refused before the body is read', async () => {
    const { deps, verifications } = harness();
    const response = await handleSessionPost(
      raw('{"password":"short"}', { 'content-length': String(MAX_BODY_BYTES + 1) }),
      deps,
    );

    expect(response.status).toBe(401);
    expect(verifications).toEqual([]);
  });
});

describe('POST /api/session — §5’s Content-Type requirement', () => {
  /*
   * ⚠ §5: "**`POST /api/session` requires `Content-Type: application/json`** and refuses
   * anything else with the same empty 401 as a wrong password. Without that requirement the
   * request is a CORS *simple request* needing no preflight, so any page the operator's
   * browser happens to load could spend the login rate limit and queue password hashing on
   * the dashboard's behalf."
   *
   * `text/plain`, `application/x-www-form-urlencoded` and `multipart/form-data` are exactly
   * the three a cross-origin page can send without a preflight, so they are exactly the three
   * that have to be refused.
   */
  test.each([
    ['no content-type at all', undefined],
    ['text/plain — a CORS simple request', 'text/plain'],
    ['form encoding — a CORS simple request', 'application/x-www-form-urlencoded'],
    ['multipart — a CORS simple request', 'multipart/form-data; boundary=x'],
    ['a lookalike', 'application/json-patch+json'],
    ['an empty header', ''],
  ])('⚠ the Content-Type is required — %s is refused with 401 and no body', async (_name, contentType) => {
    const { deps, verifications } = harness();
    const request = new Request('http://ai-server:8090/api/session', {
      method: 'POST',
      ...(contentType === undefined ? {} : { headers: { 'content-type': contentType } }),
      body: JSON.stringify({ password: RIGHT }),
    });

    const response = await handleSessionPost(request, deps);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
    expect(response.headers.get('set-cookie')).toBeNull();
    expect(verifications).toEqual([]);
  });

  /*
   * ⚠ The other side of the same boundary, and the reason it is not simply `=== `: both of
   * these are legal spellings of §5's media type, and neither is a CORS simple request. A
   * check that refused them would be a login screen that works in one browser.
   */
  test.each([
    ['exactly the media type', REQUIRED_CONTENT_TYPE],
    ['with a charset parameter', 'application/json; charset=utf-8'],
    ['upper case, as HTTP allows', 'APPLICATION/JSON'],
    ['padded', '  application/json  '],
  ])('⚠ the Content-Type is accepted — %s', async (_name, contentType) => {
    const { deps } = harness();
    const request = new Request('http://ai-server:8090/api/session', {
      method: 'POST',
      headers: { 'content-type': contentType },
      body: JSON.stringify({ password: RIGHT }),
    });

    expect((await handleSessionPost(request, deps)).status).toBe(302);
  });

  /*
   * ⚠ The point of the requirement, and the reason it is checked **first**. A page the
   * operator merely visits can fire the CORS-simple form all day; if that spent the budget,
   * §5's single global bucket would make holding the dashboard closed free and remote. Five
   * good attempts must still be there afterwards.
   */
  test('⚠ a refused content type does not spend the login budget', async () => {
    const { deps } = harness();
    const simple = (): Request =>
      new Request('http://ai-server:8090/api/session', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ password: 'wrong' }),
      });

    for (let i = 0; i < 50; i += 1) {
      expect((await handleSessionPost(simple(), deps)).status, `attempt ${i}`).toBe(401);
    }

    // The whole limit is intact: five wrong answers, and only then the 429.
    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await handleSessionPost(login('wrong'), deps)).status, `real ${i}`).toBe(401);
    }
    expect((await handleSessionPost(login(RIGHT), deps)).status).toBe(429);
  });
});

describe('POST /api/session — §5.2’s rate limit', () => {
  /*
   * ⚠ §5.2: "5 attempts per minute per source IP, then a 60 s lockout", and "a 429 carries a
   * `Retry-After` header and the screen renders its countdown from that value".
   */
  test('⚠ the sixth attempt in a minute is a 429 carrying Retry-After', async () => {
    const { deps } = harness();

    for (let i = 0; i < MAX_ATTEMPTS; i += 1) {
      expect((await handleSessionPost(login('wrong'), deps)).status, `attempt ${i}`).toBe(401);
    }
    const refused = await handleSessionPost(login('wrong'), deps);

    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBe(String(LOCKOUT_MS / 1000));
    expect(await refused.text()).toBe('');
    expect(refused.headers.get('cache-control')).toBe('no-store');
  });

  /*
   * ⚠ The limit is checked **before** the body is read and long before the KDF runs. A
   * rate limit that hashed first would be "five answers per minute, unlimited work" — and
   * scrypt is 32 MiB and a libuv worker per call, on the same thread pool §4 spends four
   * paragraphs protecting.
   */
  test('⚠ a rate-limited attempt never reaches the password verifier', async () => {
    const { deps, verifications } = harness();

    for (let i = 0; i <= MAX_ATTEMPTS + 3; i += 1) await handleSessionPost(login('wrong'), deps);
    expect(verifications).toHaveLength(MAX_ATTEMPTS);
  });

  test('⚠ even the right password is refused while the source is locked out', async () => {
    const { deps } = harness();

    for (let i = 0; i <= MAX_ATTEMPTS; i += 1) await handleSessionPost(login('wrong'), deps);
    expect((await handleSessionPost(login(RIGHT), deps)).status).toBe(429);
  });

  test('⚠ the countdown in Retry-After shrinks as the lockout runs down', async () => {
    const { deps, advance } = harness();

    for (let i = 0; i <= MAX_ATTEMPTS; i += 1) await handleSessionPost(login('wrong'), deps);
    advance(45_000);

    const refused = await handleSessionPost(login('wrong'), deps);
    expect(refused.status).toBe(429);
    expect(refused.headers.get('retry-after')).toBe('15');
  });

  test('⚠ the lockout releases and the right password works again', async () => {
    const { deps, advance } = harness();

    for (let i = 0; i <= MAX_ATTEMPTS; i += 1) await handleSessionPost(login('wrong'), deps);
    advance(LOCKOUT_MS);

    expect((await handleSessionPost(login(RIGHT), deps)).status).toBe(302);
  });

  /*
   * ⚠ §5: "**One bucket for the whole service.**" The lockout is global, and this is where
   * that is observable: a second source address — including one the caller invented — is
   * refused by the same lockout, and no address escapes it.
   *
   * That is deliberately the *opposite* of what this test asserted before. The per-source key
   * it replaced was `X-Forwarded-For`, which §2.5's deployment cannot supply honestly: Next
   * fills it from the socket only when the client omits it, so an attacker could rotate it to
   * escape their own bucket and forge the operator's to occupy theirs, while the operator
   * could do neither. The measured cost was a login the operator could not reach for 84.7 s
   * after ~1.5 s of attacker effort, with one queued scrypt per forged address. One bucket
   * bounds that queue at five by construction.
   */
  test('⚠ the lockout is global — a second source is refused by it too', async () => {
    const { deps } = harness();

    for (let i = 0; i <= MAX_ATTEMPTS; i += 1) await handleSessionPost(login('wrong'), deps);
    expect((await handleSessionPost(login('wrong'), deps)).status).toBe(429);

    const other = login(RIGHT, { 'x-forwarded-for': '192.168.4.99' });
    expect((await handleSessionPost(other, deps)).status).toBe(429);

    const forged = login(RIGHT, { 'x-forwarded-for': 'not-an-address' });
    expect((await handleSessionPost(forged, deps)).status).toBe(429);
  });

  /*
   * ⚠ §5.2: "one bucket is what keeps the number of queued hashes bounded by the limit itself
   * rather than by the number of distinct values a caller cares to invent." The KDF is the
   * expensive thing this endpoint owns — 32 MiB and a libuv worker per call — and a thousand
   * attempts from a thousand claimed addresses must still reach it five times.
   */
  test('⚠ a flood of invented sources still queues only five hashes', async () => {
    const { deps, verifications } = harness();

    for (let i = 0; i < 1000; i += 1) {
      await handleSessionPost(login('wrong', { 'x-forwarded-for': `10.0.${i >> 8}.${i & 255}` }), deps);
    }

    expect(verifications).toHaveLength(MAX_ATTEMPTS);
  });

  /*
   * ⚠ The limiter is timed on the caller's **monotonic** clock. A wall clock could have a
   * lockout ended early by a forward NTP step or extended for ever by a backward one —
   * mutation `R14`'s lesson, applied to the other place in this project that measures an
   * interval.
   */
  test('⚠ the limiter is driven by the monotonic clock, not the wall clock', async () => {
    const { deps } = harness({ nowMs: () => NOW + 10 * LOCKOUT_MS });

    for (let i = 0; i <= MAX_ATTEMPTS; i += 1) await handleSessionPost(login('wrong'), deps);
    // The wall clock has jumped ten lockouts into the future; the monotonic one has not moved.
    expect((await handleSessionPost(login('wrong'), deps)).status).toBe(429);
  });
});

describe('the two seams that used to be outside a catch (§5’s never-500 rule)', () => {
  /*
   * ⚠ §5 states the rule absolutely — "any error raised while deciding … is **401**, never
   * 500" — and `handler.ts`'s own doc says it fails closed, but the limiter call and
   * `DELETE`'s verdict ran raw. Neither is reachable with the production wiring (a `Map`, two
   * clocks and `process.env` do not throw), which is exactly why it needs a test: the
   * invariant has to be structural rather than true-because-today's-dependencies-behave.
   *
   * And the consequence was specific rather than generic. §5.2's screen maps every status
   * that is not 302/401/429 onto *Could not reach the dashboard.*, so the one 500 this module
   * could produce would tell the operator the dashboard is unreachable while it is answering
   * — with §5's "nothing is logged" leaving nowhere to check.
   */
  test('⚠ a limiter that throws is a 401, never a 500', async () => {
    const { deps } = harness({
      limiter: {
        attempt: () => {
          throw new Error('the limiter exploded');
        },
        clear: () => undefined,
      },
    });

    const response = await handleSessionPost(login(RIGHT), deps);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe('');
  });

  /*
   * ⚠ `liveSessionOf` is the one member of the session pair that is **not** total by catch —
   * `verifySession` catches, and the telemetry path relies on it. A logout whose verdict
   * throws must still clear the browser's cookie: refusing to log out is the wrong failure
   * direction, and a 500 is the wrong status.
   */
  test('⚠ a revocation store that throws still logs the browser out with 204', () => {
    const { deps } = harness({
      revocations: {
        revoke: () => undefined,
        isRevoked: () => {
          throw new Error('the store exploded');
        },
        get size() {
          return 0;
        },
      },
    });
    const { token } = mintSession(SECRET, NOW);
    const request = new Request('http://ai-server:8090/api/session', {
      method: 'DELETE',
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });

    const response = handleSessionDelete(request, deps);
    expect(response.status).toBe(204);
    expect(cookieOf(response)).toContain('Max-Age=0');
  });
});

describe('DELETE /api/session', () => {
  const withCookie = (token: string): Request =>
    new Request('http://ai-server:8090/api/session', {
      method: 'DELETE',
      headers: { cookie: `${SESSION_COOKIE}=${token}` },
    });

  test('clears the cookie and answers 204', () => {
    const { deps } = harness();
    const { token } = mintSession(SECRET, NOW);
    const response = handleSessionDelete(withCookie(token), deps);

    expect(response.status).toBe(204);
    expect(cookieOf(response)).toContain('Max-Age=0');
    expect(cookieOf(response)).toContain('HttpOnly');
    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  /*
   * ⚠ The half that makes logout mean something. Clearing the browser's copy does nothing to
   * a copy somebody else holds: the token stays validly signed and unexpired. Revoking the
   * `sid` is what stops the replay, and this is the assertion that the two halves are wired
   * together rather than merely both present.
   */
  test('⚠ the session cannot be replayed after logout', () => {
    const { deps } = harness();
    const { token, session } = mintSession(SECRET, NOW);

    expect(deps.revocations.isRevoked(session.sid, NOW)).toBe(false);
    handleSessionDelete(withCookie(token), deps);
    expect(deps.revocations.isRevoked(session.sid, NOW)).toBe(true);
  });

  /*
   * ⚠ A client whose cookie is malformed is the client that most needs it gone, so logout
   * never refuses. There is nothing here for a 401 to protect.
   */
  test.each([
    ['no cookie', null],
    ['junk', 'nonsense'],
    ['a token signed with another key', mintSession('another-thirty-two-character-secret!', NOW).token],
  ])('⚠ logout with %s still clears the cookie and answers 204', (_name, token) => {
    const { deps } = harness();
    const request =
      token === null
        ? new Request('http://ai-server:8090/api/session', { method: 'DELETE' })
        : withCookie(token);
    const response = handleSessionDelete(request, deps);

    expect(response.status).toBe(204);
    expect(cookieOf(response)).toContain('Max-Age=0');
    expect(deps.revocations.size).toBe(0);
  });

  test('logout is not rate-limited — it is not a guess', () => {
    const { deps } = harness();
    const { token } = mintSession(SECRET, NOW);

    for (let i = 0; i < 50; i += 1) {
      expect(handleSessionDelete(withCookie(token), deps).status).toBe(204);
    }
  });
});

describe('the whole chain, with the real KDF and the real verifier', () => {
  /*
   * ⚠ Every other case here injects `verify` so the suite does not pay 60 ms of scrypt per
   * assertion. This one pays it once, end to end, because the pieces being individually
   * correct is not the same claim as the pieces fitting: a hash written by `hashPassword` into
   * the env file, a password posted to `POST /api/session`, the cookie that comes back, and
   * the verdict `lib/telemetry/handler.ts` reaches from it are four contracts that have to
   * agree, and each is defined in a different module.
   *
   * Cheap scrypt parameters — the shipped ones are exercised in `scrypt.test.ts`, where the
   * cost belongs.
   */
  test('⚠ a hash written for the env file logs in and yields a session telemetry accepts', async () => {
    const password = 'a password with spaces and — punctuation';
    const passwordHash = await hashPassword(password, { logN: 1, r: 1, p: 1 });
    const revocations = freshRevocations();
    const env = { [PASSWORD_HASH_KEY]: passwordHash, [SESSION_SECRET_KEY]: SECRET };
    const { deps } = harness({ env, revocations, verify: verifyPassword });

    const wrong = await handleSessionPost(login(`${password}!`), deps);
    expect(wrong.status).toBe(401);

    const response = await handleSessionPost(login(password), deps);
    expect(response.status).toBe(302);

    // The cookie the login set, read back by the check that gates every reading.
    const carrying = {
      headers: {
        get: (name: string): string | null =>
          name === 'cookie' ? `${SESSION_COOKIE}=${tokenOf(response)}` : null,
      },
    };
    const authorizeDeps = { env, revocations, nowMs: () => NOW };

    expect(verifySession(carrying, authorizeDeps)).toBe(true);

    // …and logout takes it away again.
    handleSessionDelete(carrying as unknown as Request, deps);
    expect(verifySession(carrying, authorizeDeps)).toBe(false);
  });
});

describe('the production wiring', () => {
  /**
   * ⚠ The same ruling as `authorize.test.ts`'s, on the other composition root — and both are
   * needed, because `POST /api/session` reads `PASSWORD_HASH` while the gate reads
   * `SESSION_SECRET`, so one of them left on `process.env` would leak a different secret.
   */
  test('⚠ the login handler takes its credentials from the mounted file, never from process.env', () => {
    const descriptor = Object.getOwnPropertyDescriptor(productionSessionDeps, 'env');
    expect(typeof descriptor?.get).toBe('function');
    expect(descriptor?.value).toBeUndefined();
    expect(productionSessionDeps.env).not.toBe(process.env);

    const planted = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const before = process.env['SESSION_SECRET'];
    try {
      process.env['SESSION_SECRET'] = planted;
      expect(productionSessionDeps.env['SESSION_SECRET']).not.toBe(planted);
    } finally {
      if (before === undefined) delete process.env['SESSION_SECRET'];
      else process.env['SESSION_SECRET'] = before;
    }
    expect(typeof productionSessionDeps.limiter.attempt).toBe('function');
    expect(typeof productionSessionDeps.revocations.revoke).toBe('function');
  });

  /*
   * ⚠ Two clocks, and they are not interchangeable: the limiter's interval must be monotonic
   * and the cookie's 30 days must be wall-clock. `session.ts` and `rate-limit.ts` each carry
   * the argument; this pins the wiring.
   */
  test('⚠ the limiter gets the monotonic clock and the cookie gets the wall clock', () => {
    const monotonic = productionSessionDeps.monotonicMs();
    const wall = productionSessionDeps.nowMs();

    // `performance.now()` counts from process start; `Date.now()` is milliseconds since 1970.
    expect(monotonic).toBeLessThan(wall / 1000);
    expect(Math.abs(wall - Date.now())).toBeLessThan(5000);
  });

  test('the production verifier is the scrypt one', async () => {
    await expect(productionSessionDeps.verify('anything', 'not-a-hash')).resolves.toBe(false);
  });
});
