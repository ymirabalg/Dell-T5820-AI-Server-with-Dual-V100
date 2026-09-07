import { createHmac } from 'node:crypto';

import { describe, expect, test } from 'vitest';

import { SESSION_COOKIE, SESSION_TTL_MS } from './cookie';
import {
  SESSION_ID_BYTES,
  SESSION_VERSION,
  mintSession,
  verifiedSessionOf,
  verifySessionToken,
} from './session';

/**
 * §5's session token: what it is, what it costs to forge one, and the promise that deciding
 * never raises.
 */

const SECRET = 'a-secret-of-at-least-thirty-two-characters';
const OTHER_SECRET = 'a-different-secret-of-thirty-two-plus-chars';
const NOW = 1_757_000_000_000;

const headersWith = (cookie: string | null) => ({
  headers: { get: (name: string): string | null => (name === 'cookie' ? cookie : null) },
});

/** base64url's alphabet, in index order — `Buffer`'s own, so an index is a 6-bit value. */
const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

/**
 * A **different spelling of the same 32 bytes**, built from the character that is actually
 * there rather than from a hard-coded one.
 *
 * ⚠ This is the difference between a test that holds for every token and one that holds for
 * fifteen tokens in sixteen. A 32-byte tag is 43 base64url characters — 43 × 6 = 258 bits for
 * 256 — so the final character carries **two unused low bits**, which a canonical encoder
 * always writes as zero. `index ^ 1` therefore flips a padding bit: a different character, in
 * the same equivalence class, decoding to identical bytes, **for every possible tag**. The
 * hard-coded `endsWith('A') ? 'B' : 'A'` this replaced only landed in the same class when the
 * tag happened to end in `A`, which is 1 draw in 16.
 */
const alternateSpellingOf = (field: string): string => {
  const index = ALPHABET.indexOf(field.slice(-1));
  const swapped = ALPHABET[index ^ 1];
  if (index < 0 || swapped === undefined) throw new Error('not a base64url field');
  return `${field.slice(0, -1)}${swapped}`;
};

/** Re-sign an arbitrary payload — what a forger with the secret could do, and nobody else. */
const tokenFor = (payload: unknown, secret: string): string => {
  const encoded = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  return `${encoded}.${createHmac('sha256', secret).update(encoded).digest('base64url')}`;
};

describe('minting', () => {
  test('a fresh token verifies, and carries §5’s thirty days', () => {
    const { token, session } = mintSession(SECRET, NOW);

    expect(session.v).toBe(SESSION_VERSION);
    expect(session.iat).toBe(NOW);
    expect(session.exp).toBe(NOW + SESSION_TTL_MS);
    expect(verifySessionToken(token, SECRET, NOW)).toEqual(session);
  });

  /*
   * ⚠ The session id is what `DELETE /api/session` revokes, so two logins must never share
   * one — a colliding id would revoke a session nobody logged out of. 128 bits from
   * `randomBytes`; the assertion is that two mints at the *same instant* still differ, which
   * is the case a timestamp-derived id would fail.
   */
  test('⚠ two sessions minted at the same instant have different ids', () => {
    const a = mintSession(SECRET, NOW);
    const b = mintSession(SECRET, NOW);

    expect(a.session.sid).not.toBe(b.session.sid);
    expect(a.token).not.toBe(b.token);
    expect(Buffer.from(a.session.sid, 'base64url')).toHaveLength(SESSION_ID_BYTES);
  });

  test('the token is two base64url fields separated by one dot', () => {
    const { token } = mintSession(SECRET, NOW);
    const fields = token.split('.');

    expect(fields).toHaveLength(2);
    for (const field of fields) expect(field).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});

describe('what it takes to forge one', () => {
  /*
   * ⚠ The whole security claim of §5's cookie, in one test: the signature is over the exact
   * bytes the verifier parses, so every field a forger would want to change is inside the
   * signed region and none of it can be changed without the secret.
   *
   * The three cases are the three things worth stealing: a longer life, a different session
   * id (to escape a revocation), and a token signed with a key of the attacker's choosing.
   */
  test('⚠ a payload re-signed with a different secret does not verify', () => {
    const { session } = mintSession(SECRET, NOW);
    const forged = tokenFor(session, OTHER_SECRET);

    expect(verifySessionToken(forged, SECRET, NOW)).toBeNull();
    // …and it is a *valid* token under the key it was signed with, so the failure is the
    // signature check and not something incidental about the payload.
    expect(verifySessionToken(forged, OTHER_SECRET, NOW)).not.toBeNull();
  });

  test('⚠ extending exp without the secret does not verify', () => {
    const { session } = mintSession(SECRET, NOW);
    const greedy = tokenFor({ ...session, exp: NOW + SESSION_TTL_MS * 100 }, OTHER_SECRET);

    expect(verifySessionToken(greedy, SECRET, NOW)).toBeNull();
  });

  test('⚠ changing the session id without the secret does not verify', () => {
    const { session } = mintSession(SECRET, NOW);
    const renamed = tokenFor({ ...session, sid: 'somebody-elses' }, OTHER_SECRET);

    expect(verifySessionToken(renamed, SECRET, NOW)).toBeNull();
  });

  /*
   * ⚠ The edited payload is a **valid session in valid JSON** — only `sid` changed — and it is
   * paired with the original token's signature. That matters: flipping a random character
   * would usually corrupt the JSON, and the token would then be refused by `JSON.parse`
   * rather than by the signature check, so the test would pass under an implementation that
   * verified no signature at all. Measured: it does.
   */
  test('⚠ editing the payload while keeping the signature does not verify', () => {
    const { token, session } = mintSession(SECRET, NOW);
    const signature = token.split('.')[1] ?? '';
    const edited = Buffer.from(
      JSON.stringify({ ...session, sid: `${session.sid.slice(0, -1)}Z` }),
      'utf8',
    ).toString('base64url');

    expect(edited).not.toBe(token.split('.')[0]);
    // The edited payload is still well-formed: it verifies once it is re-signed.
    expect(verifySessionToken(tokenFor({ ...session, sid: 'edited' }, SECRET), SECRET, NOW)).not.toBeNull();
    expect(verifySessionToken(`${edited}.${signature}`, SECRET, NOW)).toBeNull();
  });

  /*
   * ⚠ A **different tag**: one bit of the decoded signature flipped and re-encoded, so the
   * bytes really are different and the spelling is still the canonical one for those bytes.
   * The only thing that can refuse it is the HMAC comparison.
   *
   * ⚠ This and the test below were one test, and conflating them cost the pipeline a 1-in-16
   * false red. It flipped the **last character** of the signature string, which — when the
   * canonical tag happened to end in `A` — produced a different *spelling of the same bytes*
   * rather than a different tag, and the verifier accepted it. On those runs the test failed
   * while demonstrating the opposite of its own name; on the others it passed for a reason it
   * did not state. Two mechanisms, two names, two mutations.
   */
  test('⚠ a signature whose bytes differ by one bit does not verify', () => {
    const { token } = mintSession(SECRET, NOW);
    const [payload = '', signature = ''] = token.split('.');

    const bytes = Buffer.from(signature, 'base64url');
    bytes.writeUInt8(bytes.readUInt8(0) ^ 0x01, 0);
    const different = bytes.toString('base64url');

    expect(different).not.toBe(signature);
    expect(verifySessionToken(`${payload}.${different}`, SECRET, NOW)).toBeNull();
  });

  /*
   * ⚠ A **non-canonical spelling of the same tag**, which is a different claim about a
   * different mechanism: the bytes are identical, so `timingSafeEqual` says yes, and the only
   * thing that can refuse it is `decodeExact`'s re-encode. Deterministic for every token —
   * see `alternateSpellingOf`.
   *
   * Not a forgery vector (producing any spelling needs the secret) but the wart §5's own
   * `scrypt.ts` already closed on its fields: one directory, one definition of canonical
   * base64url.
   */
  test('⚠ a non-canonical spelling of a valid signature does not verify', () => {
    const { token } = mintSession(SECRET, NOW);
    const [payload = '', signature = ''] = token.split('.');
    const respelled = alternateSpellingOf(signature);

    // The premise, asserted rather than assumed: a different string, the same bytes.
    expect(respelled).not.toBe(signature);
    expect(Buffer.from(respelled, 'base64url').equals(Buffer.from(signature, 'base64url'))).toBe(
      true,
    );

    expect(verifySessionToken(`${payload}.${respelled}`, SECRET, NOW)).toBeNull();
    // …and the canonical one still does, so the refusal is the spelling and nothing else.
    expect(verifySessionToken(token, SECRET, NOW)).not.toBeNull();
  });

  /*
   * ⚠ Fixture symmetry over the signature-length guard (HANDOVER §5.1), which now lives
   * inside `decodeExact`. It exists because `timingSafeEqual` **throws** on a length
   * mismatch — the classic constant-time defence turning into the classic 500 — and 32 is a
   * constant that leaks nothing. The middle case is the right length and the wrong bytes, so
   * the comparison itself is still exercised.
   */
  test('⚠ a signature of the wrong length is refused on both sides of 32 bytes', () => {
    const { token } = mintSession(SECRET, NOW);
    const payload = token.split('.')[0] ?? '';
    const withSignature = (bytes: number): string =>
      `${payload}.${Buffer.alloc(bytes).toString('base64url')}`;

    expect(verifySessionToken(withSignature(31), SECRET, NOW)).toBeNull();
    expect(verifySessionToken(withSignature(32), SECRET, NOW)).toBeNull(); // right length, wrong bytes
    expect(verifySessionToken(withSignature(33), SECRET, NOW)).toBeNull();
  });
});

describe('expiry', () => {
  /*
   * ⚠ Fixture symmetry over §5's thirty days. The comparison is `exp > nowMs`, so the two
   * sides are "one millisecond before it expires" and "the instant it expires" — and they
   * differ at the panel: one serves telemetry, the other sends the user to `/login`.
   *
   * Enforced by the server rather than left to the browser's `Max-Age`, because a client that
   * keeps sending an expired cookie is the normal case for anything that is not a browser.
   */
  test('⚠ the token is live up to its exp and dead at it', () => {
    const { token, session } = mintSession(SECRET, NOW);

    expect(verifySessionToken(token, SECRET, session.exp - 1)).not.toBeNull();
    expect(verifySessionToken(token, SECRET, session.exp)).toBeNull();
    expect(verifySessionToken(token, SECRET, session.exp + 1)).toBeNull();
  });

  test('a shorter life can be minted, and it is honoured', () => {
    const { token } = mintSession(SECRET, NOW, 1000);

    expect(verifySessionToken(token, SECRET, NOW + 999)).not.toBeNull();
    expect(verifySessionToken(token, SECRET, NOW + 1000)).toBeNull();
  });
});

describe('a payload that is signed but is not a session', () => {
  /*
   * These all carry a **valid** signature — they are what a bug in this project would
   * produce, not what an attacker could. The shape check is what stops a `null` or a number
   * from being treated as a session with `undefined` fields.
   *
   * ⚠ The last two are named for what they actually exercise. `JSON.stringify` has no way to
   * write `Infinity` or `NaN` and emits `null` for both — measured — so those payloads arrive
   * as a non-number and are refused by the `typeof` guard, never by the `Number.isFinite`
   * beside it. That guard is unreachable while the payload is JSON; step 7's harness records
   * it as a property with no mutation rather than inventing one.
   */
  test.each([
    ['a bare number', 42],
    ['null', null],
    ['an array', [1, 2, 3]],
    ['an empty object', {}],
    ['a future version', { v: 2, sid: 'x', iat: NOW, exp: NOW + 1000 }],
    ['no sid', { v: SESSION_VERSION, iat: NOW, exp: NOW + 1000 }],
    ['an empty sid', { v: SESSION_VERSION, sid: '', iat: NOW, exp: NOW + 1000 }],
    ['a numeric sid', { v: SESSION_VERSION, sid: 7, iat: NOW, exp: NOW + 1000 }],
    ['a string exp', { v: SESSION_VERSION, sid: 'x', iat: NOW, exp: `${NOW + 1000}` }],
    ['an exp of Infinity, which JSON writes as null', { v: SESSION_VERSION, sid: 'x', iat: NOW, exp: Infinity }],
    ['an exp of NaN, which JSON writes as null', { v: SESSION_VERSION, sid: 'x', iat: NOW, exp: Number.NaN }],
  ])('⚠ refused even though the signature is valid — %s', (_name, payload) => {
    expect(verifySessionToken(tokenFor(payload, SECRET), SECRET, NOW)).toBeNull();
  });
});

describe('the promise that deciding never raises (§5)', () => {
  /*
   * ⚠ §5: "A cookie that is missing, malformed, truncated, or whose signature cannot be
   * verified — **and any error raised while deciding** — is **401**, never 500."
   *
   * `lib/telemetry/handler.ts` catches, and HANDOVER §3.2 rule 2 says not to lean on that:
   * "an `authorize` that throws on ordinary input is still a bug, it just is not a 500."
   * Every input below is an ordinary way a bad cookie arrives, and each must be a `null`
   * rather than a caught throw.
   */
  test.each([
    ['null', null],
    ['an empty string', ''],
    ['no separator', 'justoneblob'],
    ['a leading dot', '.signature'],
    ['a trailing dot', 'payload.'],
    ['two separators', 'a.b.c'],
    ['a payload outside base64url', '!!!!.AAAA'],
    ['a signature outside base64url', 'AAAA.!!!!'],
    ['a truncated token', 'eyJ2IjoxLCJzaWQiOiJhIn0'],
    ['only dots', '...'],
    ['a 64 KiB blob', `${'A'.repeat(65536)}.${'B'.repeat(43)}`],
  ])('⚠ the token verifies as null rather than throwing — %s', (_name, token) => {
    expect(() => verifySessionToken(token, SECRET, NOW)).not.toThrow();
    expect(verifySessionToken(token, SECRET, NOW)).toBeNull();
  });

  /*
   * ⚠ Signed payload bytes that are not JSON at all. Unreachable without the secret — which
   * is the point of the ordering: the signature is checked **before** `JSON.parse`, so the
   * only JSON this process ever parses out of a cookie is JSON it wrote itself.
   */
  test('⚠ a validly signed payload that is not JSON is a null, not a SyntaxError', () => {
    const payload = Buffer.from('not json at all', 'utf8').toString('base64url');
    const token = `${payload}.${createHmac('sha256', SECRET).update(payload).digest('base64url')}`;

    expect(() => verifySessionToken(token, SECRET, NOW)).not.toThrow();
    expect(verifySessionToken(token, SECRET, NOW)).toBeNull();
  });
});

describe('reading the session off a request', () => {
  test('finds the cookie and verifies it', () => {
    const { token, session } = mintSession(SECRET, NOW);
    const request = headersWith(`other=1; ${SESSION_COOKIE}=${token}`);

    expect(verifiedSessionOf(request, SECRET, NOW)).toEqual(session);
  });

  test.each([
    ['no cookie header', null],
    ['a header without our cookie', 'other=1'],
    ['our cookie holding junk', `${SESSION_COOKIE}=nonsense`],
  ])('⚠ no session is found on the request — %s', (_name, cookie) => {
    expect(verifiedSessionOf(headersWith(cookie), SECRET, NOW)).toBeNull();
  });
});
